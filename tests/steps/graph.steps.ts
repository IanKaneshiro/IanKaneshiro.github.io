import { expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadGraph, renderGraphJson, renderGraphMarkdown, specProblems, type Graph } from "../../tools/specs/graph";
import { find, trace } from "../../tools/specs/query";
import { Given, Then, When } from "../support/steps";

const ROOT = path.resolve(import.meta.dir, "../..");
const SPECS = path.join(ROOT, "specs/portfolio");
const real = () => loadGraph(SPECS);
const cli = (...args: string[]) => {
  const p = Bun.spawnSync(["bun", "run", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};

// A minimal, valid spec set: one intent, one journey with one step, one behavior.
const BASE: Record<string, string> = {
  "intents/INT-001-a.md": "---\nid: INT-001\ntitle: An outcome\nstatus: active\n---\n\n## Why\n\nBecause.\n",
  "journeys/JRN-001-a.md":
    "---\nid: JRN-001\ntitle: Someone does a thing\nactor: Someone\nstatus: active\nintents: [INT-001]\nsteps:\n  - do: Does the thing\n    behaviors: [AREA-001]\n---\n",
  "features/area.feature": "@area-AREA\nFeature: Area\n\n  @AREA-001\n  Scenario: The thing works\n    Then it works\n",
};

/** A spec set in a temp dir: BASE with some files replaced or added (null removes one). */
function specSet(changes: Record<string, string | null> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-set-"));
  for (const [file, text] of Object.entries({ ...BASE, ...changes })) {
    if (text === null) continue;
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  for (const sub of ["intents", "journeys", "features"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  return dir;
}
const problemsOf = (changes: Record<string, string | null>) => loadGraph(specSet(changes)).problems;
const frontMatter = (file: string) =>
  Bun.YAML.parse(/^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, "utf8"))![1]) as Record<string, unknown>;
const mdFiles = (sub: string) => fs.readdirSync(path.join(SPECS, sub)).filter((f) => !f.startsWith("."));

// ── GRAPH-001 Three layers in three places ──────────────

Then("intents live in specs/portfolio/intents, one Markdown file each with YAML front matter", () => {
  const files = mdFiles("intents");
  expect(files.every((f) => f.endsWith(".md"))).toBe(true);
  for (const f of files) expect(frontMatter(path.join(SPECS, "intents", f)).id).toMatch(/^INT-/);
  expect(
    real()
      .intents.map((i) => i.file)
      .sort(),
  ).toEqual(files.map((f) => `intents/${f}`).sort());
});

Then("journeys live in specs/portfolio/journeys, one Markdown file each with YAML front matter", () => {
  const files = mdFiles("journeys");
  expect(files.every((f) => f.endsWith(".md"))).toBe(true);
  for (const f of files) expect(frontMatter(path.join(SPECS, "journeys", f)).id).toMatch(/^JRN-/);
  expect(
    real()
      .journeys.map((j) => j.file)
      .sort(),
  ).toEqual(files.map((f) => `journeys/${f}`).sort());
});

Then("behaviors are Gherkin scenarios in specs/portfolio/features", () => {
  const g = real();
  expect(g.behaviors.length).toBeGreaterThan(100);
  expect(g.behaviors.every((b) => b.file.startsWith("features/") && b.file.endsWith(".feature"))).toBe(true);
  expect(g.features.map((f) => f.file).sort()).toEqual(
    mdFiles("features")
      .map((f) => `features/${f}`)
      .sort(),
  );
});

// ── GRAPH-002 Permanent IDs ─────────────────────────────

Then("intents are INT-NNN, journeys are JRN-NNN and behaviors are AREA-NNN", () => {
  const g = real();
  expect(g.intents.every((i) => /^INT-\d{3}$/.test(i.id))).toBe(true);
  expect(g.journeys.every((j) => /^JRN-\d{3}$/.test(j.id))).toBe(true);
  expect(g.behaviors.every((b) => /^[A-Z][A-Z0-9]*-\d{3}$/.test(b.id) && b.id.startsWith(`${b.area}-`))).toBe(true);
  expect(problemsOf({ "intents/INT-002-b.md": "---\nid: INTENT-2\ntitle: B\n---\n" })).toContainEqual(
    'intents/INT-002-b.md: intent id "INTENT-2" should look like INT-001',
  );
});

Then("every ID is unique across the whole graph", () => {
  const g = real();
  const ids = [...g.intents, ...g.journeys, ...g.behaviors].map((n) => n.id);
  expect(new Set(ids).size).toBe(ids.length);
  const dup = problemsOf({
    "features/area.feature": `${BASE["features/area.feature"]}\n  @AREA-001\n  Scenario: Again\n    Then it works again\n`,
  });
  expect(dup.some((p) => p.includes("AREA-001 is already used at features/area.feature:5"))).toBe(true);
});

Then("each behavior has exactly one ID tag, whose area matches its feature's @area- tag", () => {
  const problems = problemsOf({
    "features/area.feature":
      "@area-AREA\nFeature: Area\n\n  @AREA-001\n  Scenario: The thing works\n    Then it works\n\n  @AREA-002 @AREA-003\n  Scenario: Two IDs\n    Then no\n\n  @OTHER-001\n  Scenario: Wrong area\n    Then no\n",
  });
  expect(problems).toContainEqual('features/area.feature:9: "Two IDs" needs exactly one @AREA-NNN tag, found 2');
  expect(problems).toContainEqual("features/area.feature:13: OTHER-001 is not in this feature's area AREA");
});

// ── GRAPH-003 Edges live in journeys ────────────────────

Then("each journey lists the intents it serves and each of its steps lists the behaviors it relies on", () => {
  for (const j of real().journeys) {
    expect([j.id, j.intents.length > 0]).toEqual([j.id, true]);
    for (const s of j.steps) expect([j.id, s.do, s.behaviors.length > 0]).toEqual([j.id, s.do, true]);
  }
});

Then("intents and behaviors don't list their own edges, so there is one source of truth", () => {
  for (const f of mdFiles("intents")) {
    expect(Object.keys(frontMatter(path.join(SPECS, "intents", f))).sort()).toEqual(["id", "status", "title"]);
  }
  for (const b of real().behaviors) {
    expect(b.tags.filter((t) => /^@(?:INT|JRN)-\d{3}$/.test(t))).toEqual([]);
  }
});

// ── GRAPH-004 Nothing is orphaned ───────────────────────

Then("every active intent is served by at least one active journey", () => {
  const g = real();
  for (const i of g.intents.filter((x) => !x.retired))
    expect([i.id, (g.servedBy[i.id] ?? []).length > 0]).toEqual([i.id, true]);
  expect(
    problemsOf({ "intents/INT-002-b.md": "---\nid: INT-002\ntitle: Nobody serves this\nstatus: active\n---\n" }),
  ).toContainEqual("intents/INT-002-b.md: INT-002 is served by no journey");
});

Then("every active journey serves at least one intent and every step names at least one behavior", () => {
  expect(real().problems).toEqual([]);
  const problems = problemsOf({
    "journeys/JRN-002-b.md":
      "---\nid: JRN-002\ntitle: Lost\nactor: Someone\nstatus: active\nintents: []\nsteps:\n  - do: Wanders\n    behaviors: []\n---\n",
  });
  expect(problems).toContainEqual("journeys/JRN-002-b.md: JRN-002 serves no intent");
  expect(problems).toContainEqual("journeys/JRN-002-b.md: step 1 names no behavior");
});

Then("every active behavior is named by at least one journey step", () => {
  const g = real();
  for (const b of g.behaviors.filter((x) => !x.retired))
    expect([b.id, (g.usedBy[b.id] ?? []).length > 0]).toEqual([b.id, true]);
  const problems = problemsOf({
    "features/area.feature": `${BASE["features/area.feature"]}\n  @AREA-002\n  Scenario: Nobody uses this\n    Then nothing\n`,
  });
  expect(problems).toContainEqual("features/area.feature:9: AREA-002 is in no journey");
});

// ── GRAPH-005 References must resolve ───────────────────

Given("a journey names an intent or behavior ID that doesn't exist or is retired", (world) => {
  world.dir = specSet({
    "journeys/JRN-002-b.md":
      "---\nid: JRN-002\ntitle: Broken links\nactor: Someone\nstatus: active\nintents: [INT-001, INT-099, INT-002]\nsteps:\n  - do: Tries\n    behaviors: [AREA-001, AREA-404, AREA-002]\n---\n",
    "intents/INT-002-b.md": "---\nid: INT-002\ntitle: Dropped\nstatus: retired\n---\n",
    "features/area.feature": `${BASE["features/area.feature"]}\n  @AREA-002 @retired\n  Scenario: Dropped\n    Then gone\n`,
  });
});

When("the specs are checked", (world) => {
  world.problems = specProblems(world.dir as string);
});

Then("the check fails, naming the journey file and the bad ID", (world) => {
  const problems = world.problems as string[];
  for (const p of [
    "journeys/JRN-002-b.md: intent INT-099 doesn't exist",
    "journeys/JRN-002-b.md: intent INT-002 is retired",
    "journeys/JRN-002-b.md: step 1: behavior AREA-404 doesn't exist",
    "journeys/JRN-002-b.md: step 1: behavior AREA-002 is retired",
  ]) {
    expect(problems).toContainEqual(p);
  }
});

// ── GRAPH-006 Gherkin must parse ────────────────────────

Given("a feature file with invalid Gherkin", (world) => {
  world.dir = specSet({
    "features/area.feature":
      "@area-AREA\nFeature: Area\n\n  @AREA-001\n  Scenario: Broken\n    Then fine\n    Whereupon not a keyword\n",
  });
});

Then("the check fails, naming the file and line", (world) => {
  const problem = (world.problems as string[]).find((p) => p.includes("invalid Gherkin"));
  expect(problem).toBeDefined();
  expect(problem!.startsWith("features/area.feature:7: invalid Gherkin")).toBe(true);
});

// ── GRAPH-007 The graph is generated ────────────────────

When('I run "bun run specs:graph"', (world) => {
  const dir = specSet();
  const p = Bun.spawnSync(["bun", "tools/specs/cli.ts", "graph", "--dir", dir], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(p.exitCode).toBe(0);
  expect(JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts["specs:graph"]).toBe(
    "bun tools/specs/cli.ts graph",
  );
  world.dir = dir;
});

Then(
  "GRAPH.md is written with a Mermaid diagram of intents and journeys and, per journey, its steps and behaviors",
  (world) => {
    const md = fs.readFileSync(path.join(world.dir as string, "GRAPH.md"), "utf8");
    expect(md).toContain("```mermaid\nflowchart LR");
    expect(md).toContain('INT_001["INT-001<br/>An outcome"]');
    expect(md).toContain('JRN_001("JRN-001<br/>Someone does a thing")');
    expect(md).toContain("JRN_001 --> INT_001");
    expect(md).toContain("### JRN-001 · Someone does a thing");
    expect(md).toContain("| 1 | Does the thing | [AREA-001](features/area.feature#L5) The thing works |");
  },
);

Then("graph.json is written with every node and edge for agents to read", (world) => {
  const json = JSON.parse(fs.readFileSync(path.join(world.dir as string, "graph.json"), "utf8"));
  expect(json.nodes.map((n: { id: string }) => n.id).sort()).toEqual(["AREA-001", "INT-001", "JRN-001"]);
  expect(json.edges).toEqual([
    { from: "JRN-001", to: "INT-001", type: "serves" },
    { from: "JRN-001", to: "AREA-001", type: "uses", step: 1, stepText: "Does the thing" },
  ]);
  const g = real();
  const full = JSON.parse(renderGraphJson(g));
  expect(full.nodes).toHaveLength(g.intents.length + g.journeys.length + g.behaviors.length);
});

Then("the spec check fails when either is out of date", (world) => {
  const dir = world.dir as string;
  expect(specProblems(dir)).toEqual([]);
  fs.appendFileSync(path.join(dir, "journeys/JRN-001-a.md"), "\nA new note.\n");
  fs.writeFileSync(
    path.join(dir, "features/area.feature"),
    BASE["features/area.feature"].replace("The thing works", "The thing still works"),
  );
  expect(specProblems(dir)).toEqual([
    'GRAPH.md: out of date; run "bun run specs:graph"',
    'graph.json: out of date; run "bun run specs:graph"',
  ]);
  expect(specProblems(SPECS)).toEqual([]);
  expect(fs.readFileSync(path.join(SPECS, "GRAPH.md"), "utf8")).toBe(renderGraphMarkdown(real()));
});

// ── GRAPH-008 Trace any node ────────────────────────────

When('I run "bun run specs:trace" with an intent, journey or behavior ID', (world) => {
  world.traces = Object.fromEntries(
    ["INT-004", "JRN-003", "KIT-009"].map((id) => {
      const r = cli("specs:trace", id);
      expect([id, r.code]).toEqual([id, 0]);
      return [id, r.out];
    }),
  );
  expect(cli("specs:trace", "NOPE-001").code).toBe(1);
});

Then(
  "it prints the intents above it and the journeys and behaviors around it, each with its title and file location",
  (world) => {
    const t = world.traces as Record<string, string>;
    const g: Graph = real();
    const show = (id: string) => {
      const n = [...g.intents, ...g.journeys, ...g.behaviors].find((x) => x.id === id)!;
      return `${n.id}  ${n.title}  (${n.kind === "behavior" ? `${n.file}:${n.line}` : n.file})`;
    };
    expect(t["INT-004"]).toContain(show("JRN-003"));
    expect(t["INT-004"]).toContain(show("THEME-001"));
    expect(t["JRN-003"]).toContain(show("INT-004"));
    expect(t["JRN-003"]).toContain(show("KIT-009"));
    expect(t["KIT-009"]).toContain(show("INT-004"));
    expect(t["KIT-009"]).toContain(show("JRN-003"));
    expect(t["KIT-009"]).toContain("step 2: Switches the theme, and the choice is remembered");
  },
);

Then("for a behavior, the other behaviors that share its journey steps", (world) => {
  const t = (world.traces as Record<string, string>)["KIT-009"];
  const shared = t.slice(t.indexOf("shares steps with"));
  for (const id of ["THEME-002", "THEME-003", "THEME-008"]) expect(shared).toContain(id);
  expect(shared).not.toContain("KIT-009");
  expect(trace(real(), "KIT-009")).toBe(t.trimEnd());
});

// ── GRAPH-009 Find where a request belongs ──────────────

When('I run "bun run specs:find" with a few words', (world) => {
  const r = cli("specs:find", "theme", "toggle");
  expect(r.code).toBe(0);
  world.found = r.out;
});

Then("it lists the intents, journeys and behaviors whose text matches, best match first, with their IDs", (world) => {
  const lines = (world.found as string).trim().split("\n");
  expect(lines[0]).toMatch(/^behavior\s+KIT-009\s+kan-theme-toggle/);
  const hits = find(real(), "theme toggle");
  expect(lines.map((l) => l.split(/\s+/)[1])).toEqual(hits.slice(0, 20).map((h) => h.id));
  expect(find(real(), "agent").map((h) => h.kind)).toEqual(expect.arrayContaining(["intent", "journey", "behavior"]));
  expect(find(real(), "INT-009")[0].id).toBe("INT-009");
  expect(find(real(), "zzz-no-such-words")).toEqual([]);
});

// ── GRAPH-010 Retiring instead of deleting ──────────────

Then("a dropped intent or journey is marked status: retired and a dropped behavior is tagged @retired", () => {
  const g = loadGraph(
    specSet({
      "intents/INT-002-b.md": "---\nid: INT-002\ntitle: Dropped\nstatus: retired\n---\n",
      "journeys/JRN-002-b.md":
        "---\nid: JRN-002\ntitle: Dropped\nactor: x\nstatus: retired\nintents: [INT-002]\nsteps:\n  - do: x\n    behaviors: [AREA-002]\n---\n",
      "features/area.feature": `${BASE["features/area.feature"]}\n  @AREA-002 @retired\n  Scenario: Dropped\n    Then gone\n`,
    }),
  );
  expect(g.intents.find((i) => i.id === "INT-002")!.retired).toBe(true);
  expect(g.journeys.find((j) => j.id === "JRN-002")!.retired).toBe(true);
  expect(g.behaviors.find((b) => b.id === "AREA-002")!.retired).toBe(true);
  expect(real().behaviors.find((b) => b.id === "SHIP-004")).toMatchObject({ retired: true });
});

Then("retired nodes stay in the files, keep their IDs, and are left out of the coverage checks", () => {
  const g = loadGraph(
    specSet({
      "intents/INT-002-b.md": "---\nid: INT-002\ntitle: Dropped\nstatus: retired\n---\n",
      "features/area.feature": `${BASE["features/area.feature"]}\n  @AREA-002 @retired\n  Scenario: Dropped\n    Then gone\n`,
    }),
  );
  expect(g.problems).toEqual([]);
  expect(g.intents.map((i) => i.id)).toContain("INT-002");
  expect(g.behaviors.map((b) => b.id)).toContain("AREA-002");
  expect(fs.readFileSync(path.join(SPECS, "features/ship.feature"), "utf8")).toContain("@SHIP-004 @ci @retired");
});

Then("no ID is ever reused", () => {
  const problems = problemsOf({
    "features/area.feature": `${BASE["features/area.feature"]}\n  @AREA-002 @retired\n  Scenario: Dropped\n    Then gone\n\n  @AREA-002\n  Scenario: Reuses a retired ID\n    Then no\n`,
  });
  expect(problems.some((p) => p.includes("AREA-002 is already used at features/area.feature:9"))).toBe(true);
});
