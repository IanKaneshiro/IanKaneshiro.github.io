import { expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTokens, resolveTokens, type Row } from "../../packages/tokens/build";
import { contrast, CONTRAST_PAIRS, type Oklch } from "../../packages/tokens/src/contrast";
import { readTokens, walk, type Token } from "../../packages/tokens/src/dtcg";
import { Given, Then, When } from "../support/steps";

const ROOT = path.resolve(import.meta.dir, "../..");
const PKG = path.join(ROOT, "packages/tokens");
const PRIMITIVE = path.join(PKG, "src/primitive");
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const primitives = () => readTokens(PRIMITIVE).tokens;
const token = (name: string): Token => {
  const t = primitives().find((x) => x.path.join(".") === name);
  if (!t) throw new Error(`no token ${name}`);
  return t;
};
const group = (prefix: string) => primitives().filter((t) => t.path.slice(0, -1).join(".") === prefix);
const names = (prefix: string) => group(prefix).map((t) => t.path[t.path.length - 1]);
const lch = (name: string) => (token(name).value as { components: [number, number, number] }).components;
const px = (name: string) => {
  const v = token(name).value as { value: number; unit: string };
  expect(v.unit).toBe("px");
  return v.value;
};
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const darkerEachStep = (ramp: string) => {
  const l = STEPS.map((s) => lch(`${ramp}.${s}`)[0]);
  for (let i = 1; i < l.length; i++) expect([ramp, STEPS[i], l[i] < l[i - 1]]).toEqual([ramp, STEPS[i], true]);
};

/** One build of the real source per test run; the build is deterministic (TOK-008). */
let built: Promise<string> | undefined;
const build = () =>
  (built ??= (async () => {
    const out = tmp("tokens-out-");
    await buildTokens({ src: path.join(PKG, "src"), out });
    return out;
  })());
const output = async (file: string) => fs.readFileSync(path.join(await build(), file), "utf8");
const cssProps = (css: string) =>
  [...css.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => ({ name: m[1], value: m[2] }));
/** The body of the first rule whose selector line is exactly `selector {`, nested or not. */
function block(css: string, selector: string): string {
  const lines = css.split("\n");
  const start = lines.findIndex((l) => l.trim() === `${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const indent = lines[start].length - lines[start].trimStart().length;
  const end = lines.findIndex((l, i) => i > start && l.trim() === "}" && l.length - l.trimStart().length === indent);
  return lines.slice(start + 1, end).join("\n");
}

// ── PRIM-001 Tokens are written in DTCG format ──────────

Then("every file under packages/tokens/src/primitive is valid W3C DTCG JSON", () => {
  const files = fs.readdirSync(PRIMITIVE);
  expect(files.length).toBeGreaterThan(0);
  expect(files.every((f) => f.endsWith(".json"))).toBe(true);
  expect(readTokens(PRIMITIVE).problems).toEqual([]);
  expect(walk({ a: { $value: { value: 4, unit: "em" }, $type: "dimension" } }, "x.json").problems).toEqual([
    "x.json: a: a dimension must be { value: number, unit: px | rem }",
  ]);
  expect(walk({ "b.c": { $type: "number", $value: 1 } }, "x.json").problems).toEqual([
    'x.json: (root): the name "b.c" can\'t contain {, } or .',
  ]);
});

Then("every token has a $value and a $type, on itself or inherited from its group", () => {
  const all = primitives();
  expect(all).toHaveLength(101);
  for (const t of all) expect([t.path.join("."), t.type && t.value !== undefined]).toEqual([t.path.join("."), true]);
  const raw = JSON.parse(fs.readFileSync(path.join(PRIMITIVE, "color.json"), "utf8"));
  expect(raw.color.cyan["500"].$type).toBeUndefined();
  expect(token("color.cyan.500").type).toBe("color");
  expect(walk({ a: { $value: 1 } }, "x.json").problems).toEqual([
    "x.json: a: has no $type, on itself or a parent group",
  ]);
});

// ── PRIM-002 Colors are authored in OKLCH ───────────────

Then("every primitive color is authored in the OKLCH color space", () => {
  const colors = primitives().filter((t) => t.type === "color");
  expect(colors).toHaveLength(57);
  for (const c of colors)
    expect([c.path.join("."), (c.value as { colorSpace: string }).colorSpace]).toEqual([c.path.join("."), "oklch"]);
});

Then("is output as an oklch() CSS value", async () => {
  const colors = cssProps(await output("tokens.css")).filter((p) =>
    /^--kan-color-(?:(?:cyan|neutral|green|amber|red)-\d+|white|black)$/.test(p.name),
  );
  expect(colors).toHaveLength(57);
  for (const c of colors) expect(c.value).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
  expect(colors.find((c) => c.name === "--kan-color-cyan-500")!.value).toBe("oklch(0.84 0.14 205)");
});

// ── PRIM-003 The electric cyan brand ramp ───────────────

Then("color.cyan has 11 steps: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900 and 950", () => {
  expect(names("color.cyan")).toEqual(STEPS);
});

Then("each step is darker than the one before it", () => darkerEachStep("color.cyan"));

Then("500 is the reference electric cyan the identity is built on", () => {
  expect(token("color.cyan.500").description).toBe("The electric cyan the identity is built on.");
  const [l, c, h] = lch("color.cyan.500");
  expect(h).toBeGreaterThanOrEqual(195);
  expect(h).toBeLessThanOrEqual(215);
  expect(c).toBeGreaterThanOrEqual(0.13);
  expect(l).toBeGreaterThan(0.75);
});

// ── PRIM-004 A neutral ramp tinted toward the brand ─────

Then("color.neutral has the same 11 steps as color.cyan, each darker than the one before", () => {
  expect(names("color.neutral")).toEqual(STEPS);
  darkerEachStep("color.neutral");
});

Then("its hue leans toward cyan with low chroma, so grays read as cool rather than flat", () => {
  const cyanHue = lch("color.cyan.500")[2];
  for (const s of STEPS) {
    const [, c, h] = lch(`color.neutral.${s}`);
    expect([s, c > 0 && c <= 0.03, hueGap(h, cyanHue) <= 30]).toEqual([s, true, true]);
  }
});

Then("color.white and color.black exist on their own", () => {
  expect(lch("color.white")).toEqual([1, 0, 0]);
  expect(lch("color.black")).toEqual([0, 0, 0]);
  expect(token("color.white").path).toEqual(["color", "white"]);
});

// ── PRIM-005 Status ramps ───────────────────────────────

Then("color.green, color.amber and color.red each have the same 11 steps", () => {
  for (const ramp of ["green", "amber", "red"]) {
    expect([ramp, names(`color.${ramp}`)]).toEqual([ramp, STEPS]);
    darkerEachStep(`color.${ramp}`);
  }
});

Then("each of their 500 steps is at least 30 degrees of hue away from cyan 500", () => {
  const cyan = lch("color.cyan.500")[2];
  for (const ramp of ["green", "amber", "red"]) {
    expect([ramp, hueGap(lch(`color.${ramp}.500`)[2], cyan) >= 30]).toEqual([ramp, true]);
  }
});

// ── PRIM-006 A 4px spacing scale ────────────────────────

const SPACE = ["0", "0-5", "1", "2", "3", "4", "6", "8", "12", "16", "24"];

Then("space has steps 0, 0.5, 1, 2, 3, 4, 6, 8, 12, 16 and 24", () => {
  // Token names can't contain ".", so 0.5 is named 0-5. (JSON puts integer-like keys first, so order by value.)
  const byValue = (a: string, b: string) => Number(a.replace("-", ".")) - Number(b.replace("-", "."));
  expect(names("space").sort(byValue)).toEqual(SPACE);
});

Then("each step is that many multiples of 4px", () => {
  for (const s of SPACE) expect([s, px(`space.${s}`)]).toEqual([s, Number(s.replace("-", ".")) * 4]);
});

// ── PRIM-007 Two font families ──────────────────────────

Then("font.family.mono is JetBrains Mono and font.family.sans is Inter", () => {
  expect((token("font.family.mono").value as string[])[0]).toBe("JetBrains Mono");
  expect((token("font.family.sans").value as string[])[0]).toBe("Inter");
});

Then("each ends with a system fallback stack of the same kind", () => {
  const mono = token("font.family.mono").value as string[];
  const sans = token("font.family.sans").value as string[];
  expect(mono).toContain("ui-monospace");
  expect(mono.at(-1)).toBe("monospace");
  expect(sans).toContain("system-ui");
  expect(sans.at(-1)).toBe("sans-serif");
});

// ── PRIM-008 A modular type scale ───────────────────────

const SIZES = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];

Then("font.size has steps xs, sm, md, lg, xl, 2xl, 3xl, 4xl and 5xl", () => {
  expect(names("font.size")).toEqual(SIZES);
});

Then("md is 16px and the steps from md upward follow a 1.25 ratio, rounded to whole pixels", async () => {
  expect(px("font.size.md")).toBe(16);
  SIZES.slice(2).forEach((s, i) => expect([s, px(`font.size.${s}`)]).toEqual([s, Math.round(16 * 1.25 ** i)]));
  expect(px("font.size.sm")).toBeLessThan(16);
  expect(px("font.size.xs")).toBeLessThan(px("font.size.sm"));
  const css = cssProps(await output("tokens.css"));
  expect(css.find((p) => p.name === "--kan-font-size-md")!.value).toBe("1rem");
});

Then("font.weight has regular 400, medium 500 and bold 700", () => {
  expect(group("font.weight").map((t) => [t.path.at(-1), t.value])).toEqual([
    ["regular", 400],
    ["medium", 500],
    ["bold", 700],
  ]);
});

Then("font.line-height has tight 1.15, normal 1.5 and relaxed 1.7", () => {
  expect(group("font.line-height").map((t) => [t.path.at(-1), t.value])).toEqual([
    ["tight", 1.15],
    ["normal", 1.5],
    ["relaxed", 1.7],
  ]);
});

// ── PRIM-009 to PRIM-011 Shape, motion, breakpoints ─────

Then("radius has none 0, sm 2px, md 4px, lg 8px and full 9999px", () => {
  expect(group("radius").map((t) => [t.path.at(-1), px(t.path.join("."))])).toEqual([
    ["none", 0],
    ["sm", 2],
    ["md", 4],
    ["lg", 8],
    ["full", 9999],
  ]);
});

Then("border.width has thin 1px and thick 2px", () => {
  expect(group("border.width").map((t) => [t.path.at(-1), px(t.path.join("."))])).toEqual([
    ["thin", 1],
    ["thick", 2],
  ]);
});

Then("duration has fast 120ms, normal 200ms and slow 320ms", () => {
  expect(group("duration").map((t) => [t.path.at(-1), t.value])).toEqual([
    ["fast", { value: 120, unit: "ms" }],
    ["normal", { value: 200, unit: "ms" }],
    ["slow", { value: 320, unit: "ms" }],
  ]);
});

Then("easing has standard and emphasized cubic-bezier curves", async () => {
  expect(names("easing")).toEqual(["standard", "emphasized"]);
  for (const t of group("easing")) expect(t.type).toBe("cubicBezier");
  const css = cssProps(await output("tokens.css"));
  expect(css.find((p) => p.name === "--kan-easing-standard")!.value).toBe("cubic-bezier(0.2, 0, 0, 1)");
});

Then("breakpoint has sm 640px, md 768px, lg 1024px and xl 1280px", () => {
  expect(group("breakpoint").map((t) => [t.path.at(-1), px(t.path.join("."))])).toEqual([
    ["sm", 640],
    ["md", 768],
    ["lg", 1024],
    ["xl", 1280],
  ]);
});

// ── TOK-001 One build makes every output ────────────────

When('I run "bun run build" in packages/tokens', (world) => {
  const out = tmp("tokens-cli-");
  const p = Bun.spawnSync(["bun", "run", "build", "--out", out], { cwd: PKG, stdout: "pipe", stderr: "pipe" });
  expect([p.exitCode, p.stderr.toString()]).toEqual([0, expect.any(String)]);
  world.out = out;
});

Then("it writes a CSS file of custom properties, a typed TypeScript module and a JSON file for the docs", (world) => {
  const out = world.out as string;
  const css = fs.readFileSync(path.join(out, "tokens.css"), "utf8");
  expect(css).toContain(":root {");
  const ts = fs.readFileSync(path.join(out, "tokens.ts"), "utf8");
  expect(ts).toContain("export type TokenName = keyof typeof tokens;");
  const docs = JSON.parse(fs.readFileSync(path.join(out, "tokens.json"), "utf8")) as Row[];
  expect(docs.length).toBeGreaterThan(101);
  expect(cssProps(block(css, ":root"))).toHaveLength(docs.length);
  expect(docs.find((d) => d.name === "color.cyan.500")).toEqual({
    name: "color.cyan.500",
    cssVar: "--kan-color-cyan-500",
    type: "color",
    layer: "primitive",
    value: "oklch(0.84 0.14 205)",
    description: "The electric cyan the identity is built on.",
  });
  expect(docs.find((d) => d.name === "color.bg.canvas")).toMatchObject({
    layer: "semantic",
    value: "oklch(0.985 0.003 220)",
    ref: "color.neutral.50",
    dark: "oklch(0.155 0.012 220)",
    darkRef: "color.neutral.950",
  });
});

// ── TOK-002 Every custom property is prefixed ───────────

Then("every CSS custom property the build writes starts with --kan-", async () => {
  const props = cssProps(await output("tokens.css"));
  expect(props.length).toBeGreaterThan(184);
  for (const p of props) expect(p.name.startsWith("--kan-")).toBe(true);
  const json = JSON.parse(await output("tokens.json")) as Row[];
  for (const d of json) expect(d.cssVar.startsWith("--kan-")).toBe(true);
});

// ── TOK-005 Typed token names ───────────────────────────

function typecheck(files: Record<string, string>): string {
  const dir = tmp("tokens-ts-");
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), text);
  const compilerOptions = {
    strict: true,
    noEmit: true,
    types: [],
    target: "ESNext",
    module: "ESNext",
    moduleResolution: "bundler",
  };
  fs.writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions, files: Object.keys(files) }));
  const p = Bun.spawnSync([path.join(ROOT, "node_modules/.bin/tsc"), "--pretty", "false", "-p", "."], {
    cwd: dir,
    stdout: "pipe",
  });
  return p.stdout.toString();
}

Then("the TypeScript module exports every token name as a string literal type", async (world) => {
  const module = await output("tokens.ts");
  world.module = module;
  const docs = JSON.parse(await output("tokens.json")) as Row[];
  for (const d of docs) expect(module).toContain(`  ${JSON.stringify(d.name)}: {`);
  const ok =
    'import { cssVar, type TokenName } from "./tokens";\nconst n: TokenName = "color.cyan.500";\nexport const v: string = cssVar(n);\n';
  expect(typecheck({ "tokens.ts": module, "use.ts": ok })).toBe("");
});

Then("using a name that doesn't exist is a type error", (world) => {
  const bad = 'import type { TokenName } from "./tokens";\nexport const n: TokenName = "color.cyan.999";\n';
  const out = typecheck({ "tokens.ts": world.module as string, "bad.ts": bad });
  // TS2322, or TS2820 when TypeScript can suggest a close name ("Did you mean …?").
  expect(out).toMatch(/^bad\.ts\(2,14\): error TS(?:2322|2820):/);
  expect(out).toContain('"color.cyan.999"');
});

// ── TOK-006 Broken references fail the build ────────────

Given("a semantic token references a primitive that doesn't exist", (world) => {
  const src = tmp("tokens-src-");
  fs.cpSync(path.join(PKG, "src"), src, { recursive: true });
  fs.mkdirSync(path.join(src, "semantic"), { recursive: true });
  fs.writeFileSync(
    path.join(src, "semantic/broken.json"),
    JSON.stringify({ color: { text: { default: { $type: "color", $value: "{color.cyan.999}" } } } }),
  );
  world.src = src;
});

When("the tokens are built", async (world) => {
  world.error = null;
  try {
    world.result = await buildTokens({ src: (world.src as string) ?? path.join(PKG, "src"), out: tmp("tokens-out-") });
  } catch (e) {
    world.error = (e as Error).message;
  }
});

Then("the build fails and names both the semantic token and the missing reference", (world) => {
  expect(world.error).toBe("broken references:\n  color.text.default references color.cyan.999, which doesn't exist");
});

// ── TOK-008 The build is repeatable ─────────────────────

When("the tokens are built twice from the same source", async (world) => {
  const a = tmp("tokens-a-");
  const b = tmp("tokens-b-");
  await buildTokens({ src: path.join(PKG, "src"), out: a });
  await buildTokens({ src: path.join(PKG, "src"), out: b });
  world.dirs = [a, b];
});

Then("the outputs are byte-for-byte identical", (world) => {
  const [a, b] = world.dirs as string[];
  for (const f of ["tokens.css", "tokens.ts", "tokens.json"]) {
    const x = fs.readFileSync(path.join(a, f));
    expect([f, x.length > 0, x.equals(fs.readFileSync(path.join(b, f)))]).toEqual([f, true, true]);
  }
});

// ── SEM: semantic tokens ────────────────────────────────

const SEMANTIC = path.join(PKG, "src/semantic");
const semanticFile = (f: string) => walk(JSON.parse(fs.readFileSync(path.join(SEMANTIC, f), "utf8")), f).tokens;
const semantic = () => [...semanticFile("base.json"), ...semanticFile("light.json"), ...semanticFile("dark.json")];
const childNames = (tokens: Token[], prefix: string) => [
  ...new Set(
    tokens.filter((t) => t.path.join(".").startsWith(`${prefix}.`)).map((t) => t.path[prefix.split(".").length]),
  ),
];
let resolved: Promise<{ rows: Row[] }> | undefined;
const rows = async () => (await (resolved ??= resolveTokens(path.join(PKG, "src")))).rows;
const refTarget = (v: unknown) => (typeof v === "string" ? /^\{([^{}]+)\}$/.exec(v)?.[1] : undefined);

Then("every semantic token's $value is a reference that resolves to a primitive token", () => {
  const all = [...primitives(), ...semantic()];
  const byName = new Map(all.map((t) => [t.path.join("."), t]));
  const resolvesToPrimitive = (ref: string, seen = new Set<string>()): boolean => {
    const t = byName.get(ref);
    if (!t || seen.has(ref)) return false;
    if (t.file !== "base.json" && t.file !== "light.json" && t.file !== "dark.json") return true;
    const next = refTarget(t.value);
    return !!next && resolvesToPrimitive(next, new Set([...seen, ref]));
  };
  for (const t of semantic()) {
    const refs = t.type === "typography" ? Object.values(t.value as Record<string, unknown>) : [t.value];
    for (const v of refs) {
      const ref = refTarget(v);
      expect([t.path.join("."), ref !== undefined && resolvesToPrimitive(ref)]).toEqual([t.path.join("."), true]);
    }
  }
});

Then("no semantic token holds a raw value", () => {
  const raw = semantic().filter((t) =>
    t.type === "typography" ? Object.values(t.value as object).some((v) => !refTarget(v)) : !refTarget(t.value),
  );
  expect(raw.map((t) => t.path.join("."))).toEqual([]);
  expect(semantic().length).toBeGreaterThan(80);
});

Given("the semantic color tokens live in semantic/light.json and semantic/dark.json", () => {
  expect(fs.readdirSync(SEMANTIC).sort()).toEqual(["base.json", "dark.json", "light.json"]);
  expect(semanticFile("base.json").filter((t) => t.path[0] === "color")).toEqual([]);
  expect(semanticFile("light.json").every((t) => t.type === "color")).toBe(true);
});

Then("both files define exactly the same token names", () => {
  const names = (f: string) =>
    semanticFile(f)
      .map((t) => t.path.join("."))
      .sort();
  expect(names("light.json")).toEqual(names("dark.json"));
  expect(names("light.json").length).toBe(30);
});

Then("the build fails naming any token that is in one but not the other", async () => {
  const src = tmp("tokens-src-");
  fs.cpSync(path.join(PKG, "src"), src, { recursive: true });
  const darkFile = path.join(src, "semantic/dark.json");
  const dark = JSON.parse(fs.readFileSync(darkFile, "utf8"));
  delete dark.color.bg.inset;
  dark.color.bg.sunken = { $value: "{color.black}" };
  fs.writeFileSync(darkFile, JSON.stringify(dark));
  await expect(buildTokens({ src, out: tmp("tokens-out-") })).rejects.toThrow(
    "light and dark must define the same tokens:\n  color.bg.inset is only in light.json\n  color.bg.sunken is only in dark.json",
  );
});

Then("color.bg has canvas, surface, raised and inset", () => {
  expect(childNames(semanticFile("light.json"), "color.bg")).toEqual(["canvas", "surface", "raised", "inset"]);
});

Then("inset is the background for code and terminal blocks", () => {
  const inset = semanticFile("light.json").find((t) => t.path.join(".") === "color.bg.inset")!;
  expect(inset.description).toBe("The background for code and terminal blocks.");
});

Then("color.text has default, muted, subtle, inverse, accent and on-accent", () => {
  expect(childNames(semanticFile("light.json"), "color.text")).toEqual([
    "default",
    "muted",
    "subtle",
    "inverse",
    "accent",
    "on-accent",
  ]);
});

Then("color.border has subtle, default, strong and focus", () => {
  expect(childNames(semanticFile("light.json"), "color.border")).toEqual(["subtle", "default", "strong", "focus"]);
});

Then("color.accent has default, hover, active and subtle", () => {
  expect(childNames(semanticFile("light.json"), "color.accent")).toEqual(["default", "hover", "active", "subtle"]);
});

Then("color.status has success, warning, danger and info, each with fg, bg and border", () => {
  const light = semanticFile("light.json");
  expect(childNames(light, "color.status")).toEqual(["success", "warning", "danger", "info"]);
  for (const s of ["success", "warning", "danger", "info"])
    expect([s, childNames(light, `color.status.${s}`)]).toEqual([s, ["fg", "bg", "border"]]);
});

async function colorIn(mode: "light" | "dark") {
  const byName = new Map((await rows()).map((r) => [r.name, r]));
  return (name: string): Oklch => {
    const r = byName.get(name)!;
    const v = mode === "dark" && r.dark !== undefined ? r.dark : r.value;
    return /oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(v)!.slice(1).map(Number) as Oklch;
  };
}
async function expectPairs(filter: (p: (typeof CONTRAST_PAIRS)[number]) => boolean, count: number) {
  const pairs = CONTRAST_PAIRS.filter(filter);
  expect(pairs).toHaveLength(count);
  for (const mode of ["light", "dark"] as const) {
    const color = await colorIn(mode);
    for (const p of pairs) {
      const ratio = contrast(color(p.fg), color(p.bg));
      expect([mode, p.fg, p.bg, ratio >= p.min]).toEqual([mode, p.fg, p.bg, true]);
    }
  }
}

Then(
  "in light and in dark, every color.text token except inverse and on-accent reaches 4.5:1 against bg.canvas, bg.surface and bg.raised",
  async () => {
    const texts = childNames(semanticFile("light.json"), "color.text").filter(
      (t) => t !== "inverse" && t !== "on-accent",
    );
    await expectPairs((p) => p.fg.startsWith("color.text.") && p.fg !== "color.text.on-accent", texts.length * 3);
  },
);

Then("text.on-accent reaches 4.5:1 against accent.default", async () => {
  await expectPairs((p) => p.fg === "color.text.on-accent" && p.bg === "color.accent.default" && p.min === 4.5, 1);
});

Then("each status fg reaches 4.5:1 against its status bg", async () => {
  await expectPairs(
    (p) => /^color\.status\.\w+\.fg$/.test(p.fg) && p.bg === p.fg.replace(/fg$/, "bg") && p.min === 4.5,
    4,
  );
});

Then(
  "in light and in dark, border.strong, border.focus and accent.default reach 3:1 against bg.canvas and bg.surface",
  async () => {
    await expectPairs((p) => p.min === 3, 6);
  },
);

Then("typography has heading-1, heading-2 and heading-3 in the mono family", () => {
  const typo = semanticFile("base.json").filter((t) => t.type === "typography");
  for (const h of ["heading-1", "heading-2", "heading-3"]) {
    const t = typo.find((x) => x.path.join(".") === `typography.${h}`)!;
    expect([h, (t.value as Record<string, string>).fontFamily]).toEqual([h, "{font.family.mono}"]);
  }
});

Then("body-lg, body-md and body-sm in the sans family", () => {
  for (const b of ["body-lg", "body-md", "body-sm"]) {
    const t = semanticFile("base.json").find((x) => x.path.join(".") === `typography.${b}`)!;
    expect([b, (t.value as Record<string, string>).fontFamily]).toEqual([b, "{font.family.sans}"]);
  }
});

Then("label and code in the mono family", () => {
  for (const b of ["label", "code"]) {
    const t = semanticFile("base.json").find((x) => x.path.join(".") === `typography.${b}`)!;
    expect([b, (t.value as Record<string, string>).fontFamily]).toEqual([b, "{font.family.mono}"]);
  }
});

Then("each sets family, size, weight and line height from primitives", async () => {
  const typo = semanticFile("base.json").filter((t) => t.type === "typography");
  expect(typo).toHaveLength(8);
  const parts = {
    fontFamily: "font.family.",
    fontSize: "font.size.",
    fontWeight: "font.weight.",
    lineHeight: "font.line-height.",
  };
  for (const t of typo) {
    for (const [part, prefix] of Object.entries(parts)) {
      expect([
        t.path.join("."),
        part,
        refTarget((t.value as Record<string, string>)[part])?.startsWith(prefix),
      ]).toEqual([t.path.join("."), part, true]);
    }
  }
  const css = await output("tokens.css");
  expect(css).toContain("--kan-typography-heading-1-font-family: var(--kan-font-family-mono);");
  expect(css).toContain("--kan-typography-body-md-line-height: var(--kan-font-line-height-normal);");
});

Then("space has inset sm, md and lg, stack sm, md and lg, and inline sm, md and lg", () => {
  const base = semanticFile("base.json");
  for (const g of ["inset", "stack", "inline"])
    expect([g, childNames(base, `space.${g}`)]).toEqual([g, ["sm", "md", "lg"]]);
});

Then("layout has gutter, section-gap, content-max-width and prose-max-width", () => {
  expect(childNames(semanticFile("base.json"), "layout")).toEqual([
    "gutter",
    "section-gap",
    "content-max-width",
    "prose-max-width",
  ]);
});

Then("focus.ring sets the color from border.focus, a width and an offset", async () => {
  const ring = Object.fromEntries(
    semanticFile("base.json")
      .filter((t) => t.path.slice(0, 2).join(".") === "focus.ring")
      .map((t) => [t.path[2], t.value]),
  );
  expect(ring).toEqual({ color: "{color.border.focus}", width: "{border.width.thick}", offset: "{space.0-5}" });
  const root = block(await output("tokens.css"), ":root");
  expect(root).toContain("--kan-focus-ring-color: var(--kan-color-border-focus);");
});

Given("a visitor prefers reduced motion", async (world) => {
  world.reduced = block(await output("tokens.css"), "@media (prefers-reduced-motion: reduce)");
});

Then("every semantic motion duration resolves to 0ms", async (world) => {
  const durations = semanticFile("base.json").filter((t) => t.path[0] === "motion" && t.type === "duration");
  expect(durations).toHaveLength(3);
  const reduced = cssProps(world.reduced as string);
  expect(reduced.map((p) => [p.name, p.value]).sort()).toEqual(
    durations.map((t) => [`--kan-${t.path.join("-")}`, "0ms"]).sort(),
  );
});

// ── TOK-003, TOK-004, TOK-007: modes, references, contrast ─

const darkColorRoles = () =>
  semanticFile("dark.json")
    .map((t) => `--kan-${t.path.join("-")}`)
    .sort();
/** Roles whose reference changes in dark mode; the rest need no override. */
const changedInDark = () => {
  const light = new Map(semanticFile("light.json").map((t) => [t.path.join("."), t.value]));
  return semanticFile("dark.json")
    .filter((t) => light.get(t.path.join(".")) !== t.value)
    .map((t) => `--kan-${t.path.join("-")}`)
    .sort();
};

Then("light semantic values are set on :root", async () => {
  const root = cssProps(block(await output("tokens.css"), ":root"));
  const get = (n: string) => root.find((p) => p.name === n)?.value;
  expect(get("--kan-color-bg-canvas")).toBe("var(--kan-color-neutral-50)");
  expect(get("--kan-color-accent-default")).toBe("var(--kan-color-cyan-800)");
  for (const name of darkColorRoles()) expect(get(name)).toBeDefined();
});

Then('dark values are set under [data-theme="dark"]', async () => {
  const dark = cssProps(block(await output("tokens.css"), '[data-theme="dark"]'));
  expect(dark.map((p) => p.name).sort()).toEqual(changedInDark());
  expect(changedInDark()).not.toContain("--kan-color-border-strong");
  expect(changedInDark().length).toBe(darkColorRoles().length - 1);
  expect(dark.find((p) => p.name === "--kan-color-bg-canvas")!.value).toBe("var(--kan-color-neutral-950)");
  expect(dark.find((p) => p.name === "--kan-color-accent-default")!.value).toBe("var(--kan-color-cyan-500)");
});

Then('dark values also apply under prefers-color-scheme: dark unless data-theme="light" is set', async () => {
  const css = await output("tokens.css");
  const media = block(css, "@media (prefers-color-scheme: dark)");
  const inner = block(media, ':root:not([data-theme="light"])');
  expect(cssProps(inner)).toEqual(cssProps(block(css, '[data-theme="dark"]')));
});

Then(
  "each semantic custom property is written as var() of its primitive's custom property, so devtools show which primitive a role uses",
  async () => {
    const all = await rows();
    const known = new Set(all.map((r) => r.cssVar));
    const css = await output("tokens.css");
    const semanticVars = new Set(all.filter((r) => r.layer === "semantic").map((r) => r.cssVar));
    const declared = [...cssProps(block(css, ":root")), ...cssProps(block(css, '[data-theme="dark"]'))].filter((p) =>
      semanticVars.has(p.name),
    );
    expect(declared.length).toBeGreaterThan(100);
    for (const p of declared) {
      const target = /^var\((--kan-[\w-]+)\)$/.exec(p.value)?.[1];
      expect([p.name, target !== undefined && known.has(target)]).toEqual([p.name, true]);
    }
  },
);

Then("the contrast rules in SEM-007 and SEM-008 are checked", (world) => {
  expect(world.error).toBeNull();
  const result = world.result as { contrastChecked: number };
  expect(result.contrastChecked).toBe(CONTRAST_PAIRS.length * 2);
  expect(new Set(CONTRAST_PAIRS.map((p) => p.rule))).toEqual(new Set(["SEM-007", "SEM-008"]));
});

Then("a failing pair fails the build, naming both tokens, the mode and the ratio", async () => {
  const src = tmp("tokens-src-");
  fs.cpSync(path.join(PKG, "src"), src, { recursive: true });
  const darkFile = path.join(src, "semantic/dark.json");
  const dark = JSON.parse(fs.readFileSync(darkFile, "utf8"));
  dark.color.text.subtle.$value = "{color.neutral.600}";
  fs.writeFileSync(darkFile, JSON.stringify(dark));
  const err = await buildTokens({ src, out: tmp("tokens-out-") }).then(
    () => "",
    (e: Error) => e.message,
  );
  expect(err).toStartWith("contrast:\n");
  expect(err).toMatch(/in dark, color\.text\.subtle on color\.bg\.canvas is \d\.\d\d:1, needs 4\.5:1 \(SEM-007\)/);
  expect(err).not.toContain("in light");
});
