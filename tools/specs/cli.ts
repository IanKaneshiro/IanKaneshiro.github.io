import fs from "node:fs";
import path from "node:path";
import { loadGraph, renderGraphJson, renderGraphMarkdown } from "./graph";

// Usage: bun tools/specs/cli.ts <check|graph> [specs dir]
const [command, dirArg] = process.argv.slice(2);
const root = path.resolve(dirArg ?? "specs/portfolio");
const graph = loadGraph(root);
const outputs = {
  "GRAPH.md": renderGraphMarkdown(graph),
  "graph.json": renderGraphJson(graph),
};
const summary = `${graph.intents.length} intents, ${graph.journeys.length} journeys, ${graph.behaviors.length} behaviors in ${graph.features.length} features`;

if (command === "graph") {
  for (const [name, text] of Object.entries(outputs)) fs.writeFileSync(path.join(root, name), text);
  console.log(`wrote GRAPH.md and graph.json · ${summary}`);
} else if (command === "check") {
  const problems = [...graph.problems];
  for (const [name, text] of Object.entries(outputs)) {
    const file = path.join(root, name);
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) {
      problems.push(`${name} is out of date; run "bun run specs:graph"`);
    }
  }
  for (const p of problems) console.error(`  ${p}`);
  console.log(`${summary} · ${problems.length} problems`);
  process.exit(problems.length ? 1 : 0);
} else {
  console.error("usage: bun tools/specs/cli.ts <check|graph> [specs dir]");
  process.exit(2);
}
