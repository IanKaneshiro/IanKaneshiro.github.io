import type { APIRoute } from "astro";
import { absolute, getPages, REPO_URL, SITE_URL } from "../lib/pages";
import { getSiteData } from "../lib/site-data";

/** llms.txt (AGENT-001), following llmstxt.org: generated from the content and the page list. */
export const GET: APIRoute = async () => {
  const { profile } = await getSiteData();
  const pages = await getPages();
  const body = [
    `# ${profile.name}`,
    "",
    `> ${profile.headline}`,
    "",
    `${SITE_URL.replace("https://", "")} is ${profile.name}'s portfolio. ${profile.summary} Each page below has a Markdown version, generated from the same content as the page.`,
    "",
    "## Pages",
    "",
    ...pages.map((p) => `- [${p.name}](${absolute(p.md)}): ${p.description}`),
    "",
    "## Optional",
    "",
    `- [Storybook](${absolute("/storybook/")}): the kan- components the site is built from`,
    `- [Source](${REPO_URL}): the code and the specs of this site`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
};
