import fs from "node:fs";
import path from "node:path";
import { loadGraph, type Graph } from "../specs/graph";
import { baseReport, scenarioReport, type Report } from "./behaviors";
import { addedDependencies, CHECKS, protectedFiles } from "./checks";
import { exec, resolveBase } from "./git";
import { PROTECTED } from "./pr";
import { runGate } from "./run";
import type { CheckResult } from "./types";

/**
 * GATE-020: drafts a pull request description with every fact filled in from the code:
 * the behaviors that now pass, what they serve, what changed, what's protected, what was
 * added, and each check's result. The summary, decisions, risks and review guide are left
 * as prompts for whoever opens the pull request; the pr-trace check fails until the
 * required ones are written (GATE-019).
 *
 *   bun run pr:body > pr.md      then fill in the prompts and: gh pr create --body-file pr.md
 */

export type FileChange = { file: string; added: number; removed: number };
export type Facts = {
  graph: Graph;
  before: Report;
  after: Report;
  changes: FileChange[];
  protectedFiles: string[];
  dependencies: { file: string; name: string }[];
  results: CheckResult[];
};

const AREAS: [string, RegExp][] = [
  ["Specs", /^specs\//],
  ["Gate", /^tools\/gate\//],
  ["Spec tooling", /^tools\/specs\//],
  ["Tests", /^tests\//],
  ["CI", /^\.github\//],
  ["Agent rules", /^(?:\.claude\/|AGENTS\.md$|CLAUDE\.md$)/],
  ["Docs", /^docs\//],
  ["Old site", /^(?:index\.html$|css\/|js\/|assets\/|CNAME$)/],
];
const GENERATED = /(?:^|\/)(?:GRAPH\.md|graph\.json|bun\.lock)$/;

export function areaOf(file: string): string {
  const pkg = /^(packages|apps)\/([^/]+)\//.exec(file);
  if (pkg) return `${pkg[1]}/${pkg[2]}`;
  return AREAS.find(([, re]) => re.test(file))?.[0] ?? "Config";
}

const prompt = (text: string) => `<!-- ${text} -->`;

export function renderBody(f: Facts): string {
  const nodes = new Map<string, { id: string; title: string }>(
    [...f.graph.intents, ...f.graph.journeys, ...f.graph.behaviors].map((n) => [n.id, n]),
  );
  const newlyPassing = f.graph.behaviors.filter((b) => f.after[b.id] === "pass" && f.before[b.id] !== "pass");
  const count = (r: Report) => Object.values(r).filter((s) => s === "pass").length;
  const active = Object.values(f.after).filter((s) => s !== "retired").length;

  // Spec trace: the journeys (and steps) using the new behaviors, and the intents those serve.
  const steps = new Map<string, Set<number>>();
  for (const b of newlyPassing) {
    for (const u of f.graph.usedBy[b.id] ?? []) {
      if (!steps.has(u.journey)) steps.set(u.journey, new Set());
      steps.get(u.journey)!.add(u.step);
    }
  }
  const intents = [
    ...new Set([...steps.keys()].flatMap((j) => f.graph.journeys.find((x) => x.id === j)?.intents ?? [])),
  ];

  // What changed, grouped by area.
  const byArea = new Map<string, FileChange[]>();
  for (const c of f.changes) byArea.set(areaOf(c.file), [...(byArea.get(areaOf(c.file)) ?? []), c]);

  const out: string[] = [];
  const h = (title: string) => out.push(`## ${title}`, "");

  h("Summary");
  out.push(prompt("What this does and why, in 2 to 4 sentences. Name the intent it serves."), "");

  h("Behaviors");
  if (newlyPassing.length) {
    out.push("| ID | Behavior | Before → after |", "|---|---|---|");
    for (const b of newlyPassing) out.push(`| ${b.id} | ${b.title} | ${f.before[b.id] ?? "new"} → pass |`);
  } else {
    out.push(prompt("No behavior changed status. List the IDs this works toward, or ask Ian for the chore label."));
  }
  out.push("");

  h("Spec trace");
  if (intents.length) {
    out.push(`**Intents:** ${intents.map((i) => `${i} ${nodes.get(i)?.title ?? ""}`).join(" · ")}`, "");
    out.push(
      `**Journeys:** ${[...steps]
        .map(([j, s]) => `${j} ${nodes.get(j)?.title ?? ""} (step ${[...s].sort((a, b) => a - b).join(", ")})`)
        .join(" · ")}`,
    );
  } else {
    out.push("No behaviors changed status, so there's nothing to trace.");
  }
  out.push("");

  h("What changed");
  if (f.changes.length) {
    out.push("| Area | Files | Lines |", "|---|---|---|");
    for (const [area, files] of [...byArea].sort(([a], [b]) => a.localeCompare(b))) {
      const added = files.reduce((n, c) => n + c.added, 0);
      const removed = files.reduce((n, c) => n + c.removed, 0);
      const list = files.map((c) => `\`${c.file}\`${GENERATED.test(c.file) ? " (generated)" : ""}`).join(", ");
      out.push(`| ${area} | ${list} | +${added} −${removed} |`);
    }
    out.push("", prompt("Add a line per area on what changed and why, where the file names don't say it."));
  } else {
    out.push("Nothing yet.");
  }
  out.push("");

  h("How it was verified");
  out.push("| Check | Result |", "|---|---|");
  for (const r of f.results) {
    const result =
      r.status === "fail"
        ? `✗ ${r.failures.length} ${r.failures.length === 1 ? "failure" : "failures"}`
        : r.status === "skip"
          ? `– ${r.note}`
          : `✓${r.note ? ` ${r.note}` : ""}`;
    out.push(`| \`${r.name}\` | ${result.replace(/\|/g, "\\|")} |`);
  }
  out.push(
    "",
    `Behavior coverage: ${count(f.before)} → ${count(f.after)} of ${active} pass, with no regressions against main.`,
    "",
    prompt("Anything else you checked: mutation tests, screenshots, manual runs."),
    "",
  );

  h("Decisions");
  out.push(prompt("Choices you made and the alternatives you rejected. Delete this section if there were none."), "");

  h("Protected changes");
  if (f.protectedFiles.length) {
    out.push("These change specs, gates or agent rules. Review them closely:", "");
    for (const file of f.protectedFiles) {
      const kind = PROTECTED.find(([, re]) => re.test(file))?.[0] ?? "gate scripts in package.json";
      out.push(`- \`${file}\` (${kind}): ${prompt("why it had to change")}`);
    }
  } else {
    out.push("None.");
  }
  out.push("");

  h("Dependencies");
  if (f.dependencies.length) {
    for (const d of f.dependencies) out.push(`- \`${d.name}\` (${d.file}): ${prompt("why it's needed")}`);
  } else {
    out.push("None.");
  }
  out.push("");

  h("Risks and follow-ups");
  out.push(
    prompt("What could break, what's deferred, open spec questions. Delete this section if there are none."),
    "",
  );

  h("Review guide");
  out.push(prompt("Where to start reading and in what order. Point at the riskiest change first."), "");

  return out.join("\n");
}

/** Lines added and removed per file since `base`, including untracked files. */
export function fileChanges(root: string, base: string): FileChange[] {
  const changes = exec(["git", "diff", "--numstat", base], root)
    .stdout.split("\n")
    .filter(Boolean)
    .map((l) => {
      const [a, r, file] = l.split("\t");
      return { file, added: Number(a) || 0, removed: Number(r) || 0 };
    });
  for (const file of exec(["git", "ls-files", "--others", "--exclude-standard"], root)
    .stdout.split("\n")
    .filter(Boolean)) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const lines = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
    changes.push({ file, added: lines, removed: 0 });
  }
  return changes.sort((a, b) => a.file.localeCompare(b.file));
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, "../..");
  const base = resolveBase(root);
  if (!base) {
    console.error("no base to compare with: fetch origin/main first (git fetch origin)");
    process.exit(2);
  }
  const ctx = { root, base, pr: null, ci: false };
  console.error("running the gate and the scenarios on this branch and on main…");
  const { results } = await runGate(CHECKS, ctx);
  const body = renderBody({
    graph: loadGraph(path.join(root, "specs/portfolio")),
    before: baseReport(root, base),
    after: scenarioReport(root),
    changes: fileChanges(root, base),
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
