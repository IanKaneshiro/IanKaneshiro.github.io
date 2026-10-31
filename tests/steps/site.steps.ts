import { expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import stylelint from "stylelint";
import { stylelintFailures } from "../../tools/gate/checks";
import { openSite, SITE_DIST, siteOrigin, type OpenedSite } from "../support/browser";
import { Given, Then, When, type World } from "../support/steps";

/**
 * The built site (apps/site), tested in a real browser: SITE-001 to SITE-014 (SITE-015
 * waits for the resume), AGENT-001 to AGENT-005, THEME-001, 004, 005 and 007, and QUAL-003 to QUAL-005.
 * siteOrigin() builds the site once per test run and serves apps/site/dist like GitHub Pages does.
 */

const ROOT = path.resolve(import.meta.dir, "../..");
const SITE = path.join(ROOT, "apps/site");
const CONTENT = path.join(SITE, "src/content");
const SITE_URL = "https://www.iankaneshiro.dev";

const readJson = <T>(...parts: string[]): T => JSON.parse(fs.readFileSync(path.join(CONTENT, ...parts), "utf8"));
type Profile = {
  name: string;
  role: string;
  headline: string;
  summary: string;
  workflow: string;
  email: string;
  links: { github: string; linkedin: string };
};
type Project = {
  order: number;
  name: string;
  summary: string;
  highlights?: string[];
  stack: string[];
  source: string;
  demo?: string;
};
const profile = () => readJson<Profile>("profile/ian.json");
const about = () => readJson<{ bio: string[]; workingOnNow: { text: string; state: string }[] }>("about/ian.json");
const stack = () => readJson<{ highlights: string; groups: { name: string; items: string[] }[] }>("stack/ian.json");
const projects = () =>
  fs
    .readdirSync(path.join(CONTENT, "projects"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Project>("projects", f))
    .sort((a, b) => a.order - b.order);

/** The pages of the site: the home page, the 404 (any path that isn't a page) and "How this site was built". */
const PAGES = ["/", "/no-such-page", "/how-it-was-built/"];
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 1280, height: 800 },
];

const opened = (world: World) => world.site as OpenedSite;
const close = (o: OpenedSite) => o.context.close();

/** Every heading on the page, in order, including those inside shadow roots. */
const headings = (o: OpenedSite) =>
  o.page.evaluate(() => {
    const out: { level: number; text: string }[] = [];
    const visit = (node: Element | ShadowRoot) => {
      if (node instanceof Element && /^H[1-6]$/.test(node.tagName)) {
        out.push({
          level: Number(node.tagName[1]),
          text:
            (node.textContent ?? "").replace(/─+/g, "").trim() ||
            ((node.getRootNode() as ShadowRoot).host?.textContent ?? "").trim(),
        });
      }
      if (node instanceof Element && node.shadowRoot) visit(node.shadowRoot);
      for (const child of node.children) visit(child);
    };
    visit(document.documentElement);
    return out;
  });

/** The text of the page as served, before any script runs. */
const rawHtml = async (urlPath: string) => (await fetch(`${await siteOrigin()}${urlPath}`)).text();
const textOf = (html: string) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

/** The computed canvas color of the page, in a form that compares as a string. */
const canvas = (o: OpenedSite) => o.page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// ── SITE-001 The first screen says who and what ─────────

When("I open the home page at 375px or 1280px wide", async (world) => {
  world.views = await Promise.all(VIEWPORTS.map((viewport) => openSite("/", { viewport })));
});

Then(
  "my first screen shows Ian's name, role, a one-line focus, and links to GitHub, LinkedIn and email",
  async (world) => {
    const p = profile();
    for (const o of world.views as OpenedSite[]) {
      const { width, height } = o.page.viewportSize()!;
      const on = (what: string) => `${what} at ${width}x${height}`;
      const inFirstScreen = async (selector: string, text: string | RegExp) => {
        const box = await o.page.locator(selector).first().boundingBox();
        expect([on(selector), box !== null]).toEqual([on(selector), true]);
        expect([
          on(selector),
          box!.y >= 0,
          box!.y + box!.height <= height,
          box!.x >= 0,
          box!.x + box!.width <= width,
        ]).toEqual([on(selector), true, true, true, true]);
        const found = await o.page.locator(selector).first().innerText();
        expect([on(selector), typeof text === "string" ? found.trim() : text.test(found)]).toEqual([
          on(selector),
          typeof text === "string" ? text : true,
        ]);
      };
      await inFirstScreen("h1", p.name);
      await inFirstScreen(".hero-role", p.role);
      await inFirstScreen(".hero-headline", p.headline);
      const links = await o.page.$$eval(".hero-links kan-button", (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { href: e.getAttribute("href"), bottom: r.bottom, right: r.right, left: r.left, top: r.top };
        }),
      );
      expect(links.map((l) => l.href)).toEqual([p.links.github, p.links.linkedin, `mailto:${p.email}`]);
      for (const l of links) {
        expect([on(l.href!), l.top >= 0, l.bottom <= height, l.left >= 0, l.right <= width]).toEqual([
          on(l.href!),
          true,
          true,
          true,
          true,
        ]);
      }
      // The one h1 is the name, and the page is the hero's: a heading and links, then the session.
      expect((await headings(o)).filter((h) => h.level === 1).map((h) => h.text)).toEqual([p.name]);
      await close(o);
    }
  },
);

// ── SITE-002 Featured projects ──────────────────────────

Then("each featured project shows its name, a one-line summary and its stack", async (world) => {
  const o = (world.site = await openSite("/"));
  const expected = projects();
  expect(expected.length).toBeGreaterThan(0);
  const cards = await o.page.$$eval("kan-project-card", (els) =>
    els.map((e) => ({
      name: e.getAttribute("name"),
      summary: [...e.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .join(" ")
        .trim(),
      stack: [...e.querySelectorAll('kan-tag[slot="stack"]')].map((t) => t.textContent?.trim()),
      links: [...e.querySelectorAll('kan-link[slot="links"]')].map((l) => ({
        text: l.textContent?.trim(),
        href: l.getAttribute("href"),
        target: l.getAttribute("target"),
      })),
    })),
  );
  world.cards = cards;
  expect(cards.map((c) => [c.name, c.summary, c.stack])).toEqual(expected.map((p) => [p.name, p.summary, p.stack]));
});

/** SITE-002's "links to its source...": the same sentence is KIT-005's, which calls this when it runs on the site. */
export function siteProjectLinks(world: World) {
  const cards = world.cards as { links: { text: string; href: string; target: string }[] }[];
  const expected = projects();
  expect(cards.map((c) => c.links.map((l) => [l.text, l.href]))).toEqual(
    expected.map((p) => [["Source", p.source], ...(p.demo ? [["Live demo", p.demo]] : [])]),
  );
  for (const l of cards.flatMap((c) => c.links)) expect(l.target).toBe("_blank");
}

Then("projects appear in the order set in the content", async (world) => {
  const o = opened(world);
  const names = await o.page.$$eval("kan-project-card", (els) => els.map((e) => e.getAttribute("name")));
  expect(names).toEqual(projects().map((p) => p.name));
  // The content files are not in order on disk by accident: the order field decides.
  expect(projects().map((p) => p.order)).toEqual([...projects().map((p) => p.order)].sort((a, b) => a - b));
  await close(o);
});

// ── SITE-003 The tech stack, grouped ────────────────────

Then("the stack section shows the current stack in the groups set in the content", async (world) => {
  const o = (world.site = await openSite("/"));
  const groups = await o.page.$$eval("#stack .stack-group", (els) =>
    els.map((g) => ({
      name: g.querySelector("h3")?.textContent?.trim(),
      items: [...g.querySelectorAll("li")].map((li) => li.textContent?.trim()),
    })),
  );
  expect(groups).toEqual(stack().groups);
});

Then("each item is an kan-tag", async (world) => {
  const o = opened(world);
  const items = await o.page.$$eval("#stack li", (lis) => lis.map((li) => [...li.children].map((c) => c.tagName)));
  expect(items.length).toBeGreaterThan(0);
  for (const tags of items) expect(tags).toEqual(["KAN-TAG"]);
  await close(o);
});

// ── SITE-004 About ──────────────────────────────────────

Then("an about section gives a short bio", async (world) => {
  const o = (world.site = await openSite("/"));
  const paragraphs = await o.page.$$eval("#about .prose p", (ps) => ps.map((p) => p.textContent?.trim()));
  expect(paragraphs).toEqual(about().bio);
  expect(await o.page.$$eval("#about kan-section-heading", (h) => h[0].textContent?.trim())).toBe("about");
});

Then("what Ian is working on now, shown as an kan-plan", async (world) => {
  const o = opened(world);
  const plans = await o.page.$$eval("#about kan-plan", (els) =>
    els.map((p) =>
      [...p.querySelectorAll("kan-plan-step")].map((s) => [s.getAttribute("state"), s.textContent?.trim()]),
    ),
  );
  expect(plans).toEqual([about().workingOnNow.map((s) => [s.state, s.text])]);
  expect(new Set(about().workingOnNow.map((s) => s.state))).toEqual(new Set(["done", "in-progress", "pending"]));
  await close(o);
});

// ── SITE-005 Contact without a backend ──────────────────

Then("contact is a mailto link plus LinkedIn and GitHub", async (world) => {
  const o = (world.site = await openSite("/"));
  const p = profile();
  const hrefs = await o.page.$$eval("#contact kan-link", (els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs).toEqual([`mailto:${p.email}`, p.links.linkedin, p.links.github]);
  // The link works in the real anchor the component draws.
  const inner = await o.page.$$eval("#contact kan-link", (els) =>
    els.map((e) => e.shadowRoot!.querySelector("a")?.href),
  );
  expect(inner).toEqual(hrefs.map((h) => h ?? undefined));
});

Then("there is no form", async (world) => {
  const o = opened(world);
  const count = await o.page.evaluate(() => {
    let n = 0;
    const visit = (root: Document | ShadowRoot) => {
      n += root.querySelectorAll("form, input, textarea, select").length;
      for (const el of root.querySelectorAll("*")) if (el.shadowRoot) visit(el.shadowRoot);
    };
    visit(document);
    return n;
  });
  expect(count).toBe(0);
  for (const page of PAGES) expect(await rawHtml(page)).not.toMatch(/<form[\s>]/i);
  await close(o);
});

// ── SITE-006 Content is data ────────────────────────────

Then("projects, the stack, the bio and links come from Astro content collections with a schema", async (world) => {
  const config = fs.readFileSync(path.join(SITE, "src/content.config.ts"), "utf8");
  for (const name of ["profile", "about", "stack", "projects"]) {
    expect([
      name,
      new RegExp(`${name}\\s*[:,}]`).test(config.slice(config.indexOf("export const collections"))),
    ]).toEqual([name, true]);
    expect([name, config.includes(`const ${name} = defineCollection(`)]).toEqual([name, true]);
  }
  expect(config).toContain("schema: z.object(");
  // What the page shows is what the files say.
  const rawPage = await rawHtml("/");
  const html = textOf(rawPage);
  const p = profile();
  for (const s of [
    p.name,
    p.role,
    p.headline,
    p.summary,
    p.workflow,
    ...about().bio,
    ...stack().groups.flatMap((g) => [g.name, ...g.items]),
  ]) {
    expect([s, html.includes(s)]).toEqual([s, true]);
  }
  for (const project of projects())
    expect([project.name, rawPage.includes(`name="${project.name}"`)]).toEqual([project.name, true]);
  world.pristine = true;
});

Then("an entry missing a required field fails the build, naming the file and the field", async () => {
  await siteOrigin(); // public/build exists once the site has been built
  const dir = path.join(CONTENT, "projects");
  const broken = path.join(dir, "zz-broken-project.json");
  const withoutSource = { ...projects()[0], source: undefined }; // JSON drops it
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "site-broken-"));
  fs.writeFileSync(broken, JSON.stringify(withoutSource));
  try {
    const build = Bun.spawnSync([path.join(SITE, "node_modules/.bin/astro"), "build", "--outDir", out], {
      cwd: SITE,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${build.stdout}${build.stderr}`;
    expect(build.exitCode).not.toBe(0);
    expect(output).toContain("zz-broken-project");
    expect(output).toMatch(/source/);
  } finally {
    fs.rmSync(broken, { force: true });
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── SITE-007 Built only from the design system ──────────

const siteCss = () =>
  ["src", "public"].flatMap((d) =>
    (fs.readdirSync(path.join(SITE, d), { recursive: true }) as string[])
      .filter((f) => f.endsWith(".css"))
      .map((f) => path.join(SITE, d, f)),
  );

Then("pages are composed from kan- components and semantic tokens", async () => {
  const files = siteCss();
  expect(files.length).toBeGreaterThan(0);
  const res = await stylelint.lint({ cwd: ROOT, files });
  expect(stylelintFailures(res.results, ROOT)).toEqual([]);
  // Pages hold kan- components, not hand-made versions: no inline styles, no style blocks in the sources.
  for (const page of PAGES) expect(await rawHtml(page)).not.toMatch(/\sstyle="/);
  const sources = (fs.readdirSync(path.join(SITE, "src"), { recursive: true }) as string[]).filter((f) =>
    f.endsWith(".astro"),
  );
  for (const f of sources) {
    expect([f, /<style[\s>]/.test(fs.readFileSync(path.join(SITE, "src", f), "utf8"))]).toEqual([f, false]);
  }
  const html = await rawHtml("/");
  for (const tag of [
    "kan-site-header",
    "kan-site-footer",
    "kan-terminal",
    "kan-project-card",
    "kan-tag",
    "kan-plan",
    "kan-section-heading",
  ]) {
    expect([tag, html.includes(`<${tag}`)]).toEqual([tag, true]);
  }
});

Then("site styles contain no raw color values and no primitive token properties", async () => {
  for (const f of siteCss()) {
    const css = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect([f, /#[0-9a-f]{3,8}\b(?![^{]*\{)|oklch\(|rgba?\(|hsla?\(/i.test(css.replace(/url\([^)]*\)/g, ""))]).toEqual([
      f,
      false,
    ]);
    expect([
      f,
      /--kan-color-(cyan|neutral|green|amber|red|white|black)|--kan-space-\d|--kan-font-(size|family|weight)/.test(css),
    ]).toEqual([f, false]);
  }
  // Lint catches both in the site's CSS, naming the file and line.
  const res = await stylelint.lint({
    cwd: ROOT,
    code: "body {\n  color: #0ff;\n  background: var(--kan-color-cyan-500);\n}\n",
    codeFilename: path.join(SITE, "src/styles/global.css"),
  });
  expect(
    stylelintFailures(res.results, ROOT)
      .map((f) => [f.file, f.line, f.rule])
      .sort((a, b) => Number(a[1]) - Number(b[1])),
  ).toEqual([
    ["apps/site/src/styles/global.css", 2, "color-no-hex"],
    ["apps/site/src/styles/global.css", 3, "kan/no-primitive-tokens"],
  ]);
  // The body is on the canvas.
  const o = await openSite("/");
  const [body, canvasToken] = await o.page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--kan-color-bg-canvas)";
    document.body.append(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(document.body).backgroundColor, token];
  });
  expect(body).toBe(canvasToken);
  await close(o);
});

// ── SITE-008 Readable without JavaScript ────────────────

Given("JavaScript is disabled", async (world) => {
  world.nojs = await Promise.all(PAGES.map((p) => openSite(p, { javaScript: false })));
  world.nojsDark = await openSite("/", { javaScript: false, colorScheme: "dark" });
});

const nojs = (world: World) => world.nojs as OpenedSite[];

Then("every page's text, project details and links are present and work", async (world) => {
  const [home, missing] = nojs(world);
  const p = profile();
  const text = await home.page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  const wanted = [
    p.name,
    p.role,
    p.headline,
    p.summary,
    p.workflow,
    stack().highlights,
    ...about().bio,
    ...about().workingOnNow.map((s) => s.text),
    ...stack().groups.flatMap((g) => [g.name, ...g.items]),
    ...projects().flatMap((x) => [x.name, x.summary, ...(x.highlights ?? []), ...x.stack]),
    p.email,
  ];
  for (const s of wanted) expect([s, text.includes(s)]).toEqual([s, true]);
  // Every link is a real anchor that is shown.
  const hrefs = await home.page.$$eval("a[href]", (as) =>
    as
      .filter((a) => getComputedStyle(a).display !== "none" && a.getClientRects().length > 0)
      .map((a) => a.getAttribute("href")),
  );
  for (const href of [
    p.links.github,
    p.links.linkedin,
    `mailto:${p.email}`,
    ...projects().flatMap((x) => [x.source, ...(x.demo ? [x.demo] : [])]),
    "/#about",
    "/#stack",
    "/#projects",
    "/#contact",
    "/storybook/",
  ]) {
    expect([href, hrefs.includes(href)]).toEqual([href, true]);
  }
  // And they work: the link on the 404 goes home, and a nav link goes to its section.
  expect(await missing.page.evaluate(() => document.body.innerText)).toMatch(/command not found/i);
  await missing.page.getByRole("link", { name: "Back to the home page" }).click();
  expect(new URL(missing.page.url()).pathname).toBe("/");
  await home.page.locator('a[href="/#projects"]').first().click();
  expect(new URL(home.page.url()).hash).toBe("#projects");
  // Smooth scrolling takes a moment to arrive.
  const arrived = () =>
    home.page.evaluate(() => document.getElementById("projects")!.getBoundingClientRect().top < 200);
  for (let i = 0; i < 30 && !(await arrived()); i++) await Bun.sleep(100);
  expect(await arrived()).toBe(true);
});

Then("only the theme toggle and animations are missing", async (world) => {
  for (const o of nojs(world)) {
    // The toggle lives in the header's shadow root, which only exists once scripts have run.
    expect(await o.page.evaluate(() => document.querySelector("kan-site-header")!.shadowRoot)).toBeNull();
    expect(await o.page.$$("kan-theme-toggle")).toHaveLength(0);
    expect(await o.page.evaluate(() => document.getAnimations().length)).toBe(0);
    // The page's own links and content are all there.
    expect(await o.page.$$("main")).toHaveLength(1);
    expect(await o.page.$$eval("kan-site-header a", (as) => as.length)).toBe(5);
  }
  for (const o of [...nojs(world), world.nojsDark as OpenedSite]) await close(o);
});

// ── SITE-009 A 404 in the terminal voice ────────────────

When("I open a path that doesn't exist", async (world) => {
  world.site = await openSite("/no-such-page/deeper/still");
});

Then('I see a "command not found" page with a link home', async (world) => {
  const o = opened(world);
  expect(await o.page.locator("h1").innerText()).toMatch(/command not found/i);
  expect(await o.page.$$("main kan-terminal kan-prompt")).toHaveLength(1);
  expect(await o.page.locator("main kan-terminal").innerText()).toMatch(/command not found/i);
  const home = o.page.getByRole("link", { name: /home/i }).and(o.page.locator("main a"));
  await home.first().click();
  expect(new URL(o.page.url()).pathname).toBe("/");
});

Then("the response status is 404", async (world) => {
  const o = opened(world);
  expect(o.status).toBe(404);
  for (const p of ["/nope", "/projects/nope", "/index.htm"])
    expect([p, (await fetch(`${await siteOrigin()}${p}`)).status]).toEqual([p, 404]);
  expect((await fetch(`${await siteOrigin()}/`)).status).toBe(200);
  // GitHub Pages serves 404.html for it.
  expect(fs.existsSync(path.join(SITE_DIST, "404.html"))).toBe(true);
  await close(o);
});

// ── SITE-010 Shares well ────────────────────────────────

Then(
  "every page has a title, a description, a canonical URL under https://www.iankaneshiro.dev, and Open Graph and Twitter card tags with an image",
  async () => {
    for (const page of PAGES) {
      const o = await openSite(page);
      const meta = await o.page.evaluate(() => {
        const get = (sel: string, attr: string) => document.head.querySelector(sel)?.getAttribute(attr) ?? null;
        return {
          title: document.title,
          description: get('meta[name="description"]', "content"),
          canonical: get('link[rel="canonical"]', "href"),
          ogTitle: get('meta[property="og:title"]', "content"),
          ogDescription: get('meta[property="og:description"]', "content"),
          ogUrl: get('meta[property="og:url"]', "content"),
          ogImage: get('meta[property="og:image"]', "content"),
          card: get('meta[name="twitter:card"]', "content"),
          twitterTitle: get('meta[name="twitter:title"]', "content"),
          twitterImage: get('meta[name="twitter:image"]', "content"),
        };
      });
      const at = (k: string) => `${page} ${k}`;
      expect([at("title"), meta.title.trim().length > 0]).toEqual([at("title"), true]);
      expect([at("description"), (meta.description ?? "").length > 20]).toEqual([at("description"), true]);
      expect([at("canonical"), meta.canonical?.startsWith(`${SITE_URL}/`)]).toEqual([at("canonical"), true]);
      expect([at("og:title"), meta.ogTitle]).toEqual([at("og:title"), meta.title]);
      expect([at("og:description"), meta.ogDescription]).toEqual([at("og:description"), meta.description]);
      expect([at("og:url"), meta.ogUrl]).toEqual([at("og:url"), meta.canonical]);
      expect([at("twitter:card"), meta.card]).toEqual([at("twitter:card"), "summary_large_image"]);
      expect([at("twitter:title"), meta.twitterTitle]).toEqual([at("twitter:title"), meta.title]);
      for (const image of [meta.ogImage, meta.twitterImage]) {
        expect([at("image"), image?.startsWith(`${SITE_URL}/`)]).toEqual([at("image"), true]);
        // The file behind it is in the build, and is 1200x630.
        const file = path.join(SITE_DIST, new URL(image!).pathname);
        expect([at(file), fs.existsSync(file)]).toEqual([at(file), true]);
        const png = fs.readFileSync(file);
        expect([png.subarray(1, 4).toString(), png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(["PNG", 1200, 630]);
      }
      await close(o);
    }
    expect((await rawHtml("/")).match(/<link rel="canonical" href="([^"]+)"/)![1]).toBe(`${SITE_URL}/`);
  },
);

Then("the favicon uses the brand mark", async () => {
  for (const page of PAGES) {
    const href = (await rawHtml(page)).match(/<link rel="icon" href="([^"]+)"/)?.[1];
    expect([page, href]).toEqual([page, "/favicon.svg"]);
  }
  const svg = fs.readFileSync(path.join(SITE_DIST, "favicon.svg"), "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("<path");
  expect((await fetch(`${await siteOrigin()}/favicon.svg`)).status).toBe(200);
});

// ── SITE-011 Landmarks, headings and a skip link ────────

Then("the first focusable element skips to the main content", async (world) => {
  const o = (world.site = await openSite("/"));
  await o.page.keyboard.press("Tab");
  const first = await o.page.evaluate(() => {
    const a = document.activeElement as HTMLAnchorElement;
    return {
      cls: a.className,
      href: a.getAttribute("href"),
      text: a.textContent,
      visible: a.getBoundingClientRect().top >= 0,
    };
  });
  expect(first).toEqual({ cls: "skip-link", href: "#main", text: "Skip to main content", visible: true });
  await o.page.keyboard.press("Enter");
  expect(new URL(o.page.url()).hash).toBe("#main");
  expect(await o.page.evaluate(() => document.getElementById("main")!.tagName)).toBe("MAIN");
});

Then("each page has header, main and footer landmarks", async () => {
  for (const page of PAGES) {
    const o = await openSite(page);
    for (const role of ["banner", "main", "contentinfo"] as const) {
      expect([page, role, await o.page.getByRole(role).count()]).toEqual([page, role, 1]);
    }
    await close(o);
  }
});

Then("exactly one h1, with no skipped heading levels", async () => {
  for (const page of PAGES) {
    const o = await openSite(page);
    const outline = await headings(o);
    expect([page, outline.filter((h) => h.level === 1).length]).toEqual([page, 1]);
    expect([page, outline[0].level]).toEqual([page, 1]);
    for (let i = 1; i < outline.length; i++) {
      expect([page, outline[i].text, outline[i].level <= outline[i - 1].level + 1]).toEqual([
        page,
        outline[i].text,
        true,
      ]);
    }
    if (page === "/")
      expect(outline.filter((h) => h.level === 2).map((h) => h.text)).toEqual([
        "about",
        "stack",
        "projects",
        "contact",
      ]);
    await close(o);
  }
});

// ── SITE-012 Responsive from phone to wide desktop ──────

Then("no page scrolls sideways at any width from 320px to 1920px", async () => {
  for (const page of PAGES) {
    const o = await openSite(page, { viewport: { width: 320, height: 700 } });
    for (const width of [320, 360, 375, 414, 768, 1024, 1280, 1920]) {
      await o.page.setViewportSize({ width, height: 800 });
      await o.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const m = await o.page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        body: document.body.scrollWidth,
        x: (window.scrollTo(100, 0), window.scrollX),
      }));
      expect([page, width, m.scroll <= m.client, m.body <= m.client, m.x]).toEqual([page, width, true, true, 0]);
    }
    await close(o);
  }
});

// ── SITE-013 The home page reads like an agent session ──

Then("the hero is a prompt asking who Ian is, answered by a few tool calls and a short summary", async (world) => {
  const o = (world.site = await openSite("/"));
  const p = profile();
  const session = await o.page.$eval(".hero kan-terminal", (t) => ({
    prompt: t.querySelector("kan-prompt")?.textContent?.trim(),
    calls: [...t.querySelectorAll("kan-tool-call")].map((c) => [
      c.getAttribute("name"),
      c.getAttribute("arg"),
      c.querySelector('[slot="result"]')?.textContent,
    ]),
    summary: t.querySelector(".session-summary")?.textContent,
    order: [...t.children].map((c) => c.tagName),
  }));
  expect(session).toEqual({
    prompt: "who is Ian Kaneshiro?",
    calls: [
      ["Read", "profile", p.role],
      ["Read", "stack", stack().highlights],
      ["Read", "workflow", p.workflow],
    ],
    summary: p.summary,
    order: ["KAN-PROMPT", "KAN-TOOL-CALL", "KAN-TOOL-CALL", "KAN-TOOL-CALL", "P"],
  });
  // The links come before the session in the page.
  expect(
    await o.page.evaluate(
      () =>
        document.querySelector(".hero-links")!.compareDocumentPosition(document.querySelector(".hero kan-terminal")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBeTruthy();
});

Then("every word of it is in the page HTML from the start", async () => {
  const p = profile();
  const html = textOf(await rawHtml("/"));
  for (const s of ["who is Ian Kaneshiro?", p.role, stack().highlights, p.workflow, p.summary]) {
    expect([s, html.includes(s)]).toEqual([s, true]);
  }
  // Nothing is typed in by script: the page's own scripts are the loader and the theme snippet only.
  // The JSON-LD block is data (AGENT-003), not a script.
  const scripts = [...(await rawHtml("/")).matchAll(/<script\b([^>]*)>/g)]
    .filter((m) => !m[1].includes('type="application/ld+json"'))
    .map((m) => /\ssrc="([^"]+)"/.exec(m[1])?.[1] ?? "(inline)");
  expect(scripts.sort()).toEqual(["(inline)", "/build/kan.esm.js"]);
});

Then("any reveal animation is skipped when the visitor prefers reduced motion", async (world) => {
  const o = opened(world);
  await close(o);
  const reduced = await openSite("/", { reducedMotion: true });
  const running = await reduced.page.evaluate(() => {
    const all = [document.getAnimations()];
    for (const el of document.querySelectorAll("*")) if (el.shadowRoot) all.push(el.shadowRoot.getAnimations());
    return all.flat().length;
  });
  expect(running).toBe(0);
  await close(reduced);
});

// ── THEME-001 Follows the system by default ─────────────

Given("I have never chosen a theme", async (world) => {
  world.light = await openSite("/", { colorScheme: "light" });
  world.dark = await openSite("/", { colorScheme: "dark" });
  for (const o of [world.light, world.dark] as OpenedSite[]) {
    expect(
      await o.page.evaluate(() => [
        localStorage.getItem("kan-theme"),
        document.documentElement.getAttribute("data-theme"),
      ]),
    ).toEqual([null, null]);
  }
});

Then("the site uses dark when my system prefers dark and light otherwise", async (world) => {
  const [light, dark] = [world.light, world.dark] as OpenedSite[];
  const natural = [await canvas(light), await canvas(dark)];
  expect(natural[0]).not.toBe(natural[1]);
  // What each system setting gives is what the token set calls light and dark.
  const forced = async (o: OpenedSite, theme: string) => {
    await o.page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    return canvas(o);
  };
  expect(natural).toEqual([await forced(dark, "light"), await forced(light, "dark")]);
  // The components follow too.
  const header = (o: OpenedSite) =>
    o.page.$eval("kan-site-header", (h) => getComputedStyle(h.shadowRoot!.querySelector("header")!).backgroundColor);
  expect(await header(light)).not.toBe(await header(dark));
  await close(light);
  await close(dark);
});

// ── THEME-004 No flash of the wrong theme ───────────────

Given("I saved dark and my system prefers light", async (world) => {
  const first = await openSite("/", { colorScheme: "light" });
  await first.page.evaluate(() => localStorage.setItem("kan-theme", "dark"));
  await first.page.close();
  world.saved = first;
});

When("I load any page", async (world) => {
  const { context } = world.saved as OpenedSite;
  world.loads = [];
  for (const page of PAGES) {
    (world.loads as OpenedSite[]).push(
      await openSite(page, {
        context,
        initScript: () => {
          // Records data-theme at the first moment a component is defined and when parsing is done,
          // both before Stencil renders anything.
          const w = window as unknown as { __early: Record<string, string | null> };
          w.__early = {};
          const snap = (key: string) =>
            (w.__early[key] ??= document.documentElement.getAttribute("data-theme") ?? "(none)");
          const define = customElements.define.bind(customElements);
          customElements.define = (...args: Parameters<typeof define>) => {
            snap("firstDefine");
            return define(...args);
          };
          document.addEventListener("DOMContentLoaded", () => snap("domContentLoaded"));
        },
      }),
    );
  }
});

Then("the first frame painted is already dark", async (world) => {
  const loads = world.loads as OpenedSite[];
  const dark = await openSite("/", { colorScheme: "dark" });
  const darkCanvas = await canvas(dark);
  await close(dark);
  for (const o of loads) {
    const early = await o.page.evaluate(() => (window as unknown as { __early: Record<string, string> }).__early);
    expect([o.url, early.domContentLoaded]).toEqual([o.url, "dark"]);
    expect([o.url, early.firstDefine]).toEqual([o.url, "dark"]);
    expect([o.url, await canvas(o)]).toEqual([o.url, darkCanvas]);
    // The snippet is the first thing in the head, so nothing paints before it runs.
    const order = await o.page.evaluate(() =>
      [...document.head.children].slice(0, 3).map((e) => `${e.tagName}${e.hasAttribute("src") ? ":src" : ""}`),
    );
    expect([o.url, order[0]]).toEqual([o.url, "SCRIPT"]);
    const html = await rawHtml(new URL(o.url).pathname);
    const snippet = html.indexOf('localStorage.getItem("kan-theme")');
    expect([o.url, snippet > 0 && snippet < html.search(/<link[^>]+stylesheet|type="module"/)]).toEqual([o.url, true]);
  }
  await loads[0].context.close();
});

// ── THEME-005 System changes apply live ─────────────────

Given("I am on system", async (world) => {
  const o = (world.site = await openSite("/", { colorScheme: "light" }));
  expect(
    await o.page.evaluate(() => [
      localStorage.getItem("kan-theme"),
      document.documentElement.getAttribute("data-theme"),
    ]),
  ).toEqual([null, null]);
  await o.page.evaluate(() => ((window as unknown as { __kept: boolean }).__kept = true));
  world.before = [
    await canvas(o),
    await o.page.$eval(
      "kan-site-header",
      (h) => getComputedStyle(h.shadowRoot!.querySelector("header")!).backgroundColor,
    ),
  ];
});

When("my system switches between light and dark", async (world) => {
  await opened(world).page.emulateMedia({ colorScheme: "dark" });
});

Then("the page follows without a reload", async (world) => {
  const o = opened(world);
  const header = () =>
    o.page.$eval("kan-site-header", (h) => getComputedStyle(h.shadowRoot!.querySelector("header")!).backgroundColor);
  const dark = [await canvas(o), await header()];
  expect(dark).not.toEqual(world.before);
  expect(await o.page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
  await o.page.emulateMedia({ colorScheme: "light" });
  expect([await canvas(o), await header()]).toEqual(world.before as string[]);
  expect(await o.page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
  await close(o);
});

// ── THEME-007 Without JavaScript ────────────────────────

Then("the site follows my system theme", async (world) => {
  const [light, dark] = [nojs(world)[0], world.nojsDark as OpenedSite];
  expect(await light.page.evaluate(() => document.documentElement.hasAttribute("data-theme"))).toBe(false);
  expect(await canvas(light)).not.toBe(await canvas(dark));
  const forced = async (o: OpenedSite, theme: string) => {
    await o.page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    return canvas(o);
  };
  expect([await canvas(light), await canvas(dark)]).toEqual([await forced(dark, "light"), await forced(light, "dark")]);
});

Then("the toggle is not shown", async (world) => {
  for (const o of [...nojs(world), world.nojsDark as OpenedSite]) {
    expect(await o.page.$$("kan-theme-toggle")).toHaveLength(0);
    expect(await o.page.evaluate(() => document.querySelector("kan-site-header")!.shadowRoot)).toBeNull();
    await close(o);
  }
});

// ── QUAL-003 Fonts ──────────────────────────────────────

Then("fonts are self-hosted, subset to Latin, and only the weights in use are shipped", async (world) => {
  const origin = await siteOrigin();
  const o = (world.site = await openSite("/"));
  const fonts = o.requests.filter((u) => /\.woff2?(\?|$)/.test(u));
  expect(fonts.length).toBeGreaterThan(0);
  for (const f of fonts) expect([f, new URL(f).origin]).toEqual([f, origin]);
  expect(fonts.map((f) => path.basename(new URL(f).pathname).replace(/\.[\w-]+\.woff2$/, "")).sort()).toEqual([
    "inter-latin-wght-normal",
    "jetbrains-mono-latin-wght-normal",
  ]);
  // The build ships those two files and no other font: one variable file per family covers every weight in use.
  const shipped = (fs.readdirSync(SITE_DIST, { recursive: true }) as string[]).filter((f) =>
    /\.(woff2?|ttf|otf)$/.test(f),
  );
  expect(shipped.map((f) => path.basename(f).replace(/\.[\w-]+\.woff2$/, "")).sort()).toEqual([
    "inter-latin-wght-normal",
    "jetbrains-mono-latin-wght-normal",
  ]);
  const css = (fs.readdirSync(path.join(SITE_DIST, "_astro")) as string[])
    .filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(SITE_DIST, "_astro", f), "utf8"))
    .join("\n");
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  expect(faces).toHaveLength(2);
  for (const face of faces) expect(face).toMatch(/unicode-range:[^;}]*U\+(0000-00FF|\?\?)/i);
  expect(faces.map((f) => /font-family:\s*"?([\w ]+)"?/.exec(f)![1]).sort()).toEqual(["Inter", "JetBrains Mono"]);
  // The text is in use: each family renders on the page.
  const used = await o.page.evaluate(() => [
    getComputedStyle(document.body).fontFamily,
    getComputedStyle(document.querySelector("h1")!).fontFamily,
  ]);
  expect(used[0]).toContain("Inter");
  expect(used[1]).toContain("JetBrains Mono");
});

Then("text shows in the fallback font while they load", async (world) => {
  const css = (fs.readdirSync(path.join(SITE_DIST, "_astro")) as string[])
    .filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(SITE_DIST, "_astro", f), "utf8"))
    .join("\n");
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  expect(faces.length).toBeGreaterThan(0);
  for (const face of faces) expect(face).toMatch(/font-display:\s*swap/);
  // Both families come with a fallback stack from the tokens.
  const stacks = await opened(world).page.evaluate(() => [
    getComputedStyle(document.body).fontFamily,
    getComputedStyle(document.querySelector("h1")!).fontFamily,
  ]);
  expect(stacks[0]).toMatch(/Inter.*sans-serif/);
  expect(stacks[1]).toMatch(/JetBrains Mono.*monospace/);
  await close(opened(world));
});

// ── QUAL-004 No third-party requests ────────────────────

Then("loading any page makes no requests to another origin: no trackers, external fonts or CDNs", async () => {
  const origin = await siteOrigin();
  for (const page of PAGES) {
    for (const colorScheme of ["light", "dark"] as const) {
      const o = await openSite(page, { colorScheme });
      // Interact a little: hover, scroll to the end, so anything lazy has loaded.
      await o.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await o.page.waitForLoadState("networkidle");
      const origins = [...new Set(o.requests.filter((u) => /^https?:/.test(u)).map((u) => new URL(u).origin))];
      expect([page, colorScheme, origins]).toEqual([page, colorScheme, [origin]]);
      expect(o.requests.length).toBeGreaterThan(3);
      await close(o);
    }
  }
  // Nothing in the built pages loads from elsewhere either.
  for (const page of PAGES) {
    const loads = [
      ...(await rawHtml(page)).matchAll(/<(?:script|link|img|iframe|source)\b[^>]*?(?:src|href)="(https?:[^"]+)"/g),
    ].map((m) => m[1]);
    expect([
      page,
      loads.filter((u) => !u.startsWith(SITE_URL) && !/rel="canonical"/.test(u)).filter((u) => !/iankaneshiro/.test(u)),
    ]).toEqual([page, []]);
  }
});

// ── QUAL-005 Every page passes axe ──────────────────────

Then("every page passes axe with no violations in light and in dark", async () => {
  const axe = fs.readFileSync(path.join(ROOT, "node_modules/axe-core/axe.min.js"), "utf8");
  for (const page of PAGES) {
    for (const colorScheme of ["light", "dark"] as const) {
      for (const viewport of VIEWPORTS) {
        const o = await openSite(page, { colorScheme, viewport });
        await o.page.addScriptTag({ content: axe });
        const violations = await o.page.evaluate(async () => {
          const r = await (
            window as unknown as {
              axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> };
            }
          ).axe.run();
          return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => String(n.target)).join(" | ")}`);
        });
        expect([page, colorScheme, viewport.width, violations]).toEqual([page, colorScheme, viewport.width, []]);
        await close(o);
      }
    }
  }
});

// ── Agents: the Markdown versions, llms.txt, JSON-LD and crawlers ──

const REPO_URL = "https://github.com/IanKaneshiro/IanKaneshiro.github.io";
const AI_CRAWLERS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];

/** The HTML pages of the build, as URL paths: "/", "/how-it-was-built/" and "/404.html". */
const builtPages = (): string[] =>
  (fs.readdirSync(SITE_DIST, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".html") && !f.startsWith("build") && !f.startsWith("_astro"))
    .map((f) =>
      f === "index.html" ? "/" : f.endsWith("/index.html") ? `/${f.slice(0, -"index.html".length)}` : `/${f}`,
    )
    .sort();
/** The Markdown version of an HTML page: the same path ending in .md. */
const mdPath = (page: string) => (page === "/" ? "/index.md" : `${page.replace(/(\/|\.html)$/, "")}.md`);
/** What the site's public URL is on the test server. */
const local = async (url: string) => url.replace(SITE_URL, await siteOrigin());
const fetchText = async (urlPath: string) => {
  const res = await fetch(await local(urlPath.startsWith("/") ? `${SITE_URL}${urlPath}` : urlPath));
  return { status: res.status, text: await res.text() };
};

type Graph = {
  nodes: { kind: string; id: string; title: string; area?: string; file: string; line?: number }[];
  edges: { from: string; to: string; type: string; step?: number; stepText?: string }[];
};
const graph = () => JSON.parse(fs.readFileSync(path.join(ROOT, "specs/portfolio/graph.json"), "utf8")) as Graph;
const specUrl = (n: { file: string; line?: number }) => `${REPO_URL}/blob/main/specs/portfolio/${n.file}#L${n.line}`;

// ── AGENT-001 llms.txt ──────────────────────────────────

Then("/llms.txt follows the llms.txt convention", async () => {
  const { status, text } = await fetchText("/llms.txt");
  expect(status).toBe(200);
  const lines = text.split("\n");
  // llmstxt.org: an H1 with the name, a blockquote summary, then sections of links.
  expect(lines[0]).toBe(`# ${profile().name}`);
  expect(lines.filter((l) => l.startsWith("# ")).length).toBe(1);
  expect(lines.findIndex((l) => l.startsWith("> "))).toBeGreaterThan(0);
  expect(lines).toContain("## Pages");
  expect(lines).toContain("## Optional");
  const optional = text.slice(text.indexOf("## Optional"));
  expect(optional).toContain("(" + SITE_URL + "/storybook/)");
  expect(optional).toContain(`(${REPO_URL})`);
  for (const l of lines.filter((x) => x.startsWith("- ")))
    expect([l, /^- \[[^\]]+\]\(https:\/\/[^)]+\)(: .+)?$/.test(l)]).toEqual([l, true]);
});

Then("summarizes who Ian is and links to the Markdown version of every page", async () => {
  const p = profile();
  const { text } = await fetchText("/llms.txt");
  const summary = text.split("\n").find((l) => l.startsWith("> "))!;
  expect(summary.toLowerCase()).toContain(p.role.toLowerCase());
  expect(summary).toContain(p.headline);
  const pagesSection = text.slice(text.indexOf("## Pages"), text.indexOf("## Optional"));
  const links = [...pagesSection.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map((m) => m[1]);
  for (const link of links) {
    expect([link, link.startsWith(`${SITE_URL}/`), link.endsWith(".md")]).toEqual([link, true, true]);
    expect([link, (await fetchText(link)).status]).toEqual([link, 200]);
  }
  expect(links.map((l) => l.slice(SITE_URL.length)).sort()).toEqual(builtPages().map(mdPath).sort());
});

// ── AGENT-002 A Markdown version of every page ──────────

Then("every page has a Markdown version at the same path ending in .md", async () => {
  expect(builtPages().length).toBeGreaterThanOrEqual(3);
  for (const page of builtPages()) {
    const md = await fetchText(mdPath(page));
    expect([page, mdPath(page), md.status]).toEqual([page, mdPath(page), 200]);
    expect([page, md.text.startsWith("# ")]).toEqual([page, true]);
  }
});

Then("it's generated from the same content collections as the page", async () => {
  await siteOrigin(); // public/build exists once the site has been built
  const file = path.join(CONTENT, "profile/ian.json");
  const original = fs.readFileSync(file);
  const marker = "Marker headline for the generation check";
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "site-generated-"));
  fs.writeFileSync(file, JSON.stringify({ ...profile(), headline: marker }));
  try {
    const build = Bun.spawnSync([path.join(SITE, "node_modules/.bin/astro"), "build", "--outDir", out], {
      cwd: SITE,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect([build.exitCode, `${build.stdout}${build.stderr}`.slice(-500)]).toEqual([0, expect.any(String)]);
    for (const f of ["index.html", "index.md", "llms.txt"]) {
      expect([f, fs.readFileSync(path.join(out, f), "utf8").includes(marker)]).toEqual([f, true]);
    }
  } finally {
    fs.writeFileSync(file, original);
    fs.rmSync(out, { recursive: true, force: true });
  }
  // The files say the same as the Markdown: nothing in it is typed by hand.
  const md = (await fetchText("/index.md")).text;
  const p = profile();
  for (const s of [p.name, p.role, p.headline, p.summary, p.email, p.links.github, p.links.linkedin, ...about().bio])
    expect([s, md.includes(s)]).toEqual([s, true]);
  for (const x of projects())
    for (const s of [x.name, x.summary, x.source, ...(x.demo ? [x.demo] : []), ...(x.highlights ?? []), ...x.stack])
      expect([s, md.includes(s)]).toEqual([s, true]);
  for (const g of stack().groups) for (const s of [g.name, ...g.items]) expect([s, md.includes(s)]).toEqual([s, true]);
});

// ── AGENT-003 Structured data ───────────────────────────

type LdNode = Record<string, unknown> & { "@type": string; "@id"?: string };
const jsonLd = async () => {
  const o = await openSite("/");
  const scripts = await o.page.$$eval('script[type="application/ld+json"]', (els) =>
    els.map((e) => e.textContent ?? ""),
  );
  await close(o);
  expect(scripts).toHaveLength(1);
  const doc = JSON.parse(scripts[0]) as { "@context": string; "@graph": LdNode[] };
  expect(doc["@context"]).toBe("https://schema.org");
  return doc["@graph"];
};

Then("the home page has JSON-LD for Ian as a Person, with job title and profile links", async () => {
  const p = profile();
  const people = (await jsonLd()).filter((n) => n["@type"] === "Person");
  expect(people).toHaveLength(1);
  expect(people[0]).toMatchObject({
    name: p.name,
    jobTitle: p.role,
    url: `${SITE_URL}/`,
    email: p.email,
  });
  expect((people[0].sameAs as string[]).sort()).toEqual([p.links.github, p.links.linkedin].sort());
});

Then("each featured project as a SoftwareSourceCode entry with its repository and demo links", async () => {
  const graphNodes = await jsonLd();
  const person = graphNodes.find((n) => n["@type"] === "Person")!;
  const code = graphNodes.filter((n) => n["@type"] === "SoftwareSourceCode");
  expect(code.map((c) => c.name)).toEqual(projects().map((x) => x.name));
  for (const [i, x] of projects().entries()) {
    expect([x.name, code[i].codeRepository]).toEqual([x.name, x.source]);
    expect([x.name, code[i].description]).toEqual([x.name, x.summary]);
    expect([x.name, code[i].url]).toEqual([x.name, x.demo]); // no demo, no url
    expect([x.name, code[i].author]).toEqual([x.name, { "@id": person["@id"] }]);
  }
  expect(code.length).toBe(projects().length);
});

// ── AGENT-004 Agents read what people see ───────────────

/**
 * Every text node of the rendered page (open shadow roots included), sorted into: shown to people,
 * screen-reader-only (clipped or visually hidden, still in the accessibility tree), or hidden from people.
 * Hidden text, and text hidden from assistive technology too, is reported in `bad`.
 */
const readText = (o: OpenedSite) =>
  o.page.evaluate(() => {
    const bad: string[] = [];
    const seen: string[] = [];
    const skip = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
    const flatParent = (el: Element): Element | null =>
      el.assignedSlot ?? el.parentElement ?? (el.getRootNode() as ShadowRoot).host ?? null;
    const check = (node: Text) => {
      const text = (node.data ?? "").replace(/\s+/g, " ").trim();
      if (!text) return;
      const el = node.parentElement ?? (node.getRootNode() as ShadowRoot).host;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()];
      const chain: Element[] = [];
      for (let cur: Element | null = el; cur; cur = flatParent(cur)) chain.push(cur);
      const style = getComputedStyle(el);
      const ariaHidden = chain.some((e) => e.getAttribute("aria-hidden") === "true" || e.hasAttribute("hidden"));
      const rendered = rects.some((r) => r.width > 0 || r.height > 0) && style.display !== "none";
      const focusable = chain.some((e) => e.matches("a[href], button, input, select, textarea, [tabindex]"));
      const reasons: string[] = [];
      if (chain.some((e) => getComputedStyle(e).opacity === "0")) reasons.push("opacity 0");
      if (/rgba\(.*,\s*0\)$|transparent/.test(style.color)) reasons.push("transparent text");
      if (parseFloat(style.fontSize) === 0) reasons.push("font-size 0");
      // Hiding that leaves the text for assistive technology: tiny, clipped or off the page.
      const srOnly: string[] = [];
      if (rendered && rects.every((r) => r.width <= 1 || r.height <= 1)) srOnly.push("tiny");
      if (
        chain.some((e) => {
          const s = getComputedStyle(e);
          return (s.clip !== "auto" && s.clip !== "") || (s.clipPath !== "none" && s.clipPath !== "");
        })
      )
        srOnly.push("clip");
      for (const e of chain) {
        const s = getComputedStyle(e);
        if (s.overflow === "visible" && s.overflowX === "visible") continue;
        const box = e.getBoundingClientRect();
        if (
          rects.every((r) => r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom)
        )
          srOnly.push("clipped by overflow");
      }
      if (!focusable && rects.every((r) => r.right <= 0 || r.bottom <= 0)) srOnly.push("off the page");
      const shown = rendered && style.visibility === "visible" && !reasons.length && !srOnly.length;
      const readable = rendered && style.visibility === "visible" && !ariaHidden;
      if (shown || (readable && !reasons.length && (srOnly.length || focusable))) {
        seen.push(text);
        return;
      }
      if (!rendered || style.visibility !== "visible" || ariaHidden || reasons.length || srOnly.length)
        bad.push(
          `${text.slice(0, 60)} (${[!rendered && "not rendered", style.visibility !== "visible" && style.visibility, ariaHidden && "aria-hidden", ...reasons, ...srOnly].filter(Boolean).join(", ")})`,
        );
    };
    const walk = (root: Node) => {
      for (const child of root.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) check(child as Text);
        else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as Element;
          if (skip.has(el.tagName)) continue;
          if (el.shadowRoot) walk(el.shadowRoot);
          walk(el);
        }
      }
    };
    walk(document.body);
    const hrefs: string[] = [];
    const collect = (root: Document | ShadowRoot | Element) => {
      for (const el of root.querySelectorAll("*")) {
        const href = el.getAttribute("href");
        if (href)
          hrefs.push(new URL(href, location.href).href.replace(location.origin, "https://www.iankaneshiro.dev"));
        if (el.shadowRoot) collect(el.shadowRoot);
      }
    };
    collect(document);
    return { bad, text: seen.join(" ").replace(/\s+/g, " "), hrefs };
  });

const agentViews = async (colorScheme: "light" | "dark", page: string) =>
  openSite(page, { colorScheme, reducedMotion: true, viewport: VIEWPORTS[1] });

Then("no page contains text that is hidden from people but readable by agents", async () => {
  for (const page of PAGES) {
    for (const colorScheme of ["light", "dark"] as const) {
      const o = await agentViews(colorScheme, page);
      const { bad, text } = await readText(o);
      expect([page, colorScheme, bad]).toEqual([page, colorScheme, []]);
      expect([page, colorScheme, text.length > 100]).toEqual([page, colorScheme, true]);
      await close(o);
    }
  }
  // The facts in the JSON-LD are on the page too: in its text, or in a link.
  const o = await agentViews("light", "/");
  const { text, hrefs } = await readText(o);
  await close(o);
  const facts: string[] = [];
  const collect = (v: unknown, key = "") => {
    if (typeof v === "string") {
      if (!key.startsWith("@")) facts.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => collect(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, k);
  };
  collect(await jsonLd());
  expect(facts.length).toBeGreaterThan(10);
  for (const fact of facts) expect([fact, text.includes(fact) || hrefs.includes(fact)]).toEqual([fact, true]);
});

/** The sentences of a Markdown document, without its syntax. */
const sentences = (md: string) =>
  md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split("\n")
    .map((l) => l.replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/, "").replace(/[`*_]/g, ""))
    .flatMap((l) => l.split(/(?<=[.!?])\s+/))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

Then("every sentence in a page's Markdown version also appears on the page", async () => {
  const pairs: [string, string][] = [
    ["/", "/index.md"],
    ["/how-it-was-built/", "/how-it-was-built.md"],
    ["/no-such-page", "/404.md"],
  ];
  for (const [page, md] of pairs) {
    const o = await agentViews("light", page);
    const { text } = await readText(o);
    await close(o);
    const found = sentences((await fetchText(md)).text);
    expect([md, found.length > 3]).toEqual([md, true]);
    for (const s of found) expect([md, s, text.includes(s)]).toEqual([md, s, true]);
  }
});

// ── AGENT-005 AI crawlers are welcome ───────────────────

Then("/robots.txt allows every crawler, AI crawlers included, and lists the sitemap", async () => {
  const { status, text } = await fetchText("/robots.txt");
  expect(status).toBe(200);
  const groups = text
    .split(/\n\s*\n/)
    .map((g) =>
      g
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    )
    .filter((g) => g.some((l) => l.startsWith("User-agent:")));
  for (const agent of ["*", ...AI_CRAWLERS]) {
    const group = groups.find((g) => g.includes(`User-agent: ${agent}`));
    expect([agent, group !== undefined]).toEqual([agent, true]);
    expect([agent, group!.includes("Allow: /")]).toEqual([agent, true]);
    expect([agent, group!.some((l) => l.startsWith("Disallow:") && l !== "Disallow:")]).toEqual([agent, false]);
  }
  const sitemap = text.split("\n").find((l) => l.startsWith("Sitemap:"));
  expect(sitemap).toBe(`Sitemap: ${SITE_URL}/sitemap.xml`);
  // The sitemap it points to exists and lists every page but the 404.
  const map = await fetchText(sitemap!.slice("Sitemap: ".length));
  expect(map.status).toBe(200);
  const locs = [...map.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs).toContain(`${SITE_URL}/`);
  expect(locs).toContain(`${SITE_URL}/how-it-was-built/`);
  expect(locs.some((l) => l.includes("404"))).toBe(false);
  expect(locs.sort()).toEqual(
    builtPages()
      .filter((p) => p !== "/404.html")
      .map((p) => `${SITE_URL}${p}`)
      .sort(),
  );
  for (const loc of locs) expect([loc, (await fetchText(loc)).status]).toEqual([loc, 200]);
});

// ── SITE-014 How this site was built ────────────────────

/** The journeys that serve an intent, and the behaviors each step of a journey uses, from graph.json. */
const specTree = () => {
  const g = graph();
  const node = (id: string) => g.nodes.find((n) => n.id === id)!;
  return g.nodes
    .filter((n) => n.kind === "intent")
    .map((intent) => ({
      intent,
      journeys: g.edges
        .filter((e) => e.type === "serves" && e.to === intent.id)
        .map((e) => {
          const uses = g.edges.filter((u) => u.type === "uses" && u.from === e.from);
          const steps = [...new Set(uses.map((u) => u.step!))]
            .sort((a, b) => a - b)
            .map((n) => ({
              text: uses.find((u) => u.step === n)!.stepText!,
              behaviors: uses.filter((u) => u.step === n).map((u) => node(u.to)),
            }));
          return { journey: node(e.from), steps };
        }),
    }));
};

Then(
  "a page shows the spec graph: the intents, the journeys that serve them and the behaviors behind each step",
  async () => {
    const g = graph();
    const o = await openSite("/how-it-was-built/");
    const outline = await headings(o);
    expect(outline.filter((h) => h.level === 1)).toHaveLength(1);
    const tree = specTree();
    // The headings, in order: each intent, then the journeys that serve it.
    expect(outline.filter((h) => h.level > 1).map((h) => [h.level, h.text])).toEqual(
      tree.flatMap((t) => [
        [2, `${t.intent.id} ${t.intent.title}`],
        ...t.journeys.map((j) => [3, `${j.journey.id} ${j.journey.title}`]),
      ]),
    );
    // Each journey's steps in order, and for each step the behaviors it uses.
    const shown = await o.page.evaluate(() =>
      [...document.querySelectorAll(".journey")].map((j) =>
        [...j.querySelectorAll(":scope > ol > li")].map((li) => ({
          text: li.querySelector(".step-text")!.textContent!.trim(),
          behaviors: [...li.querySelectorAll("kan-link")].map((a) => ({
            href: a.getAttribute("href"),
            target: a.getAttribute("target"),
            text: (a.textContent ?? "").replace(/\s+/g, " ").trim(),
          })),
        })),
      ),
    );
    expect(shown).toEqual(
      tree.flatMap((t) =>
        t.journeys.map((j) =>
          j.steps.map((s) => ({
            text: s.text,
            behaviors: s.behaviors.map((b) => ({ href: specUrl(b), target: "_blank", text: `${b.id} ${b.title}` })),
          })),
        ),
      ),
    );
    // The counts, near the top.
    const counts = (n: string) => g.nodes.filter((x) => x.kind === n).length;
    const top = await o.page.evaluate(() => document.querySelector(".built-counts")!.textContent);
    expect(top).toBe(`${counts("intent")} intents, ${counts("journey")} journeys and ${counts("behavior")} behaviors.`);
    expect(
      await o.page
        .locator("kan-tag")
        .first()
        .evaluate((e) => e.textContent),
    ).toMatch(/^[A-Z]+$/);
    await close(o);
  },
);

Then("it is generated from graph.json at build time, with links to each spec file in the source repo", async () => {
  const g = graph();
  // One link per uses edge of each journey, under each intent the journey serves.
  const expected = g.edges
    .filter((e) => e.type === "serves")
    .reduce((n, e) => n + g.edges.filter((u) => u.type === "uses" && u.from === e.from).length, 0);
  expect(expected).toBeGreaterThan(100);
  // Counted in the HTML as served, before any script runs.
  const html = await rawHtml("/how-it-was-built/");
  const links = [...html.matchAll(/<kan-link href="([^"]+)" target="_blank"/g)].map((m) => m[1]);
  const specLinks = links.filter((l) => l.startsWith(`${REPO_URL}/blob/main/specs/portfolio/`));
  expect(specLinks.length).toBe(expected);
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const allowed = new Set(g.nodes.filter((n) => n.kind === "behavior").map(specUrl));
  for (const l of specLinks) {
    expect([l, allowed.has(l)]).toEqual([l, true]);
    // The link goes to a real file, and the line is the scenario's.
    const m = /specs\/portfolio\/(.+)#L(\d+)$/.exec(l)!;
    const lines = fs.readFileSync(path.join(ROOT, "specs/portfolio", m[1]), "utf8").split("\n");
    expect([l, lines[Number(m[2]) - 1].trim().startsWith("Scenario")]).toEqual([l, true]);
  }
  // Every behavior a journey uses is linked.
  const used = new Set(g.edges.filter((e) => e.type === "uses").map((e) => e.to));
  for (const id of used) expect([id, specLinks.includes(specUrl(nodes.get(id)!))]).toEqual([id, true]);
  // No-JS visitors get plain anchors for the same links.
  expect(
    (html.match(new RegExp(`<a[^>]*href="${REPO_URL}/blob/main/specs/portfolio/[^"]+#L\\d+"`, "g")) ?? []).length,
  ).toBe(expected);
  // And the footer on every page links to it.
  expect(await rawHtml("/")).toContain('href="/how-it-was-built/"');
});
