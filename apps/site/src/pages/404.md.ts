import type { APIRoute } from "astro";
import { notFoundMarkdown } from "../lib/markdown";

export const GET: APIRoute = () =>
  new Response(notFoundMarkdown(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
