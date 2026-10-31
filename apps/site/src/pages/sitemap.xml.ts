import type { APIRoute } from "astro";
import { absolute, getPages } from "../lib/pages";

/** Every HTML page except the 404 (AGENT-005). */
export const GET: APIRoute = async () => {
  const urls = (await getPages()).filter((p) => p.indexable).map((p) => `  <url><loc>${absolute(p.path)}</loc></url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
