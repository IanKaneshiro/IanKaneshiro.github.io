import type { Row } from "@kan/tokens/build";
import { contrast, CONTRAST_PAIRS, type Oklch } from "@kan/tokens/contrast";

/**
 * The Foundations pages (DOCS-004, DOCS-005), rendered from the token build's JSON. Nothing here
 * knows a token's value: change a token, rebuild, and the pages follow.
 *
 * Swatches use each token's literal value, so light and dark can sit side by side. The rest of
 * the page is styled with semantic tokens and follows the toolbar's theme.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const code = (s: string) => `<code>${esc(s)}</code>`;
const heading = (text: string) => `<h2 class="doc-h">${esc(text)}</h2>`;
const swatch = (color: string, label = "") =>
  `<span class="doc-swatch" style="background: ${esc(color)}" role="img" aria-label="${esc(label || color)}"></span>`;

export const darkValue = (r: Row) => r.dark ?? r.value;
export const darkRef = (r: Row) => r.darkRef ?? r.ref;
export const parseOklch = (v: string): Oklch => {
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(v);
  if (!m) throw new Error(`not an oklch color: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

const primitive = (rows: Row[], prefix: string) =>
  rows.filter((r) => r.layer === "primitive" && r.name.startsWith(prefix));
const last = (name: string) => name.split(".").at(-1)!;

function ramps(rows: Row[]): string {
  const colors = primitive(rows, "color.");
  const groups = [...new Set(colors.map((r) => r.name.split(".")[1]))];
  return groups
    .map((g) => {
      const steps = colors.filter((r) => r.name.split(".")[1] === g);
      const single = steps.length === 1 && steps[0].name === `color.${g}`;
      return `<section class="doc-ramp" data-ramp="${esc(g)}">
  <h3>${code(single ? steps[0].name : `color.${g}`)}</h3>
  <ol class="doc-swatches">${steps
    .map(
      (r) => `
    <li data-token="${esc(r.name)}">${swatch(r.value, r.name)}<strong>${esc(single ? g : last(r.name))}</strong>${code(r.value)}${code(r.cssVar)}</li>`,
    )
    .join("")}
  </ol>
</section>`;
    })
    .join("\n");
}

function scale(rows: Row[], prefix: string, demo: (r: Row) => string): string {
  return `<table class="doc-table">
  <thead><tr><th>Token</th><th>Value</th><th>Preview</th></tr></thead>
  <tbody>${primitive(rows, prefix)
    .map(
      (r) => `
    <tr data-token="${esc(r.name)}"><td>${code(r.name)}</td><td>${code(r.value)}</td><td>${demo(r)}</td></tr>`,
    )
    .join("")}
  </tbody>
</table>`;
}

export function renderPrimitives(rows: Row[]): string {
  const sample = "The quick brown fox jumps over the lazy dog";
  return `<article class="doc">
<h1 class="doc-title">Primitives</h1>
<p class="doc-lede">The raw palette and scales. Components and pages never use these directly; they use the semantic roles, which reference them.</p>
${heading("Color")}
${ramps(rows)}
${heading("Space")}
${scale(rows, "space.", (r) => `<span class="doc-bar" style="width: ${esc(r.value)}"></span>`)}
${heading("Font family")}
${scale(rows, "font.family.", (r) => `<span style="font-family: ${esc(r.value)}">${sample}</span>`)}
${heading("Font size")}
${scale(rows, "font.size.", (r) => `<span class="doc-nowrap" style="font-size: ${esc(r.value)}">Ag kan</span>`)}
${heading("Font weight")}
${scale(rows, "font.weight.", (r) => `<span style="font-weight: ${esc(r.value)}">${sample}</span>`)}
${heading("Line height")}
${scale(rows, "font.line-height.", (r) => `<span class="doc-lines" style="line-height: ${esc(r.value)}">${sample}. ${sample}.</span>`)}
${heading("Radius")}
${scale(rows, "radius.", (r) => `<span class="doc-box" style="border-radius: ${esc(r.value)}"></span>`)}
${heading("Border width")}
${scale(rows, "border.width.", (r) => `<span class="doc-box" style="border-width: ${esc(r.value)}"></span>`)}
${heading("Duration")}
${scale(rows, "duration.", () => "")}
${heading("Easing")}
${scale(rows, "easing.", () => "")}
${heading("Breakpoint")}
${scale(rows, "breakpoint.", () => "")}
</article>`;
}

function roleRow(r: Row): string {
  const cell = (value: string, ref: string | undefined) =>
    `<td><div class="doc-mode">${swatch(value, `${r.name}: ${value}`)}${ref ? code(ref) : ""}${code(value)}</div></td>`;
  return `
    <tr data-token="${esc(r.name)}"><td>${code(r.cssVar)}${r.description ? `<p class="doc-note">${esc(r.description)}</p>` : ""}</td>${cell(r.value, r.ref)}${cell(darkValue(r), darkRef(r))}</tr>`;
}

function contrastTable(rows: Row[]): string {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const sample = (fg: string, bg: string) =>
    `<span class="doc-sample" style="color: ${esc(fg)}; background: ${esc(bg)}">Aa</span>`;
  return `<table class="doc-table" data-contrast>
  <thead><tr><th>Pair</th><th>Needs</th><th>Light</th><th>Dark</th></tr></thead>
  <tbody>${CONTRAST_PAIRS.map((p) => {
    const fg = byName.get(p.fg);
    const bg = byName.get(p.bg);
    if (!fg || !bg) return `\n    <tr><td colspan="4">${code(p.fg)} on ${code(p.bg)}: missing</td></tr>`;
    const cell = (f: string, b: string) => {
      const ratio = contrast(parseOklch(f), parseOklch(b));
      return `<td><div class="doc-mode">${sample(f, b)}<span class="${ratio >= p.min ? "doc-pass" : "doc-fail"}">${ratio.toFixed(2)}:1 ${ratio >= p.min ? "✓" : "✗"}</span></div></td>`;
    };
    return `
    <tr data-pair="${esc(`${p.fg} on ${p.bg}`)}"><td>${code(p.fg)} on ${code(p.bg)}</td><td>${p.min}:1 (${p.rule})</td>${cell(fg.value, bg.value)}${cell(darkValue(fg), darkValue(bg))}</tr>`;
  }).join("")}
  </tbody>
</table>`;
}

export function renderSemantic(rows: Row[]): string {
  const semantic = rows.filter((r) => r.layer === "semantic");
  const colors = semantic.filter((r) => r.type === "color");
  const groups = [...new Set(colors.map((r) => r.name.split(".").slice(0, 2).join(".")))];
  const others = semantic.filter((r) => r.type !== "color");
  const typography = [...new Set(others.filter((r) => r.group?.startsWith("typography.")).map((r) => r.group!))];
  const parts = (group: string) => others.filter((r) => r.group === group);
  return `<article class="doc">
<h1 class="doc-title">Semantic tokens</h1>
<p class="doc-lede">Roles components and pages use. Each one references a primitive; dark mode changes the reference. The swatches show both modes; the rest of this page follows the toolbar's theme.</p>
${heading("Color roles")}
${groups
  .map(
    (g) => `<h3>${code(g)}</h3>
<table class="doc-table">
  <thead><tr><th>Role</th><th>Light</th><th>Dark</th></tr></thead>
  <tbody>${colors
    .filter((r) => r.name.startsWith(`${g}.`))
    .map(roleRow)
    .join("")}
  </tbody>
</table>`,
  )
  .join("\n")}
${heading("Contrast")}
<p class="doc-lede">Every pair WCAG AA requires, in both modes. The build fails if any of them drops below its minimum.</p>
${contrastTable(rows)}
${heading("Typography")}
${typography
  .map((g) => {
    const p = parts(g);
    const style = p
      .map((r) => `${r.cssVar.replace(`--kan-${g.replace(/\./g, "-")}-`, "")}: var(${r.cssVar})`)
      .join("; ");
    return `<div class="doc-type" data-token="${esc(g)}"><p style="${esc(style)}">${esc(g.split(".")[1])}: The quick brown fox</p>${p
      .map((r) => code(`${last(r.name)} → ${r.ref ?? r.value}`))
      .join(" ")}</div>`;
  })
  .join("\n")}
${heading("Space, layout, focus and motion")}
<table class="doc-table">
  <thead><tr><th>Role</th><th>References</th><th>Value</th></tr></thead>
  <tbody>${others
    .filter((r) => !r.group)
    .map(
      (r) => `
    <tr data-token="${esc(r.name)}"><td>${code(r.cssVar)}</td><td>${r.ref ? code(r.ref) : ""}</td><td>${code(r.value)}${r.dark ? ` / dark ${code(r.dark)}` : ""}</td></tr>`,
    )
    .join("")}
  </tbody>
</table>
</article>`;
}
