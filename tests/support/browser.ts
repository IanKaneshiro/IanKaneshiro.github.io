import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { buildTokens } from "../../packages/tokens/build";

/**
 * Real-browser checks for the components. Builds the tokens and the components once per test run,
 * serves them, and opens plain HTML pages that load the components with one script tag.
 *
 * Chromium comes from CHROME_PATH, the Playwright cache (local), or the system Chrome that GitHub's
 * Ubuntu runners have (CI). Nothing is downloaded.
 */

const ROOT = path.resolve(import.meta.dir, "../..");
const COMPONENTS = path.join(ROOT, "packages/components");

export function chromiumPath(): string {
  const cache = path.join(os.homedir(), ".cache/ms-playwright");
  const fromCache = fs.existsSync(cache)
    ? fs
        .readdirSync(cache)
        .filter((d) => d.startsWith("chromium"))
        .sort()
        .reverse()
        .flatMap((d) => [
          path.join(cache, d, "chrome-headless-shell-linux64/chrome-headless-shell"),
          path.join(cache, d, "chrome-linux64/chrome"),
          path.join(cache, d, "chrome-linux/chrome"),
        ])
    : [];
  const candidates = [
    process.env.CHROME_PATH,
    ...fromCache,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`no Chromium found; set CHROME_PATH (looked in ${candidates.join(", ")})`);
  return found;
}

let ready: Promise<{ url: string; tokensCss: string }> | undefined;
let browser: Promise<Browser> | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
const pages = new Map<string, string>();

/** Builds tokens and components once, then serves www/build, tokens.css and registered pages. */
function serve() {
  return (ready ??= (async () => {
    const tokensOut = fs.mkdtempSync(path.join(os.tmpdir(), "browser-tokens-"));
    await buildTokens({ src: path.join(ROOT, "packages/tokens/src"), out: tokensOut });
    const build = Bun.spawnSync(["bun", "run", "build"], { cwd: COMPONENTS, stdout: "pipe", stderr: "pipe" });
    if (build.exitCode !== 0) throw new Error(`component build failed:\n${build.stdout}${build.stderr}`);
    const tokensCss = fs.readFileSync(path.join(tokensOut, "tokens.css"), "utf8");
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const { pathname } = new URL(req.url);
        if (pathname === "/tokens.css") return new Response(tokensCss, { headers: { "content-type": "text/css" } });
        if (pathname.startsWith("/p/")) {
          const html = pages.get(pathname.slice(3));
          return html
            ? new Response(html, { headers: { "content-type": "text/html" } })
            : new Response("", { status: 404 });
        }
        const file = path.join(COMPONENTS, "www", path.normalize(pathname));
        if (!file.startsWith(path.join(COMPONENTS, "www")) || !fs.existsSync(file))
          return new Response("", { status: 404 });
        return new Response(Bun.file(file));
      },
    });
    return { url: `http://127.0.0.1:${server.port}`, tokensCss };
  })());
}

/** A plain HTML page: tokens.css, one script tag for the components, a canvas background, and `body`. */
export function pageHtml(body: string, theme?: "light" | "dark"): string {
  return `<!doctype html>
<html lang="en"${theme ? ` data-theme="${theme}"` : ""}>
<head>
<meta charset="utf-8">
<title>kan components</title>
<link rel="stylesheet" href="/tokens.css">
<script type="module" src="/build/kan.esm.js"></script>
<style>
  body { margin: 0; padding: 16px; background: var(--kan-color-bg-canvas); color: var(--kan-color-text-default); font-family: var(--kan-typography-body-md-font-family); }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Builds the tokens and the components, once per test run. Anything that reads Stencil output waits for this. */
export const ensureBuilt = () => serve().then(() => undefined);

export type Opened = { page: Page; context: BrowserContext; url: string; scripts: string[] };

/** Opens `body` in a fresh page (in a fresh context, unless `context` is given), waits for the components to hydrate, and records the scripts loaded. */
export async function open(
  body: string,
  options: {
    theme?: "light" | "dark";
    reducedMotion?: boolean;
    javaScript?: boolean;
    viewport?: { width: number; height: number };
    /** Opens the page in this browser context, so it shares storage with pages opened earlier in it (a second page, a next visit). */
    context?: BrowserContext;
  } = {},
): Promise<Opened> {
  const { url } = await serve();
  const b = await (browser ??= chromium.launch({ executablePath: chromiumPath() }));
  const context =
    options.context ??
    (await b.newContext({
      javaScriptEnabled: options.javaScript ?? true,
      reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
      ...(options.viewport ? { viewport: options.viewport } : {}),
    }));
  const page = await context.newPage();
  const scripts: string[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".js")) scripts.push(r.url());
  });
  const id = `${pages.size + 1}.html`;
  pages.set(id, pageHtml(body, options.theme));
  await page.goto(`${url}/p/${id}`);
  if (options.javaScript ?? true) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll("*")]
        .filter((e) => e.tagName.toLowerCase().startsWith("kan-"))
        .every((e) => e.classList.contains("hydrated")),
    );
  }
  return { page, context, url: `${url}/p/${id}`, scripts };
}

/** The text of every script a page loaded. */
export async function scriptText(opened: Opened): Promise<string> {
  const texts = await Promise.all(opened.scripts.map((s) => fetch(s).then((r) => r.text())));
  return texts.join("\n");
}

export async function closeBrowser(): Promise<void> {
  if (browser) await (await browser).close();
  browser = undefined;
  server?.stop(true);
}

/** Waits for Stencil to re-render: its updates land on the next animation frame. */
export const settle = (o: Opened) =>
  o.page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
