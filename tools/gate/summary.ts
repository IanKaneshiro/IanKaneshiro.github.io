import fs from "node:fs";
import path from "node:path";
import { CHECKS } from "./checks";
import type { CheckResult } from "./types";

/**
 * GATE-012: one comment on the pull request listing every failure, updated on every push.
 *
 *   bun tools/gate/summary.ts <reports dir>     (CI: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, GITHUB_SHA)
 */

export const MARKER = "<!-- gate-summary -->";

export function renderSummary(results: CheckResult[], sha = ""): string {
  const byName = new Map(results.map((r) => [r.name, r]));
  const failed = CHECKS.filter((c) => byName.get(c.name)?.status === "fail" || !byName.has(c.name));
  const lines = [
    MARKER,
    failed.length
      ? `## ✗ Gate: ${failed.length} of ${CHECKS.length} checks failed`
      : `## ✓ Gate passed: all ${CHECKS.length} checks`,
    "",
    "| Check | Result |",
    "|---|---|",
    ...CHECKS.map((c) => {
      const r = byName.get(c.name);
      const result = !r
        ? "✗ no result (the job didn't finish)"
        : r.status === "fail"
          ? `✗ ${r.failures.length} ${r.failures.length === 1 ? "failure" : "failures"}`
          : r.status === "skip"
            ? `– skipped: ${r.note}`
            : `✓${r.note ? ` ${r.note}` : ""}`;
      return `| \`${c.name}\` · ${c.title} | ${result.replace(/\|/g, "\\|")} |`;
    }),
  ];
  for (const r of results.filter((x) => x.status === "fail")) {
    lines.push("", `### ${r.name}`, "");
    for (const f of r.failures) {
      const where = f.file ? `\`${f.file}${f.line ? `:${f.line}` : ""}\` ` : "";
      lines.push(`- ${where}**${f.rule}**: ${f.message}. Fix: ${f.fix}`);
    }
  }
  lines.push("", `_Run \`bun run gate\` locally to reproduce.${sha ? ` Updated for ${sha.slice(0, 7)}.` : ""}_`);
  return lines.join("\n");
}

export type Comment = { id: number; body: string; user: { login: string } };

/** Update the gate's own comment if there is one, otherwise create it. */
export function planUpsert(comments: Comment[]): { action: "update"; id: number } | { action: "create" } {
  const mine = comments.find((c) => c.body.startsWith(MARKER) && c.user.login === "github-actions[bot]");
  return mine ? { action: "update", id: mine.id } : { action: "create" };
}

if (import.meta.main) {
  const dir = process.argv[2] ?? "gate-reports";
  const results: CheckResult[] = fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    : [];
  const body = renderSummary(results, process.env.GITHUB_SHA);
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) {
    console.log(body);
    process.exit(0);
  }
  const api = (url: string, init: RequestInit = {}) =>
    fetch(`https://api.github.com/${url}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", ...init.headers },
    }).then(async (r) => {
      if (!r.ok) throw new Error(`${init.method ?? "GET"} ${url}: ${r.status} ${await r.text()}`);
      return r.json();
    });
  const comments = (await api(`repos/${repo}/issues/${pr}/comments?per_page=100`)) as Comment[];
  const plan = planUpsert(comments);
  const init = { method: plan.action === "update" ? "PATCH" : "POST", body: JSON.stringify({ body }) };
  await api(
    plan.action === "update" ? `repos/${repo}/issues/comments/${plan.id}` : `repos/${repo}/issues/${pr}/comments`,
    init,
  );
  console.log(`${plan.action === "update" ? "updated" : "posted"} the gate summary on #${pr}`);
}
