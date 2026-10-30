import { expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assemble, OLD_SITE } from "../../tools/site/assemble";
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

/** A repo-like dir with a fake old site and a fake Storybook build. */
function fixture(withStorybook: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  for (const f of OLD_SITE) {
    if (f.includes(".") || f === "CNAME") {
      fs.writeFileSync(path.join(dir, f), `${f} content\n`);
    } else {
      fs.mkdirSync(path.join(dir, f, "nested"), { recursive: true });
      fs.writeFileSync(path.join(dir, f, "nested/x.txt"), f);
    }
  }
  if (withStorybook) {
    fs.mkdirSync(path.join(dir, "packages/components/storybook-static"), { recursive: true });
    fs.writeFileSync(path.join(dir, "packages/components/storybook-static/index.html"), "<title>Storybook</title>");
  }
  return dir;
}

// ── SHIP-005 Deploy on merge ────────────────────────────

When("a change is merged to main", (world) => {
  const wf = deploy();
  expect(wf.on.push?.branches).toEqual(["main"]);
  world.wf = wf;
});

Then("GitHub Actions deploys the site, with Storybook under /storybook, to GitHub Pages", (world) => {
  const { build, deploy: publish } = (world.wf as Workflow).jobs;
  const runs = build.steps.map((s) => s.run ?? s.uses);
  const order = (needle: string) => runs.findIndex((r) => r?.includes(needle));
  expect(order("build-storybook")).toBeGreaterThan(-1);
  expect(order("tools/site/assemble.ts _site")).toBeGreaterThan(order("build-storybook"));
  expect(order("actions/upload-pages-artifact")).toBeGreaterThan(order("tools/site/assemble.ts"));
  expect(build.steps.find((s) => s.uses?.startsWith("actions/upload-pages-artifact"))!.with).toEqual({ path: "_site" });
  expect(publish.steps.map((s) => s.uses)).toEqual(["actions/deploy-pages@v4"]);
  expect(publish.permissions).toEqual({ pages: "write", "id-token": "write" });
  expect(publish.environment?.name).toBe("github-pages");

  const repo = fixture(true);
  const out = path.join(repo, "_site");
  assemble(repo, out);
  expect(fs.readFileSync(path.join(out, "storybook/index.html"), "utf8")).toBe("<title>Storybook</title>");
  for (const f of OLD_SITE) {
    const [a, b] = [path.join(repo, f), path.join(out, f)];
    const read = (p: string) =>
      fs.statSync(p).isDirectory() ? fs.readFileSync(path.join(p, "nested/x.txt")) : fs.readFileSync(p);
    expect([f, read(a).equals(read(b))]).toEqual([f, true]);
  }
  expect(fs.existsSync(path.join(out, ".nojekyll"))).toBe(true);
});

Then("a failed build leaves the live site unchanged", (world) => {
  const { deploy: publish } = (world.wf as Workflow).jobs;
  expect(publish.needs).toBe("build");
  const repo = fixture(false);
  expect(() => assemble(repo, path.join(repo, "_site"))).toThrow("no Storybook build");
  expect(fs.existsSync(path.join(repo, "_site"))).toBe(false);
});
