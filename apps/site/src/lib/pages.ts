import { getProfile } from "./site-data";

export const SITE_URL = "https://www.iankaneshiro.dev";
export const REPO_URL = "https://github.com/IanKaneshiro/IanKaneshiro.github.io";

/** One page of the site: the HTML page, its Markdown version, and the words that describe it. */
export interface PageMeta {
  /** The HTML path, like "/how-it-was-built/". */
  path: string;
  /** The Markdown version's path, like "/how-it-was-built.md". */
  md: string;
  /** The <title>. */
  title: string;
  /** What links to the page call it (llms.txt). */
  name: string;
  description: string;
  /** In the sitemap. The 404 is not. */
  indexable: boolean;
}

/** The copy of the 404 page, read by the page and by its Markdown version. */
export const NOT_FOUND = {
  heading: "Command not found",
  prompt: "open this-page",
  error: "ian: command not found: this-page",
  back: "Back to the home page",
};

/** The copy of "How this site was built", read by the page and by its Markdown version. */
export const BUILT = {
  heading: "How this site was built",
  intro: [
    "This site is built spec-first. Each intent (why) is served by journeys (who and how), and each step of a journey uses behaviors (what).",
    "Every behavior is a test that runs against the built site, and agents work through the gates: a change is trusted when the gates pass.",
  ],
};

export const absolute = (p: string) => new URL(p, SITE_URL).href;

/** Every page, from the content: the page, the Markdown version, llms.txt and the sitemap all read this. */
export async function getPages(): Promise<PageMeta[]> {
  const profile = await getProfile();
  return [
    {
      path: "/",
      md: "/index.md",
      title: `${profile.name} · ${profile.role}`,
      name: profile.name,
      description: profile.headline,
      indexable: true,
    },
    {
      path: "/how-it-was-built/",
      md: "/how-it-was-built.md",
      title: `${BUILT.heading} · ${profile.name}`,
      name: BUILT.heading,
      description: `The spec graph behind ${SITE_URL.replace("https://", "")}: intents, journeys and the behaviors that are tested.`,
      indexable: true,
    },
    {
      path: "/404.html",
      md: "/404.md",
      title: `${NOT_FOUND.heading} · ${profile.name}`,
      name: NOT_FOUND.heading,
      description: `That page doesn't exist. Head back to ${profile.name}'s home page.`,
      indexable: false,
    },
  ];
}

export async function getPage(path: string): Promise<PageMeta> {
  return (await getPages()).find((p) => p.path === path)!;
}
