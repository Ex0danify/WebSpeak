# Contributing

## Translations (i18n)

WebSpeak ships English (`en`, default and fallback) and German (`de`). A language is a set of files, one `<code>.ts` per i18n folder, so adding one needs no list, switcher or config edit.

### How text works

```
gateway --{ code, params?, message (English, logs only) }--> browser --t("err_<CODE>", params)--> text in the user's language
```

- **The gateway never translates.** It sends a stable `code` plus optional `params`. Its `message` is English and only for logs. The browser renders the matching `err_<CODE>` key.
- **Stores and composables hold a `LocalizedText`** (`text(key, params)`, from `web/src/shared/i18n/localizedText.ts`), never a rendered sentence, so a language switch updates text already on screen. Components call `t('key', { name })`. Both accept only a known key (`MessageKey`, derived from the `en` files), so a typo is a compile error.
- **One key per sentence, one module per key, every language complete.** Keys are flat (`t('close')`), placeholders are `{{name}}`, and the set of placeholders must be the same in every language.
- **Dates, numbers, units, durations and lists** go through `useFormat()` (`Intl`), never string building such as `"3 " + "minutes"`.
- **TeamSpeak-originated text** (channel and nickname, chat text, kick reasons) is user data and is shown raw. It never enters a catalog.
- **Admin-authored content** (the welcome text) is stored per language in the database, not in the i18n files. Defaults live in `src/modules/admin/siteCopy.ts`; a language without one falls back to `en`.
- **No CJK characters** anywhere in code, comments, logs, tests or docs. Everything internal is English.

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
   - No CJK characters. The parity test rejects them; a CJK language needs that rule changed in its own commit.

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
| `npm test` | `keyParity.test.ts` (same keys and placeholders per language, no CJK, no untranslated value unless allowlisted), `languages.test.ts` |
| `npm run test:e2e` | `language.matrix.spec.ts` loads the main pages in every discovered language (build the web app first) |

The first four run inside the `build` scripts.

`npm run format` rewrites the code with Prettier (140 columns, Tailwind class order); `npm run format:check` is the CI check. `npm run lint` (ESLint with typescript-eslint and eslint-plugin-vue, including the unawaited-promise rules) must be clean too, `npm run lint:fix` applies the safe fixes. After pulling, `git config blame.ignoreRevsFile .git-blame-ignore-revs` keeps the mass reformat out of `git blame`.
