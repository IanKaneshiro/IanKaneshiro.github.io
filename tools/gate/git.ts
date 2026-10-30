import fs from "node:fs";
import path from "node:path";

export type Exec = { code: number; stdout: string; stderr: string };

export function exec(cmd: string[], cwd: string, env: Record<string, string | undefined> = {}): Exec {
  const p = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? 1, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

const git = (root: string, ...args: string[]) => exec(["git", ...args], root);

/**
 * The commit to compare against: the merge base of HEAD with the target branch.
 * CI passes the target as GATE_BASE (the PR's base branch, or the commit before a push);
 * locally it's origin/main.
 */
export function resolveBase(root: string, target = process.env.GATE_BASE || "origin/main"): string | null {
  const ref = git(root, "rev-parse", "--verify", "--quiet", `${target}^{commit}`);
  if (ref.code !== 0) return null;
  const mb = git(root, "merge-base", ref.stdout.trim(), "HEAD");
  return mb.code === 0 ? mb.stdout.trim() : null;
}

/** Files changed since `base`, including uncommitted and untracked files. */
export function changedFiles(root: string, base: string): string[] {
  const tracked = git(root, "diff", "--name-only", base).stdout.split("\n");
  const untracked = git(root, "ls-files", "--others", "--exclude-standard").stdout.split("\n");
  return [...new Set([...tracked, ...untracked].filter(Boolean))].sort();
}

export type AddedLine = { file: string; line: number; text: string };

/** Every line added since `base`, with its file and line number in the new version. */
export function addedLines(root: string, base: string): AddedLine[] {
  const out: AddedLine[] = parseDiff(git(root, "diff", "-U0", "--no-color", "--no-ext-diff", base).stdout);
  for (const file of git(root, "ls-files", "--others", "--exclude-standard").stdout.split("\n").filter(Boolean)) {
    const full = path.join(root, file);
    if (!fs.statSync(full).isFile()) continue;
    fs.readFileSync(full, "utf8")
      .split("\n")
      .forEach((text, i) => out.push({ file, line: i + 1, text }));
  }
  return out;
}

export function parseDiff(diff: string): AddedLine[] {
  const out: AddedLine[] = [];
  let file = "";
  let line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+") && file && file !== "/dev/null") {
      out.push({ file, line, text: raw.slice(1) });
      line++;
    }
  }
  return out;
}

/** A file's content at `base`, or null if it didn't exist there. */
export function readAt(root: string, base: string, file: string): string | null {
  const r = git(root, "show", `${base}:${file}`);
  return r.code === 0 ? r.stdout : null;
}
