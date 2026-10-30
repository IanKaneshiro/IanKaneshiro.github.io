/**
 * WCAG 2 contrast for OKLCH colors (SEM-007, SEM-008, TOK-007).
 * OKLCH → OKLab → linear sRGB (Björn Ottosson's matrices), clipped to the sRGB gamut,
 * then WCAG relative luminance and contrast ratio.
 */

export type Oklch = [l: number, c: number, h: number];

export function oklchToLinearSrgb([L, C, H]: Oklch): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** WCAG relative luminance. Linear sRGB is already what the WCAG formula linearizes to. */
export function luminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type Pair = { fg: string; bg: string; min: number; rule: string };

/** The pairs SEM-007 and SEM-008 require, in each mode. */
export const CONTRAST_PAIRS: Pair[] = [
  ...["default", "muted", "subtle", "accent"].flatMap((t) =>
    ["canvas", "surface", "raised"].map((bg) => ({
      fg: `color.text.${t}`,
      bg: `color.bg.${bg}`,
      min: 4.5,
      rule: "SEM-007",
    })),
  ),
  { fg: "color.text.on-accent", bg: "color.accent.default", min: 4.5, rule: "SEM-007" },
  ...["success", "warning", "danger", "info"].map((s) => ({
    fg: `color.status.${s}.fg`,
    bg: `color.status.${s}.bg`,
    min: 4.5,
    rule: "SEM-007",
  })),
  ...["color.border.strong", "color.border.focus", "color.accent.default"].flatMap((fg) =>
    ["color.bg.canvas", "color.bg.surface"].map((bg) => ({ fg, bg, min: 3, rule: "SEM-008" })),
  ),
];

export type ContrastFailure = Pair & { mode: string; ratio: number };

/** Every required pair below its minimum, in each mode. `color(name, mode)` resolves a token to OKLCH. */
export function checkContrast(modes: string[], color: (name: string, mode: string) => Oklch): ContrastFailure[] {
  return modes.flatMap((mode) =>
    CONTRAST_PAIRS.flatMap((pair) => {
      const ratio = contrast(color(pair.fg, mode), color(pair.bg, mode));
      return ratio + 1e-9 < pair.min ? [{ ...pair, mode, ratio }] : [];
    }),
  );
}

export const formatContrastFailure = (f: ContrastFailure) =>
  `in ${f.mode}, ${f.fg} on ${f.bg} is ${f.ratio.toFixed(2)}:1, needs ${f.min}:1 (${f.rule})`;
