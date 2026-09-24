# WebSpeak design

| File | What it is |
|---|---|
| `palette.md` | Color tokens, contrast, rationale |
| `components-mock.html` | Approved visual reference for the base components. Open in a browser. It has switches for theme, typeface and corner radius; the chosen setting is Inter and Balanced. |
| `redesign-plan.md` | Step-by-step phase 1 implementation plan (Tailwind migration, component library) with phase 2 reference. Written for an orchestrating agent. One step = one commit. |
| `../../web/src/styles/tokens.css` | The implemented tokens |

## Foundations (decided)

| | Decision |
|---|---|
| Typeface | Inter (variable, self-hosted through `@fontsource-variable/inter`), 14 px base. CJK and system fallbacks in the stack for zh-CN, ja and ru. |
| Mono | IBM Plex Mono for data readouts and small uppercase labels (latency, sample rate, section labels). |
| Type scale | Display 28/32 700, Title 18/26 600, Body 14/20 400, Small 12/16 400, Data mono 13. |
| Radius | Balanced: `rounded-sm` 6 px (menu rows, kbd), `rounded-md` 8 px (buttons, inputs, tabs), `rounded-lg` 12 px (cards, dialogs, menus). Chips and switches are pills. |
| Elevation | Two levels. `shadow-sm` for a raised control (selected segment). `shadow-lg` for floating layers (menu, dialog, toast, tooltip). Cards use a 1 px `line` border and no shadow. |
| Spacing | Tailwind's 4 px grid (`gap-2` = 8 px). Control heights: 32 / 40 / 48 px. |
| Motion | 120 ms transitions on color and position only. Use `motion-reduce:transition-none` where a transition moves something. |
| Icons | 24 px viewBox, 1.8 stroke, round caps, `currentColor`, rendered at 18 px (15 px inside dense rows). |

## Component conventions (from the mock)

- Status is never color alone: warning and danger chips carry an icon, muted members show a mic-off icon.
- Speaking is a 2 px `success` ring on the avatar, offset by a 2 px gap in the surface color.
- The selected channel row uses `surface-2` and semibold text. There is no accent bar on rows or cards.
- Focus is a 2 px `accent` outline with 2 px offset on every interactive element. Inputs also get a 3 px accent glow.
- Destructive actions use the `danger` button variant only inside dialogs and menus, never as a primary page action.
