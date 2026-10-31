import { expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble, SITE, STORYBOOK } from "../../tools/site/assemble";
import { openSite, siteOrigin } from "../support/browser";
import { Then, When } from "../support/steps";

const ROOT = path.resolve(import.meta.dir, "../..");
type Step = { uses?: string; run?: string; with?: Record<string, unknown> };
type Job = {
  needs?: string | string[];
  steps: Step[];
  permissions?: Record<string, string>;
  environment?: { name: string };
};
type Workflow = { on: { push?: { branches: string[] } }; jobs: Record<string, Job> };
const deploy = () =>
  Bun.YAML.parse(fs.readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8")) as Workflow;

/** A repo-like dir with a fake site build (index.html, 404.html, a nested asset) and a fake Storybook build. */
function fixture({ site = true, storybook = true } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  const put = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  if (site) {
    put(`${SITE}/index.html`, "<title>Site</title>");
    put(`${SITE}/404.html`, "<title>Not found</title>");
    put(`${SITE}/assets/nested/file.bin`, "nested asset");
  }
  if (storybook) put(`${STORYBOOK}/index.html`, "<title>Storybook</title>");
  return dir;
}

/** Every file under `dir`, relative, sorted. */
const files = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
    .sort();

/** The deploy workflow's build job: the site is built before Storybook, and Storybook before assemble. */
function expectBuildOrder(wf: Workflow) {
  const runs = wf.jobs.build.steps.map((s) => s.run ?? s.uses);
  const order = (needle: string) => runs.findIndex((r) => r?.includes(needle));
  expect(order("--cwd apps/site build")).toBeGreaterThan(-1);
  expect(order("build-storybook")).toBeGreaterThan(order("--cwd apps/site build"));
  expect(order("tools/site/assemble.ts _site")).toBeGreaterThan(order("build-storybook"));
  expect(order("actions/upload-pages-artifact")).toBeGreaterThan(order("tools/site/assemble.ts"));
}

/** Asserts the site build is at the root of `out` byte for byte, and Storybook is under storybook/. */
function expectAssembled(repo: string, out: string) {
  const siteDir = path.join(repo, SITE);
  for (const f of files(siteDir)) {
    expect([f, fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(path.join(siteDir, f)))]).toEqual([f, true]);
  }
  expect(fs.readFileSync(path.join(out, "storybook/index.html"), "utf8")).toBe("<title>Storybook</title>");
  expect(fs.existsSync(path.join(out, ".nojekyll"))).toBe(true);
  expect(files(out).filter((f) => !f.startsWith("storybook/"))).toEqual([...files(siteDir), ".nojekyll"].sort());
}

// ── SHIP-005 Deploy on merge ────────────────────────────

When("a change is merged to main", (world) => {
  const wf = deploy();
  expect(wf.on.push?.branches).toEqual(["main"]);
  world.wf = wf;
});

Then("GitHub Actions deploys the site, with Storybook under /storybook, to GitHub Pages", (world) => {
  const { deploy: publish, build } = (world.wf as Workflow).jobs;
  expectBuildOrder(world.wf as Workflow);
  expect(build.steps.find((s) => s.uses?.startsWith("actions/upload-pages-artifact"))!.with).toEqual({ path: "_site" });
  expect(publish.steps.map((s) => s.uses)).toEqual(["actions/deploy-pages@v4"]);
  expect(publish.permissions).toEqual({ pages: "write", "id-token": "write" });
  expect(publish.environment?.name).toBe("github-pages");

  const repo = fixture();
  const out = path.join(repo, "_site");
  assemble(repo, out);
  expectAssembled(repo, out);
});

Then("a failed build leaves the live site unchanged", (world) => {
  const { deploy: publish } = (world.wf as Workflow).jobs;
  expect(publish.needs).toBe("build");
  for (const [missing, message] of [
    [{ site: false }, "no site build"],
    [{ storybook: false }, "no Storybook build"],
  ] as const) {
    const repo = fixture(missing);
    expect(() => assemble(repo, path.join(repo, "_site"))).toThrow(message);
    expect(fs.existsSync(path.join(repo, "_site"))).toBe(false);
  }
});

// ── SHIP-008 Cutover from the old site ──────────────────

const OLD_ANCHORS = ["about", "contact", "page-top", "portfolio"]; // the old home page's #section links

Then("the deploy publishes the new site at the root of www.iankaneshiro.dev, with Storybook under /storybook", () => {
  expectBuildOrder(deploy());
  const repo = fixture();
  const out = path.join(repo, "_site");
  assemble(repo, out);
  expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toBe("<title>Site</title>");
  expect(fs.readFileSync(path.join(out, "404.html"), "utf8")).toBe("<title>Not found</title>");
  expectAssembled(repo, out);
});

Then("the old site's files are gone from the repo", () => {
  const tracked = Bun.spawnSync(["git", "ls-files", "--", "index.html", "css", "js", "assets", "CNAME"], { cwd: ROOT })
    .stdout.toString()
    .trim();
  expect(tracked).toBe("");
  for (const f of ["index.html", "css", "js", "CNAME", "assets"]) {
    expect([f, fs.existsSync(path.join(ROOT, f))]).toEqual([f, false]);
  }
});

Then(
  "links people already have to the old site still work: the home page, and the resume at /assets/Kaneshiro_Ian_Resume.pdf",
  async () => {
    const origin = await siteOrigin();
    const home = await openSite("/");
    try {
      expect(home.status).toBe(200);
      expect(await home.page.locator("h1").count()).toBe(1);
      expect(await home.page.locator("kan-project-card").count()).toBeGreaterThan(0);

      const res = await fetch(`${origin}/assets/Kaneshiro_Ian_Resume.pdf`);
      expect(res.status).toBe(200);
      expect(
        Buffer.from(await res.arrayBuffer())
          .subarray(0, 4)
          .toString(),
      ).toBe("%PDF");

      // The old home page's in-page links: each one the new home page also links to has a target.
      const { linked, present } = await home.page.evaluate((anchors) => {
        const hrefs = [...document.querySelectorAll("[href]")].map((e) => e.getAttribute("href") ?? "");
        return {
          linked: anchors.filter((a) => hrefs.some((h) => h === `#${a}` || h === `/#${a}`)),
          present: anchors.filter((a) => document.getElementById(a)),
        };
      }, OLD_ANCHORS);
      expect(linked.filter((a) => !present.includes(a))).toEqual([]);
      expect(present).toEqual(expect.arrayContaining(["about", "contact"]));
    } finally {
      await home.context.close();
    }
  },
);
