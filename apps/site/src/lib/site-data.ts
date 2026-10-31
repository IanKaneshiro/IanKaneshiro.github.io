import { getCollection, getEntry } from "astro:content";

/*
 * The shapes of the collections in content.config.ts. Written out so the code type-checks on a clean
 * checkout, before Astro has generated its content types; the build checks the content against the schema.
 */
export interface Profile {
  name: string;
  role: string;
  headline: string;
  summary: string;
  workflow: string;
  email: string;
  links: { github: string; linkedin: string };
}
export interface About {
  bio: string[];
  workingOnNow: { text: string; state: "done" | "in-progress" | "pending" }[];
}
export interface Stack {
  highlights: string;
  groups: { name: string; items: string[] }[];
}
export interface Project {
  order: number;
  name: string;
  summary: string;
  highlights: string[];
  stack: string[];
  source: string;
  demo?: string;
}

export interface SiteData {
  profile: Profile;
  about: About;
  stack: Stack;
  projects: Project[];
}

export async function getProfile(): Promise<Profile> {
  return (await getEntry("profile", "ian"))!.data as Profile;
}

/** The content the home page shows, loaded for the page, its Markdown version and the JSON-LD. */
export async function getSiteData(): Promise<SiteData> {
  const about = (await getEntry("about", "ian"))!.data as About;
  const stack = (await getEntry("stack", "ian"))!.data as Stack;
  const projects = ((await getCollection("projects")) as { data: Project }[])
    .map((p) => p.data)
    .sort((a, b) => a.order - b.order);
  return { profile: await getProfile(), about, stack, projects };
}
