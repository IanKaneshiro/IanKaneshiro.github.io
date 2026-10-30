import fs from "node:fs";
import path from "node:path";

/**
 * A small validator for the W3C Design Tokens format (DTCG) as this package uses it (PRIM-001):
 * every token has a $value and a $type, its own or inherited from a group, and the value has
 * the shape its type requires. A value can also be a reference, like "{color.cyan.500}".
 */

export type Token = { path: string[]; type: string; value: unknown; description?: string; file: string };

const TYPES = [
  "color",
  "dimension",
  "duration",
  "fontFamily",
  "fontWeight",
  "number",
  "cubicBezier",
  "typography",
] as const;
/** The parts of a typography token, and the type each part has. */
export const TYPOGRAPHY_PARTS = {
  fontFamily: "fontFamily",
  fontSize: "dimension",
  fontWeight: "fontWeight",
  lineHeight: "number",
} as const;
const RESERVED = new Set(["$value", "$type", "$description", "$extensions", "$deprecated"]);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRef = (v: unknown) => typeof v === "string" && /^\{[^{}]+\}$/.test(v);

/** Why `value` isn't a valid `type` value, or null if it is. */
export function valueProblem(type: string, value: unknown): string | null {
  if (isRef(value)) return null;
  switch (type) {
    case "color": {
      if (!isObject(value)) return "a color must be an object with colorSpace and components";
      const c = value.components;
      if (typeof value.colorSpace !== "string") return "a color needs a colorSpace";
      if (!Array.isArray(c) || c.length !== 3 || !c.every(isNum)) return "a color needs three numeric components";
      if (value.alpha !== undefined && !(isNum(value.alpha) && value.alpha >= 0 && value.alpha <= 1)) {
        return "alpha must be a number from 0 to 1";
      }
      return null;
    }
    case "dimension":
      return isObject(value) && isNum(value.value) && (value.unit === "px" || value.unit === "rem")
        ? null
        : "a dimension must be { value: number, unit: px | rem }";
    case "duration":
      return isObject(value) && isNum(value.value) && (value.unit === "ms" || value.unit === "s")
        ? null
        : "a duration must be { value: number, unit: ms | s }";
    case "fontFamily":
      return typeof value === "string" ||
        (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string"))
        ? null
        : "a fontFamily must be a string or a non-empty list of strings";
    case "fontWeight":
      return isNum(value) && value >= 1 && value <= 1000 ? null : "a fontWeight must be a number from 1 to 1000";
    case "number":
      return isNum(value) ? null : "a number must be a number";
    case "cubicBezier":
      return Array.isArray(value) &&
        value.length === 4 &&
        value.every(isNum) &&
        [value[0], value[2]].every((x) => x >= 0 && x <= 1)
        ? null
        : "a cubicBezier must be four numbers with x1 and x2 from 0 to 1";
    case "typography": {
      if (!isObject(value)) return "a typography value must be an object";
      const missing = Object.keys(TYPOGRAPHY_PARTS).filter((k) => !(k in value));
      if (missing.length) return `a typography value needs ${missing.join(", ")}`;
      for (const [part, partType] of Object.entries(TYPOGRAPHY_PARTS)) {
        const bad = valueProblem(partType, value[part]);
        if (bad) return `${part}: ${bad}`;
      }
      return null;
    }
    default:
      return `unknown $type "${type}"; use one of ${TYPES.join(", ")}`;
  }
}

/** Every token in a DTCG document, plus any problems with it. */
export function walk(doc: unknown, file: string): { tokens: Token[]; problems: string[] } {
  const tokens: Token[] = [];
  const problems: string[] = [];
  const visit = (node: unknown, at: string[], inherited?: string) => {
    const where = `${file}: ${at.join(".") || "(root)"}`;
    if (!isObject(node)) {
      problems.push(`${where}: expected a token or a group`);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key.startsWith("$") && !RESERVED.has(key)) problems.push(`${where}: unknown property ${key}`);
      if (!key.startsWith("$") && /[{}.]/.test(key))
        problems.push(`${where}: the name "${key}" can't contain {, } or .`);
    }
    const type = typeof node.$type === "string" ? node.$type : inherited;
    if ("$value" in node) {
      if (!type) {
        problems.push(`${where}: has no $type, on itself or a parent group`);
        return;
      }
      const bad = valueProblem(type, node.$value);
      if (bad) problems.push(`${where}: ${bad}`);
      tokens.push({
        path: at,
        type,
        value: node.$value,
        description: typeof node.$description === "string" ? node.$description : undefined,
        file,
      });
      return;
    }
    for (const [key, child] of Object.entries(node)) if (!key.startsWith("$")) visit(child, [...at, key], type);
  };
  visit(doc, []);
  return { tokens, problems };
}

/** Every token in the .json files under `dir`, and every problem, including invalid JSON. */
export function readTokens(dir: string): { tokens: Token[]; problems: string[] } {
  const tokens: Token[] = [];
  const problems: string[] = [];
  const files = fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const f of files) {
    let doc: unknown;
    try {
      doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      problems.push(`${f}: invalid JSON: ${(e as Error).message}`);
      continue;
    }
    const r = walk(doc, f);
    tokens.push(...r.tokens);
    problems.push(...r.problems);
  }
  return { tokens, problems };
}
