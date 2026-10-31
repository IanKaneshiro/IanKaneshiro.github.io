import fs from "node:fs";
import path from "node:path";

/**
 * Assembles what GitHub Pages serves at www.iankaneshiro.dev (SHIP-005, SHIP-008): the built site
 * (apps/site/dist) at the root and Storybook under /storybook. Throws, writing nothing, if either
 * build is missing.
 *
 *   bun tools/site/assemble.ts <out dir>     after bun run --cwd apps/site build
 *                                            and bun run --cwd packages/components build-storybook
 */

export const SITE = "apps/site/dist";
export const STORYBOOK = "packages/components/storybook-static";

export function assemble(root: string, out: string): string[] {
  const site = path.join(root, SITE);
  const storybook = path.join(root, STORYBOOK);
  if (!fs.existsSync(path.join(site, "index.html"))) {
    throw new Error(`no site build at ${SITE}; run bun run --cwd apps/site build first`);
  }
  if (!fs.existsSync(path.join(storybook, "index.html"))) {
    throw new Error(`no Storybook build at ${STORYBOOK}; run bun run --cwd packages/components build-storybook first`);
  }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(site, out, { recursive: true });
  fs.cpSync(storybook, path.join(out, "storybook"), { recursive: true });
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  return [...fs.readdirSync(site), "storybook", ".nojekyll"];
}

if (import.meta.main) {
  const out = path.resolve(process.argv[2] ?? "_site");
  try {
    const written = assemble(path.resolve(import.meta.dir, "../.."), out);
    console.log(`assembled ${out}: ${written.join(", ")}`);
  } catch (e) {
    console.error(`assemble: ${(e as Error).message}`);
    process.exit(1);
  }
}
