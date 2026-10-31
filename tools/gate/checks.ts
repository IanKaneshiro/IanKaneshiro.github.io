import { ESLint } from "eslint";
import fs from "node:fs";
import path from "node:path";
import stylelint from "stylelint";
import { loadGraph, specProblems } from "../specs/graph";
import { baseReport, compareCoverage, scenarioReport, type Report } from "./behaviors";
import { addedLines, changedFiles, exec, readAt } from "./git";
import { appPermissions, evaluateAppPermissions, KEY_FILE } from "../agent/app";
import { evaluateProtection, type BranchRule, type Ruleset } from "./protection";
import { checkHygiene } from "./hygiene";
import { checkDependencies, dependencyNames, prTraceFailures, protectedChanges, protectedNote } from "./pr";
import { scanSecrets } from "./secrets";
import { fromFailures, pass, skip, type Check, type Failure } from "./types";

const bin = (root: string, name: string) => path.join(root, "node_modules/.bin", name);
const SPECS = "specs/portfolio";

/** A fix for each lint rule the design system cares about; anything else points at the rule's docs. */
const LINT_FIXES: Record<string, string> = {
  "kan/component-tag-prefix": "rename the tag to start with kan- (CMP-001)",
  "kan/no-primitive-tokens": "use the semantic token for this role, e.g. var(--kan-color-text-default) (CMP-002)",
  "color-no-hex": "use a semantic color token instead of a hex value, e.g. var(--kan-color-text-default) (CMP-002)",
  "color-named": "use a semantic color token instead of a named color (CMP-002)",
  "function-disallowed-list": "use a semantic color token instead of a color function (CMP-002)",
};
const eslintFix = (rule: string | null) =>
  !rule
    ? "fix the syntax error"
    : (LINT_FIXES[rule] ??
      (rule.startsWith("@typescript-eslint/")
        ? `see https://typescript-eslint.io/rules/${rule.slice(19)}`
        : `see https://eslint.org/docs/latest/rules/${rule}`));

export function eslintFailures(results: ESLint.LintResult[], root: string): Failure[] {
  return results.flatMap((res) =>
    res.messages
      .filter((m) => m.severity === 2)
      .map((m) => ({
        file: path.relative(root, res.filePath),
        line: m.line,
        rule: m.ruleId ?? "parse-error",
        message: m.message,
        fix: m.fix ? `run bun run lint:fix, or ${eslintFix(m.ruleId)}` : eslintFix(m.ruleId),
      })),
  );
}

export function stylelintFailures(results: stylelint.LintResult[], root: string): Failure[] {
  return results.flatMap((res) =>
    res.warnings
      .filter((w) => w.severity === "error")
      .map((w) => ({
        file: path.relative(root, res.source ?? ""),
        line: w.line,
        rule: w.rule,
        message: w.text.replace(/\s*\([^)]*\)$/, ""),
        fix: LINT_FIXES[w.rule] ?? `see https://stylelint.io/user-guide/rules/${w.rule}`,
      })),
  );
}

/** tsconfig.json files of the workspace packages and apps, e.g. packages/components/tsconfig.json. */
export function packageTsconfigs(root: string): string[] {
  return ["packages", "apps"]
    .flatMap((group) => {
      const dir = path.join(root, group);
      return fs.existsSync(dir) ? fs.readdirSync(dir).map((p) => `${group}/${p}/tsconfig.json`) : [];
    })
    .filter((f) => fs.existsSync(path.join(root, f)))
    .sort();
}

/** Dependencies any package.json gained since `base`. */
export function addedDependencies(root: string, base: string): { file: string; name: string }[] {
  const added: { file: string; name: string }[] = [];
  for (const file of changedFiles(root, base).filter((f) => /(?:^|\/)package\.json$/.test(f))) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const before = dependencyNames(JSON.parse(readAt(root, base, file) ?? "{}"));
    for (const name of dependencyNames(JSON.parse(fs.readFileSync(full, "utf8")))) {
      if (!before.has(name)) added.push({ file, name });
    }
  }
  return added;
}

/** Files changed since `base` that Ian reviews closely (GATE-009, GATE-010). */
export function protectedFiles(root: string, base: string): string[] {
  const scriptsChanged = (file: string) => {
    const before = JSON.parse(readAt(root, base, file) ?? "{}").scripts ?? {};
    const after = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).scripts ?? {};
    return JSON.stringify(before) !== JSON.stringify(after);
  };
  return protectedChanges(
    changedFiles(root, base).filter((f) => fs.existsSync(path.join(root, f)) || f.startsWith("specs/")),
    scriptsChanged,
  );
}

let headReport: Report | undefined;
const head = (root: string) => (headReport ??= scenarioReport(root));

export const CHECKS: Check[] = [
  {
    name: "format",
    title: "Prettier",
    async run({ root }) {
      const r = exec([bin(root, "prettier"), "--list-different", "."], root);
      if (r.code > 1) throw new Error(r.stderr.trim() || r.stdout.trim());
      return fromFailures(
        r.stdout
          .split("\n")
          .filter(Boolean)
          .map((file) => ({ file, rule: "prettier", message: "isn't formatted", fix: "run bun run format" })),
      );
    },
  },
  {
    name: "lint",
    title: "ESLint and Stylelint",
    async run({ root }) {
      const js = await new ESLint({ cwd: root }).lintFiles(["."]);
      const css = await stylelint.lint({ cwd: root, files: "**/*.css", allowEmptyInput: true });
      return fromFailures([...eslintFailures(js, root), ...stylelintFailures(css.results, root)]);
    },
  },
  {
    name: "typecheck",
    title: "TypeScript, strict",
    async run({ root }) {
      // The root project plus every package with its own tsconfig (GATE-004: every package).
      const projects = ["tsconfig.json", ...packageTsconfigs(root)];
      const failures: Failure[] = [];
      for (const project of projects) {
        const r = exec([bin(root, "tsc"), "--noEmit", "--pretty", "false", "-p", project], root);
        const found = r.stdout
          .split("\n")
          .map((l) => /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(l))
          .filter((m): m is RegExpExecArray => !!m)
          .map(([, file, line, code, message]) => ({
            file: path.normalize(path.isAbsolute(file) ? path.relative(root, file) : file),
            line: Number(line),
            rule: code,
            message,
            fix: `fix the type error; see https://typescript.tv/errors/#${code.toLowerCase()}`,
          }));
        if (r.code !== 0 && !found.length) throw new Error(`${project}: ${r.stdout.trim() || r.stderr.trim()}`);
        failures.push(...found);
      }
      return fromFailures(failures, `${projects.length} projects`);
    },
  },
  {
    name: "test",
    title: "Unit and scenario tests",
    async run({ root }) {
      const r = exec(["bun", "test"], root);
      const failures: Failure[] = [];
      let file: string | undefined;
      for (const line of `${r.stdout}\n${r.stderr}`.split("\n")) {
        const f = /^([\w./-]+\.test\.[cm]?[jt]sx?):$/.exec(line.trim());
        if (f) file = f[1];
        const fail = /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line.trim());
        if (fail) {
          failures.push({
            file,
            rule: "test",
            message: `fails: ${fail[1]}`,
            fix: `run bun test ${file ?? ""} -t "${fail[1].split(" > ").pop()}" and fix the code it tests`,
          });
        }
      }
      if (r.code !== 0 && !failures.length) {
        failures.push({ rule: "test", message: `bun test exited ${r.code}`, fix: "run bun test and read the output" });
      }
      return fromFailures(failures);
    },
  },
  {
    name: "specs",
    title: "Spec graph",
    async run({ root }) {
      return fromFailures(
        specProblems(path.join(root, SPECS)).map((p) => {
          const m = /^([^:]+?)(?::(\d+))?: (.*)$/.exec(p);
          const outOfDate = p.includes("out of date");
          return {
            file: m ? `${SPECS}/${m[1]}` : undefined,
            line: m?.[2] ? Number(m[2]) : undefined,
            rule: outOfDate ? "graph-out-of-date" : "spec-graph",
            message: m ? m[3] : p,
            fix: outOfDate ? "run bun run specs:graph" : "fix the spec; spec changes are flagged for Ian's review",
          };
        }),
      );
    },
  },
  {
    name: "behaviors",
    title: "Behavior coverage never drops",
    async run({ root, base }) {
      if (!base) return skip("no base commit to compare with");
      const now = head(root);
      const before = baseReport(root, base);
      const count = (r: Report) => Object.values(r).filter((s) => s === "pass").length;
      const active = Object.values(now).filter((s) => s !== "retired").length;
      return fromFailures(compareCoverage(before, now), `${count(before)} → ${count(now)}/${active} behaviors pass`);
    },
  },
  {
    name: "hygiene",
    title: "No weakened tests",
    async run({ root, base }) {
      if (!base) return skip("no base commit to compare with");
      return fromFailures(checkHygiene(addedLines(root, base)));
    },
  },
  {
    name: "secrets",
    title: "Secret scan",
    async run({ root, base }) {
      if (!base) return skip("no base commit to compare with");
      const files = changedFiles(root, base).filter((f) => fs.existsSync(path.join(root, f)));
      return fromFailures(scanSecrets(addedLines(root, base), files));
    },
  },
  {
    name: "pr-trace",
    title: "Pull request names its behaviors and explains the work",
    async run({ root, pr }) {
      if (!pr) return skip("no pull request yet");
      const graph = loadGraph(path.join(root, SPECS));
      const known = new Map(graph.behaviors.map((b) => [b.id, { retired: b.retired }]));
      return fromFailures(prTraceFailures(pr.body, pr.labels, known, head(root)));
    },
  },
  {
    name: "dependencies",
    title: "New dependencies are explained",
    async run({ root, base, pr }) {
      if (!base) return skip("no base commit to compare with");
      const added = addedDependencies(root, base);
      if (!pr) {
        return added.length
          ? skip(`no pull request yet; its description must explain: ${added.map((a) => a.name).join(", ")}`)
          : pass();
      }
      return fromFailures(checkDependencies(added, pr.body));
    },
  },
  {
    name: "protected-paths",
    title: "Spec and gate changes flagged for review",
    async run({ root, base }) {
      if (!base) return skip("no base commit to compare with");
      return pass(protectedNote(protectedFiles(root, base)));
    },
  },
  {
    name: "protection",
    title: "main is protected for everyone",
    async run({ root, ci }) {
      const gh = (...args: string[]) => exec(["gh", ...args], root);
      if (!ci && gh("auth", "status").code !== 0) return skip("gh isn't signed in");
      const repo =
        process.env.GITHUB_REPOSITORY ??
        gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner").stdout.trim();
      const rules = gh("api", `repos/${repo}/rules/branches/main`, "--paginate");
      if (rules.code !== 0) throw new Error(`couldn't read the rules for main: ${rules.stderr.trim()}`);
      const branchRules: BranchRule[] = JSON.parse(rules.stdout || "[]");
      const rulesets: Ruleset[] = [];
      for (const id of new Set(branchRules.map((r) => r.ruleset_id).filter((x): x is number => !!x))) {
        const rs = gh("api", `repos/${repo}/rulesets/${id}`);
        if (rs.code === 0) rulesets.push(JSON.parse(rs.stdout));
      }
      const failures = evaluateProtection(
        branchRules,
        rulesets,
        CHECKS.map((c) => c.name),
      );
      const notes: string[] = [];
      if (!rulesets.some((r) => Array.isArray(r.bypass_actors))) notes.push("bypass lists not visible to this token");
      // The agent app's permissions can only be read with its key, which never leaves Ian's machine.
      if (!ci && fs.existsSync(KEY_FILE)) failures.push(...evaluateAppPermissions(await appPermissions()));
      else notes.push("agent app permissions checked locally");
      return fromFailures(failures, notes.join("; ") || undefined);
    },
  },
];
