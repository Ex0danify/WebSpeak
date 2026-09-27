import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The colour tokens of tokens.css, in both themes, against WCAG 2.x contrast. No browser: the
// values are read from the stylesheet (hex colours and the `color-mix(in srgb, ...)` tints) and the
// ratios are computed here. Axe checks the rendered pages (e2e/a11y/axe.spec.ts); this one checks
// the pairs no page shows today, and fails when a value drifts.

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

/** The `--ws-*` declarations of the first block that starts with `selector`. */
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end++) {
    if (css[end] === "{") depth++;
    if (css[end] === "}" && --depth === 0) break;
  }
  const found: Record<string, string> = {};
  for (const match of css.slice(open + 1, end).matchAll(/--(ws-[\w-]+):\s*([^;]+);/g)) found[match[1]!] = match[2]!.replace(/\s+/g, " ").trim();
  return found;
}

const light = declarations(":root");
const dark = declarations(':root[data-theme="dark"]');
const system = declarations(':root:not([data-theme="light"]):not([data-theme="dark"])');

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)) as Rgb;
}

/** A token as sRGB channels, following `var()` and `color-mix(in srgb, A p%, B)` in the given theme. */
function resolve(value: string, theme: Record<string, string>): Rgb {
  const variable = /^var\(--(ws-[\w-]+)\)$/.exec(value);
  if (variable) return resolve(theme[variable[1]!]!, theme);
  if (value.startsWith("#")) return parseHex(value);
  const mix = /^color-mix\(in srgb, (.+?) (\d+)%, (.+)\)$/.exec(value);
  if (!mix) throw new Error(`cannot read ${value}`);
  const share = Number(mix[2]) / 100;
  const a = resolve(mix[1]!, theme);
  const b = resolve(mix[3]!, theme);
  return a.map((channel, index) => channel * share + b[index]! * (1 - share)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(foreground: Rgb, background: Rgb): number {
  const [hi, lo] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

const themes = {
  light,
  dark: { ...light, ...dark },
} as const;

const token = (theme: Record<string, string>, name: string) => resolve(`var(--ws-${name})`, theme);

// [foreground, background, minimum ratio]: 4.5 for text (WCAG 1.4.3), 3 for what marks a control or
// a state (1.4.11).
const pairs: [string, string, number][] = [
  ["fg", "surface-0", 4.5],
  ["fg", "surface-1", 4.5],
  ["fg", "surface-2", 4.5],
  ["fg-muted", "surface-0", 4.5],
  ["fg-muted", "surface-1", 4.5],
  ["fg-muted", "surface-2", 4.5],
  ["accent", "surface-0", 4.5],
  ["accent", "surface-1", 4.5],
  ["accent-fg", "accent", 4.5],
  ["success", "surface-1", 4.5],
  ["warning", "surface-1", 4.5],
  ["danger", "surface-1", 4.5],
  ["fg", "accent-soft", 4.5],
  ["accent", "accent-soft", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["danger", "danger-soft", 4.5],
  ["line-strong", "surface-1", 3],
  ["line-strong", "surface-2", 3],
  ["accent", "surface-2", 3],
];

const ratioOf = (theme: Record<string, string>, foreground: string, background: string) => contrast(token(theme, foreground), token(theme, background));

for (const [themeName, theme] of Object.entries(themes)) {
  describe(`${themeName} theme`, () => {
    it.each(pairs)("%s on %s is at least %d:1", (foreground, background, minimum) => {
      const ratio = ratioOf(theme, foreground, background);
      expect(ratio, `${foreground} on ${background}: ${ratio.toFixed(3)}`).toBeGreaterThanOrEqual(minimum);
    });
  });
}

describe("the system theme", () => {
  it("is the dark theme, value for value", () => {
    expect(system).toEqual(dark);
  });
});
