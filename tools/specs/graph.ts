import fs from "node:fs";
import path from "node:path";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";

/**
 * Loads the spec graph: intents (why) ← served by journeys (who, how) → whose steps use
 * behaviors (Gherkin scenarios). Edges live only in journey front matter; everything
 * else here is derived. Never throws on bad input: problems are collected instead, so
 * the review UI keeps working while a file is half-edited.
 */

export type Intent = { kind: "intent"; id: string; title: string; status: string; retired: boolean; file: string; body: string };
export type JourneyStep = { do: string; behaviors: string[] };
export type Journey = {
  kind: "journey"; id: string; title: string; actor: string; status: string; retired: boolean;
  intents: string[]; steps: JourneyStep[]; file: string; body: string;
};
export type BehaviorStep = { keyword: string; text: string };
export type Behavior = {
  kind: "behavior"; id: string; title: string; area: string; tags: string[]; retired: boolean;
  steps: BehaviorStep[]; file: string; line: number;
};
export type Feature = { file: string; area: string; title: string; description: string; behaviors: string[] };
export type Use = { journey: string; step: number };
export type Graph = {
  intents: Intent[]; journeys: Journey[]; features: Feature[]; behaviors: Behavior[];
  /** intent id → journey ids that serve it */
  servedBy: Record<string, string[]>;
  /** behavior id → journey steps (1-based) that use it */
  usedBy: Record<string, Use[]>;
  problems: string[];
};

const INTENT_ID = /^INT-\d{3}$/;
const JOURNEY_ID = /^JRN-\d{3}$/;
const BEHAVIOR_TAG = /^@([A-Z][A-Z0-9]*)-(\d{3})$/;
const AREA_TAG = /^@area-([A-Z][A-Z0-9]*)$/;

function listFiles(dir: string, ext: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : [];
}

function frontMatter(text: string): { data: Record<string, any>; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const data = Bun.YAML.parse(m[1]);
  return data && typeof data === "object" ? { data: data as Record<string, any>, body: m[2].trim() } : null;
}

export function loadGraph(root: string): Graph {
  const problems: string[] = [];
  const ids = new Map<string, string>(); // id → where it was first defined
  const claim = (id: string, where: string) => {
    const prior = ids.get(id);
    if (prior) problems.push(`${where}: ${id} is already used at ${prior}`);
    else ids.set(id, where);
  };

  const readMd = (sub: string) =>
    listFiles(path.join(root, sub), ".md").flatMap((f) => {
      const file = `${sub}/${f}`;
      try {
        const fm = frontMatter(fs.readFileSync(path.join(root, file), "utf8"));
        if (!fm) { problems.push(`${file}: no YAML front matter`); return []; }
        return [{ file, ...fm }];
      } catch (e) {
        problems.push(`${file}: ${(e as Error).message}`);
        return [];
      }
    });

  const intents: Intent[] = readMd("intents").map(({ file, data, body }) => {
    const id = String(data.id ?? "");
    if (!INTENT_ID.test(id)) problems.push(`${file}: intent id "${id}" should look like INT-001`);
    claim(id, file);
    const status = String(data.status ?? "active");
    return { kind: "intent", id, title: String(data.title ?? ""), status, retired: status === "retired", file, body };
  });

  const journeys: Journey[] = readMd("journeys").map(({ file, data, body }) => {
    const id = String(data.id ?? "");
    if (!JOURNEY_ID.test(id)) problems.push(`${file}: journey id "${id}" should look like JRN-001`);
    claim(id, file);
    const status = String(data.status ?? "active");
    const steps: JourneyStep[] = (Array.isArray(data.steps) ? data.steps : []).map((s: any) => ({
      do: String(s?.do ?? ""),
      behaviors: Array.isArray(s?.behaviors) ? s.behaviors.map(String) : [],
    }));
    return {
      kind: "journey", id, title: String(data.title ?? ""), actor: String(data.actor ?? ""), status,
      retired: status === "retired", intents: Array.isArray(data.intents) ? data.intents.map(String) : [],
      steps, file, body,
    };
  });

  const features: Feature[] = [];
  const behaviors: Behavior[] = [];
  for (const f of listFiles(path.join(root, "features"), ".feature")) {
    const file = `features/${f}`;
    let doc;
    try {
      doc = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher())
        .parse(fs.readFileSync(path.join(root, file), "utf8"));
    } catch (e) {
      problems.push(`${file}: ${(e as Error).message.replace(/\s+/g, " ")}`);
      continue;
    }
    if (!doc.feature) { problems.push(`${file}: no Feature`); continue; }
    const area = doc.feature.tags.map((t) => AREA_TAG.exec(t.name)?.[1]).find(Boolean) ?? "";
    if (!area) problems.push(`${file}: feature has no @area- tag`);
    const feature: Feature = {
      file, area, title: doc.feature.name, description: doc.feature.description.replace(/^\s+/gm, "").trim(), behaviors: [],
    };
    for (const child of doc.feature.children) {
      const s = child.scenario;
      if (!s) continue;
      const at = `${file}:${s.location.line}`;
      const tags = s.tags.map((t) => t.name);
      const idTags = tags.filter((t) => BEHAVIOR_TAG.test(t));
      if (idTags.length !== 1) { problems.push(`${at}: "${s.name}" needs exactly one @AREA-NNN tag, found ${idTags.length}`); continue; }
      const id = idTags[0].slice(1);
      if (area && !id.startsWith(`${area}-`)) problems.push(`${at}: ${id} is not in this feature's area ${area}`);
      claim(id, at);
      behaviors.push({
        kind: "behavior", id, title: s.name, area, tags: tags.filter((t) => t !== idTags[0]),
        retired: tags.includes("@retired"),
        steps: s.steps.map((st) => ({ keyword: st.keyword.trim(), text: st.text })),
        file, line: s.location.line,
      });
      feature.behaviors.push(id);
    }
    features.push(feature);
  }

  // Edges, all read from journeys.
  const intentById = new Map(intents.map((i) => [i.id, i]));
  const behaviorById = new Map(behaviors.map((b) => [b.id, b]));
  const servedBy: Record<string, string[]> = {};
  const usedBy: Record<string, Use[]> = {};
  for (const j of journeys) {
    if (j.retired) continue;
    if (!j.intents.length) problems.push(`${j.file}: ${j.id} serves no intent`);
    for (const i of j.intents) {
      const intent = intentById.get(i);
      if (!intent) problems.push(`${j.file}: intent ${i} doesn't exist`);
      else if (intent.retired) problems.push(`${j.file}: intent ${i} is retired`);
      else (servedBy[i] ??= []).includes(j.id) || servedBy[i].push(j.id);
    }
    if (!j.steps.length) problems.push(`${j.file}: ${j.id} has no steps`);
    j.steps.forEach((s, k) => {
      if (!s.behaviors.length) problems.push(`${j.file}: step ${k + 1} names no behavior`);
      for (const b of s.behaviors) {
        const behavior = behaviorById.get(b);
        if (!behavior) problems.push(`${j.file}: step ${k + 1}: behavior ${b} doesn't exist`);
        else if (behavior.retired) problems.push(`${j.file}: step ${k + 1}: behavior ${b} is retired`);
        else (usedBy[b] ??= []).push({ journey: j.id, step: k + 1 });
      }
    });
  }
  for (const i of intents) if (!i.retired && !servedBy[i.id]) problems.push(`${i.file}: ${i.id} is served by no journey`);
  for (const b of behaviors) if (!b.retired && !usedBy[b.id]) problems.push(`${b.file}:${b.line}: ${b.id} is in no journey`);

  return { intents, journeys, features, behaviors, servedBy, usedBy, problems };
}

/** GRAPH.md: a Mermaid overview, then every journey's steps and every area's behaviors. */
export function renderGraphMarkdown(g: Graph): string {
  const node = (id: string) => id.replace("-", "_");
  const label = (s: string) => s.replace(/"/g, "'");
  const files = new Map<string, string>([
    ...g.intents.map((i) => [i.id, i.file] as const),
    ...g.journeys.map((j) => [j.id, j.file] as const),
    ...g.behaviors.map((b) => [b.id, `${b.file}#L${b.line}`] as const),
  ]);
  const titles = new Map<string, string>([...g.intents, ...g.journeys, ...g.behaviors].map((n) => [n.id, n.title]));
  const link = (id: string) => (files.has(id) ? `[${id}](${files.get(id)})` : id);

  const L = [
    "# Spec graph",
    "",
    `Generated by \`bun run specs:graph\`; do not edit by hand. ${g.intents.length} intents, ${g.journeys.length} journeys, ${g.behaviors.length} behaviors.`,
    "",
    "## Intents and journeys",
    "",
    "```mermaid",
    "flowchart LR",
    ...g.intents.map((i) => `  ${node(i.id)}["${i.id}<br/>${label(i.title)}"]:::intent`),
    ...g.journeys.map((j) => `  ${node(j.id)}("${j.id}<br/>${label(j.title)}"):::journey`),
    ...g.journeys.flatMap((j) => j.intents.map((i) => `  ${node(j.id)} --> ${node(i)}`)),
    "  classDef intent fill:#083344,stroke:#22d3ee,color:#ecfeff",
    "  classDef journey fill:#111827,stroke:#6b7280,color:#f9fafb",
    "```",
    "",
    "## Intents",
    "",
    "| Intent | Journeys |",
    "|---|---|",
    ...g.intents.map((i) => `| ${link(i.id)} ${i.title} | ${(g.servedBy[i.id] ?? []).map(link).join(", ")} |`),
    "",
    "## Journeys",
    "",
  ];
  for (const j of g.journeys) {
    L.push(
      `### ${j.id} · ${j.title}`,
      "",
      `[${j.file}](${j.file}) · **Actor:** ${j.actor} · **Serves:** ${j.intents.map(link).join(", ")}`,
      "",
      "| # | Step | Behaviors |",
      "|---|---|---|",
      ...j.steps.map((s, k) => `| ${k + 1} | ${s.do} | ${s.behaviors.map((b) => `${link(b)} ${titles.get(b) ?? "?"}`).join("<br/>")} |`),
      "",
    );
  }
  L.push("## Behaviors by area", "");
  for (const f of g.features) {
    L.push(`### ${f.area} · ${f.title}`, "", `[${f.file}](${f.file})`, "", "| ID | Behavior | Journeys |", "|---|---|---|");
    for (const id of f.behaviors) {
      const journeys = [...new Set((g.usedBy[id] ?? []).map((u) => u.journey))];
      L.push(`| ${link(id)} | ${titles.get(id)} | ${journeys.map(link).join(", ")} |`);
    }
    L.push("");
  }
  return L.join("\n");
}

/** graph.json: every node and edge, for agents and for the site's "How this site was built" page. */
export function renderGraphJson(g: Graph): string {
  const nodes = [
    ...g.intents.map(({ body: _, ...i }) => i),
    ...g.journeys.map(({ body: _, steps: __, ...j }) => j),
    ...g.behaviors,
  ];
  const edges = [
    ...g.journeys.flatMap((j) => j.intents.map((to) => ({ from: j.id, to, type: "serves" }))),
    ...g.journeys.flatMap((j) =>
      j.steps.flatMap((s, k) => s.behaviors.map((to) => ({ from: j.id, to, type: "uses", step: k + 1, stepText: s.do }))),
    ),
  ];
  return `${JSON.stringify({ nodes, edges }, null, 2)}\n`;
}
