import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "./git";
import type { Failure } from "./types";

/** GATE-007: behavior coverage never drops below main's. */

export type Report = Record<string, string>;

/** Runs the scenario suite in `dir` and returns each behavior's status. {} if `dir` has no suite. */
export function scenarioReport(dir: string): Report {
  if (!fs.existsSync(path.join(dir, "tests/scenarios.test.ts"))) return {};
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gate-behaviors-")), "report.json");
  exec(["bun", "test", "tests/scenarios.test.ts"], dir, { GATE_BEHAVIORS_REPORT: out });
  if (!fs.existsSync(out)) throw new Error(`the scenario suite in ${dir} didn't write a report`);
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

/** Runs main's scenario suite in a throwaway worktree at `base`. */
export function baseReport(root: string, base: string): Report {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-base-"));
  const add = exec(["git", "worktree", "add", "--detach", "--force", dir, base], root);
  if (add.code !== 0) throw new Error(`couldn't check out ${base}: ${add.stderr.trim()}`);
  try {
    if (!fs.existsSync(path.join(dir, "tests/scenarios.test.ts"))) return {};
    const install = exec(["bun", "install", "--frozen-lockfile"], dir);
    if (install.code !== 0) throw new Error(`bun install failed at ${base}: ${install.stderr.trim()}`);
    return scenarioReport(dir);
  } finally {
    exec(["git", "worktree", "remove", "--force", dir], root);
  }
}

export function compareCoverage(base: Report, head: Report): Failure[] {
  return Object.entries(base)
    .filter(([id, s]) => s === "pass" && head[id] !== "pass" && head[id] !== "retired")
    .map(([id]) => ({
      rule: "coverage-dropped",
      message: `${id} passes on main but is ${head[id] ?? "missing"} here`,
      fix: `make ${id} pass again (bun test tests/scenarios.test.ts -t "${id}"); if the behavior should go, ask Ian to retire it in the specs`,
    }));
}
