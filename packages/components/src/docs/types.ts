/** The shape of Stencil's docs.json, as far as the docs pages use it. */
export type DocsJson = { components: ComponentDoc[] };
export type ComponentDoc = {
  tag: string;
  docs: string;
  props: { name: string; attr?: string; type: string; default?: string; docs: string; reflectToAttr?: boolean }[];
  events: { event: string; detail: string; bubbles: boolean; composed: boolean; docs: string }[];
  slots: { name: string; docs: string }[];
  parts: { name: string; docs: string }[];
  styles: { name: string; docs: string }[];
};
