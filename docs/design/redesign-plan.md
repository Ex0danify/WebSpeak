# WebSpeak redesign plan

Audience: a root agent that orchestrates the redesign, and any sub-agents it dispatches. Read this whole file, then `docs/design/README.md`, `docs/design/palette.md` and `docs/design/components-mock.html` (the approved visual reference) before starting.

Branch: `design-v2`. Current baseline commit: the one that contains this file.

## 0. How to run this plan

### 0.1 Prime directive

Every step below is **one commit**. Commits must be small, single-purpose and independently buildable so that `git bisect` can find a regression by commit alone. When a step turns out to be larger than its size cap, split it into more commits, and add the split to this file.

### 0.2 Commit rules

- One concern per commit. Never mix these in one commit: mechanical codemod output, hand edits, formatting, file moves, dependency changes.
- Size cap: about 300 changed lines, excluding lockfiles and pure moves. A codemod commit may exceed this only if its output is fully mechanical and the codemod is committed earlier.
- Every commit passes gate `G-BUILD` (section 0.4). A commit that leaves the build red is a defect, even if the next commit fixes it.
- Tick the step's checkbox in this file in the same commit that completes it.
- Message format follows the repo history (conventional commits, scope `web`): `feat(web):`, `refactor(web):`, `style(web):`, `chore(web):`, `docs:`. Put the step id in the body, for example `Step 3.4`. Don't end the message with any attribution. We will attribute AI use in the README later!
- Do not push, merge, rebase or force anything. Do not touch `master`.
- Do not commit `web/dist`, `.snapshots/` or root `package-lock.json` churn. If `npm install` rewrites the `teamspeak-client` URL to `git+ssh` in the root lockfile, revert that hunk.
- Milestone tags (local, lightweight) at the end of each track: `design-v2/track-N`. They give bisect good anchors.

### 0.3 Hard constraints

- Phase 1 changes **look and structure of primitives, not layout and not behavior**. Screens keep their current layout. Phase 2 redesigns layout.
- Do not edit the backend (`src/`), `web/src/composables/useVoiceWebSocket.ts`, or the audio path. Never add per-frame logging or per-frame reactive state to the voice path (see `CLAUDE.md`).
- Keep all five languages (zh, en, de, ru, ja). German and Russian strings are long; CJK needs font fallbacks. Every component must tolerate text 40% longer than English.
- Keep light, dark and system themes working (`web/src/services/theme.ts` sets `data-theme`). Components use only tokens from `web/src/styles/tokens.css`. No hex or `rgb()` literals in components. If a needed color is missing, add a derived token in its own commit first.
- Keep the mobile layout (breakpoint 740 px and below) and the `--ui-scale` zoom mechanism (`App.vue`, `main.ts`, and the JS compensation near `getComputedStyle(...).getPropertyValue("--ui-scale")` in `WebClient.vue`) unchanged in phase 1.
- Browser baseline is Chrome/Edge 111+.
- No new runtime dependency without asking the user. Open decisions are listed in section 6. Stop and ask when you reach one.
- Accessibility floor: 2 px accent focus outline on every interactive element, 44 px touch targets on mobile, status never conveyed by color alone, `motion-reduce:` variants on anything that moves.

### 0.4 Verification gates

| Gate | Command | Meaning |
|---|---|---|
| `G-BUILD` | `cd web && npm run build` | Typecheck (`vue-tsc`) and Vite build pass. Required on every commit. |
| `G-STYLE` | `cd web && npm run check:styles` | Literal-color budget per file does not increase (step 0.4). Required from step 0.4 on. |
| `G-SNAP` | `cd web && npm run snapshot -- --label after && npm run snapshot:diff` | Screenshot diff against the baseline (steps 0.1 to 0.3). Each step states one of: **zero** (diff must be 0.00%), **expected** (review changed shots and say why in the commit body), or **n/a**. |
| `G-SMOKE` | Manual checklist in section 5 | Connected-view behavior. Run at each track end. If step 0.5 succeeds it runs automatically, otherwise ask the user. |

If a gate fails, fix it inside the same step. If you cannot fix it inside the step's size cap, revert the step and report.

### 0.5 Parallelism

The root agent owns git and commits sequentially. Sub-agents may work in git worktrees (`isolation: "worktree"`) and hand back a finished commit that the root agent cherry-picks in order.

- Safe in parallel: Track 4 (new component files only), and Track 3 or 5 work on `AdminView.vue` versus work on `WebClient.vue`.
- Never in parallel: two agents editing `WebClient.vue`. It is 4,101 lines and every step touches it.
- Track order is fixed: 0, then 1, then 2. After that, 3 and 4 may overlap, 5 needs the matching parts of 3 and 4, 6 comes last, 7 closes.

## 1. Where we start

Measured on `design-v2` at the time of writing.

| File | Lines | Notes |
|---|---|---|
| `web/src/views/WebClient.vue` | 4,101 | Template about 370, script about 2,670, style about 1,050. Script holds a 1,230-line inline `translations` object (5 languages). |
| `web/src/views/AdminView.vue` | 1,389 | Its whole stylesheet is minified onto one line. |
| `web/src/views/DemoView.vue` | 103 | A separate simulated workspace at `/demo`. It duplicates markup and does not use WebClient. |
| `web/src/components/` | `Icon.vue` (45 inline SVG icons), `LanguageSwitcher.vue` | No other shared components. |

Literal colors in components: WebClient 555 hex and 84 `rgba()`, AdminView 239 and 14, DemoView 92 and 7. There are 148 `data-theme` selector references in the three views (dark-mode override rules), 23 `!important`, and 37 `@media` blocks in `WebClient.vue` (breakpoints 1200, 980, 740, 420, 390, 360).

Raw controls in `WebClient.vue`: 71 `<button>`, 21 `<input>`, 5 `<select>`, 99 `<Icon>`. Five modal dialogs: QQ group, screen-share settings, channel password, server password, audio settings.

The legacy CSS is layered chronologically (comments such as "M007", "M008", "mobile interaction pass"): later rules override earlier ones for the same selector. For a selector, the last winning declaration decides what is visible.

Already in place (do not redo): Tailwind v4 via `@tailwindcss/vite` with preflight **off**; tokens and theming in `web/src/styles/tokens.css`; `cn()`; `Button` with `cva`; Inter and IBM Plex Mono self-hosted; `@/` alias. Legacy CSS variables (`--surface-*`, `--text-*`, `--accent`, `--border`, `--success`, `--warning`, `--danger`) still exist at the bottom of `WebClient.vue` and coexist with the new `--ws-*` tokens.

## 2. Phase 1 goal and definition of done

**Goal:** replace the static per-view CSS with the configured Tailwind tokens and a shared component library, and swap views over to those components wherever a matching component exists. Layout stays as it is.

Done means all of these hold:

1. `npm run build` and `npm run check:styles` pass.
2. No `.vue` file contains a literal color (hex, `rgb`, `rgba`, `hsl`) outside an allowlist in `web/scripts/style-budget.json`, and every allowlist entry has a reason.
3. No selector of the form `:global(html[data-theme=...] ...)` remains. Themes work only by token swap.
4. No legacy variable (`--surface-*`, `--text-primary`, `--text-muted`, `--border`, `--accent`, `--success`, `--warning`, `--danger`) remains.
5. The views contain no raw `<input>` or `<select>`, and no raw `<button>` except allowlisted ones with a reason (for example a card that is a button).
6. All five dialogs use the shared `Dialog` component.
7. Tailwind preflight is enabled and `body` uses `font-sans` and the token colors.
8. `G-SMOKE` passes on the final commit and the user has signed off the snapshots.
9. Section 7 (phase 2 readiness) is satisfied.

## 3. Steps

Notation: **Visual** says what `G-SNAP` must show. **Size** is a rough expected diff.

### Track 0. Safety net

- [ ] **0.1 Snapshot harness.**
  Add `web/scripts/snapshot.mjs`, devDependency `playwright-core`, scripts `snapshot` and `snapshot:diff`, and `.snapshots/` to `.gitignore`. Drive the system Chromium (`CHROMIUM_PATH`, default `/usr/bin/chromium-browser`) against `vite preview`. Mock `/api/**` with canned JSON through `page.route` so no backend is needed. Capture: join page in en, zh and de, in light and dark, at 1440x900 and 390x844; plus `/demo` and `/admin` login in the same themes and sizes. Force `prefers-reduced-motion: reduce` and wait for `document.fonts.ready` so runs are deterministic.
  Diff: add devDependencies `pixelmatch` and `pngjs`; `snapshot:diff` prints percent changed per shot and exits non-zero above a threshold flag.
  Visual: n/a. Size: about 200 lines. Commit: `chore(web): add visual snapshot harness`.
- [ ] **0.2 Baseline capture.**
  Run the harness on the commit before any styling change and store it as `.snapshots/baseline` (not committed). Record the commit hash in this file under section 8.
  Commit: none.
- [ ] **0.3 Dev-only component gallery.**
  Add route `/__ui` registered only when `import.meta.env.DEV` is true, rendering `web/src/views/UiGallery.vue`. It lists every `components/ui` component with all variants, mirroring `components-mock.html`. It has theme and language controls. Start with `Button`. Every later component step adds its own section.
  Visual: n/a. Commit: `feat(web): add dev-only component gallery`.
- [ ] **0.4 Literal-color budget.**
  Add `web/scripts/check-styles.mjs` and `web/scripts/style-budget.json`. The script counts hex, `rgb(a)`, `hsl` literals and `:global(html[data-theme` selectors per `.vue` file. It fails when a file's count exceeds its budget. Seed budgets with the current counts. Every later migration commit lowers the budget in the same commit (a ratchet). Add `npm run check:styles`.
  Commit: `chore(web): add literal-color budget check`.
- [ ] **0.5 Connected-view fixture (timebox: one session).**
  Use Playwright `page.routeWebSocket` to script the `/ws/voice` protocol (read `useVoiceWebSocket.ts` for the message shapes) so the connected view renders without a TeamSpeak server: channel list, members, a speaking member, chat messages, a poke, a reconnect banner. Add these captures to the harness. If the protocol is too entangled to script cleanly, stop, record it under section 8, and rely on manual `G-SMOKE`.
  Commit: `chore(web): capture connected view with a scripted websocket`.

### Track 1. Foundations (small, visible only as palette and font)

- [ ] **1.1 Add derived tokens.**
  In `tokens.css` add soft tints and a scrim, all defined with `color-mix()` so they need no per-theme duplicates: `accent-soft`, `success-soft`, `warning-soft`, `danger-soft` (13% of the color into `surface-1`), and `scrim` (about 55% near-black into `surface-0`). Register them under `@theme inline` as `--color-*`.
  Visual: zero. Commit: `feat(web): add soft and scrim color tokens`.
- [ ] **1.2 Apply the font.**
  Replace the three `font-family` declarations (`WebClient.vue`, `DemoView.vue`, `AdminView.vue` global body rules) with `var(--font-sans)`. Inter is currently named but never loaded, so this is the first real change of typeface.
  Visual: expected (glyph shapes, wrapping). Check de and ru for overflow. Commit: `style(web): use the Inter font stack`.
- [ ] **1.3 Legacy variable bridge.**
  In `WebClient.vue` rewrite the three legacy root blocks so each legacy variable is an alias of a `--ws-*` token (`--surface-0: var(--ws-surface-0)`, `--accent: var(--ws-accent)`, and so on). Delete the dark and system-dark copies of those blocks, since token swapping now handles it. This moves everything that already uses the variables to the blue palette in one commit.
  Visual: expected (partly blue, partly still teal where hex is hardcoded; this two-tone state is intentional until Track 3 ends). Commit: `style(web): alias legacy theme variables to design tokens`.

**Tag `design-v2/track-1`.**

### Track 2. Slim down WebClient (no visual change)

Purpose: `WebClient.vue` is too large for an agent to hold in context. Cut what is not styling out of it first. All steps here have **Visual: zero**.

- [ ] **2.1 Extract translations verbatim.**
  Move the `translations` object and the `Language` type to `web/src/i18n/webclient.ts` and import it. Do not reformat or reorder. Verify with a small script that `JSON.stringify` of the object is identical before and after.
  Commit: `refactor(web): move WebClient translations to i18n module`.
- [ ] **2.2 Split by language and add a key-parity check.**
  `web/src/i18n/webclient/{zh,en,de,ru,ja}.ts` and an index that assembles them. Add `npm run check:i18n`, which fails when any language lacks a key that another has. Report existing gaps in the commit body. Do not silently fix translations.
  Commit: `refactor(web): split translations per language`.
- [ ] **2.3 Shared language and t() composable.**
  Add `web/src/i18n/use-i18n.ts` with `language`, `setLanguage` (persisted, using the existing storage key) and `t(key, vars)`, taking the current logic from `WebClient.vue`. Switch `WebClient.vue` to it. Leave `AdminView.vue` and `DemoView.vue` on their own copies unless they use the same storage key (check and note).
  Commit: `refactor(web): extract useI18n composable`.
- [ ] **2.4 Extract pure helpers.**
  Move pure, template-independent helpers out of the script (formatters, clamp and scale math, tree building) into `web/src/lib/`. Only functions with no reactive state. Stop at roughly 500 lines moved; more belongs to phase 2.
  Commit: `refactor(web): move pure helpers out of WebClient`.

**Tag `design-v2/track-2`.**

### Track 3. Legacy color migration (in place, mechanical)

Purpose: get every literal color out of the legacy CSS so the palette and both themes work everywhere by token. No markup changes.

- [ ] **3.0 Color codemod and mapping table.**
  Add `web/scripts/migrate-colors.mjs` and `docs/design/color-map.md`. The script rewrites a line range of a `.vue` style block: each hex or `rgba()` literal becomes a token utility value (`var(--ws-*)` or a `color-mix()` of tokens) chosen by the **CSS property** and the mapping table, and prints a "needs review" list for anything ambiguous. Seed mapping by role, not by hue:

  | Old literal (frequency) | Role | Token |
  |---|---|---|
  | `#fff` in `background` (79) | card and panel surface | `--ws-surface-1` |
  | `#fff` in `color` on a filled accent or dark button | text on accent | `--ws-accent-fg` |
  | `#006a64`, `#087d74` | accent, accent hover | `--ws-accent` (hover: `color-mix` of accent and `fg`) |
  | `#f6f9f8`, `#f7f9f8`, `#f4f8f6` | page background | `--ws-surface-0` |
  | `#edf1ef`, `#e6ecea`, `#e0eae6` | subtle surface or divider | `--ws-surface-2` or `--ws-line` by property |
  | `#899792`, `#71817c`, `#7e8c88` | muted text | `--ws-fg-muted` |
  | `#30413d`, `#202f2c`, `#192120` | text or dark surface | by property; if only used inside a dark override, delete the rule instead |
  | `#65d879`, `#90f691`, `#55d17a` | success or speaking | `--ws-success` |
  | `#c95a54`, `#e56b91` | danger | `--ws-danger` |
  | `#c89143`, `#e2b36c` | warning | `--ws-warning` |
  | `rgba(0,0,0,x)` overlays | scrim or shadow | `--ws-scrim` or `shadow-sm`/`shadow-lg` values |

  Extend the table as you find new literals. Commit the script and the table before using them.
  Commit: `chore(web): add legacy color codemod and mapping table`.
- [ ] **3.1 to 3.9 WebClient style, in file order, about 120 lines of CSS per commit.**
  For each chunk: run the codemod on the chunk, resolve the review list by hand, delete `:global(html[data-theme=...] ...)` override rules that only re-state dark values now provided by the tokens, remove `!important` where the cascade allows, then lower the budget in `style-budget.json`. Record the chunk's first and last selector in the commit body so bisect can locate it. Because later rules override earlier ones, migrate a chunk, then check the **final computed look** of every selector it touches in snapshots, not the chunk in isolation.
  Suggested feature groupings, if you prefer to cut by feature instead of by line range (both are acceptable, pick one and stay with it): join header and brand; join hero and promises; join card and form; workspace header and banners; room hero, voice grid and chat; member panel; dock and audio popovers; member context menu; settings, password and screen-share modals; mobile blocks.
  Visual: expected, and should converge on the blue palette. Commit: `style(web): migrate <area> colors to tokens`.
- [ ] **3.10 WebClient stragglers.**
  Get the `WebClient.vue` budget to zero. Allowlist only real exceptions (for example a black scrim over a video tile), each with a reason.
  Commit: `style(web): finish WebClient token migration`.
- [ ] **3.11 Expand AdminView CSS (format only).**
  Reformat the single-line minified stylesheet to one rule per line. No value changes. Verify that the built CSS is equivalent (compare after normalizing whitespace).
  Visual: zero. Commit: `style(web): expand minified AdminView styles`.
- [ ] **3.12 to 3.14 AdminView, DemoView, small components.**
  Same procedure for `AdminView.vue` (2 to 3 commits by area: auth and setup, shell and sidebar, pages), then `DemoView.vue`, `LanguageSwitcher.vue`, `Icon.vue` and `App.vue`. AdminView uses a dark green sidebar and hero; map them to `--ws-accent` derived colors, and show the result to the user before continuing (decision D6).

**Tag `design-v2/track-3`.** Run `G-SMOKE`.

### Track 4. Component library (new files only, safe to parallelize)

Each step adds `web/src/components/ui/<Name>.vue` plus a `<name>.ts` `cva` file when it has variants, a gallery section (step 0.3), and a tick in this file. Match `components-mock.html` for look and `docs/design/README.md` for conventions. Props are explicit (no `VariantProps` spread in `defineProps`, see `Button.vue`). Emit `update:modelValue` for controls. Everything is keyboard operable, has a visible focus style, and takes a `class` prop merged with `cn()`.
**Visual: n/a** for all of Track 4 (nothing uses the components yet).

- [ ] **4.1 Button additions.** Icon-only size, `loading` state, `as="a"` for links, pressed state (`aria-pressed`, used for mute and deafen toggles). `feat(web): extend Button for icon, loading and link use`.
- [ ] **4.2 Field, Label, Hint, Input.** Error state with icon and message, `aria-invalid`, `aria-describedby`. `feat(web): add Field and Input`.
- [ ] **4.3 Select.** Native `<select>` styled, with the chevron. `feat(web): add Select`.
- [ ] **4.4 Switch.** `role="switch"`, `aria-checked`. `feat(web): add Switch`.
- [ ] **4.5 Checkbox and Radio.** `feat(web): add Checkbox and Radio`.
- [ ] **4.6 Slider.** Range input with token colors; volume and threshold use. `feat(web): add Slider`.
- [ ] **4.7 Chip and Count.** Variants neutral, accent, success, warning, danger; danger and warning always show an icon slot. `feat(web): add Chip and Count`.
- [ ] **4.8 Tabs and Segmented.** `role="tablist"`, arrow-key navigation. `feat(web): add Tabs and Segmented`.
- [ ] **4.9 Card.** Surface with border and no shadow, optional header. `feat(web): add Card`.
- [ ] **4.10 Avatar.** Initial fallback, `speaking` ring (2 px `success` with a 2 px gap in the surface color), size scale. `feat(web): add Avatar`.
- [ ] **4.11 Meter.** Input-level bar. Must be driven by a plain `ref` or CSS variable, never per-frame Vue state that re-renders siblings. `feat(web): add Meter`.
- [ ] **4.12 Dialog.** Decision D1 first (native `<dialog>` versus `reka-ui`). Focus trap, Esc, backdrop click, `aria-labelledby`, scroll lock, restores focus on close. Sizes sm, md, lg. `feat(web): add Dialog`.
- [ ] **4.13 Menu and Popover.** Anchored, keyboard navigable, submenu support (needed for "move to channel"), mobile bottom-sheet variant at 740 px and below. `feat(web): add Menu and Popover`.
- [ ] **4.14 Tooltip.** `feat(web): add Tooltip`.
- [ ] **4.15 Toast and Banner.** A `useToast()` service and a persistent `Banner` (info, warning, danger) for reconnect, degraded audio and pokes. `feat(web): add Toast and Banner`.
- [ ] **4.16 Small parts.** `Separator`, `Kbd`, `Spinner`, `Skeleton`. `feat(web): add Separator, Kbd, Spinner and Skeleton`.
- [ ] **4.17 Icon consolidation.** Move `Icon.vue` to `components/ui/Icon.vue` (update imports in the same commit), add the icons the mock uses that are missing, and standardize size tokens (18 px default, 15 px in dense rows). Keep the current inline-SVG approach. `refactor(web): move Icon into ui and add missing icons`.

**Tag `design-v2/track-4`.**

### Track 5. Swap usage sites to components (one area per commit)

Each step replaces markup in one area with Track 4 components, deletes the CSS rules that became dead, and lowers the budget. Do not change layout, wording, ids, `v-model` targets or event handlers. The step is only finished when the area behaves identically in `G-SMOKE`. **Visual: expected**, low. Steps depend on the Track 4 component named in brackets.

WebClient:
- [ ] **5.1 Join form** [Field, Input, Select, Button]. `refactor(web): use ui components in the join form`.
- [ ] **5.2 Join header actions** [Button, Icon]. GitHub, QQ, Bilibili, changelog, admin, theme, version. Keep all eight, phase 2 reduces them. `refactor(web): use Button for join header actions`.
- [ ] **5.3 QQ dialog** [Dialog]. `refactor(web): use Dialog for the QQ group modal`.
- [ ] **5.4 Screen-share settings dialog** [Dialog, Segmented, Select]. `refactor(web): use Dialog for screen share settings`.
- [ ] **5.5 Password dialogs** [Dialog, Field, Input, Button]. Merge the channel and server variants into one `PasswordDialog.vue` if props can cover the difference; otherwise keep two thin wrappers. `refactor(web): unify channel and server password dialogs`.
- [ ] **5.6 Settings dialog shell** [Dialog, Tabs]. Navigation and frame only. `refactor(web): use Dialog and Tabs for the settings shell`.
- [ ] **5.7 Settings panels** [Switch, Slider, Select, Segmented, Meter, Chip]. One commit per panel (audio input, output, processing, advanced, and so on; list them when you start). `refactor(web): use ui controls in settings <panel>`.
- [ ] **5.8 Workspace header** [Button, Chip]. `refactor(web): use ui components in the workspace header`.
- [ ] **5.9 Member search and status** [Input, Button]. `refactor(web): use Input and Button in the member panel header`.
- [ ] **5.10 Member rows** [Avatar, Chip, Icon]. Keep the row markup and click targets. `refactor(web): use Avatar and Chip in member rows`.
- [ ] **5.11 Member context menu** [Menu]. Including the "move to channel" submenu and the mobile sheet. `refactor(web): use Menu for the member context menu`.
- [ ] **5.12 Audio dock** [Button, Slider, Meter, Tooltip, Segmented]. Desktop dock and the mobile control dock as two commits. `refactor(web): use ui components in the audio dock`.
- [ ] **5.13 Banners and toast** [Banner, Toast]. Reconnect, audio notice, poke, toast. `refactor(web): use Banner and Toast`.
- [ ] **5.14 Chat composer and messages** [Input, Button, Avatar]. `refactor(web): use ui components in chat`.
- [ ] **5.15 Language switcher** [Menu]. Rebuild `LanguageSwitcher.vue` on Menu, same props and events. `refactor(web): rebuild LanguageSwitcher on Menu`.
- [ ] **5.16 Mobile navigation and More panel** [Button, Tabs]. `refactor(web): use ui components in mobile navigation`.

AdminView (can run in parallel with WebClient steps):
- [ ] **5.17 Auth and setup forms** [Field, Input, Select, Button, Checkbox, Radio, Card].
- [ ] **5.18 Shell, sidebar, top bar** [Button, Chip].
- [ ] **5.19 Overview and settings pages** [Card, Chip, Switch, Input, Button].
- [ ] **5.20 DemoView.** Decision D3 first (retire, or rebuild on the library as the phase 2 workspace fixture). If kept: swap its controls.

**Tag `design-v2/track-5`.** Run `G-SMOKE` and show the user the full snapshot set.

### Track 6. Turn on the Tailwind base and clean up

The riskiest change is enabling preflight. Make it a one-line commit by fixing everything it would break **first**, while it is still off.

- [ ] **6.1 Find preflight regressions.**
  On a scratch branch or working tree only, add `@import "tailwindcss/preflight.css" layer(base);` and diff snapshots. List every difference in this file under section 8. Do not commit the import yet.
- [ ] **6.2 Harden legacy CSS (several commits).**
  For each regression on the list, add the explicit rule the legacy CSS was relying on the browser for (button border and background, heading margins, list styles, `img`/`svg` display, `box-sizing`, `border-color`). One commit per area, each with **Visual: zero**, because preflight is still off. `style(web): make <area> independent of browser defaults`.
- [ ] **6.3 Enable preflight.**
  Add the import and a base layer: `body` gets `bg-surface-0 text-fg font-sans`. Snapshots must show **zero** change. `style(web): enable Tailwind preflight`.
- [ ] **6.4 Remove the legacy variable aliases.**
  Grep must show no use of `--surface-*`, `--text-*`, `--border`, `--accent`, `--success`, `--warning`, `--danger`. Delete the alias blocks. `refactor(web): remove legacy theme variables`.
- [ ] **6.5 Remove dead CSS.**
  Delete unused selectors from the scoped styles (compare selectors against template usage), one view per commit. Keep only structural layout rules. Lower budgets.
- [ ] **6.6 Meta and static assets.**
  Update `theme-color` in `web/index.html` to the new accent (light value; the theme switcher may update it at runtime if that is cheap), and check the `lang` attribute follows the selected language. `chore(web): update theme-color to the new palette`.
- [ ] **6.7 Enforce the budgets.**
  Make `check:styles` and `check:i18n` part of `npm run build` in `web/package.json`. `chore(web): run style and i18n checks in build`.

**Tag `design-v2/track-6`.**

### Track 7. Close phase 1

- [ ] **7.1 Docs.** Update `CLAUDE.md` (structure, styling rules), `docs/design/README.md` (library inventory), and tick section 2. Screenshots in `docs/screenshots/` are stale and are regenerated at the end of phase 2, not now. `docs: update design docs for phase 1`.
- [ ] **7.2 Phase 1 tag and report.** Tag `design-v2/phase-1`. Write a short report for the user: what changed, snapshot links, known deviations, and every allowlist entry.

## 4. Order at a glance

```
0 safety net -> 1 foundations -> 2 slim WebClient
                                      |
                 +--------------------+--------------------+
                 v                                         v
        3 color migration                          4 component library
                 |                                         |
                 +--------------------+--------------------+
                                      v
                        5 swap usage sites (needs 3 for the area, 4 for the component)
                                      v
                        6 preflight and cleanup -> 7 close
```

## 5. Manual smoke checklist (`G-SMOKE`)

Run against a real server, on desktop and at 390 px width, in light and dark, in en and one other language. Everything below must behave exactly as before the phase started.

1. Join form: fields validate, nickname and address are remembered, join works with and without a channel or server password (both dialogs).
2. Connected: channel tree renders, current channel is highlighted, switching channels works, member count and speaking indicator update.
3. Voice: push-to-talk and voice-activity modes both transmit; mute and deafen toggles work; input meter moves; output volume changes.
4. Settings dialog: every panel opens, every control persists across reload, Esc and backdrop click close it, focus returns to the button that opened it.
5. Member context menu: opens on click and long press, volume slider works, "move to channel" submenu works, mobile sheet works.
6. Chat: send, receive, scroll, long messages wrap.
7. Screen share: settings dialog, start, stop, viewing another member's stream.
8. Banners: reconnect, failed reconnect and retry, degraded audio notice, poke, toast.
9. Theme: system, light and dark; no flash of wrong theme on reload.
10. Language: all five switch live; de and ru have no clipped text.
11. Keyboard: Tab order sane, every control shows a focus ring, dialogs trap focus.
12. Admin: login, setup wizard, overview, settings save.

## 6. Decisions the user still owns

Stop and ask when a step reaches one of these. Do not decide silently.

| Id | Decision | Recommendation |
|---|---|---|
| D1 | Dialog, Menu, Popover, Tooltip primitives: native `<dialog>` and hand-built, or the headless library `reka-ui`. | `reka-ui` for Menu, Popover, Tooltip (positioning and keyboard handling are easy to get wrong); native `<dialog>` is acceptable for Dialog. |
| D2 | Add `playwright-core`, `pixelmatch`, `pngjs` as devDependencies for the snapshot harness. | Yes, dev only. |
| D3 | Fate of `DemoView.vue`. | Keep and rebuild on the library as the phase 2 workspace fixture. |
| D4 | Breakpoint scale: legacy uses 1200, 980, 740, 420, 390, 360. Tailwind defaults are 640, 768, 1024, 1280. | Define custom `--breakpoint-*` tokens matching 740, 980 and 1200 in phase 2, not before. |
| D5 | Replace the `#app { zoom: var(--ui-scale) }` mechanism with root font-size scaling (removes the JS compensation for fixed elements). | Decide in phase 2, with the new layout. |
| D6 | AdminView identity: it uses a dark green sidebar and hero. Keep a dark sidebar in the new palette, or align it with the light app. | Show both to the user after step 3.12. |
| D7 | Brand mark: `/网站图标.jpg` is used as favicon and logo. Keep or replace with a vector logo. | Ask before touching. |

## 7. Phase 2 readiness (reference only, do not implement)

Phase 2 is a separate plan. It has two parts, and phase 1 must leave the code able to support them.

**Declutter the main login page.** Today the join header carries eight controls (GitHub, QQ, Bilibili, version, changelog, admin, theme, language) plus a secure-gateway note, a hero with promises and a visitor counter, a form card, and a footer. Phase 2 will consolidate the secondary links (for example into one overflow `Menu` and an About `Dialog`), simplify the hero, and put the join form first. Phase 1 must therefore provide: Button variants for quiet header actions, `Menu`, `Dialog`, `Card`, `Field`, and a `Chip` for status, and must keep the join copy and links data-driven where cheap.

**Rework the main web app once connected.** Today it is a four-column grid (nav rail, channel sidebar, workspace, member panel) with a separate mobile layout (bottom nav, More panel), a desktop audio dock inside the member rail, and a 2,670-line script. Phase 2 will redesign this shell and its parts. Phase 1 must therefore provide:

- Components for the pieces phase 2 recomposes: `Avatar` with speaking ring, `Chip`, `Tabs`, `Segmented`, `Menu` (with submenu and mobile sheet), `Dialog`, `Tooltip`, `Banner`, `Toast`, `Slider`, `Meter`, `Switch`, `Kbd`, `Skeleton`, `Separator`.
- All strings in `i18n` modules and a shared `useI18n`, so new components do not add inline translation objects.
- No color or typography literals left in views, so a layout rewrite does not have to fight legacy paint.
- The gallery route and (ideally) the scripted-websocket fixture, so redesigned screens can be checked without a live TeamSpeak server.
- A recorded decision on breakpoints (D4) and on scaling (D5).
- Phase 2 candidates that are **not** done in phase 1: splitting the `WebClient.vue` script into composables (channel tree, audio settings, screen share, chat), a layout primitive set (`AppShell`, `Sidebar`, `Panel`, `Stack`), resizable or collapsible panels, keyboard shortcut layer, command palette, and refreshed `docs/screenshots/`.

## 8. Working notes (fill in as you go)

- Baseline commit hash for snapshots: _(step 0.2)_
- Connected-view fixture feasibility: _(step 0.5)_
- Preflight regression list: _(step 6.1)_
- Open-decision answers: _(D1 to D7)_
