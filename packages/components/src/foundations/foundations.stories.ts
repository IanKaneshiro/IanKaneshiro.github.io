import rows from "@kan/tokens/tokens.json";
import { renderPrimitives, renderSemantic } from "./render";

/** Foundations (DOCS-004, DOCS-005): generated from the token build's JSON. */
export default {
  title: "Foundations",
  parameters: { layout: "fullscreen" },
};

export const Primitives = { render: () => renderPrimitives(rows) };
export const Semantic = { render: () => renderSemantic(rows) };
