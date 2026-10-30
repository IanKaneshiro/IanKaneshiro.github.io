import fs from "node:fs";
import path from "node:path";
import { CHECKS } from "./checks";
import { exec, resolveBase } from "./git";
import { runGate } from "./run";
import type { PullRequest } from "./types";

/**
 * bun run gate                         every check, in order (GATE-001)
 * bun run gate --only lint,typecheck   just these
 * bun run gate --report-dir dir        also write each result as dir/<check>.json (CI)
 */

const root = path.resolve(import.meta.dir, "../..");
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const only = opt("--only")?.split(",").filter(Boolean);
const unknown = only?.filter((n) => !CHECKS.some((c) => c.name === n)) ?? [];
if (unknown.length) {
  console.error(`unknown check: ${unknown.join(", ")}. Checks: ${CHECKS.map((c) => c.name).join(", ")}`);
  process.exit(2);
}
const checks = only ? CHECKS.filter((c) => only.includes(c.name)) : CHECKS;

function pullRequest(): PullRequest | null {
  const event = process.env.GITHUB_EVENT_PATH;
  if (event && fs.existsSync(event)) {
    const pr = JSON.parse(fs.readFileSync(event, "utf8")).pull_request;
    return pr
      ? { number: pr.number, body: pr.body ?? "", labels: (pr.labels ?? []).map((l: { name: string }) => l.name) }
      : null;
  }
  const r = exec(["gh", "pr", "view", "--json", "number,body,labels"], root);
  if (r.code !== 0) return null;
  const pr = JSON.parse(r.stdout);
  return { number: pr.number, body: pr.body ?? "", labels: pr.labels.map((l: { name: string }) => l.name) };
}

const ci = process.env.CI === "true";
const ctx = { root, base: resolveBase(root), pr: pullRequest(), ci };
const run = await runGate(checks, ctx, (line) => console.log(line));

const reportDir = opt("--report-dir");
if (reportDir) {
  fs.mkdirSync(reportDir, { recursive: true });
  for (const r of run.results)
    fs.writeFileSync(path.join(reportDir, `${r.name}.json`), `${JSON.stringify(r, null, 2)}\n`);
}
process.exit(run.code);
