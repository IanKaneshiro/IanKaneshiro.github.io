import type { APIRoute } from "astro";
import { builtMarkdown } from "../lib/markdown";
import { loadSpecGraph } from "../lib/spec-graph";

export const GET: APIRoute = () =>
  new Response(builtMarkdown(loadSpecGraph()), { headers: { "content-type": "text/markdown; charset=utf-8" } });
