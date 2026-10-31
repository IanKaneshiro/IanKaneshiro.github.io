import { SITE_URL } from "./pages";
import type { SiteData } from "./site-data";

/** The home page's structured data (AGENT-003): Ian as a Person and each project as SoftwareSourceCode. */
export function homeJsonLd({ profile, projects }: SiteData): string {
  const personId = `${SITE_URL}/#person`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": personId,
        name: profile.name,
        jobTitle: profile.role,
        description: profile.headline,
        url: `${SITE_URL}/`,
        email: profile.email,
        sameAs: [profile.links.github, profile.links.linkedin],
      },
      ...projects.map((p) => ({
        "@type": "SoftwareSourceCode",
        name: p.name,
        description: p.summary,
        codeRepository: p.source,
        ...(p.demo ? { url: p.demo } : {}),
        author: { "@id": personId },
      })),
    ],
  };
  // "<" is escaped so no content can close the script element.
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
