# WebSpeak palette

Status: chosen direction "Signal Blue", built on the base color `#065682`. Implemented as tokens in
`web/src/styles/tokens.css`. This file is the reference for why the values are what they are.

## Tokens

| Token (Tailwind name) | Light | Dark | Use |
|---|---|---|---|
| `surface-0` | `#f2f6f9` | `#0b141c` | Page background |
| `surface-1` | `#ffffff` | `#0f1a24` | Cards, panels, sidebar |
| `surface-2` | `#e6eef4` | `#172633` | Hover, selected row, inputs |
| `fg` | `#101c26` | `#e5eef5` | Primary text |
| `fg-muted` | `#556a7a` | `#8fa6b8` | Secondary text, icons |
| `line` | `#d3dfe8` | `#243746` | Dividers and card edges (decorative) |
| `line-strong` | derived | derived | Input, outline button and switch borders. 80% `fg-muted` mixed into `surface-1`, about 3.7:1 light and 4.9:1 dark |
| `accent` | `#065682` | `#6fb8ec` | Primary actions, links, focus ring, selection |
| `accent-fg` | `#ffffff` | `#04202f` | Text on `accent` |
| `success` | `#25794a` | `#6ddc8b` | Connected, speaking |
| `warning` | `#96590a` | `#e5b567` | Away, degraded |
| `danger` | `#b83c37` | `#f0837c` | Errors, muted mic, leave |

## Decisions

- **Base color `#065682`** (hue 201°, a deep cerulean). 7.9:1 against white, so it works directly as the
  light-theme accent.
- **Dark accent `#6fb8ec`** is a lighter tint of the same hue. The base itself is only about 2.2:1 on dark
  surfaces, so it cannot be used as text, icon or focus color there.
- **Neutrals** sit at about hue 205° so surfaces and accent belong to one family.
- **Semantic colors** (`success`, `warning`, `danger`) are separate from the accent and never used as
  decoration. Speaking state is green so it stays distinct from the blue accent.
- Never convey state by color alone. Pair `warning` and `danger` with an icon or label.

## Contrast (WCAG, foreground on `surface-1`)

| | Light | Dark |
|---|---|---|
| `fg` | 17.3 | 15.0 |
| `fg-muted` | 5.6 | 7.0 |
| `accent` | 7.9 | 8.2 |
| `accent-fg` on `accent` | 7.9 | 7.8 |
| `success` | 5.4 | 10.3 |
| `warning` | 5.6 | 9.3 |
| `danger` | 5.6 | 6.9 |

`fg-muted` on `surface-2` is 4.8 (light) and 6.1 (dark). `line` is a decorative 1.4:1 border and must
not carry meaning on its own; anything that marks a control's edge uses `line-strong` (WCAG 1.4.11).

## Alternatives considered

- **Deep Teal**: the previous identity (`#006a64` / `#69d2c7`). Speaking green sat too close to the accent.
- **Graphite & Amber**: amber accent collides with the warning color.
- **Moss & Lime**: green accent and green speaking state are nearly the same hue.

## Not decided yet

See `README.md` for type, shape, elevation and motion.
