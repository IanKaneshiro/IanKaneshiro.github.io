import type { Behavior, Graph, Intent, Journey } from "./graph";

/**
 * Questions an agent asks the graph before changing anything:
 * where does this request belong (find, GRAPH-009), and what's around this node (trace, GRAPH-008).
 */

type Node = Intent | Journey | Behavior;

export const where = (n: Node) => (n.kind === "behavior" ? `${n.file}:${n.line}` : n.file);
const line = (n: Node, indent = "  ") => `${indent}${n.id}  ${n.title}  (${where(n)})`;

function index(g: Graph) {
  return new Map<string, Node>([...g.intents, ...g.journeys, ...g.behaviors].map((n) => [n.id, n]));
}

function text(n: Node): string {
  if (n.kind === "intent") return `${n.id} ${n.title} ${n.body}`;
  if (n.kind === "journey") return `${n.id} ${n.title} ${n.actor} ${n.body} ${n.steps.map((s) => s.do).join(" ")}`;
  return `${n.id} ${n.title} ${n.tags.join(" ")} ${n.steps.map((s) => s.text).join(" ")}`;
}

export type Hit = { id: string; kind: Node["kind"]; title: string; where: string; score: number };

/** Nodes whose text contains every word, best first: ID matches, then title matches, then intents before journeys before behaviors. */
export function find(g: Graph, query: string): Hit[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const n of index(g).values()) {
    const body = text(n).toLowerCase();
    if (!words.every((w) => body.includes(w))) continue;
    const id = n.id.toLowerCase();
    const area = id.replace(/-\d+$/, "");
    const title = n.title.toLowerCase();
    let score = id === q ? 1000 : 0;
    for (const w of words) score += (w === id ? 50 : w === area ? 5 : 0) + (title.includes(w) ? 10 : 0);
    score += { intent: 3, journey: 2, behavior: 1 }[n.kind] + (n.retired ? -100 : 0);
    hits.push({ id: n.id, kind: n.kind, title: n.title, where: where(n), score });
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function formatHits(hits: Hit[], limit = 20): string {
  if (!hits.length) return "no matches";
  const shown = hits.slice(0, limit).map((h) => `${h.kind.padEnd(8)} ${h.id.padEnd(10)} ${h.title}  (${h.where})`);
  return [...shown, ...(hits.length > limit ? [`… and ${hits.length - limit} more`] : [])].join("\n");
}

/** Everything around a node: the intents above it, and the journeys and behaviors it connects to. */
export function trace(g: Graph, id: string): string | null {
  const nodes = index(g);
  const n = nodes.get(id);
  if (!n) return null;
  const get = (x: string) => nodes.get(x);
  const out = [`${n.kind} ${line(n, "")}${n.retired ? "  [retired]" : ""}`];

  if (n.kind === "intent") {
    const journeys = (g.servedBy[n.id] ?? []).map(get).filter((j): j is Journey => j?.kind === "journey");
    out.push("", "served by journeys");
    for (const j of journeys) {
      out.push(line(j));
      j.steps.forEach((s, k) => {
        out.push(`      ${k + 1}. ${s.do}`);
        for (const b of s.behaviors) if (get(b)) out.push(line(get(b)!, "         "));
      });
    }
  }

  if (n.kind === "journey") {
    out.push(`  actor: ${n.actor}`, "", "serves intents");
    for (const i of n.intents) if (get(i)) out.push(line(get(i)!));
    out.push("", "steps");
    n.steps.forEach((s, k) => {
      out.push(`  ${k + 1}. ${s.do}`);
      for (const b of s.behaviors) if (get(b)) out.push(line(get(b)!, "       "));
    });
  }

  if (n.kind === "behavior") {
    const uses = g.usedBy[n.id] ?? [];
    const journeys = [...new Set(uses.map((u) => u.journey))]
      .map(get)
      .filter((j): j is Journey => j?.kind === "journey");
    const intents = [...new Set(journeys.flatMap((j) => j.intents))].map(get).filter((i): i is Intent => !!i);
    out.push("", "intents", ...intents.map((i) => line(i)));
    out.push("", "journeys");
    for (const u of uses) {
      const j = get(u.journey) as Journey;
      out.push(`${line(j)}\n      step ${u.step}: ${j.steps[u.step - 1].do}`);
    }
    const siblings = new Set<string>();
    for (const u of uses)
      for (const b of (get(u.journey) as Journey).steps[u.step - 1].behaviors) if (b !== n.id) siblings.add(b);
    out.push(
      "",
      "shares steps with",
      ...[...siblings]
        .map(get)
        .filter((x): x is Node => !!x)
        .map((x) => line(x)),
    );
  }
  return out.join("\n");
}
