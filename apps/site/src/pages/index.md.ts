import type { APIRoute } from "astro";
import { homeMarkdown } from "../lib/markdown";
import { getSiteData } from "../lib/site-data";

export const GET: APIRoute = async () =>
  new Response(homeMarkdown(await getSiteData()), { headers: { "content-type": "text/markdown; charset=utf-8" } });
