import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator, type Pickle } from "@cucumber/messages";
import fs from "node:fs";
import path from "node:path";

export type Scenario = {
  /** The permanent @AREA-NNN id, e.g. "GATE-001". */
  id: string;
  name: string;
  tags: string[];
  steps: string[];
  file: string;
};

const ID_TAG = /^@([A-Z][A-Z0-9]*-\d{3})$/;

/** Every scenario in a feature file, with outlines expanded and backgrounds included. */
export function loadScenarios(file: string, text = fs.readFileSync(file, "utf8")): Scenario[] {
  const newId = IdGenerator.incrementing();
  const document = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(text);
  return compile(document, file, newId).map((pickle: Pickle) => {
    const tags = pickle.tags.map((t) => t.name);
    return {
      id: tags.map((t) => ID_TAG.exec(t)?.[1]).find(Boolean) ?? "(no id)",
      name: pickle.name,
      tags,
      steps: pickle.steps.map((s) => s.text),
      file,
    };
  });
}

export function featureFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".feature"))
    .sort()
    .map((f) => path.join(dir, f));
}
