# Contributing

The repository is one gateway (`src/`, Node and TypeScript) and one web app (`web/`, Vue 3, Pinia, Tailwind CSS v4). This file covers how to test it, how to keep it formatted and how to add translations. User documentation lives in `docs/README.*.md`.

## Quick start

```bash
cp .env.example .env              # every deployment setting is read from .env, strictly and without defaults
npm ci && npm --prefix web ci
npm run build                     # alias for build:all = build:web + build:gateway, runs every gate
npm run dev                       # gateway with tsx; npm run web:dev serves the web app on Vite
```

`npm run admin:reset-password` resets a lost admin password (in Docker: `docker compose exec webspeak node dist/index.js reset-admin-password`).

## Architecture

Where code lives, which way imports point, how files are named and which gates enforce it: [docs/architecture.md](docs/architecture.md).

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

`.github/workflows/ci.yml` runs formatting, lint, `npm run build` and `npm test` in the `verify` job, then `test:e2e` and `test:a11y` and a Docker health smoke test; `release.yml` runs `npm test` before it packages. `test:visual` and `test:real` never run in CI.

### Commits, pull requests and releases

Pull requests are squash-merged and the pull request title becomes the commit message, so it has to be a [Conventional Commit](https://www.conventionalcommits.org): `type(scope): subject`, subject in lowercase. `.github/workflows/pr-title.yml` checks it. The types are:

- `feat` goes under Features and bumps the minor version.
- `fix` goes under Bug Fixes and bumps the patch version.
- `perf` and `revert` have their own sections.
- `refactor`, `docs`, `copy`, `style`, `test`, `build`, `ci` and `chore` are listed under Other.
- A `!` before the colon (`feat(config)!: ...`) or a `BREAKING CHANGE:` line in the description marks a breaking change. Below 1.0 it bumps the minor version.

There is no changelog file to write. `.github/workflows/release-please.yml` keeps a "release" pull request open on `master` with the next version number in `package.json` and `package-lock.json`. Merging it creates the `v*` tag and the GitHub release with the notes made from the commit titles; the tag starts `release.yml`, which attaches the Windows and Linux packages. The settings are in `release-please-config.json`.

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
