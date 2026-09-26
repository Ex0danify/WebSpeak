// Legacy color codemod (plan step 3.0). Rewrites literal colors (hex, rgb(), rgba())
// in the <style> blocks of a .vue file to design tokens, by CSS property and role.
// The mapping and its reasoning are documented in docs/design/color-map.md.
//
//   node scripts/migrate-colors.mjs <file> [--from N] [--to N] [--write] [--verbose]
//
//   --from / --to   only rules that start on a line in this range (1-based, inclusive)
//   --write         apply the changes (default is a dry run that only reports)
//   --verbose       also list every heuristic replacement, not just the totals
//
// The report has four parts:
//   range           first and last selector processed (for the commit body)
//   replaced        counts by confidence: exact (table) and heuristic (thresholds)
//   needs review    literals left untouched because the role is ambiguous, with a suggestion
//   theme rules     rules under data-theme / prefers-color-scheme. These are never rewritten:
//                   the tokens swap per theme, so they are delete candidates. Each is classified
//                   keep / tokens-only / has-literals and lists its non-color declarations.
//
// After a run: resolve the review list by hand, delete the theme rules, then
// `npm run check:styles -- --update` to ratchet the budget down.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------- mapping tables

// Exact literals. Keys are lowercase 6-digit hex. Per role: `bg`, `text`, `border`, or `any`.
// A value is a token name, or `hover:<token>` for the hover shade of a filled control.
// Anything not listed here falls through to the threshold rules in `heuristic()`.
const EXACT = {
  "#ffffff": { bg: "surface-1", border: "surface-1" }, // `text` depends on the rule's fill, see whiteText()
  "#006a64": { any: "accent" },
  "#087d74": { any: "hover:accent" },
  "#f6f9f8": { bg: "surface-0" },
  "#f7f9f8": { bg: "surface-0" },
  "#f4f8f6": { bg: "surface-0" },
  "#edf1ef": { bg: "surface-2", border: "line" },
  "#e6ecea": { bg: "surface-2", border: "line" },
  "#e0eae6": { bg: "surface-2", border: "line" },
  "#899792": { text: "fg-muted" },
  "#71817c": { text: "fg-muted" },
  "#7e8c88": { text: "fg-muted" },
  "#30413d": { text: "fg", bg: "fg" },
  "#202f2c": { text: "fg", bg: "fg" },
  "#192120": { text: "fg", bg: "fg" },
  "#65d879": { any: "success" },
  "#90f691": { any: "success" },
  "#55d17a": { any: "success" },
  "#c95a54": { any: "danger" },
  "#e56b91": { any: "danger" },
  "#c89143": { any: "warning" },
  "#e2b36c": { any: "warning" },
};

const TEXT_PROPS = new Set([
  "color", "caret-color", "fill", "stroke", "text-decoration-color", "-webkit-text-fill-color",
  "accent-color", "text-emphasis-color", "column-rule-color",
]);
const BORDER_PROP = /^(?:border|outline)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?(?:-color)?$|^column-rule$/;
const BG_PROP = /^background(?:-color|-image)?$|^scrollbar-color$/;
const SHADOW_PROPS = new Set(["box-shadow", "text-shadow"]);

const FAMILY_TOKEN = { accent: "accent", success: "success", warning: "warning", danger: "danger" };

// ---------------------------------------------------------------- color helpers

const v = (token) => `var(--ws-${token})`;
const pct = (alpha) => `${Math.round(alpha * 1000) / 10}%`;
const withAlpha = (token, alpha) => `color-mix(in srgb, ${v(token)} ${pct(alpha)}, transparent)`;
const HOVER = (token) => `color-mix(in srgb, ${v(token)} 85%, ${v("fg")})`;

function parseColor(text) {
  const lower = text.toLowerCase();
  if (lower.startsWith("#")) {
    let hex = lower.slice(1);
    if (hex.length <= 4) hex = [...hex].map((ch) => ch + ch).join("");
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  const inner = lower.slice(lower.indexOf("(") + 1, lower.lastIndexOf(")"));
  const parts = inner.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (s) => (s.endsWith("%") ? (parseFloat(s) / 100) * 255 : parseFloat(s));
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  const c = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha };
  return [c.r, c.g, c.b, c.a].some(Number.isNaN) ? null : c;
}

function analyze(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const chroma = (max - min) / 255;
  const l = (max + min) / 510;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === c.r) h = ((c.g - c.b) / d) % 6;
    else if (max === c.g) h = (c.b - c.r) / d + 2;
    else h = (c.r - c.g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  // The legacy neutrals are green-tinted grays (chroma up to about .05). A pale color above that is a tint.
  let family;
  if (chroma < (l > 0.8 ? 0.05 : 0.15)) family = "neutral";
  else if (h >= 150 && h < 260) family = "accent"; // teal, cyan, blue
  else if (h >= 85 && h < 150) family = "success";
  else if (h >= 20 && h < 85) family = "warning";
  else if (h >= 330 || h < 20) family = "danger";
  else family = "purple";
  return { chroma, l, h, family };
}

const hex6 = (c) => `#${[c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

// ---------------------------------------------------------------- mapping

// role: "bg" | "text" | "border"; ctx: { fill, hover, bgLiteral }
// Returns { value, kind: "exact" | "heuristic" } or { review: "why", suggest: "..." }.
function mapOpaque(c, role, ctx, literal) {
  const key = hex6(c);
  const exact = EXACT[key];
  if (exact) {
    const token = exact[role] ?? exact.any;
    if (token) {
      if (token.startsWith("hover:")) return { value: HOVER(token.slice(6)), kind: "exact" };
      return { value: v(token), kind: "exact" };
    }
  }
  const { l, family } = analyze(c);

  // A border that repeats the rule's own fill keeps matching it.
  if (role === "border" && ctx.bgLiteral && hex6(ctx.bgLiteral) === key && ctx.fillToken) {
    return { value: ctx.fillToken, kind: "heuristic" };
  }

  if (role === "text") return mapText(c, ctx, key, l, family);
  if (role === "bg") return mapBackground(c, ctx, key, l, family);
  return mapBorder(key, l, family);
}

function whiteText(ctx) {
  // Text that is white-ish depends on what it sits on.
  if (ctx.fill === "accent" || ctx.fill === "success" || ctx.fill === "warning" || ctx.fill === "danger") {
    return { value: v("accent-fg"), kind: "heuristic" };
  }
  if (ctx.fill === "fg") return { value: v("surface-1"), kind: "heuristic" };
  return {
    review: "light text and the rule has no fill of its own (inherits a dark or colored parent?)",
    suggest: `${v("accent-fg")} on a filled control, ${v("surface-1")} on an inverse (fg) fill`,
  };
}

function mapText(c, ctx, key, l, family) {
  if (family === "neutral") {
    if (l >= 0.8) return whiteText(ctx);
    return { value: v(l < 0.32 ? "fg" : "fg-muted"), kind: "heuristic" };
  }
  if (family === "purple") return { review: "purple text", suggest: v("accent") };
  if (l >= 0.85) {
    // Pale colored text only exists on a dark or filled surface.
    if (ctx.fill) return { value: v("accent-fg"), kind: "heuristic" };
    return { review: `pale ${family} text without a fill in this rule`, suggest: v(FAMILY_TOKEN[family]) };
  }
  const token = FAMILY_TOKEN[family];
  if (token === "accent" && ctx.hover && key !== "#006a64") return { value: HOVER("accent"), kind: "heuristic" };
  return { value: v(token), kind: "heuristic" };
}

function mapBackground(c, ctx, key, l, family) {
  if (family === "neutral") {
    if (l >= 0.98) return { value: v("surface-1"), kind: "heuristic" };
    if (l >= 0.95) return { value: v("surface-0"), kind: "heuristic" };
    if (l >= 0.87) return { value: v("surface-2"), kind: "heuristic" };
    if (l >= 0.75) return { value: v("line"), kind: "heuristic" };
    if (l >= 0.32) return { value: v("line-strong"), kind: "heuristic" };
    if (l < 0.06) return { review: "near-black fill (video backdrop or scrim?)", suggest: `allowlist it, or ${v("fg")}` };
    return { value: v("fg"), kind: "heuristic" };
  }
  if (family === "purple") return { review: "purple fill", suggest: v("accent") };
  const token = FAMILY_TOKEN[family];
  if (l >= 0.85) return { value: v(`${token}-soft`), kind: "heuristic" };
  if (token === "accent" && ctx.hover && key !== "#006a64") return { value: HOVER("accent"), kind: "heuristic" };
  return { value: v(token), kind: "heuristic" };
}

function mapBorder(key, l, family) {
  if (family === "neutral") {
    if (l >= 0.75) return { value: v("line"), kind: "heuristic" };
    if (l >= 0.32) return { value: v("line-strong"), kind: "heuristic" };
    return { review: "dark border that does not match a fill", suggest: v("fg") };
  }
  if (family === "purple") return { review: "purple border", suggest: v("line-strong") };
  const token = FAMILY_TOKEN[family];
  if (l >= 0.8) {
    if (token === "accent") return { value: v("line"), kind: "heuristic" };
    return { value: `color-mix(in srgb, ${v(token)} 30%, ${v("surface-1")})`, kind: "heuristic" };
  }
  return { value: v(token), kind: "heuristic" };
}

// Translucent colors. The base color picks the token, the alpha becomes a color-mix() percentage.
function mapAlpha(c, role, ctx) {
  const { l, family } = analyze(c);
  if (family === "neutral") {
    if (l < 0.3) {
      // Black-ish overlay. Strong ones are scrims, faint ones are tints of the text color.
      if (role === "bg" && c.a >= 0.4) return { value: withAlpha("scrim", c.a), kind: "heuristic" };
      return { value: withAlpha("fg", c.a), kind: "heuristic" };
    }
    if (l > 0.8) return { value: withAlpha(role === "border" ? "line" : "surface-1", c.a), kind: "heuristic" }; // white glass, or a light hairline
    return { value: withAlpha("fg-muted", c.a), kind: "heuristic" };
  }
  if (family === "purple") return { review: "translucent purple", suggest: withAlpha("accent", c.a) };
  // A pale tint ("glass" over a colored surface) uses the soft token, a saturated color uses the token itself.
  const token = FAMILY_TOKEN[family];
  return { value: withAlpha(l > 0.85 && role === "bg" ? `${token}-soft` : token, c.a), kind: "heuristic" };
}

// box-shadow: layers of dark translucent color are elevation, not color, so the whole
// declaration becomes one of the theme shadows. Colored layers (glows, focus rings) map per color.
function mapShadow(value, ctx) {
  const layers = splitTop(value, ",");
  const parsed = layers.map((layer) => {
    const m = layer.match(COLOR_RE);
    const color = m ? parseColor(m[0]) : null;
    return { layer, color, inset: /\binset\b/.test(layer) };
  });
  if (parsed.some((p) => !p.color)) return null; // `none`, var(), unparseable: leave alone
  const dark = (p) => {
    const { l, family } = analyze(p.color);
    return family === "neutral" && l < 0.3;
  };
  if (parsed.every(dark) && !parsed.some((p) => p.inset)) {
    // Lengths are x, y, blur, spread; a bare 0 has no unit.
    const blur = Math.max(...parsed.map((p) => Number.parseFloat(p.layer.replace(COLOR_RE, "").match(/(?:-?[\d.]+(?:px)?\s+){2}([\d.]+)px/)?.[1] ?? "0")));
    // Floating layers are wide and clearly visible; a wide but faint shadow (alpha < .15) is only a soft lift.
    const strength = Math.max(...parsed.map((p) => p.color.a));
    return { value: blur >= 16 && strength >= 0.15 ? "var(--shadow-lg)" : "var(--shadow-sm)", kind: "heuristic", whole: true };
  }
  if (parsed.some(dark)) return { review: "shadow mixes dark and colored layers", suggest: "split into var(--shadow-sm) plus a colored ring" };
  return null; // all colored: handled per literal below
}

// ---------------------------------------------------------------- parsing

const COLOR_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\brgba?\([^)]*\)/g;
const OTHER_COLOR_RE = /\b(?:hsla?|hwb|oklch|oklab)\(/;

function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") depth -= 1;
    else if (text[i] === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const squash = (text) => stripComments(text).replace(/\s+/g, " ").trim();

// Walks one style block and returns its rules with the declarations inside them.
function parseRules(text, base, lineAt) {
  const rules = [];
  const stack = [];
  let pStart = 0;
  let paren = 0;
  let i = 0;
  const top = () => stack[stack.length - 1];

  const decl = (start, end) => {
    const frame = top();
    if (!frame || !frame.holdsDecls) return;
    const raw = text.slice(start, end);
    const clean = stripComments(raw);
    if (!clean.trim()) return;
    // Colon at paren depth 0, on the comment-stripped text mapped back by searching the raw text.
    let depth = 0;
    let colon = -1;
    let inComment = false;
    for (let k = 0; k < raw.length; k += 1) {
      if (!inComment && raw[k] === "/" && raw[k + 1] === "*") inComment = true;
      else if (inComment && raw[k] === "*" && raw[k + 1] === "/") { inComment = false; k += 1; }
      else if (!inComment) {
        if (raw[k] === "(") depth += 1;
        else if (raw[k] === ")") depth -= 1;
        else if (raw[k] === ":" && depth === 0) { colon = k; break; }
      }
    }
    if (colon < 0) return;
    const prop = squash(raw.slice(0, colon)).toLowerCase();
    if (!prop) return;
    frame.decls.push({ prop, start: base + start + colon + 1, end: base + end, value: raw.slice(colon + 1) });
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close < 0 ? text.length : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < text.length && text[i] !== ch) i += text[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    else if (paren === 0 && ch === "{") {
      const prelude = squash(text.slice(pStart, i));
      const lead = text.slice(pStart, i).search(/\S/);
      const atName = prelude.startsWith("@") ? prelude.slice(1).split(/[\s(]/)[0].toLowerCase() : null;
      const holdsDecls = !atName || atName === "font-face" || atName === "page";
      const themed = /data-theme|prefers-color-scheme/.test(prelude) || stack.some((f) => f.themed);
      const frame = {
        prelude,
        atName,
        holdsDecls,
        themed,
        decls: [],
        line: lineAt(base + pStart + Math.max(lead, 0)),
        endLine: 0,
        parentSelectors: stack.filter((f) => !f.atName).map((f) => f.prelude),
      };
      stack.push(frame);
      rules.push(frame);
      pStart = i + 1;
    } else if (paren === 0 && ch === ";") {
      decl(pStart, i);
      pStart = i + 1;
    } else if (paren === 0 && ch === "}") {
      decl(pStart, i);
      const frame = stack.pop();
      if (frame) frame.endLine = lineAt(base + i);
      pStart = i + 1;
    }
    i += 1;
  }
  return rules.filter((r) => r.holdsDecls);
}

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const file = args.find((arg, i) => !arg.startsWith("--") && !["--from", "--to"].includes(args[i - 1]));
if (!file) {
  console.error("usage: node scripts/migrate-colors.mjs <file.vue> [--from N] [--to N] [--write] [--verbose]");
  process.exit(2);
}
const path = resolve(file);
const source = readFileSync(path, "utf8");
const from = Number(option("--from") ?? 1);
const to = Number(option("--to") ?? Infinity);
const verbose = flag("--verbose");

const lineStarts = [0];
for (let i = 0; i < source.length; i += 1) if (source[i] === "\n") lineStarts.push(i + 1);
const lineAt = (offset) => {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

const rules = [];
for (const block of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
  const base = block.index + block[0].indexOf(">") + 1;
  rules.push(...parseRules(block[1], base, lineAt));
}

const edits = [];
const review = [];
const themeRules = [];
const counts = { exact: 0, heuristic: 0 };
const heuristics = [];
const selected = rules.filter((rule) => rule.line >= from && rule.line <= to);
const shortSel = (rule) => (rule.prelude.length > 72 ? `${rule.prelude.slice(0, 69)}...` : rule.prelude);

function roleOf(prop) {
  if (TEXT_PROPS.has(prop)) return "text";
  if (BORDER_PROP.test(prop)) return "border";
  if (BG_PROP.test(prop)) return "bg";
  return null;
}

for (const rule of selected) {
  if (rule.themed) {
    const literals = rule.decls.flatMap((d) => d.value.match(COLOR_RE) ?? []);
    const colorProps = rule.decls.filter((d) => roleOf(d.prop) || SHADOW_PROPS.has(d.prop) || d.prop.startsWith("--"));
    const other = [...new Set(rule.decls.filter((d) => !colorProps.includes(d)).map((d) => d.prop))];
    let verdict = "tokens-only";
    if (rule.decls.length && rule.decls.every((d) => d.prop === "color-scheme")) verdict = "keep (color-scheme)";
    else if (literals.length) verdict = "has-literals";
    themeRules.push({ rule, verdict, literals: literals.length, other });
    continue;
  }

  // The rule's own fill decides what light text means: accent-fg on a colored fill, surface-1 on an inverse one.
  const hover = /:(?:hover|focus-visible|active)\b/.test(rule.prelude);
  const ctx = { hover, fill: null, fillToken: null, bgLiteral: null };
  for (const d of rule.decls) {
    if (roleOf(d.prop) !== "bg") continue;
    const m = d.value.match(COLOR_RE);
    const c = m ? parseColor(m[0]) : null;
    if (!c || c.a < 1) continue;
    const mapped = mapOpaque(c, "bg", { hover }, m[0]);
    if (!mapped.value) continue;
    ctx.bgLiteral = c;
    ctx.fillToken = mapped.value;
    // A hover shade is a mix of accent; every other value is a plain var(--ws-<token>).
    const token = mapped.value.startsWith("color-mix") ? "accent" : mapped.value.match(/^var\(--ws-([\w-]+)\)$/)?.[1];
    if (["accent", "success", "warning", "danger", "fg"].includes(token)) ctx.fill = token;
  }

  for (const d of rule.decls) {
    if (OTHER_COLOR_RE.test(d.value)) {
      review.push({ rule, d, literal: d.value.trim(), reason: "hsl/hwb/oklch color", suggest: "" });
    }
    const matches = [...d.value.matchAll(COLOR_RE)];
    if (!matches.length) continue;

    // Whole-declaration shadow replacement first.
    if (SHADOW_PROPS.has(d.prop)) {
      const shadow = d.prop === "box-shadow" ? mapShadow(d.value, ctx) : null;
      if (shadow?.whole) {
        const important = /!\s*important\s*$/i.test(d.value) ? " !important" : "";
        const trailing = d.value.match(/\s*$/)[0];
        edits.push({ start: d.start, end: d.end, text: ` ${shadow.value}${important}${trailing}`, guard: d.value });
        counts.heuristic += 1;
        heuristics.push({ rule, d, from: d.value.trim(), to: shadow.value });
        continue;
      }
      if (shadow?.review) {
        review.push({ rule, d, literal: d.value.trim(), reason: shadow.review, suggest: shadow.suggest });
        continue;
      }
    }

    const role = roleOf(d.prop) ?? (SHADOW_PROPS.has(d.prop) ? "bg" : null);
    const isGradient = /gradient\(/.test(d.value);
    for (const m of matches) {
      const literal = m[0];
      const c = parseColor(literal);
      if (!role || !c) {
        review.push({ rule, d, literal, reason: `property \`${d.prop}\` has no role`, suggest: "" });
        continue;
      }
      const result = c.a < 1 ? mapAlpha(c, role, ctx) : mapOpaque(c, role, ctx, literal);
      if (result.review) {
        review.push({ rule, d, literal, reason: result.review, suggest: result.suggest });
        continue;
      }
      const start = d.start + m.index;
      edits.push({ start, end: start + literal.length, text: result.value, guard: literal });
      counts[result.kind] += 1;
      if (result.kind === "heuristic" || isGradient) heuristics.push({ rule, d, from: literal, to: result.value, gradient: isGradient });
      if (isGradient) review.push({ rule, d, literal, reason: "gradient stop (check the final look)", suggest: `mapped to ${result.value}`, applied: true });
    }
  }
}

// ---------------------------------------------------------------- report

const out = [];
const first = selected[0];
const last = selected[selected.length - 1];
out.push(`file      ${file}`);
out.push(`range     lines ${from}-${Number.isFinite(to) ? to : "end"}, ${selected.length} rules${selected.length ? `, first \`${shortSel(first)}\` (L${first.line}), last \`${shortSel(last)}\` (L${last.line})` : ""}`);
const inRange = selected.reduce((n, rule) => n + rule.decls.reduce((m, d) => m + (d.value.match(COLOR_RE)?.length ?? 0), 0), 0);
out.push(`literals  ${inRange} in range (${themeRules.reduce((n, t) => n + t.literals, 0)} of them in theme rules)`);
out.push(`replaced  ${counts.exact + counts.heuristic} literals (${counts.exact} exact, ${counts.heuristic} heuristic)${flag("--write") ? " [written]" : " [dry run]"}`);

const pending = review.filter((r) => !r.applied);
out.push("", `needs review (${pending.length} left as they are)`);
for (const r of pending) out.push(`  L${r.rule.line}  ${shortSel(r.rule)}  ${r.d.prop}: ${r.literal}  -- ${r.reason}${r.suggest ? ` | ${r.suggest}` : ""}`);

const gradients = review.filter((r) => r.applied);
if (gradients.length) {
  out.push("", `gradient stops applied (${gradients.length}), check the final look`);
  for (const r of gradients) out.push(`  L${r.rule.line}  ${shortSel(r.rule)}  ${r.literal} -> ${r.suggest.replace("mapped to ", "")}`);
}

out.push("", `theme rules, not rewritten (${themeRules.length}); delete candidates`);
for (const t of themeRules) {
  out.push(`  L${t.rule.line}-${t.rule.endLine}  ${t.verdict.padEnd(12)} ${shortSel(t.rule)}${t.literals ? `  [${t.literals} literal(s)]` : ""}${t.other.length ? `  KEEP? non-color: ${t.other.join(", ")}` : ""}`);
}

if (verbose) {
  out.push("", `heuristic replacements (${heuristics.length})`);
  for (const h of heuristics) out.push(`  L${h.rule.line}  ${shortSel(h.rule)}  ${h.d.prop}: ${h.from} -> ${h.to}`);
}
console.log(out.join("\n"));

if (flag("--write") && edits.length) {
  let next = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    const before = next.slice(edit.start, edit.end);
    if (edit.guard !== undefined && !before.includes(edit.guard.trim())) throw new Error(`offset drift at ${edit.start}: expected ${edit.guard}, found ${before}`);
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }
  writeFileSync(path, next);
}
