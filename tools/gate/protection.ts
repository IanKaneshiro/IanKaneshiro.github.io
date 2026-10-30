import type { Failure } from "./types";

/**
 * GATE-003: main only changes through a green, approved pull request.
 *
 * Two repository rulesets apply to main:
 * - one with no bypass at all: a pull request, every required check, no force pushes, no deletion;
 * - one requiring an approving review (and a new one after any push), which only repository
 *   admins may bypass, and only when merging a pull request.
 */

export const GITHUB_ACTIONS_APP_ID = 15368;
export const ADMIN_ROLE_ID = 5;

export type BranchRule = { type: string; ruleset_id?: number; parameters?: Record<string, unknown> };
export type BypassActor = { actor_type: string; actor_id: number | null; bypass_mode?: string };
export type Ruleset = { id: number; enforcement?: string; bypass_actors?: BypassActor[] };

const fix = "update the main rulesets in Settings → Rules (Ian only); see AGENTS.md";

export function evaluateProtection(rules: BranchRule[], rulesets: Ruleset[], requiredChecks: string[]): Failure[] {
  const failures: Failure[] = [];
  const fail = (rule: string, message: string) => failures.push({ rule, message, fix });
  const byId = new Map(rulesets.map((r) => [r.id, r]));
  // Bypass lists are only visible to admins. When they aren't visible, rules count as strict.
  const bypassOf = (r: BranchRule) => byId.get(r.ruleset_id ?? -1)?.bypass_actors ?? [];
  const strict = rules.filter((r) => bypassOf(r).length === 0);
  const strictHas = (type: string) => strict.some((r) => r.type === type);
  const anyHas = (type: string) => rules.some((r) => r.type === type);
  const need = (type: string, missing: string, bypassable: string) => {
    if (!anyHas(type)) fail(`ruleset-${type}`, missing);
    else if (!strictHas(type)) fail("ruleset-bypass", bypassable);
  };

  need(
    "pull_request",
    "main accepts direct pushes: no rule requires a pull request",
    "admins can push to main directly",
  );
  need("non_fast_forward", "main accepts force pushes", "admins can force push to main");
  need("deletion", "main can be deleted", "admins can delete main");

  const checks = (list: BranchRule[]) =>
    list
      .filter((r) => r.type === "required_status_checks")
      .flatMap((r) => (r.parameters?.required_status_checks as { context: string; integration_id?: number }[]) ?? []);
  for (const name of requiredChecks) {
    const c = checks(rules).find((x) => x.context === name);
    if (!c) {
      fail("required-check", `the ${name} check isn't required to merge`);
    } else if (!checks(strict).some((x) => x.context === name)) {
      fail("ruleset-bypass", `admins can merge without the ${name} check, so they could merge red`);
    } else if (c.integration_id !== undefined && c.integration_id !== GITHUB_ACTIONS_APP_ID) {
      fail("required-check-source", `the ${name} check can be satisfied by something other than GitHub Actions`);
    }
  }

  const approvals = rules.filter(
    (r) => r.type === "pull_request" && Number(r.parameters?.required_approving_review_count ?? 0) >= 1,
  );
  if (!approvals.length) {
    fail("required-approval", "a pull request can merge without an approving review");
  } else {
    if (!approvals.some((r) => r.parameters?.require_last_push_approval === true)) {
      fail("last-push-approval", "a push after the approval doesn't need a new approval");
    }
    for (const r of approvals) {
      const others = bypassOf(r).filter(
        (a) => !(a.actor_type === "RepositoryRole" && a.actor_id === ADMIN_ROLE_ID && a.bypass_mode === "pull_request"),
      );
      if (others.length) {
        fail(
          "approval-bypass",
          `${others.length} actor(s) besides admins merging a pull request can skip the approval`,
        );
      }
    }
  }

  for (const rs of rulesets) {
    if (rs.enforcement && rs.enforcement !== "active") {
      fail("ruleset-enforcement", `ruleset ${rs.id} is ${rs.enforcement}, not active`);
    }
  }
  return failures;
}
