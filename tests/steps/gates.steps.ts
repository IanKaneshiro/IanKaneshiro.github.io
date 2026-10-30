import { expect } from "bun:test";
import { ESLint } from "eslint";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import stylelint from "stylelint";
import { compareCoverage } from "../../tools/gate/behaviors";
import { addedDependencies, CHECKS, eslintFailures, protectedFiles, stylelintFailures } from "../../tools/gate/checks";
import { exec } from "../../tools/gate/git";
import { checkHygiene } from "../../tools/gate/hygiene";
import {
  behaviorIds,
  checkDependencies,
  checkSections,
  checkTrace,
  PR_SECTIONS,
  protectedChanges,
  protectedNote,
  prTraceFailures,
  section,
} from "../../tools/gate/pr";
import { fileChanges, renderBody } from "../../tools/gate/pr-body";
import {
  ADMIN_ROLE_ID,
  evaluateProtection,
  GITHUB_ACTIONS_APP_ID,
  type BranchRule,
  type Ruleset,
} from "../../tools/gate/protection";
import { APP, botEmail, botName, evaluateAppPermissions, installationToken } from "../../tools/agent/app";
import { refuseGh, refusePush } from "../../tools/agent/guard";
import { runGate, type GateRun } from "../../tools/gate/run";
import { scanSecrets } from "../../tools/gate/secrets";
import { MARKER, planUpsert, renderSummary } from "../../tools/gate/summary";
import type { Check, CheckResult, Context, Failure } from "../../tools/gate/types";
import { loadGraph } from "../../tools/specs/graph";
import { featureFiles, loadScenarios } from "../support/gherkin";
import { status } from "../support/status";
import { Given, steps, Then, When } from "../support/steps";

// Fixture text is assembled at runtime where it would otherwise trip the gate's own
// hygiene and secret checks on this file.

const ROOT = path.resolve(import.meta.dir, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

type Job = { "timeout-minutes"?: number; needs?: unknown; strategy?: Record<string, unknown>; steps?: unknown[] };
type Workflow = { on: { pull_request: { types: string[] } }; jobs: Record<string, Job> };
const workflow = () => Bun.YAML.parse(read(".github/workflows/gate.yml")) as Workflow;
const ciChecks = () => (workflow().jobs.check.strategy!.matrix as { check: string[] }).check;
const agents = () => read("AGENTS.md");
const settings = () => JSON.parse(read(".claude/settings.json"));
const ctx = (root = ROOT): Context => ({ root, base: null, pr: null, ci: false });
const check = (name: string) => CHECKS.find((c) => c.name === name)!;
const names = CHECKS.map((c) => c.name);
const rules = (failures: Failure[]) => failures.map((f) => f.rule);

/** A temp dir that can run the repo's tools: node_modules linked in, plus the given files. */
function sandbox(files: Record<string, string>, copy: string[] = []): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-sandbox-"));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  for (const f of copy) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  return dir;
}

/** Claude Code's matching for Bash(...) permission rules: `*` matches anything. */
function denied(command: string): boolean {
  return (settings().permissions.deny as string[])
    .map((r) => /^Bash\((.*)\)$/.exec(r)?.[1])
    .filter((p): p is string => !!p)
    .some((p) =>
      new RegExp(
        `^${p
          .split("*")
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*")}$`,
      ).test(command),
    );
}

const fake = (name: string, failures: Failure[] = []): Check => ({
  name,
  title: name,
  run: async () => ({ status: failures.length ? "fail" : "pass", failures }),
});

// ── GATE-001 One gate command ───────────────────────────

When('I run "bun run gate"', async (world) => {
  expect(JSON.parse(read("package.json")).scripts.gate).toBe("bun tools/gate/cli.ts");
  const failing = new Set(["lint", "secrets"]);
  world.run = await runGate(
    CHECKS.map((c) => fake(c.name, failing.has(c.name) ? [{ rule: "r", message: "m", fix: "f" }] : [])),
    ctx(),
  );
});

Then("every check that CI runs, runs locally in the same order", (world) => {
  expect(ciChecks()).toEqual(names);
  expect((world.run as GateRun).results.map((r) => r.name)).toEqual(ciChecks());
});

Then("it exits non-zero, naming each check that failed", (world) => {
  const run = world.run as GateRun;
  expect(run.code).not.toBe(0);
  expect(run.output.trim().split("\n").at(-1)).toBe("✗ 2 checks failed: lint, secrets");
});

// ── GATE-003 main only changes through a green, approved pull request ─

const ADMIN_PR_BYPASS = { actor_type: "RepositoryRole", actor_id: ADMIN_ROLE_ID, bypass_mode: "pull_request" };
const goodRulesets = (): Ruleset[] => [
  { id: 1, enforcement: "active", bypass_actors: [] },
  { id: 2, enforcement: "active", bypass_actors: [{ ...ADMIN_PR_BYPASS }] },
];
const goodRules = (): BranchRule[] => [
  { type: "pull_request", ruleset_id: 1, parameters: { required_approving_review_count: 0 } },
  { type: "non_fast_forward", ruleset_id: 1 },
  { type: "deletion", ruleset_id: 1 },
  {
    type: "required_status_checks",
    ruleset_id: 1,
    parameters: {
      required_status_checks: names.map((context) => ({ context, integration_id: GITHUB_ACTIONS_APP_ID })),
    },
  },
  {
    type: "pull_request",
    ruleset_id: 2,
    parameters: { required_approving_review_count: 1, require_last_push_approval: true },
  },
];
const requiredChecks = (r: BranchRule[]) =>
  r.find((x) => x.type === "required_status_checks")!.parameters!.required_status_checks as {
    context: string;
    integration_id: number;
  }[];
const protection = (r = goodRules(), rs = goodRulesets()) => evaluateProtection(r, rs, names);

Then("main rejects direct pushes and force pushes", () => {
  expect(protection()).toEqual([]);
  const noPr = goodRules().filter((r) => r.type !== "pull_request");
  expect(protection(noPr)[0].message).toContain("direct pushes");
  const noFf = goodRules().filter((r) => r.type !== "non_fast_forward");
  expect(protection(noFf)[0].message).toContain("force pushes");
});

Then("a pull request can't merge until every required check passes", () => {
  const missing = goodRules();
  const checks = missing.find((x) => x.type === "required_status_checks")!;
  checks.parameters!.required_status_checks = requiredChecks(missing).filter((c) => c.context !== "lint");
  const f = protection(missing);
  expect(rules(f)).toEqual(["required-check"]);
  expect(f[0].message).toContain("lint");

  const spoofable = goodRules();
  requiredChecks(spoofable)[0].integration_id = 1;
  expect(rules(protection(spoofable))).toEqual(["required-check-source"]);
});

Then("these rules apply to admins too, so nobody can merge red", () => {
  const bypassable = goodRulesets();
  bypassable[0].bypass_actors = [{ ...ADMIN_PR_BYPASS }];
  const f = protection(goodRules(), bypassable);
  expect(new Set(rules(f))).toEqual(new Set(["ruleset-bypass"]));
  expect(f.map((x) => x.message)).toContain("admins can merge without the lint check, so they could merge red");
  expect(
    rules(protection(goodRules(), [{ id: 1, enforcement: "evaluate", bypass_actors: [] }, goodRulesets()[1]])),
  ).toEqual(["ruleset-enforcement"]);
});

Then("a pull request can't merge without an approving review, and a push after the approval needs a new one", () => {
  const noApproval = goodRules().filter((r) => r.ruleset_id !== 2);
  expect(protection(noApproval).map((f) => f.message)).toEqual([
    "a pull request can merge without an approving review",
  ]);
  const stale = goodRules();
  stale[4].parameters = { required_approving_review_count: 1, require_last_push_approval: false };
  expect(protection(stale).map((f) => f.message)).toEqual(["a push after the approval doesn't need a new approval"]);
});

Then("only admins can skip the approval, and only when merging a pull request", () => {
  const always = goodRulesets();
  always[1].bypass_actors = [{ ...ADMIN_PR_BYPASS, bypass_mode: "always" }];
  expect(rules(protection(goodRules(), always))).toEqual(["approval-bypass"]);
  const agent = goodRulesets();
  agent[1].bypass_actors = [
    { ...ADMIN_PR_BYPASS },
    { actor_type: "Integration", actor_id: APP.appId, bypass_mode: "pull_request" },
  ];
  expect(rules(protection(goodRules(), agent))).toEqual(["approval-bypass"]);
});

Then("\"bun run gate:protection\" fails if GitHub's branch protection settings don't say so", async () => {
  expect(JSON.parse(read("package.json")).scripts["gate:protection"]).toBe("bun tools/gate/cli.ts --only protection");
  expect(names).toContain("protection");
  const run = await runGate([fake("protection", evaluateProtection([], [], names))], ctx());
  expect(run.code).toBe(1);
});

// ── GATE-004 Typecheck ──────────────────────────────────

Then("every package typechecks in strict mode", async () => {
  const configs = exec(["git", "ls-files", "--cached", "--others", "--exclude-standard", "*tsconfig*.json"], ROOT)
    .stdout.split("\n")
    .filter(Boolean);
  expect(configs.length).toBeGreaterThan(0);
  for (const c of configs) expect([c, JSON.parse(read(c)).compilerOptions.strict]).toEqual([c, true]);
  expect(await check("typecheck").run(ctx())).toMatchObject({ status: "pass" });
});

Then("each error is reported with its file and line", async () => {
  const dir = sandbox({
    "src/bad.ts": "export const n: number = 1;\nexport const s: string = n;\n",
    "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [] }, include: ["src"] }),
  });
  const out = await check("typecheck").run(ctx(dir));
  expect(out.status).toBe("fail");
  expect(out.failures[0]).toMatchObject({ file: "src/bad.ts", line: 2, rule: "TS2322" });
});

// ── GATE-005 Lint and format ────────────────────────────

Then("ESLint, Stylelint and Prettier report no errors in any package", async () => {
  expect(JSON.parse(read("package.json")).scripts.lint).toContain("stylelint");
  expect((await check("lint").run(ctx())).failures).toEqual([]);
  expect((await check("format").run(ctx())).failures).toEqual([]);
});

Then("a file that isn't formatted fails, named", async () => {
  const dir = sandbox({ "src/ugly.ts": "export const   x = {a:1,\n b :2}\n", "src/fine.ts": "export const y = 1;\n" }, [
    ".prettierrc.json",
  ]);
  const out = await check("format").run(ctx(dir));
  expect(out.status).toBe("fail");
  expect(out.failures.map((f) => f.file)).toEqual(["src/ugly.ts"]);
});

// ── GATE-006 The design rules are lint rules ────────────

async function lintCss(file: string, code: string) {
  const res = await stylelint.lint({ cwd: ROOT, code, codeFilename: path.join(ROOT, file) });
  return stylelintFailures(res.results, ROOT);
}
async function lintTsx(file: string, code: string) {
  const res = await new ESLint({ cwd: ROOT }).lintText(code, { filePath: path.join(ROOT, file) });
  return eslintFailures(res, ROOT);
}
const component = (tag: string) =>
  `import { Component, h } from "@stencil/core";\n\n@Component({ tag: "${tag}", shadow: true })\nexport class Button {\n  render() {\n    return h("button", null);\n  }\n}\n`;

Then(
  "raw colors, and primitive tokens used outside packages/tokens, fail lint in components and the site",
  async (world) => {
    const bad =
      ".a {\n  color: #fff;\n  border-color: red;\n  background: oklch(80% 0.1 200deg);\n  outline-color: var(--kan-color-cyan-500);\n  margin: var(--kan-space-4);\n}\n";
    const good = ".a {\n  color: var(--kan-color-text-default);\n  margin: var(--kan-space-inset-md);\n}\n";
    const failures: Failure[] = [];
    for (const file of ["packages/components/src/components/button/button.css", "apps/site/src/styles/home.css"]) {
      const f = await lintCss(file, bad);
      expect(rules(f).sort()).toEqual([
        "color-named",
        "color-no-hex",
        "function-disallowed-list",
        "kan/no-primitive-tokens",
        "kan/no-primitive-tokens",
      ]);
      expect(await lintCss(file, good)).toEqual([]);
      failures.push(...f);
    }
    expect(await lintCss("packages/tokens/src/check.css", ".a {\n  color: var(--kan-color-cyan-500);\n}\n")).toEqual(
      [],
    );
    world.failures = failures;
  },
);

Then("a component tag without the kan- prefix fails lint", async (world) => {
  const file = "packages/components/src/components/button/button.tsx";
  const bad = await lintTsx(file, component("ik-button"));
  expect(rules(bad)).toEqual(["kan/component-tag-prefix"]);
  expect(bad[0].message).toContain('"kan-button"');
  expect(await lintTsx(file, component("kan-button"))).toEqual([]);
  (world.failures as Failure[]).push(...bad);
});

Then("each failure names the rule and how to fix it", (world) => {
  const failures = world.failures as Failure[];
  expect(failures.length).toBe(11);
  for (const f of failures) {
    expect(f.rule && f.file && f.line).toBeTruthy();
    expect(f.fix).toMatch(/semantic|kan-/);
  }
});

// ── GATE-007 Behaviors are tests, and coverage never drops ─

Then("every active behavior runs as a scenario test, and one without step definitions shows as todo", () => {
  const graph = loadGraph(path.join(ROOT, "specs/portfolio"));
  for (const b of graph.behaviors.filter((x) => !x.retired))
    expect([b.id, status[b.id]]).not.toEqual([b.id, undefined]);
  for (const file of featureFiles(path.join(ROOT, "specs/portfolio/features"))) {
    for (const s of loadScenarios(file)) {
      if (s.tags.includes("@retired")) continue;
      const hasUndefinedStep = s.steps.some((text) => steps.match(text) === null);
      expect([s.id, status[s.id] === "todo"]).toEqual([s.id, hasUndefinedStep]);
    }
  }
});

Then("a pull request fails if it turns a behavior that passes on main into todo or failing", () => {
  const main = { "A-001": "pass", "A-002": "pass", "A-003": "pass", "A-004": "todo", "A-005": "pass", "A-006": "pass" };
  const branch = { "A-001": "todo", "A-002": "fail", "A-003": "pass", "A-004": "pass", "A-005": "retired" };
  expect(compareCoverage(main, branch).map((x) => x.message)).toEqual([
    "A-001 passes on main but is todo here",
    "A-002 passes on main but is fail here",
    "A-006 passes on main but is missing here",
  ]);
  expect(compareCoverage(main, { ...main })).toEqual([]);
});

// ── GATE-008 Tests can't be quietly weakened ────────────

const SKIP = "." + "skip";
const ONLY = "." + "only";
const directive = (s: string) => s.replace("DIS", "dis");

Then("a pull request fails if it adds .skip or .only to a test", () => {
  const f = checkHygiene([
    { file: "tests/steps/site.steps.ts", line: 4, text: `test${SKIP}("renders", () => {});` },
    { file: "packages/components/src/button.spec.tsx", line: 9, text: `  it${ONLY}("clicks", async () => {` },
    { file: "packages/components/src/button.tsx", line: 2, text: `const x = list${SKIP}(1);` },
  ]);
  expect(f.map((x) => [x.file, x.line, x.rule])).toEqual([
    ["tests/steps/site.steps.ts", 4, "no-skip"],
    ["packages/components/src/button.spec.tsx", 9, "no-only"],
  ]);
});

Then("if it adds a lint-disable, @ts-ignore or @ts-expect-error comment without a reason on the same line", () => {
  const f = checkHygiene([
    { file: "a.ts", line: 1, text: directive("// eslint-DISable-next-line no-console") },
    {
      file: "a.ts",
      line: 2,
      text: directive("// eslint-DISable-next-line no-console -- printing is the point of this CLI"),
    },
    { file: "a.ts", line: 3, text: "// @" + "ts-ignore" },
    { file: "a.ts", line: 4, text: "// @" + "ts-expect-error -- upstream types miss the overload" },
    { file: "b.css", line: 5, text: directive("/* stylelint-DISable-next-line color-no-hex */") },
  ]);
  expect(f.map((x) => [x.line, x.rule])).toEqual([
    [1, "directive-needs-reason"],
    [3, "directive-needs-reason"],
    [5, "directive-needs-reason"],
  ]);
});

// ── GATE-009, GATE-010 Protected paths ──────────────────

Given(
  "a pull request changes workflows, lint or format configs, tsconfig, budgets, thresholds or gate scripts",
  (world) => {
    world.expected = [
      ".github/workflows/gate.yml",
      "eslint.config.js",
      "stylelint.config.js",
      ".prettierrc.json",
      "tsconfig.json",
      "apps/site/budgets.json",
      "lighthouserc.json",
      "tools/gate/checks.ts",
      "package.json",
    ];
    world.changed = [...(world.expected as string[]), "packages/components/src/x.ts", "apps/site/package.json"];
    world.scriptsChanged = (f: string) => f === "package.json";
  },
);

Given("a pull request changes anything under specs/", (world) => {
  world.expected = ["specs/portfolio/features/kit.feature", "specs/portfolio/intents/INT-001-know-ian-fast.md"];
  world.changed = [...(world.expected as string[]), "docs/content-draft.md"];
  world.scriptsChanged = () => false;
});

Then("the protected-paths check lists those files for a close review", (world) => {
  const files = protectedChanges(world.changed as string[], world.scriptsChanged as (f: string) => boolean);
  expect(files).toEqual(world.expected as string[]);
  const note = protectedNote(files)!;
  expect(note.startsWith("review closely: ")).toBe(true);
  for (const f of files) expect(note).toContain(f);
  expect(protectedNote([])).toBeUndefined();
});

Then("the pull request can't merge without Ian's approval", () => {
  expect(protection()).toEqual([]);
  expect(rules(protection(goodRules().filter((r) => r.ruleset_id !== 2)))).toEqual(["required-approval"]);
  expect(refuseGh(["pr", "review", "3", "--approve"])).not.toBeNull();
});

// ── GATE-011 Pull requests trace to behaviors ───────────

const known = () =>
  new Map(loadGraph(path.join(ROOT, "specs/portfolio")).behaviors.map((b) => [b.id, { retired: b.retired }]));

Then("a pull request names the behavior IDs it implements in its description", () => {
  expect(read(".github/pull_request_template.md")).toMatch(/^## Behaviors$/m);
  const body = "## Behaviors\n\n- GATE-008\n- GATE-016: secrets\n\n## Notes\n\nSee SITE-001 later.";
  expect(behaviorIds(body)).toEqual(["GATE-008", "GATE-016"]);
});

Then("the gate fails if it names none, unless it is labeled chore, or if a named ID doesn't exist", () => {
  expect(rules(checkTrace("## Notes\n\nTidy up.", [], known(), {}))).toEqual(["names-behaviors"]);
  expect(checkTrace("## Notes\n\nTidy up.", ["chore"], known(), {})).toEqual([]);
  expect(rules(checkTrace("## Behaviors\n\n- GATE-999", [], known(), {}))).toEqual(["unknown-behavior"]);
  expect(rules(checkTrace("## Behaviors\n\n- SHIP-004", [], known(), {}))).toEqual(["retired-behavior"]);
});

Then("the gate lists any named behavior whose scenario still doesn't pass", () => {
  const f = checkTrace("## Behaviors\n\n- GATE-008\n- GATE-002", [], known(), {
    "GATE-008": "pass",
    "GATE-002": "todo",
  });
  expect(f).toHaveLength(1);
  expect(f[0]).toMatchObject({ rule: "behavior-not-passing", message: "GATE-002 is named but its scenario is todo" });
});

// ── GATE-012 Failures say what to fix ───────────────────

Then("each failed check reports the file, line, rule and a one-line fix", async () => {
  const failure = { file: "src/a.ts", line: 7, rule: "no-only", message: "adds .only", fix: "remove it" };
  const run = await runGate([fake("hygiene", [failure])], ctx());
  expect(run.output).toContain("src/a.ts:7  [no-only] adds .only\n    fix: remove it");
  const real = [
    ...checkHygiene([{ file: "t/a.test.ts", line: 3, text: `it${ONLY}("x")` }]),
    ...scanSecrets([{ file: "src/b.ts", line: 9, text: `const k = "AK${"IA"}${"A".repeat(16)}";` }]),
  ];
  expect(real).toHaveLength(2);
  for (const f of real) {
    expect(f.file && f.line && f.rule && f.fix).toBeTruthy();
    expect(f.fix).not.toContain("\n");
  }
});

Then("the pull request has one summary comment listing every failure, updated on every push", () => {
  const results: CheckResult[] = CHECKS.map((c) => ({
    name: c.name,
    title: c.title,
    status: c.name === "lint" ? "fail" : "pass",
    ms: 1,
    failures:
      c.name === "lint"
        ? [{ file: "x.css", line: 2, rule: "color-no-hex", message: "Unexpected hex color", fix: "use a token" }]
        : [],
  }));
  const body = renderSummary(results, "abcdef1234");
  expect(body.startsWith(MARKER)).toBe(true);
  expect(body).toContain("`x.css:2` **color-no-hex**: Unexpected hex color. Fix: use a token");
  expect(body).toContain(`1 of ${CHECKS.length} checks failed`);
  const bot = { login: "github-actions[bot]" };
  const ian = { login: "IanKaneshiro" };
  expect(
    planUpsert([
      { id: 1, body: "hi", user: ian },
      { id: 2, body: `${MARKER}\nold`, user: bot },
    ]),
  ).toEqual({
    action: "update",
    id: 2,
  });
  expect(planUpsert([{ id: 1, body: `${MARKER} faked`, user: ian }])).toEqual({ action: "create" });
  const wf = workflow();
  expect(wf.on.pull_request.types).toContain("synchronize");
  expect(JSON.stringify(wf.jobs.summary.steps)).toContain("tools/gate/summary.ts");
});

// ── GATE-013 An agent can't stop on red ─────────────────

type HookRun = { code: number; stdout: string; stderr: string };

Given("a Claude Code session that changed code", (world) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-hook-"));
  const git = (...a: string[]) => exec(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], dir);
  git("init", "-q");
  fs.writeFileSync(path.join(dir, "a.ts"), "export {};\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");
  const hook = (arg: string, env: Record<string, string> = {}): HookRun => {
    const p = Bun.spawnSync([path.join(ROOT, ".claude/hooks/gate.sh"), arg], {
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
      stdin: Buffer.from(JSON.stringify({ session_id: "s1" })),
    });
    return { code: p.exitCode ?? 1, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
  };
  hook("start");
  fs.writeFileSync(path.join(dir, "a.ts"), "export const changed = true;\n");
  world.hook = hook;
});

When('the agent tries to finish while "bun run gate" fails', (world) => {
  const failingGate = "echo '✗ lint'; echo '  a.ts:1  [no-only] adds .only'; echo '✗ 1 check failed: lint'; exit 1";
  const hook = world.hook as (a: string, e: Record<string, string>) => HookRun;
  world.attempts = [1, 2, 3, 4].map(() => hook("stop", { GATE_CMD: failingGate }));
});

Then("a Stop hook keeps it working, up to 3 attempts, and then hands over to Ian with the failures listed", (world) => {
  const attempts = world.attempts as HookRun[];
  expect(attempts.map((a) => a.code)).toEqual([2, 2, 2, 0]);
  expect(attempts[0].stderr).toContain("attempt 1 of 3");
  const handover = JSON.parse(attempts[3].stdout).systemMessage as string;
  expect(handover).toContain("handing over to Ian");
  expect(handover).toContain("a.ts:1  [no-only] adds .only");
  expect(settings().hooks.Stop[0].hooks[0].command).toContain(".claude/hooks/gate.sh stop");
});

Then("AGENTS.md states the same rule for Cursor, Grok Build and any other agent", () => {
  const text = agents();
  expect(text).toContain("**Don't stop while the gate fails.** This applies to every agent.");
  expect(text).toContain("in Cursor, Grok Build or anything else");
  expect(text).toContain("After 3 attempts that don't get it green, stop and hand over to Ian");
});

// ── GATE-014 Done means green ───────────────────────────

Then("an agent's work is done only when its pull request passes every required check", () => {
  expect(agents()).toContain("You're done only when the pull request passes every required check.");
});

Then("the agent reports the pull request link and its check status", () => {
  expect(agents()).toContain("Report the pull request link and its check status.");
});

Then("Ian approves and merges, and agents never merge", () => {
  expect(agents()).toContain("Ian approves and merges; agents never merge.");
  expect(refuseGh(["pr", "merge", "12", "--squash"])).toContain("never merge");
  expect(denied("gh pr merge 12 --squash")).toBe(true);
  expect(denied("gh api -X PUT repos/IanKaneshiro/IanKaneshiro.github.io/pulls/12/merge")).toBe(true);
});

// ── GATE-015 The gate is fast ───────────────────────────

Then("the full CI gate finishes in under 10 minutes", () => {
  const job = workflow().jobs.check;
  expect(job["timeout-minutes"]).toBeLessThanOrEqual(10);
  expect(job.needs).toBeUndefined();
  expect(job.strategy!["fail-fast"]).toBe(false);
});

// ── GATE-016 No secrets ─────────────────────────────────

Then("a pull request that adds a secret, key or token fails the secret scan, naming the file and line", () => {
  const fakes = [
    `token: "gh${"p"}_${"a".repeat(36)}"`,
    `ANTHROPIC_API_KEY=sk-${"ant"}-api03-${"b".repeat(40)}`,
    `-----BEGIN ${"OPENSSH"} PRIVATE KEY-----`,
    `const aws = "AK${"IA"}${"C".repeat(16)}";`,
    `apiKey: "${"d".repeat(24)}"`,
  ];
  const f = scanSecrets(
    [
      ...fakes.map((text, i) => ({ file: "src/config.ts", line: i + 10, text })),
      { file: "src/ok.ts", line: 1, text: "const token = process.env.API_TOKEN;" },
    ],
    [".env", ".env.example", "src/config.ts"],
  );
  expect(f.filter((x) => x.rule === "secret").map((x) => [x.file, x.line])).toEqual(
    fakes.map((_, i) => ["src/config.ts", i + 10]),
  );
  expect(f.filter((x) => x.rule === "secret-file").map((x) => x.file)).toEqual([".env"]);
});

// ── GATE-017 New dependencies are explained ─────────────

Then("a pull request that adds a dependency fails unless its description gives a reason for each one", () => {
  const added = [
    { file: "package.json", name: "left-pad" },
    { file: "packages/components/package.json", name: "@stencil/core" },
  ];
  const one = "## Dependencies\n\n- `left-pad`: pads the table columns\n- `@stencil/core`\n";
  expect(checkDependencies(added, one).map((f) => f.message)).toEqual([
    "adds the dependency @stencil/core without a reason",
  ]);
  const both =
    "## Dependencies\n\n- `left-pad`: pads the table columns\n- `@stencil/core`: the component compiler (CMP-001)\n";
  expect(checkDependencies(added, both)).toEqual([]);
  expect(checkDependencies(added, "## Notes\n\nleft-pad: pads things")).toHaveLength(2);
});

// ── GATE-018 Agents work as their own GitHub identity ───

Given("agents push branches, commit and open pull requests through the agent commands", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  expect(scripts["agent:push"]).toBe("bun tools/agent/cli.ts push");
  expect(scripts["agent:gh"]).toBe("bun tools/agent/cli.ts gh");
  const env = settings().env;
  expect([env.GIT_AUTHOR_NAME, env.GIT_COMMITTER_NAME]).toEqual(["ians-agent[bot]", "ians-agent[bot]"]);
  expect([env.GIT_AUTHOR_EMAIL, env.GIT_COMMITTER_EMAIL]).toEqual([botEmail(), botEmail()]);
  expect(agents()).toContain("`bun run agent:push`");
});

Then("they act as ians-agent[bot], with a token that expires within an hour", async () => {
  expect(botName()).toBe("ians-agent[bot]");
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const now = Date.parse("2026-10-30T20:00:00Z");
  const calls: { url: string; method: string; auth: string; body?: string }[] = [];
  const fakeFetch = async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      auth: new Headers(init.headers).get("authorization")!,
      body: init.body as string,
    });
    const json = url.endsWith("/installation") ? { id: 42 } : { token: "ghs_test", expires_at: "2026-10-30T21:00:00Z" };
    return new Response(JSON.stringify(json), { status: 200 });
  };
  const cacheFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agent-token-")), "token.json");
  const opts = { key, fetch: fakeFetch, now: () => now, cacheFile };
  expect(await installationToken(opts)).toEqual({ token: "ghs_test", expiresAt: "2026-10-30T21:00:00Z" });
  expect(calls.map((c) => [c.method, c.url])).toEqual([
    ["GET", `https://api.github.com/repos/${APP.repo}/installation`],
    ["POST", "https://api.github.com/app/installations/42/access_tokens"],
  ]);
  expect(JSON.parse(calls[1].body!)).toEqual({ repositories: ["IanKaneshiro.github.io"] });
  const [head, body, sig] = calls[0].auth.replace("Bearer ", "").split(".");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  expect(claims.iss).toBe(String(APP.appId));
  expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  expect(crypto.verify("RSA-SHA256", Buffer.from(`${head}.${body}`), publicKey, Buffer.from(sig, "base64url"))).toBe(
    true,
  );
  expect((fs.statSync(cacheFile).mode & 0o777).toString(8)).toBe("600");
  // Reused while it has more than 5 minutes left; refreshed after that.
  await installationToken({ ...opts, now: () => now + 50 * 60_000 });
  expect(calls).toHaveLength(2);
  await installationToken({ ...opts, now: () => now + 56 * 60_000 });
  expect(calls).toHaveLength(4);
});

Then(
  "the app has no Administration or Workflows permission, so it can't change rulesets, branch protection or CI",
  () => {
    const granted = { actions: "read", checks: "read", contents: "write", metadata: "read", pull_requests: "write" };
    expect(evaluateAppPermissions(granted)).toEqual([]);
    expect(evaluateAppPermissions({ ...granted, administration: "write" }).map((f) => f.message)).toEqual([
      "the agent app has administration: write",
    ]);
    expect(evaluateAppPermissions({ ...granted, workflows: "write" }).map((f) => f.message)).toEqual([
      "the agent app has workflows: write",
    ]);
    expect(evaluateAppPermissions({ ...granted, contents: "read" }).map((f) => f.message)).toEqual([
      "the agent app needs contents: write",
    ]);
  },
);

Then(
  "the agent commands refuse to merge, label, push to main or force push, and Claude Code permission rules make agents use them",
  () => {
    for (const args of [
      ["pr", "merge", "3", "--squash"],
      ["pr", "edit", "3", "--add-label", "chore"],
      ["pr", "edit", "3", "--remove-label=chore"],
      ["label", "create", "x"],
      ["api", "-X", "PUT", "repos/o/r/branches/main/protection"],
      ["api", "repos/o/r/issues/3/labels", "-f", "labels[]=chore"],
      ["ruleset", "list"],
      ["auth", "token"],
    ]) {
      expect([args.join(" "), refuseGh(args) !== null]).toEqual([args.join(" "), true]);
    }
    for (const args of [
      ["pr", "create", "--title", "x", "--body-file", "pr.md"],
      ["pr", "view", "3"],
      ["api", "repos/o/r/pulls/3"],
    ]) {
      expect([args.join(" "), refuseGh(args)]).toEqual([args.join(" "), null]);
    }
    expect(refusePush("main")).toContain("never push to main");
    expect(refusePush("feature/x", ["--force"])).toContain("no options");
    expect(refusePush("+feature/x")).not.toBeNull();
    expect(refusePush("agent/identity")).toBeNull();
    for (const cmd of [
      "git push -u origin agent/identity",
      "git push --force",
      "gh pr create --fill",
      "gh pr edit 3 --add-label chore",
      "gh pr merge 3",
      "gh api -X PUT repos/o/r/branches/main/protection",
      "GH_TOKEN=x gh pr create",
      "bun run agent:token",
      "cat ~/.config/ian-agent/private-key.pem",
    ]) {
      expect([cmd, denied(cmd)]).toEqual([cmd, true]);
    }
    for (const cmd of [
      "bun run agent:push",
      "bun run agent:gh -- pr create --fill",
      "gh pr view 3",
      "gh pr checks 3",
    ]) {
      expect([cmd, denied(cmd)]).toEqual([cmd, false]);
    }
    expect(settings().permissions.deny).toEqual(
      expect.arrayContaining(["Edit(/.claude/**)", "Read(~/.config/ian-agent/**)"]),
    );
  },
);

Then("AGENTS.md states the same limits for Cursor, Grok Build and any other agent", () => {
  const text = agents();
  expect(text).toContain("Instructions for every coding agent (Claude Code, Cursor, Grok Build and any other)");
  const limits = text.slice(text.indexOf("## Limits"), text.indexOf("## Commands"));
  for (const s of [
    "**merge**",
    "**add or remove labels**",
    "**push to `main`**",
    "**force push**",
    "**change branch protection or rulesets**",
  ]) {
    expect(limits).toContain(s);
  }
});

// ── GATE-019 Pull requests explain the work ─────────────

const headings = (md: string) =>
  [...md.replace(/<!--[\s\S]*?-->/g, "").matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());

Then(
  "the pull request template has sections for the summary, behaviors, spec trace, what changed, verification, decisions, protected changes, dependencies, risks and follow-ups, and a review guide",
  () => {
    expect(PR_SECTIONS).toEqual([
      "Summary",
      "Behaviors",
      "Spec trace",
      "What changed",
      "How it was verified",
      "Decisions",
      "Protected changes",
      "Dependencies",
      "Risks and follow-ups",
      "Review guide",
    ]);
    expect(headings(read(".github/pull_request_template.md"))).toEqual(PR_SECTIONS);
  },
);

Then("the pr-trace check fails if the summary, verification or review guide is empty, naming each one", () => {
  const template = read(".github/pull_request_template.md");
  const empty = prTraceFailures(template, ["chore"], known(), {});
  expect(empty.map((f) => f.message)).toEqual([
    "the ## Summary section is missing or empty",
    "the ## How it was verified section is missing or empty",
    "the ## Review guide section is missing or empty",
  ]);
  const filled = template
    .replace("## Summary\n", "## Summary\n\nAdds the thing.\n")
    .replace("## How it was verified\n", "## How it was verified\n\nbun run gate: 12/12.\n")
    .replace("## Review guide\n", "## Review guide\n\nStart with pr.ts.\n");
  expect(prTraceFailures(filled, ["chore"], known(), {})).toEqual([]);
  expect(checkSections("## Summary\n\nOnly a summary.")).toHaveLength(2);
});

// ── GATE-020 The facts in a pull request are generated ──

When('an agent runs "bun run pr:body"', (world) => {
  expect(JSON.parse(read("package.json")).scripts["pr:body"]).toBe("bun tools/gate/pr-body.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pr-body-"));
  const git = (...a: string[]) => exec(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...a], dir);
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  git("init", "-q");
  write("package.json", JSON.stringify({ name: "x", scripts: { test: "bun test" }, dependencies: {} }, null, 2));
  write("README.md", "# x\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD").stdout.trim();
  write("tools/gate/pr.ts", "export const a = 1;\nexport const b = 2;\n");
  write("packages/components/src/kan-plan.tsx", "export {};\n");
  write("specs/portfolio/features/gates.feature", "@area-GATE\nFeature: Gates\n");
  write(
    "package.json",
    JSON.stringify({ name: "x", scripts: { test: "bun test" }, dependencies: { "left-pad": "1.0.0" } }, null, 2),
  );
  const results: CheckResult[] = [
    { name: "lint", title: "Lint", status: "fail", ms: 1, failures: [{ rule: "r", message: "m", fix: "f" }] },
    { name: "behaviors", title: "Behaviors", status: "pass", ms: 1, failures: [], note: "1 → 2/3 behaviors pass" },
    { name: "pr-trace", title: "PR", status: "skip", ms: 1, failures: [], note: "no pull request yet" },
  ];
  world.body = renderBody({
    graph: loadGraph(path.join(ROOT, "specs/portfolio")),
    before: { "GATE-001": "pass", "GATE-019": "todo", "GATE-020": "todo" },
    after: { "GATE-001": "pass", "GATE-019": "pass", "GATE-020": "todo" },
    changes: fileChanges(dir, base),
    protectedFiles: protectedFiles(dir, base),
    dependencies: addedDependencies(dir, base),
    results,
  });
});

Then(
  "it drafts the description with the behaviors that now pass, the intents and journeys they serve, the files changed by area, the protected files, the added dependencies and each check's result",
  (world) => {
    const body = world.body as string;
    expect(headings(body)).toEqual(PR_SECTIONS);
    expect(section(body, "Behaviors")).toContain("| GATE-019 | Pull requests explain the work | todo → pass |");
    expect(section(body, "Behaviors")).not.toContain("GATE-001");
    expect(section(body, "Spec trace")).toContain(
      "**Intents:** INT-010 Agent output is trusted because gates enforce the rules",
    );
    expect(section(body, "Spec trace")).toContain("JRN-014 An agent delivers a feature through the gates (step 3)");
    const changed = section(body, "What changed");
    expect(changed).toContain("| Gate | `tools/gate/pr.ts` | +2 −0 |");
    expect(changed).toContain("| packages/components | `packages/components/src/kan-plan.tsx` |");
    expect(changed).toContain("| Specs | `specs/portfolio/features/gates.feature` |");
    const prot = section(body, "Protected changes");
    expect(prot).toContain("`tools/gate/pr.ts` (gate scripts)");
    expect(prot).toContain("`specs/portfolio/features/gates.feature` (specs)");
    expect(prot).not.toContain("package.json");
    expect(body).toContain("- `left-pad` (package.json):");
    const verified = section(body, "How it was verified");
    expect(verified).toContain("| `lint` | ✗ 1 failure |");
    expect(verified).toContain("| `behaviors` | ✓ 1 → 2/3 behaviors pass |");
    expect(verified).toContain("| `pr-trace` | – no pull request yet |");
    expect(verified).toContain("Behavior coverage: 1 → 2 of 3 pass");
  },
);

Then("it leaves the summary, decisions, risks and review guide for the agent to write", (world) => {
  const body = world.body as string;
  for (const title of ["Summary", "Decisions", "Risks and follow-ups", "Review guide"]) {
    expect([title, section(body, title).trim()]).toEqual([title, ""]);
  }
  expect(body).toContain("<!-- What this does and why, in 2 to 4 sentences. Name the intent it serves. -->");
  expect(checkSections(body).map((f) => f.message)).toEqual([
    "the ## Summary section is missing or empty",
    "the ## Review guide section is missing or empty",
  ]);
});
