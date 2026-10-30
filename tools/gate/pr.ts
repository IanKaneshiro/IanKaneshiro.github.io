import type { Failure } from "./types";

/** Rules about the pull request itself: what it implements, what it adds, what it touches. */

const ID = /\b[A-Z][A-Z0-9]*-\d{3}\b/g;

/** The text under a "## <title>" heading, up to the next "## " heading, without HTML comments. */
export function section(body: string, title: string): string {
  const lines = body
    .replace(/\r/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n");
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${title}\\s*$`, "i").test(l.trim()));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

/** The pull request description's sections, in order (GATE-019). */
export const PR_SECTIONS = [
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
];
/** Sections that need words from whoever opened the pull request. */
export const REQUIRED_SECTIONS = ["Summary", "How it was verified", "Review guide"];

/** GATE-019: the summary, verification and review guide can't be left empty. */
export function checkSections(body: string): Failure[] {
  return REQUIRED_SECTIONS.filter((title) => !section(body, title).trim()).map((title) => ({
    rule: "explain-the-work",
    message: `the ## ${title} section is missing or empty`,
    fix: `write the ## ${title} section of the pull request description (bun run pr:body drafts the rest)`,
  }));
}

export const behaviorIds = (body: string) => [...new Set(section(body, "Behaviors").match(ID) ?? [])];

/**
 * GATE-011: a pull request names the behaviors it implements. Fails if it names none
 * (unless labeled chore), names an ID that doesn't exist, or names one whose scenario
 * doesn't pass yet.
 */
export function checkTrace(
  body: string,
  labels: string[],
  known: Map<string, { retired: boolean }>,
  status: Record<string, string>,
): Failure[] {
  const ids = behaviorIds(body);
  if (!ids.length) {
    return labels.includes("chore")
      ? []
      : [
          {
            rule: "names-behaviors",
            message: "the pull request description names no behavior IDs under ## Behaviors",
            fix: "list the behavior IDs this pull request implements under ## Behaviors, or ask Ian to label it chore",
          },
        ];
  }
  const failures: Failure[] = [];
  for (const id of ids) {
    const node = known.get(id);
    if (!node) {
      failures.push({
        rule: "unknown-behavior",
        message: `${id} doesn't exist in the specs`,
        fix: "fix the ID, or propose the behavior in a spec change first",
      });
    } else if (node.retired) {
      failures.push({ rule: "retired-behavior", message: `${id} is retired`, fix: "remove it from ## Behaviors" });
    } else if (status[id] !== "pass") {
      failures.push({
        rule: "behavior-not-passing",
        message: `${id} is named but its scenario is ${status[id] ?? "missing"}`,
        fix: `make ${id} pass (bun test tests/scenarios.test.ts -t "${id}"), or remove it from ## Behaviors`,
      });
    }
  }
  return failures;
}

/** Everything the pr-trace check enforces: behaviors named (GATE-011) and the work explained (GATE-019). */
export function prTraceFailures(
  body: string,
  labels: string[],
  known: Map<string, { retired: boolean }>,
  status: Record<string, string>,
): Failure[] {
  return [...checkTrace(body, labels, known, status), ...checkSections(body)];
}

type PackageJson = Record<string, Record<string, string> | unknown>;
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

export function dependencyNames(pkg: PackageJson | null): Set<string> {
  const names = new Set<string>();
  for (const field of DEP_FIELDS) {
    const deps = pkg?.[field];
    if (deps && typeof deps === "object") for (const name of Object.keys(deps)) names.add(name);
  }
  return names;
}

/**
 * GATE-017: every dependency a change adds needs a reason under ## Dependencies,
 * on a line naming the package followed by the reason, e.g. "- `prettier`: formats code".
 */
export function checkDependencies(added: { file: string; name: string }[], body: string): Failure[] {
  const text = section(body, "Dependencies");
  return added
    .filter(({ name }) => {
      const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
      const line = text.split("\n").find((l) => new RegExp(`(^|[\\s\`'"*])${esc}([\\s\`'"*:,]|$)`).test(l));
      if (!line) return true;
      const reason = line.slice(line.indexOf(name) + name.length).replace(/^[\s`'"*:,–—-]+/, "");
      return reason.trim().split(/\s+/).filter(Boolean).length < 2;
    })
    .map(({ file, name }) => ({
      file,
      rule: "explain-dependency",
      message: `adds the dependency ${name} without a reason`,
      fix: `add a line under ## Dependencies in the pull request description: - \`${name}\`: <why it's needed>`,
    }));
}

/** GATE-009, GATE-010: paths only Ian may change. */
export const PROTECTED: [label: string, re: RegExp][] = [
  ["specs", /^specs\//],
  ["workflows", /^\.github\//],
  ["gate scripts", /^tools\/gate\//],
  ["agent rules", /^(?:\.claude\/|AGENTS\.md$|CLAUDE\.md$)/],
  [
    "lint and format configs",
    /(?:^|\/)(?:eslint\.config\.[cm]?[jt]s|stylelint\.config\.[cm]?[jt]s|\.stylelintrc[^/]*|\.prettierrc[^/]*|prettier\.config\.[cm]?[jt]s|\.prettierignore)$/,
  ],
  ["tsconfig", /(?:^|\/)tsconfig[^/]*\.json$/],
  ["budgets and thresholds", /(?:^|\/)(?:budgets?\.json|lighthouserc[^/]*|\.size-limit[^/]*)$/],
];

/**
 * Files in `changed` that need Ian's sign-off. A package.json counts only when its
 * "scripts" change, since that's where the gate commands live.
 */
export function protectedChanges(changed: string[], scriptsChanged: (file: string) => boolean): string[] {
  return changed.filter(
    (f) => PROTECTED.some(([, re]) => re.test(f)) || (/(?:^|\/)package\.json$/.test(f) && scriptsChanged(f)),
  );
}

export function checkProtected(files: string[], labels: string[]): Failure[] {
  if (!files.length || labels.includes("owner-approved")) return [];
  return files.map((file) => ({
    file,
    rule: "owner-approval",
    message: `changes a protected path (${PROTECTED.find(([, re]) => re.test(file))?.[0] ?? "gate scripts in package.json"})`,
    fix: "Ian reviews this change and adds the owner-approved label; agents must not add it",
  }));
}
