/**
 * A component's API page (DOCS-003), rendered from Stencil's docs.json: props, events, slots,
 * CSS parts and custom properties all come from the source's types and JSDoc, never by hand.
 */

import type { ComponentDoc, DocsJson } from "./types";

export type { ComponentDoc, DocsJson };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const code = (s: string) => `<code>${esc(s)}</code>`;

function table(title: string, head: string[], rows: string[][]): string {
  if (!rows.length) return `<h2 class="doc-h">${esc(title)}</h2><p class="doc-note">None.</p>`;
  return `<h2 class="doc-h">${esc(title)}</h2>
<table class="doc-table" data-api="${esc(title.toLowerCase())}">
  <thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `\n    <tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
  </tbody>
</table>`;
}

export function renderApi(doc: ComponentDoc): string {
  return `<article class="doc">
<h1 class="doc-title">${esc(doc.tag)}</h1>
<p class="doc-lede">${esc(doc.docs.split("\n\n")[0] ?? "")}</p>
${table(
  "Props",
  ["Attribute", "Type", "Default", "Description"],
  doc.props.map((p) => [code(p.attr ?? p.name), code(p.type), p.default ? code(p.default) : "", esc(p.docs)]),
)}
${table(
  "Events",
  ["Event", "Detail", "Description"],
  doc.events.map((e) => [code(e.event), code(e.detail), esc(e.docs)]),
)}
${table(
  "Slots",
  ["Slot", "Description"],
  doc.slots.map((s) => [code(s.name || "(default)"), esc(s.docs)]),
)}
${table(
  "CSS parts",
  ["Part", "Description"],
  doc.parts.map((p) => [code(p.name), esc(p.docs)]),
)}
${table(
  "CSS custom properties",
  ["Property", "Description"],
  doc.styles.map((s) => [code(s.name), esc(s.docs)]),
)}
</article>`;
}

export const componentDoc = (docs: DocsJson, tag: string): ComponentDoc => {
  const doc = docs.components.find((c) => c.tag === tag);
  if (!doc) throw new Error(`docs.json has no ${tag}; run the Stencil build`);
  return doc;
};

/**
 * A component's API story. docs.json is loaded only when the story opens: it's written by the
 * Stencil build, so nothing that merely imports a stories file should need it to exist.
 */
export const apiStory = (tag: string) => ({
  loaders: [async () => ({ docs: (await import("@kan/components/docs.json")).default })],
  render: (_args: unknown, { loaded }: { loaded: { docs: DocsJson } }) => renderApi(componentDoc(loaded.docs, tag)),
});
