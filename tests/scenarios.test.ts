import { afterAll, describe, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { featureFiles, loadScenarios } from "./support/gherkin";
import { status } from "./support/status";
import { steps, type World } from "./support/steps";
import "./steps";

/**
 * Runs specs/portfolio as tests (GATE-007).
 *
 * A scenario runs once every one of its steps has a definition in tests/steps/.
 * Until then it shows as todo. A scenario tagged @retired doesn't run.
 *
 *   bun test tests/scenarios.test.ts -t "GATE-"      one area
 *   bun test tests/scenarios.test.ts -t "GATE-007"   one behavior
 *
 * With GATE_BEHAVIORS_REPORT set, writes each behavior's status (pass, fail, todo,
 * retired) to that file. The behaviors check compares it with main's.
 */

const FEATURES = path.resolve(import.meta.dir, "../specs/portfolio/features");

for (const file of featureFiles(FEATURES)) {
  describe(path.basename(file), () => {
    for (const scenario of loadScenarios(file)) {
      const title = `${scenario.id} ${scenario.name}`;
      if (scenario.tags.includes("@retired")) {
        status[scenario.id] = "retired";
        test.skipIf(true)(title, () => {});
        continue;
      }
      const matched = scenario.steps.map((text) => ({ text, match: steps.match(text) }));
      if (matched.some((m) => m.match === null)) {
        status[scenario.id] = "todo";
        test.todo(title);
        continue;
      }
      status[scenario.id] = "pending";
      test(
        title,
        async () => {
          status[scenario.id] = "fail";
          const world: World = {};
          for (const { text, match } of matched) {
            try {
              await match!.definition.fn(world, ...match!.args);
            } catch (err) {
              if (err instanceof Error) err.message = `step "${text}": ${err.message}`;
              throw err;
            }
          }
          status[scenario.id] = "pass";
        },
        120_000,
      );
    }
  });
}

afterAll(() => {
  const out = process.env.GATE_BEHAVIORS_REPORT;
  if (out) fs.writeFileSync(out, `${JSON.stringify(status, null, 2)}\n`);
});
