import { absolute, BUILT, NOT_FOUND } from "./pages";
import type { SiteData } from "./site-data";
import { countLine, type SpecGraph } from "./spec-graph";

/** The Markdown versions of the pages (AGENT-002). Each reads the data its page reads; every line is on the page. */

type Part = string | Part[];
const flatten = (parts: Part[]): string[] => parts.flatMap((p) => (typeof p === "string" ? [p] : flatten(p)));
const lines = (...parts: Part[]) => `${flatten(parts).join("\n")}\n`;

export function homeMarkdown({ profile, about, stack, projects }: SiteData): string {
  return lines(
    `# ${profile.name}`,
    "",
    profile.role,
    "",
    profile.headline,
    "",
    profile.summary,
    "",
    "## about",
    "",
    about.bio.flatMap((p) => [p, ""]),
    "### working on now",
    "",
    about.workingOnNow.map((s) => `- ${s.text}`),
    "",
    "## stack",
    "",
    stack.groups.flatMap((g) => [`### ${g.name}`, "", g.items.map((i) => `- ${i}`), ""]),
    "## projects",
    "",
    projects.flatMap((p) => [
      `### ${p.name}`,
      "",
      p.summary,
      "",
      p.highlights.map((h) => `- ${h}`),
      ...(p.highlights.length ? [""] : []),
      p.stack.map((t) => `- ${t}`),
      "",
      `- [Source](${p.source})`,
      ...(p.demo ? [`- [Live demo](${p.demo})`] : []),
      "",
    ]),
    "## contact",
    "",
    `- [${profile.email}](mailto:${profile.email})`,
    `- [LinkedIn](${profile.links.linkedin})`,
    `- [GitHub](${profile.links.github})`,
  );
}

export function builtMarkdown(graph: SpecGraph): string {
  return lines(
    `# ${BUILT.heading}`,
    "",
    BUILT.intro.flatMap((p) => [p, ""]),
    countLine(graph.counts),
    "",
    graph.intents.flatMap((intent) => [
      `## ${intent.id} ${intent.title}`,
      "",
      intent.journeys.flatMap((j) => [
        `### ${j.id} ${j.title}`,
        "",
        j.steps.flatMap((s) => [`${s.n}. ${s.text}`, s.behaviors.map((b) => `   - [${b.id} ${b.title}](${b.url})`)]),
        "",
      ]),
    ]),
  );
}

export function notFoundMarkdown(): string {
  return lines(
    `# ${NOT_FOUND.heading}`,
    "",
    NOT_FOUND.prompt,
    "",
    NOT_FOUND.error,
    "",
    `[${NOT_FOUND.back}](${absolute("/")})`,
  );
}
