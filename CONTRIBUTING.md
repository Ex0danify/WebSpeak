# Contributing

The repository is one gateway (`src/`, Node and TypeScript) and one web app (`web/`, Vue 3, Pinia, Tailwind CSS v4). This file covers how the code is laid out, how to test it, how to keep it formatted and how to add translations. User documentation lives in `docs/README.*.md`.

## Quick start

```bash
cp .env.example .env              # every deployment setting is read from .env, strictly and without defaults
npm ci && npm --prefix web ci
npm run prepare:sdk               # fetch the TeamSpeak SDK
npm run build                     # alias for build:all = build:web + build:gateway, runs every gate
npm run dev                       # gateway with tsx; npm run web:dev serves the web app on Vite
```

`npm run admin:reset-password` resets a lost admin password (in Docker: `docker compose exec webspeak node dist/index.js reset-admin-password`).

## Architecture

Where code lives, which way imports point, how files are named, and which gates enforce it.

### Principles

1. **Group by feature, not by file kind.** Everything one feature owns lives in one folder. Kind folders (`components/`, `composables/`) exist only inside a feature or in `shared/`. A feature is deleted by removing its folder.
2. **One-way dependencies.** Imports point down the layer list, never up and never sideways. `dependency-cruiser` enforces this; review does not have to.
3. **The public surface is `index.ts`.** Other folders import a feature or module through its barrel only.
4. **Names say the role, folders carry the context.** No `utils`, `helpers`, `common` or `misc` basenames (the one exception is `shared/i18n/common/`). Role files imported from many places keep the feature as a prefix (`chatStore.ts`, `chatTypes.ts`).
5. **camelCase files and folders.** PascalCase only for Vue components and, by convention, for types. Only `scripts/*.mjs` use kebab-case.
6. **Tests sit next to the code**, named `name.aspect.test.ts`.
7. **Hot paths keep closure state.** Audio nodes, decoders, timers, PCM buffers, peers and sockets are never in Pinia or a `ref`. Modules do not import each other; they are wired through late-bound callbacks. No per-frame persistent logging.
8. **Files stay under 400 lines.** Larger files are listed in a budget file with their current size and may only shrink.

### Web app (`web/src/`)

```
web/src/
  main.ts, App.vue            # bootstrap: router, Pinia, registers every i18n module
  views/                      # one route = one file; composes features, owns no logic
    ClientLayout.vue          # parent route of join and room: calls useRoomSession() once and provides it
    JoinView, RoomView, AdminView, DemoView, UiGallery (dev only, sections in gallery/)
    clientRoutes.ts
  features/
    room/                     # connected workspace and its assembler (useRoomSession.ts, useRoomContext.ts)
      chat/ members/ audioSettings/ whisper/ network/ shell/ voiceGrid/
    voice/                    # engine/ (microphone, playback, output, WebRTC transport), audio preferences, stores/
    screenShare/              # capture, peers, stats, viewer UI, stores/
    session/                  # BASE: socket, message router, session actions, ICE servers, sessionStore
    join/  admin/  demo/      # screens
  shared/
    ui/<name>/                # design-system components: .vue files, a cva file, index.ts
    components/ composables/ lib/ services/
    i18n/                     # useI18n() registry, useFormat(), localizedText, the common module
    styles/                   # main.css (Tailwind v4 entry), tokens.css
  testSupport/                # fakes and harnesses shared by tests
```

#### Layers

```
views  ->  features/room  ->  features/{voice, screenShare, join, admin, demo}  ->  features/session  ->  shared
```

- `shared/` imports nothing from features or views.
- A feature imports lower features' barrels and `shared/`. Features on the same layer never import each other (`voice` and `screenShare`, `admin` and `join`). `join` and `room` never import each other either: what they share comes down through `features/session` or `shared/`, or is wired in `views/`.
- Inside `features/room/` the sub-features are one layer, have no barrels and never import each other. Only `shell/` and the room root compose them.
- `features/room/useRoomSession.ts` is the only place that imports several features together. It resets the stores, wires the late-bound callbacks of session, voice and screen share, and returns six groups (`session`, `roster`, `chat`, `audio`, `screenShare`, `actions`). Composables take only the group they need. `useRoomContext.ts` provides and injects it.
- Cross-feature imports go through the barrel (`@/features/session`); inside one feature use relative paths.
- Stores hold only reactive state the UI reads: `sessionStore` in `session/`, `voiceAudioStore` in `voice/stores/`, `screenShareStore` in `screenShare/stores/`, `joinFormStore` in `join/stores/`, `adminStores` in `admin/`. Admin stores never import each other.

#### Naming

| Thing | Convention | Example |
|---|---|---|
| Vue component | `PascalCase.vue` | `MemberRow.vue` |
| Folder | camelCase | `screenShare/`, `audioSettings/` |
| Composable | `useThing.ts` exporting `useThing` | `useChat.ts` |
| Store | `thingStore.ts` exporting `useThingStore` | `voiceAudioStore.ts` |
| Types, API | `thingTypes.ts`, `thingApi.ts` | |
| Other module | `camelCase.ts` named for the topic | `messageRouter.ts` |
| Test | `name.test.ts` or `name.aspect.test.ts` | `useRoomSession.reset.test.ts` |

#### Where a new file goes

1. A design-system atom with no app knowledge: `shared/ui/`.
2. It knows one feature's data or copy: that feature. New strings go in that feature's `i18n/` module (see Translations below).
3. Used by two or more features and knows neither: `shared/`, or `features/session/` when it is gateway or roster state.
4. A pure function with no Vue and no I/O: `shared/lib/<topic>` or the feature's own file.
5. It touches `window`, `localStorage` or `fetch`: `shared/services/` or `<feature>Api.ts`.
6. Nothing fits: add a feature. Never add a `misc` file.

A feature folder past about ten files gets sub-folders by sub-feature, or by role inside `voice/`, never by kind at the top of a feature.

#### Styling and components

- Tailwind CSS v4 through `@tailwindcss/vite`. Tokens live in `web/src/shared/styles/tokens.css`; the default Tailwind palette is removed. Only semantic names exist: `surface-0/1/2`, `fg`, `fg-muted`, `line`, `line-strong`, `accent`, `accent-fg`, `success`, `warning`, `danger` with `-soft` tints, `scrim`, plus the fixed `media-*` and `brand-*` colors. Themes swap the values, so there are no `dark:` variants.
- A literal color exists only in `tokens.css`, and nothing outside it reads `var(--ws-*)` (the private theme layer).
- No `<style>` block in any `.vue` file. A rule no utility can express goes to `shared/styles/main.css` or a `cva` file, with a comment saying why.
- Font sizes, radii, shadows, z-indexes and breakpoints come from the `@theme` tokens (`text-caption`, `rounded-lg`, `shadow-lg`, `max-compact:`). Arbitrary values are only for layout dimensions and are counted by a ratchet that only shrinks.
- New UI goes into `web/src/shared/ui/<name>/`: a Vue component, a `cva` variants file merged with `cn()`, and an `index.ts` barrel. Behavior and accessibility come from reka-ui. Parts that share a context live in one family folder (`menu/`, `tabs/`, `field/`). Files used by several `ui/` folders go in `ui/shared/`. Import from the barrel, never from a file inside another folder. Show new components in the dev gallery (`views/gallery/`).
- No raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>` or hand-made `role="tab|dialog|switch|status"` outside `shared/ui/`. A `class=` on a library component may position it, never restyle it: add a variant to the component instead. The allowlist, with a reason per entry, is `web/scripts/raw-controls-budget.json`.
- Every touch target is 44 px on a phone or touch screen.

### Gateway (`src/`)

```
src/
  index.ts  relay.ts          # composition roots (dist/index.js and dist/relay.js are the deploy paths)
  shared/                     # logger, errors, constants, messageCodes, teamSpeakTarget, teamSpeakProtocol, typeGuards, tokenBucket, http/
  config/                     # env (all settings from .env), webrtcConfig
  infra/
    persistence/              # database, migrations, one repository per table group
    security/                 # master secret, secret crypto, admin password, open-target policy
  modules/                    # each imported only through its index.ts
    relay/  teamspeak/  join/
    screenShare/              # protocol, hub, publish, native streams, types
    voice/                    # voiceBridge, voiceAdmission, voiceTypes, voiceOpus
      session/ directory/ messages/ audio/ webrtc/
    admin/                    # router, routes/, service, invites, settings, sessions, login rate limit, site copy
  transport/http/             # Express and HTTPS, security headers, mounts the voice bridge and the admin router
```

#### Layers

```
index/relay  ->  transport  ->  modules  ->  infra  ->  config  ->  shared
```

- Inside `modules/` the order is `relay < teamspeak < join < screenShare < voice < admin`: a module imports only modules to its left, through their `index.ts`.
- `screenShare` never imports `voice`. `voice/audio/` and `voice/webrtc/` never import each other. `voice/session/` never imports `voice/messages/`.
- `infra/`, `config/` and `shared/` import no module; type imports count too.
- `index.ts` and `relay.ts` are the only places that construct concrete objects.
- `voiceBridge.ts` holds the `WebSocketServer`, the heartbeat, shutdown and hooks. `voiceAdmission.ts` admits a connection: it builds the per-connection `VoiceConnection` context and registers the listeners in a fixed order before `connect()`, because `clientEnter` and `clientLeave` fire during the handshake. Gateway state is plain TypeScript; there is no Pinia on the gateway.
- `@discordjs/opus` is CommonJS and is loaded with `createRequire`.

Gateway files are camelCase and prefixed by the module when they would otherwise be generic (`voiceCommands.ts`, not `commands.ts`). Tests are `name.aspect.test.ts` beside the file; cross-cutting tests live in `test/`, their helpers in `test/support/`.

### Gates

They run inside the two build chains, so a red gate fails the same command CI runs.

| Chain | Gates |
|---|---|
| `npm run build:gateway` | `tsc`, `check:gateway-types` (tests type-check too), `check:gateway-size` (under 400 lines, ratchet `scripts/gateway-size-budget.json`, covers `src/` and `test/`), `check:gateway-names`, `check:gateway-deps` (layers and module order), `check:gateway-literals`, `check:comment-refs` |
| `npm run build:web` | `vue-tsc`, `check:styles`, `check:scoped-style`, `check:tokens`, `check:raw-controls`, `check:i18n`, `check:i18n-literals`, `check:i18n-keys`, `check:deps` (layers), `check:names`, `check:file-size` (ratchet `web/scripts/file-size-budget.json`), `check:comment-refs`, then `vite build` and a build stamp |

`npm --prefix web run check:ui-usage` prints how often each library component is used outside the gallery; it is a report, not a gate.

Comments, test names and docs say why, not when. They carry no plan, step or finding ids (`check:comment-refs`).

## Testing

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | Vitest: gateway project (node) and web project (happy-dom) | nothing |
| `npm run test:watch`, `test:coverage` | the same, watching or with a v8 report in `test-results/coverage/` | nothing |
| `npm run test:e2e` | Playwright against the real gateway with a fake TeamSpeak server, desktop (1440x900) and mobile (390x844, touch) | Chromium, a fresh web build |
| `WEBSPEAK_TEST_TS_LICENSE=accept npm run test:real` | Playwright, serial, real gateway and a disposable TeamSpeak 6 server in Docker | Docker, internet, Chromium, a fresh web build |
| `npm run test:visual` | screenshots compared with a local baseline | Chromium, a fresh web build, a baseline |
| `npm run test:a11y` | axe scans, keyboard, touch targets, overflow, theme flash | Chromium, a fresh web build |
| `npm run test:full` | build the web app once, then unit, e2e, visual and a11y (not `test:real`) | Chromium |
| `npx tsx scripts/bench-voice-frames.ts`, `bench-webrtc-frames.ts` | manual benchmarks of the audio paths; not in CI, judge on a median of 5 | nothing |

Before any layer that serves the frontend, run `npm run build:web`. It writes `web/dist/.build-stamp`, and the browser layers refuse to run against a bundle that no longer matches the sources.

### Where tests live

| Kind | Location |
|---|---|
| Gateway unit and API tests | `name.aspect.test.ts` beside the code in `src/`, cross-cutting ones (wire text, environment, identities) in `test/` |
| Gateway test support (fake TeamSpeak server and client, gateway harness) | `test/support/` |
| Web unit and component tests | `*.test.ts` beside the code in `web/src/`, shared fakes in `web/src/testSupport/` |
| Browser tests | `e2e/*.spec.ts`, `e2e/a11y/`, `e2e/visual/`, `e2e/real/`; fixtures in `e2e/fixtures/`, helpers in `e2e/helpers/` |

Tests are never emitted into `dist/`: `tsconfig.build.json` excludes them, and the root `tsconfig.json` is the editor config that includes them.

### Writing tests

- **Name the rule.** A test title states the behavior it protects (`refuses a build after a source file changed`), not the function it calls.
- **See it fail first.** Break the code or the expected value once and watch the test fail for the right reason.
- **No sleeps.** Wait for a condition (`expect.poll`, Playwright auto-waiting). No retries in Vitest: a flaky unit test is a bug.
- **Deterministic.** Fixed clock (`vi.useFakeTimers()`), no dependence on your `.env`, `data/` or browser profile; temporary directories and generated identities only.
- **Locators** are roles, labels and visible text (`getByRole`, `getByLabel`). Add a `data-testid` only when nothing accessible exists.
- **A known bug** is committed twice: first the failing test marked `it.fails(...)` (Vitest) or `test.fail()` (Playwright, because `test.fixme` skips and could never turn red), then the fix, which turns it into a normal test.
- **Never touch a TeamSpeak server that is not disposable.** Do not add per-frame logging or reactive state to the voice path for a test; read the audio counters the gateway already exposes in admin session summaries.

### Browser tests

Specs import `test` and `expect` from `e2e/fixtures`, not from `@playwright/test`. The fixture gives every worker its own real gateway and points `baseURL` at it, so a test drives the browser through `page` and scripts TeamSpeak through the fake server (`addMember`, `failNext`, `holdConnects`, ...) in the same process. Members and sessions of one test stay visible to the next test of the same worker until its page closes, so pick unique nicknames. Use `test.skip(({ isMobile }) => isMobile)` for what only makes sense on one project.

`test:e2e` uses the system Chromium locally or `CHROMIUM_PATH`. With `CI=true` it uses Playwright's own Chromium, retries a failed test once and writes `test-results/junit-<layer>.xml`. A failed test carries a `gateway-log` attachment, and `npx playwright show-trace <trace.zip>` shows each action, the DOM, network and console.

### Real TeamSpeak server

`npm run test:real` starts `teamspeaksystems/teamspeak6-server` from `e2e/real/compose.yml` (voice on UDP 19987, WebQuery on 127.0.0.1:19080, data in a tmpfs) and removes it afterwards.

- **License.** You accept the server's license, the repository does not. Read it (`docker run --rm --entrypoint cat teamspeaksystems/teamspeak6-server /opt/tsserver/LICENSE`) and export `WEBSPEAK_TEST_TS_LICENSE=accept` yourself. Without it the run stops before starting anything.
- **Internet.** The server contacts `accounting2.teamspeak.com` on start.
- **Slots.** A second run or worktree sets `WEBSPEAK_TEST_TS_SLOT=n` (0 to 100); ports, compose project and network move together. Never run two against one server.
- **Flood ban.** With the server's default limits the fifth join in a row is banned. Global setup raises the antiflood points, and `flood.spec.ts` fails if that stops working.
- **Leftovers** of a killed run are removed by the next run, or by hand with `docker compose -p webspeak-test-ts-0 down -v`.

### Visual and accessibility tests

Visual baselines are not committed; they live in `.snapshots/baseline/` and are only good on the machine and Chromium that made them. Capture the baseline from the commit you compare against, then run on your change:

```bash
npm run build:web
git switch <commit to compare against>   # build it, then:
npm run test:visual -- --update-snapshots
git switch <your change>                 # build it, then:
npm run test:visual                      # a shot fails above 0.01 % differing pixels
```

`npm run test:a11y` holds `axe.spec.ts` (every screen and state in both themes; `known-violations.ts` lists today's exceptions and fails on a stale row, so a fix deletes its row), `keyboard.spec.ts`, `targets.spec.ts` (touch targets at 390 px, `small-targets.ts` is a ratchet), `overflow.spec.ts` (every page and language at phone width) and `theme-flash.spec.ts`. The color tokens also have a browserless contrast test, `web/src/shared/styles/tokens.contrast.test.ts`.

### CI

`.github/workflows/ci.yml` runs formatting, lint, `npm run build` and `npm test` in the `verify` job, then `test:e2e` and `test:a11y` and a Docker health smoke test; `build-release.yml` runs `npm test` before it packages. `test:visual` and `test:real` never run in CI.

## Code style

`npm run format` rewrites the code with Prettier (140 columns, Tailwind class order); `npm run format:check` is the CI check. `npm run lint` (ESLint with typescript-eslint and eslint-plugin-vue, including the unawaited-promise rules) must be clean too; `npm run lint:fix` applies the safe fixes.

## Translations (i18n)

WebSpeak ships English (`en`, default and fallback) and German (`de`). A language is a set of files, one `<code>.ts` per i18n folder, so adding one needs no list, switcher or config edit.

### How text works

```
gateway --{ code, params?, message (English, logs only) }--> browser --t("err_<CODE>", params)--> text in the user's language
```

- **The gateway never translates.** It sends a stable `code` plus optional `params`. Its `message` is English and only for logs. The browser renders the matching `err_<CODE>` key.
- **Stores and composables hold a `LocalizedText`** (`text(key, params)`, from `web/src/shared/i18n/localizedText.ts`), never a rendered sentence, so a language switch updates text already on screen. Errors thrown inside composables are `LocalizedError`s (a `LocalizedText` plus a `code`); catch sites use `errorText(error, fallback)`. Components call `t('key', { name })`. Both accept only a known key (`MessageKey`, derived from the `en` files), so a typo is a compile error.
- **One key per sentence, one module per key, every language complete.** Keys are flat (`t('close')`), placeholders are `{{name}}`, and the set of placeholders must be the same in every language.
- **Dates, numbers, units, durations and lists** go through `useFormat()` (`Intl`; `date`, `time`, `dateTime`, `number`, `percent`, `unit`, `duration`, `list`, `relative`), never string building such as `"3 " + "minutes"`. There is no plural helper: counts are phrased neutrally (`Members: 3`).
- **TeamSpeak-originated text** (channel and nickname, chat text, kick reasons) is user data and is shown raw. It never enters a catalog.
- **Admin-authored content** (the welcome text) is stored per language in the database, not in the i18n files. It lives in the `welcome_texts` table. Defaults live in `src/modules/admin/siteCopy.ts`; a language without one falls back to `en`.
- **No CJK characters** anywhere in code, comments, logs, tests or docs. Everything internal is English. The only exception is the translation files of a CJK language (see below).

Strings live in `web/src/features/<feature>/i18n/{en,de}.ts` and `web/src/shared/i18n/common/`. The modules are `common`, `join`, `room`, `chat` (`room/chat`), `session`, `screenShare`, `voice`, `admin` and `demo`.

### Add a language

1. Scaffold it:

   ```bash
   npm run i18n:create fr          # or pt-BR, es, ...
   ```

   This writes `<code>.ts` in every i18n folder. Each file holds every key of the matching `en.ts`, same order and comments, with the English text as placeholder values. `web/src/shared/i18n/common/<code>.ts` also gets a `meta` export:

   ```ts
   export const meta = { endonym: "Français", tag: "fr", intl: "fr-FR", flag: "🇫🇷" };
   ```

   `endonym` is the language's name in itself, `tag` goes into `<html lang>`, `intl` is the `Intl` locale. The script guesses them from the code, so check the flag in particular. Override with `npm run i18n:create fr -- --endonym "Français" --intl fr-FR --flag 🇫🇷`, or preview with `-- --dry-run`. The script refuses to overwrite an existing language.

2. Translate the values in place in all the new files.
   - Copy every `{{placeholder}}` exactly. It may move within the sentence.
   - Follow the English string's punctuation per key.
   - Leave `TeamSpeak`, `WebSpeak`, `WebRTC`, `WebSocket`, `Opus`, `RNNoise` and acronyms such as `VOX` untranslated.
   - Pick one word per concept and use it everywhere (channel, member, whisper, poke, away, mute, identity, relay, screen share, kick, ban, ...). Look at how `de` does it.
   - No CJK characters, unless the language itself is CJK (`zh`, `ja`, `ko`, listed in `web/src/shared/i18n/cjkLanguages.ts`; add a new CJK language there). The parity test rejects them for every other language.

3. Words that really are identical to English (brand names, loanwords) go in the `SAME_AS_ENGLISH` set in `web/src/shared/i18n/keyParity.test.ts`, as `module.key`. Each entry needs a reason in review.

4. Optional: add a welcome-text default for the language in `src/modules/admin/siteCopy.ts`.

5. Run the gates:

   ```bash
   npm --prefix web run check:i18n
   npm test
   ```

   `keyParity.test.ts` fails for every value that still equals its English text. Expect that while a language is half translated; it should be green before the PR is merged.

6. Have a native speaker review the result.

Nothing else is edited: each module's `index.ts` globs its folder, and `web/src/shared/i18n/languages.ts` lists a language once every folder has its file and a `meta`. The switcher, `<html lang>`, the `Intl` locale, browser language detection, the admin welcome-language select and the parity checks all read that list.

### Add or change a string

1. Pick the module of the feature that uses the string. A key lives in exactly one module. Move it to `common` only if it is word-for-word identical in all languages and used by two or more views.
2. Add it to **every** language file of that folder, with the same `{{placeholders}}`.
3. Use it with `t('key', { name })` in a template or script, or `text('key', params)` when a store or composable must hold it.
4. Keys built at runtime go through a typed builder returning `MessageKey` and are listed in `web/scripts/i18n-dynamic-keys.json`.
5. A key family with no owner gets a new `features/<name>/i18n/` folder: `en.ts`, `de.ts` (copy the `satisfies Record<string, string>` and `MessageCatalog` block of an existing folder), an `index.ts` that globs the folder, and one entry in the module list in `web/src/main.ts` and `web/src/testSetup.ts`.

Wording changes to an existing `en` or `de` string are separate commits titled `copy(i18n): ...` with the reason.

Key families: `err_<CODE>` (a gateway code, the key is derived from it), `joinErr_<CODE>` and `opErr_<CODE>` (the same code with a different sentence in the join and command context), `adminErr_<CODE>` (admin API codes), `event_<kind>` (server events).

### Add a gateway message code

1. Add the code and its param names to `src/shared/messageCodes.ts`. Params are strings or numbers; cap error detail the way `safeClientErrorDetail` does.
2. Send it with the typed senders (`sendProtocolError`, `classifyOperationError`, `screenShareError`, `addServerEvent`). `message` is one English sentence per code; the variable part goes in `params`.
3. Add a row to the wire-text golden tests in `test/wireText.*.test.ts`.
4. Add `err_<CODE>` to the owning web module (`session`, `screenShare`, ...) in **all** languages. `check:i18n-keys` and `errorCodes.completeness.test.ts` fail until you do.

A new server event kind needs the same: `kind` and `params` on the wire, an `event_<kind>` key, and a case in `useChat.eventText`. Hot-path audio modules emit `{ code, params }` through callbacks and never call `t()`.

### Checks

| Command | Checks |
|---|---|
| `npm --prefix web run check:i18n` | every language file exists in every folder, every key in every language, no duplicate declarations |
| `npm --prefix web run check:i18n-keys` | every used key exists, every `err_*` has a gateway code and vice versa, dynamic keys are pinned, unused keys fail |
| `npm --prefix web run check:i18n-literals` | no CJK and no hard-coded user-visible text outside i18n files |
| `npm run check:gateway-literals` | no CJK in `src/`, `test/`, `e2e/`, `scripts/` |
| `npm test` | `keyParity.test.ts` (same keys and placeholders per language, no CJK outside the CJK languages, no untranslated value unless allowlisted), `languages.test.ts` |
| `npm run test:e2e` | `language.matrix.spec.ts` loads the main pages in every discovered language (build the web app first) |

The first four run inside the `build` scripts.

### German style

Register is informal "du" (`Wähle`, `Gib ein`, `dein`), never "Sie". Short sentences; the instruction follows the cause. Punctuation follows `en` per key (a full stop only where `en` has one). German quotes `„…“` around names, ellipsis `…`, dash ` – `. Nouns are capitalised, all-caps labels stay all caps, compounds are one word, and brand and technical names are hyphenated compounds (`TeamSpeak-Server`, `Relay-Knoten`). The nickname is **Name** everywhere unless TeamSpeak's own client says otherwise, **das Relay** is neuter, **Token** covers both the relay token and the voice-session ticket, and labels say **speichern** (`Identität speichern`).

| English | German |
|---|---|
| channel | Kanal (`Sprachkanal`, `Textkanal`, `Zielkanal`, `Kanaladministrator`) |
| member / visitor | Mitglied / Besucher |
| whisper | Flüstern, `Flüsterziel` |
| poke | Anstupsen, Anstupser (`hat dich angestupst`) |
| away | Abwesend, `Abwesenheitsnachricht` |
| mute / unmute | stummschalten / einschalten (mic), Ton wiederherstellen (output) |
| microphone / input device | Mikrofon / Eingabegerät |
| speakers / output device | Lautsprecher / Ausgabegerät |
| identity | Identität |
| invite link | Einladungslink |
| favorite / recent | Favorit / Zuletzt verwendet |
| screen share | Bildschirm teilen, `Freigabe beenden`, `ansehen` |
| accompaniment | Begleitung |
| relay / acceleration | Relay / Relay-Beschleunigung |
| connect / reconnect | Verbindung herstellen / neu verbinden |
| kick / ban | entfernt / gebannt |
| flood protection | Flood-Schutz |
| settings / profile / privacy | Einstellungen / Profil / Datenschutz |
| admin console | Administrationskonsole |
| live | LIVE |
