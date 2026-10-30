import fs from "node:fs";
import path from "node:path";
import { loadGraph, renderGraphJson, renderGraphMarkdown, specProblems } from "./graph";
import { find, formatHits, trace } from "./query";

/**
 * bun run specs:check             the graph is consistent and GRAPH.md/graph.json are current
 * bun run specs:graph             regenerate GRAPH.md and graph.json
 * bun run specs:trace <ID>        what's around an intent, journey or behavior (GRAPH-008)
 * bun run specs:find <words>      where a request belongs (GRAPH-009)
 *
 * --dir <specs dir> reads another spec set (default specs/portfolio).
 */

const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const root = path.resolve(dirAt >= 0 ? args.splice(dirAt, 2)[1] : "specs/portfolio");
const [command, ...rest] = args;
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
} else if (command === "trace" && rest.length === 1) {
  const out = trace(graph, rest[0].toUpperCase());
  if (!out) {
    console.error(`no intent, journey or behavior ${rest[0]}; try bun run specs:find <words>`);
    process.exit(1);
  }
  console.log(out);
} else if (command === "find" && rest.length) {
  const hits = find(graph, rest.join(" "));
  console.log(formatHits(hits));
  process.exit(hits.length ? 0 : 1);
} else {
  console.error("usage: bun tools/specs/cli.ts <check | graph | trace <ID> | find <words>> [--dir <specs dir>]");
  process.exit(2);
}
