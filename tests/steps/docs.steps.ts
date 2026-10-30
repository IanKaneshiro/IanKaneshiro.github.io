import { expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyTheme, themeDecorator, themeGlobalType } from "../../packages/components/src/theme";
import {
  darkRef,
  darkValue,
  parseOklch,
  renderPrimitives,
  renderSemantic,
} from "../../packages/components/src/foundations/render";
import { resolveTokens, type Row } from "../../packages/tokens/build";
import { contrast, CONTRAST_PAIRS } from "../../packages/tokens/src/contrast";
import { Then } from "../support/steps";

const ROOT = path.resolve(import.meta.dir, "../..");
const COMPONENTS = path.join(ROOT, "packages/components");
let resolved: Promise<Row[]> | undefined;
const rows = () => (resolved ??= resolveTokens(path.join(ROOT, "packages/tokens/src")).then((r) => r.rows));
const fakeRoot = () => {
  const attrs = new Map<string, string>();
  return {
    attrs,
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
    removeAttribute: (n: string) => void attrs.delete(n),
  };
};

// ── DOCS-002 Theme switch in the toolbar ────────────────

Then("the toolbar switches every story between light and dark", () => {
  const preview = fs.readFileSync(path.join(COMPONENTS, ".storybook/preview.ts"), "utf8");
  expect(preview).toContain("globalTypes: themeGlobalType");
  expect(preview).toContain("decorators: [themeDecorator]");
  expect(themeGlobalType.theme.toolbar.items.map((i) => i.value)).toEqual(["system", "light", "dark"]);
  const seen: (string | undefined)[] = [];
  const original = globalThis.document;
  const root = fakeRoot();
  Object.assign(globalThis, { document: { documentElement: root } });
  try {
    for (const theme of ["dark", "light", "system"]) {
      expect(themeDecorator(() => "story", { globals: { theme } })).toBe("story");
      seen.push(root.attrs.get("data-theme"));
    }
  } finally {
    Object.assign(globalThis, { document: original });
  }
  expect(seen).toEqual(["dark", "light", undefined]);
});

Then("the switch sets data-theme exactly the way the site does", async () => {
  const root = fakeRoot();
  applyTheme("dark", root);
  expect(root.attrs.get("data-theme")).toBe("dark");
  applyTheme("system", root);
  expect(root.attrs.has("data-theme")).toBe(false);
  // tokens.css reads exactly these: [data-theme="dark"], and system dark unless data-theme="light".
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "docs-tokens-"));
  try {
    const { buildTokens } = await import("../../packages/tokens/build");
    await buildTokens({ src: path.join(ROOT, "packages/tokens/src"), out });
    const css = fs.readFileSync(path.join(out, "tokens.css"), "utf8");
    expect(css).toContain('[data-theme="dark"] {');
    expect(css).toContain(':root:not([data-theme="light"]) {');
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

// ── DOCS-004 Foundations pages show the tokens ──────────

Then("a Foundations section shows each primitive ramp as named swatches with their values", async () => {
  const html = renderPrimitives(await rows());
  for (const ramp of ["cyan", "neutral", "green", "amber", "red"]) expect(html).toContain(`data-ramp="${ramp}"`);
  for (const r of (await rows()).filter((x) => x.layer === "primitive" && x.type === "color")) {
    const item = new RegExp(`<li data-token="${r.name.replace(/\./g, "\\.")}">.*?</li>`, "s").exec(html)?.[0] ?? "";
    expect([r.name, item.includes(`background: ${r.value}`), item.includes(r.value), item.includes(r.cssVar)]).toEqual([
      r.name,
      true,
      true,
      true,
    ]);
  }
  const stories = fs.readFileSync(path.join(COMPONENTS, "src/foundations/foundations.stories.ts"), "utf8");
  expect(stories).toContain('title: "Foundations"');
});

Then("every semantic token with its light and dark values and the primitives they reference", async () => {
  const html = renderSemantic(await rows());
  for (const r of (await rows()).filter((x) => x.layer === "semantic" && x.type === "color")) {
    const row = new RegExp(`<tr data-token="${r.name.replace(/\./g, "\\.")}">.*?</tr>`, "s").exec(html)?.[0] ?? "";
    for (const part of [r.cssVar, r.value, r.ref!, darkValue(r), darkRef(r)!]) {
      expect([r.name, part, row.includes(part)]).toEqual([r.name, part, true]);
    }
  }
  expect(html).toContain("<code>color.neutral.950</code>");
});

Then("both pages are generated from the token build's JSON", async () => {
  const stories = fs.readFileSync(path.join(COMPONENTS, "src/foundations/foundations.stories.ts"), "utf8");
  expect(stories).toContain('import rows from "@kan/tokens/tokens.json";');
  const render = fs.readFileSync(path.join(COMPONENTS, "src/foundations/render.ts"), "utf8");
  expect(render).not.toMatch(/oklch\([\d.]/);
  const changed = (await rows()).map((r) => (r.name === "color.cyan.500" ? { ...r, value: "oklch(0.5 0.1 100)" } : r));
  expect(renderPrimitives(changed)).toContain("oklch(0.5 0.1 100)");
  expect(renderPrimitives(changed)).not.toContain("oklch(0.84 0.14 205)");
});

// ── DOCS-005 Contrast is visible ────────────────────────

Then("the semantic color page shows the contrast ratio of each text and background pair in each mode", async () => {
  const all = await rows();
  const html = renderSemantic(all);
  const byName = new Map(all.map((r) => [r.name, r]));
  for (const p of CONTRAST_PAIRS) {
    const row =
      new RegExp(`<tr data-pair="${`${p.fg} on ${p.bg}`.replace(/\./g, "\\.")}">.*?</tr>`, "s").exec(html)?.[0] ?? "";
    const [fg, bg] = [byName.get(p.fg)!, byName.get(p.bg)!];
    const light = contrast(parseOklch(fg.value), parseOklch(bg.value)).toFixed(2);
    const dark = contrast(parseOklch(darkValue(fg)), parseOklch(darkValue(bg))).toFixed(2);
    expect([p.fg, p.bg, row.includes(`${light}:1`), row.includes(`${dark}:1`), row.includes(`${p.min}:1`)]).toEqual([
      p.fg,
      p.bg,
      true,
      true,
      true,
    ]);
  }
});
