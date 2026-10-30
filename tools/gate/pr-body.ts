import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadGraph, type Behavior, type Graph } from "../specs/graph";
import { baseReport, scenarioReport, type Report } from "./behaviors";
import { addedDependencies, CHECKS, protectedFiles } from "./checks";
import { resolveBase } from "./git";
import { protectedKind } from "./pr";
import { runGate } from "./run";
import type { CheckResult } from "./types";

/**
 * GATE-020: drafts a short pull request description with the facts filled in from the code:
 * the behaviors that are new or changed and what they serve, the files to review closely, the
 * added dependencies, and the gate and coverage results. The summary, review guide and notes are
 * left as prompts; the pr-trace check fails until the required ones are written (GATE-019).
 *
 *   bun run pr:body --out pr.md     then fill in the prompts and open it with bun run agent:gh
 */

export type Facts = {
  graph: Graph;
  /** The specs on main, to tell changed behaviors from untouched ones. */
  baseGraph: Graph | null;
  before: Report;
  after: Report;
  protectedFiles: string[];
  dependencies: { file: string; name: string }[];
  results: CheckResult[];
};

const GENERATED = /(?:^|\/)(?:GRAPH\.md|graph\.json|bun\.lock)$/;
const prompt = (text: string) => `<!-- ${text} -->`;
const scenarioText = (b: Behavior) => JSON.stringify([b.title, b.tags, b.steps]);

/** Behaviors that pass now and either didn't before, or whose scenario was rewritten. */
export type Listed = { behavior: Behavior; change: "new" | "changed" };
export function newOrChanged(f: Facts): Listed[] {
  const before = new Map((f.baseGraph?.behaviors ?? []).map((b) => [b.id, b]));
  return f.graph.behaviors.flatMap((b): Listed[] => {
    if (b.retired || f.after[b.id] !== "pass") return [];
    if (f.before[b.id] !== "pass") return [{ behavior: b, change: "new" }];
    const old = before.get(b.id);
    return old && scenarioText(old) !== scenarioText(b) ? [{ behavior: b, change: "changed" }] : [];
  });
}

export function renderBody(f: Facts): string {
  const title = (id: string) => [...f.graph.intents, ...f.graph.journeys].find((n) => n.id === id)?.title ?? "";
  const listed = newOrChanged(f);
  const out: string[] = [];

  out.push("## Summary", "", prompt("What this does and why, in 2 or 3 sentences."), "");

  out.push("## Behaviors", "");
  if (listed.length) {
    for (const { behavior, change } of listed) out.push(`- ${behavior.id} ${behavior.title} (${change})`);
    const steps = new Map<string, Set<number>>();
    for (const { behavior } of listed) {
      for (const u of f.graph.usedBy[behavior.id] ?? [])
        steps.set(u.journey, (steps.get(u.journey) ?? new Set()).add(u.step));
    }
    const intents = [
      ...new Set([...steps.keys()].flatMap((j) => f.graph.journeys.find((x) => x.id === j)?.intents ?? [])),
    ];
    const serves = [
      ...intents.map((i) => `${i} ${title(i)}`),
      ...[...steps].map(([j, s]) => `${j} step ${[...s].sort((a, b) => a - b).join(", ")}`),
    ];
    if (serves.length) out.push("", `Serves ${serves.join(" · ")}`);
  } else {
    out.push(prompt("No behavior is new or changed. Name the IDs this works toward, or ask Ian for the chore label."));
  }
  out.push("");

  out.push("## Review guide", "", prompt("Where to start and what deserves the closest look, riskiest first."));
  const review = f.protectedFiles.filter((file) => !GENERATED.test(file));
  if (review.length) {
    const byKind = new Map<string, string[]>();
    for (const file of review) byKind.set(protectedKind(file), [...(byKind.get(protectedKind(file)) ?? []), file]);
    const groups = [...byKind].map(([kind, files]) => `${kind}: ${files.map((x) => `\`${x}\``).join(", ")}`);
    out.push("", `Review closely (${groups.join("; ")})`);
  }
  out.push("");

  const failed = f.results.filter((r) => r.status === "fail").map((r) => r.name);
  const passed = f.results.filter((r) => r.status === "pass").length;
  const skipped = f.results.filter((r) => r.status === "skip").length;
  const count = (r: Report) => Object.values(r).filter((s) => s === "pass").length;
  const active = Object.values(f.after).filter((s) => s !== "retired").length;
  const gate = failed.length
    ? `✗ failing: ${failed.join(", ")}`
    : `✓ ${passed} checks pass${skipped ? `, ${skipped} run only on the pull request` : ""}`;
  out.push(
    "## Verification",
    "",
    `Gate ${gate} · behaviors ${count(f.before)} → ${count(f.after)} of ${active} pass`,
    "",
    prompt("Anything beyond the gate: mutation tests, screenshots, manual runs. Delete if nothing."),
    "",
  );

  out.push(
    "## Notes",
    "",
    prompt("Decisions, risks and follow-ups worth Ian's attention. Delete this section if none."),
    "",
  );

  if (f.dependencies.length) {
    out.push("## Dependencies", "");
    for (const d of f.dependencies) out.push(`- \`${d.name}\`: ${prompt("why it's needed")}`);
    out.push("");
  }
  return out.join("\n");
}

/** The spec set as it is at `base`, extracted to a temp dir. */
export function specsAt(root: string, base: string): Graph | null {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "specs-at-"));
  const archive = Bun.spawnSync(["git", "archive", base, "specs/portfolio"], { cwd: root });
  if (archive.exitCode !== 0) return null;
  const untar = Bun.spawnSync(["tar", "-x", "-C", dir], { stdin: archive.stdout });
  return untar.exitCode === 0 ? loadGraph(path.join(dir, "specs/portfolio")) : null;
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, "../..");
  const base = resolveBase(root);
  if (!base) {
    console.error("no base to compare with: fetch origin/main first (git fetch origin)");
    process.exit(2);
  }
  console.error("running the gate and the scenarios on this branch and on main…");
  const { results } = await runGate(CHECKS, { root, base, pr: null, ci: false });
  const body = renderBody({
    graph: loadGraph(path.join(root, "specs/portfolio")),
    baseGraph: specsAt(root, base),
    before: baseReport(root, base),
    after: scenarioReport(root),
    protectedFiles: protectedFiles(root, base),
    dependencies: addedDependencies(root, base),
    results,
  });
  const outAt = process.argv.indexOf("--out");
  if (outAt > 0) {
    fs.writeFileSync(process.argv[outAt + 1], body);
    console.error(`wrote ${process.argv[outAt + 1]}`);
  } else {
    console.log(body);
  }
}
