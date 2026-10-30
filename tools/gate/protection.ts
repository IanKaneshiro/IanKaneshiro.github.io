import type { Failure } from "./types";

/**
 * GATE-003: main only changes through a green pull request, for everyone.
 * Reads the rules GitHub applies to main (repository rulesets) and checks they say so.
 */

export const GITHUB_ACTIONS_APP_ID = 15368;

export type BranchRule = { type: string; ruleset_id?: number; parameters?: Record<string, unknown> };
export type Ruleset = { id: number; enforcement?: string; bypass_actors?: unknown[] };

const fix = "update the main ruleset in Settings → Rules (Ian only); see AGENTS.md";

export function evaluateProtection(rules: BranchRule[], rulesets: Ruleset[], requiredChecks: string[]): Failure[] {
  const failures: Failure[] = [];
  const has = (type: string) => rules.some((r) => r.type === type);
  const need = (type: string, message: string) => {
    if (!has(type)) failures.push({ rule: `ruleset-${type}`, message, fix });
  };
  need("pull_request", "main accepts direct pushes: no rule requires a pull request");
  need("non_fast_forward", "main accepts force pushes");
  need("deletion", "main can be deleted");

  const checks = rules
    .filter((r) => r.type === "required_status_checks")
    .flatMap((r) => (r.parameters?.required_status_checks as { context: string; integration_id?: number }[]) ?? []);
  for (const name of requiredChecks) {
    const c = checks.find((x) => x.context === name);
    if (!c) {
      failures.push({ rule: "required-check", message: `the ${name} check isn't required to merge`, fix });
    } else if (c.integration_id !== undefined && c.integration_id !== GITHUB_ACTIONS_APP_ID) {
      failures.push({
        rule: "required-check-source",
        message: `the ${name} check can be satisfied by something other than GitHub Actions`,
        fix,
      });
    }
  }

  for (const rs of rulesets) {
    if (rs.enforcement && rs.enforcement !== "active") {
      failures.push({ rule: "ruleset-enforcement", message: `ruleset ${rs.id} is ${rs.enforcement}, not active`, fix });
    }
    if (rs.bypass_actors?.length) {
      failures.push({
        rule: "ruleset-bypass",
        message: `ruleset ${rs.id} lets ${rs.bypass_actors.length} actor(s) bypass it, so admins could merge red`,
        fix,
      });
    }
  }
  return failures;
}
