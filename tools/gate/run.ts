import type { Check, CheckResult, Context, Failure } from "./types";

export type GateRun = { code: number; results: CheckResult[]; output: string };

export function formatFailure(f: Failure): string {
  const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}  ` : "";
  return `  ${where}[${f.rule}] ${f.message}\n    fix: ${f.fix}`;
}

/**
 * Runs checks in order and reports each one. Exits non-zero if any check fails,
 * naming every failed check (GATE-001). A check that throws counts as failed.
 */
export async function runGate(checks: Check[], ctx: Context, log: (s: string) => void = () => {}): Promise<GateRun> {
  const results: CheckResult[] = [];
  const lines: string[] = [];
  const say = (s: string) => {
    lines.push(s);
    log(s);
  };
  say(
    `gate · ${checks.length} ${checks.length === 1 ? "check" : "checks"}${ctx.base ? ` · against ${ctx.base.slice(0, 7)}` : ""}`,
  );
  for (const check of checks) {
    const started = performance.now();
    let result: CheckResult;
    try {
      const outcome = await check.run(ctx);
      result = { ...outcome, name: check.name, title: check.title, ms: performance.now() - started };
    } catch (err) {
      result = {
        name: check.name,
        title: check.title,
        status: "fail",
        failures: [
          {
            rule: "gate-error",
            message: `the check crashed: ${(err as Error).message}`,
            fix: "fix the error above, or the check itself if it's wrong (that needs Ian's sign-off)",
          },
        ],
        ms: performance.now() - started,
      };
    }
    results.push(result);
    const mark = { pass: "✓", fail: "✗", skip: "-" }[result.status];
    const time = `${(result.ms / 1000).toFixed(1)}s`;
    const detail =
      result.status === "fail"
        ? `${result.failures.length} ${result.failures.length === 1 ? "failure" : "failures"}`
        : result.status === "skip"
          ? `skipped: ${result.note}`
          : (result.note ?? "");
    say(`${mark} ${check.name.padEnd(16)} ${time.padStart(6)}  ${detail}`.trimEnd());
    for (const f of result.failures) say(formatFailure(f));
  }
  const failed = results.filter((r) => r.status === "fail").map((r) => r.name);
  say(
    failed.length
      ? `✗ ${failed.length} ${failed.length === 1 ? "check" : "checks"} failed: ${failed.join(", ")}`
      : "✓ gate passed",
  );
  return { code: failed.length ? 1 : 0, results, output: lines.join("\n") };
}
