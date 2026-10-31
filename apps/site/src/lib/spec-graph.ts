import fs from "node:fs";
import path from "node:path";
import { REPO_URL } from "./pages";

/** specs/portfolio/graph.json, read at build time: the intents, the journeys that serve them and the behaviors behind each step. */
export interface Behavior {
  id: string;
  title: string;
  area: string;
  url: string;
}
export interface Step {
  n: number;
  text: string;
  behaviors: Behavior[];
}
export interface Journey {
  id: string;
  title: string;
  steps: Step[];
}
export interface Intent {
  id: string;
  title: string;
  journeys: Journey[];
}
export interface SpecGraph {
  intents: Intent[];
  counts: { intents: number; journeys: number; behaviors: number };
}

type Node = { kind: string; id: string; title: string; area?: string; file: string; line?: number };
type Edge = { from: string; to: string; type: string; step?: number; stepText?: string };

export function loadSpecGraph(): SpecGraph {
  // astro builds from apps/site
  const file = path.resolve(process.cwd(), "../../specs/portfolio/graph.json");
  const graph = JSON.parse(fs.readFileSync(file, "utf8")) as { nodes: Node[]; edges: Edge[] };
  const nodes = (kind: string) => graph.nodes.filter((n) => n.kind === kind);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const journey = (j: Node): Journey => {
    const uses = graph.edges.filter((e) => e.type === "uses" && e.from === j.id);
    const steps = new Map<number, Step>();
    for (const e of uses) {
      const b = byId.get(e.to)!;
      const step = steps.get(e.step!) ?? { n: e.step!, text: e.stepText!, behaviors: [] };
      step.behaviors.push({
        id: b.id,
        title: b.title,
        area: b.area ?? b.id.split("-")[0],
        url: `${REPO_URL}/blob/main/specs/portfolio/${b.file}#L${b.line}`,
      });
      steps.set(e.step!, step);
    }
    return { id: j.id, title: j.title, steps: [...steps.values()].sort((a, b) => a.n - b.n) };
  };

  const intents = nodes("intent").map((i) => ({
    id: i.id,
    title: i.title,
    journeys: graph.edges.filter((e) => e.type === "serves" && e.to === i.id).map((e) => journey(byId.get(e.from)!)),
  }));
  return {
    intents,
    counts: { intents: intents.length, journeys: nodes("journey").length, behaviors: nodes("behavior").length },
  };
}

export const countLine = (c: SpecGraph["counts"]) =>
  `${c.intents} intents, ${c.journeys} journeys and ${c.behaviors} behaviors.`;
