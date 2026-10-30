import type { AddedLine } from "./git";
import type { Failure } from "./types";

/**
 * GATE-008: tests can't be quietly weakened. Looks only at lines a change adds.
 *
 * - `.skip` / `.only` on describe, it or test, in test files.
 * - an eslint-disable, stylelint-disable, @ts-ignore, @ts-expect-error or @ts-nocheck
 *   comment without a reason on the same line, written as ` -- why`.
 */

const CODE = /\.(?:[cm]?[jt]sx?|css)$/;
const TEST_FILE = /(?:^|\/)tests?\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const SKIP_ONLY = /\b(?:describe|it|test)\s*\.\s*(skip|only)\b/;
// Directives only take effect inside comments, so only comment-prefixed ones count.
const DIRECTIVE =
  /(?:\/\/|\/\*)\s*(eslint-disable(?:-next-line|-line)?|stylelint-disable(?:-next-line|-line)?|@ts-ignore|@ts-expect-error|@ts-nocheck)/;
const REASON = /\s--\s*\S.{2,}/;
/** Files a compiler writes, listed one by one; a general "generated" escape would be a loophole. */
const GENERATED = [/^packages\/[\w-]+\/src\/components\.d\.ts$/];

export function checkHygiene(lines: AddedLine[]): Failure[] {
  const failures: Failure[] = [];
  for (const { file, line, text } of lines) {
    if (!CODE.test(file) || GENERATED.some((re) => re.test(file))) continue;
    const so = SKIP_ONLY.exec(text);
    if (so && TEST_FILE.test(file)) {
      failures.push({
        file,
        line,
        rule: `no-${so[1]}`,
        message: `adds .${so[1]} to a test`,
        fix:
          so[1] === "only"
            ? "remove .only so the whole suite runs"
            : "remove .skip and make the test pass; if the behavior was dropped, ask Ian to retire it in the specs",
      });
    }
    const d = DIRECTIVE.exec(text);
    if (d && !REASON.test(text.slice(d.index + d[0].length))) {
      failures.push({
        file,
        line,
        rule: "directive-needs-reason",
        message: `adds ${d[1]} without a reason`,
        fix: `fix the underlying problem, or add the reason on the same line: ${d[1]} -- <why this is safe>`,
      });
    }
  }
  return failures;
}
