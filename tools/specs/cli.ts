import fs from "node:fs";
import path from "node:path";
import { loadGraph, renderGraphJson, renderGraphMarkdown, specProblems } from "./graph";

// Usage: bun tools/specs/cli.ts <check|graph> [specs dir]
const [command, dirArg] = process.argv.slice(2);
const root = path.resolve(dirArg ?? "specs/portfolio");
const graph = loadGraph(root);
const summary = `${graph.intents.length} intents, ${graph.journeys.length} journeys, ${graph.behaviors.length} behaviors in ${graph.features.length} features`;

if (command === "graph") {
  fs.writeFileSync(path.join(root, "GRAPH.md"), renderGraphMarkdown(graph));
  fs.writeFileSync(path.join(root, "graph.json"), renderGraphJson(graph));
  console.log(`wrote GRAPH.md and graph.json · ${summary}`);
} else if (command === "check") {
  const problems = specProblems(root, graph);
  for (const p of problems) console.error(`  ${p}`);
  console.log(`${summary} · ${problems.length} problems`);
  process.exit(problems.length ? 1 : 0);
} else {
  console.error("usage: bun tools/specs/cli.ts <check|graph> [specs dir]");
  process.exit(2);
}
