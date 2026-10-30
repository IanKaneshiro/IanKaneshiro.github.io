/** One thing a check found wrong. Every failure says where, which rule, and how to fix it (GATE-012). */
export type Failure = {
  file?: string;
  line?: number;
  rule: string;
  message: string;
  fix: string;
};

export type Outcome = {
  status: "pass" | "fail" | "skip";
  failures: Failure[];
  /** Why a check was skipped, or anything else worth showing next to its result. */
  note?: string;
};

export type CheckResult = Outcome & { name: string; title: string; ms: number };

export type PullRequest = { number: number; body: string; labels: string[] };

export type Context = {
  root: string;
  /** The commit this change is compared against (the merge base with main), or null if unknown. */
  base: string | null;
  pr: PullRequest | null;
  ci: boolean;
};

export type Check = {
  /** Also the CI job name and the required status check's name. */
  name: string;
  title: string;
  run: (ctx: Context) => Promise<Outcome>;
};

export const pass = (note?: string): Outcome => ({ status: "pass", failures: [], note });
export const skip = (note: string): Outcome => ({ status: "skip", failures: [], note });
export const fromFailures = (failures: Failure[], note?: string): Outcome => ({
  status: failures.length ? "fail" : "pass",
  failures,
  note,
});
