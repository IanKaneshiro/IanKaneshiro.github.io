/**
 * Step definitions: the glue between a Gherkin step's text and code.
 *
 *   Then("the toggle is not shown", (world) => { ... });
 *   Then(/^the ruleset has (\d+) rules$/, (world, n) => { ... });
 *
 * A string matches the step text exactly; a RegExp passes its capture groups as
 * arguments. Given/When/Then are the same function. Each scenario gets a fresh
 * `world` to pass state between its steps.
 *
 * A step definition must check what its text says. A step that passes without
 * checking anything defeats the spec.
 */

export type World = Record<string, unknown>;
export type StepFn = (world: World, ...args: string[]) => unknown;
type Definition = { pattern: string | RegExp; fn: StepFn };
export type Match = { definition: Definition; args: string[] };

export class StepRegistry {
  private readonly definitions: Definition[] = [];

  define(pattern: string | RegExp, fn: StepFn) {
    this.definitions.push({ pattern, fn });
  }

  /** The one definition matching `text`, null if none; throws if several match. */
  match(text: string): Match | null {
    const matches: Match[] = [];
    for (const definition of this.definitions) {
      if (typeof definition.pattern === "string") {
        if (definition.pattern === text) matches.push({ definition, args: [] });
      } else {
        const m = definition.pattern.exec(text);
        if (m) matches.push({ definition, args: m.slice(1) });
      }
    }
    if (matches.length > 1) {
      throw new Error(
        `step "${text}" matches ${matches.length} definitions: ${matches.map((m) => String(m.definition.pattern)).join(" | ")}`,
      );
    }
    return matches[0] ?? null;
  }
}

/** The registry the scenario runner uses. Step files register into it on import. */
export const steps = new StepRegistry();
export const Given = (pattern: string | RegExp, fn: StepFn) => steps.define(pattern, fn);
export const When = Given;
export const Then = Given;
