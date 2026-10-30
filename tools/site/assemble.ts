import fs from "node:fs";
import path from "node:path";

/**
 * Assembles what GitHub Pages serves at www.iankaneshiro.dev (SHIP-005): the site at the root
 * and Storybook under /storybook. Until the new site ships, the root is the old site's files,
 * copied unchanged (SHIP-008).
 *
 *   bun tools/site/assemble.ts <out dir>     after bun run --cwd packages/components build-storybook
 */

/** The old site, served as-is until the new site replaces it. */
export const OLD_SITE = ["index.html", "css", "js", "assets", "CNAME"];
export const STORYBOOK = "packages/components/storybook-static";

export function assemble(root: string, out: string): string[] {
  const storybook = path.join(root, STORYBOOK);
  if (!fs.existsSync(path.join(storybook, "index.html"))) {
    throw new Error(`no Storybook build at ${STORYBOOK}; run bun run --cwd packages/components build-storybook first`);
  }
  for (const f of OLD_SITE) {
    if (!fs.existsSync(path.join(root, f))) throw new Error(`the old site's ${f} is missing`);
  }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const f of OLD_SITE) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
  fs.cpSync(storybook, path.join(out, "storybook"), { recursive: true });
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  return [...OLD_SITE, "storybook", ".nojekyll"];
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
