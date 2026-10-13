# Architecture

Where code lives, which way imports point, how files are named, and which gates enforce it. Scope: the gateway (`src/`, Node and TypeScript) and the web app (`web/src/`, Vue 3). Testing is in [CONTRIBUTING.md](../CONTRIBUTING.md), translations are in its Translations section.

## Overview

The browser talks to the gateway over one WebSocket (`modules/voice`) and a few HTTP routes (`transport/http`). The gateway joins TeamSpeak 3 and TeamSpeak 6 servers through the TeamSpeak client library (`modules/teamspeak`) and carries voice and screen share between them and the browsers (`modules/voice`, `modules/screenShare`, optionally over WebRTC). `modules/admin` serves the administration console; its settings, invites and sessions live in SQLite (`node:sqlite`, `infra/persistence`). With `WEBSPEAK_MODE=relay`, `index.ts` starts only the acceleration relay (`modules/relay`) instead of the gateway; `relay.ts` is a standalone entry point for the same relay.

## Principles

1. **Group by feature, not by file kind.** Everything one feature owns lives in one folder. Kind folders (`components/`, `composables/`) exist only inside a feature or in `shared/`. A feature is deleted by removing its folder.
2. **One-way dependencies.** Imports point down the layer list, never up and never sideways. `dependency-cruiser` enforces this; review does not have to.
3. **The public surface is `index.ts`.** Other folders import a feature or module through its barrel only.
4. **Names say the role, folders carry the context.** No `utils`, `helpers`, `common` or `misc` basenames (the one exception is `shared/i18n/common/`). Role files imported from many places keep the feature as a prefix (`chatStore.ts`, `chatTypes.ts`).
5. **camelCase files and folders.** PascalCase only for Vue components and, by convention, for types. Only `scripts/*.mjs` use kebab-case.
6. **Tests sit next to the code**, named `name.aspect.test.ts`.
7. **Hot paths keep closure state.** Audio nodes, decoders, timers, PCM buffers, peers and sockets are never in Pinia or a `ref`. Modules do not import each other; they are wired through late-bound callbacks. No per-frame persistent logging.
8. **Files stay under 400 lines.** Larger files are listed in a budget file with their current size and may only shrink.

## Web app (`web/src/`)

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

### Layers

```
views  ->  features/room  ->  features/{voice, screenShare, join, admin, demo}  ->  features/session  ->  shared
```

- `shared/` imports nothing from features or views.
- A feature imports lower features' barrels and `shared/`. Features on the same layer never import each other (`voice` and `screenShare`, `admin` and `join`). `join` and `room` never import each other either: what they share comes down through `features/session` or `shared/`, or is wired in `views/`.
- Inside `features/room/` the sub-features are one layer, have no barrels and never import each other. Only `shell/` and the room root compose them.
- `features/room/useRoomSession.ts` is the only place that imports several features together. It resets the stores, wires the late-bound callbacks of session, voice and screen share, and returns six groups (`session`, `roster`, `chat`, `audio`, `screenShare`, `actions`). Composables take only the group they need. `useRoomContext.ts` provides and injects it.
- Cross-feature imports go through the barrel (`@/features/session`); inside one feature use relative paths.
- Stores hold only reactive state the UI reads: `sessionStore` in `session/`, `voiceAudioStore` in `voice/stores/`, `screenShareStore` in `screenShare/stores/`, `joinFormStore` in `join/stores/`, `adminStores` in `admin/`. Admin stores never import each other.

### Naming

| Thing | Convention | Example |
|---|---|---|
| Vue component | `PascalCase.vue` | `MemberRow.vue` |
| Folder | camelCase | `screenShare/`, `audioSettings/` |
| Composable | `useThing.ts` exporting `useThing` | `useChat.ts` |
| Store | `thingStore.ts` exporting `useThingStore` | `voiceAudioStore.ts` |
| Types, API | `thingTypes.ts`, `thingApi.ts` | |
| Other module | `camelCase.ts` named for the topic | `messageRouter.ts` |
| Test | `name.test.ts` or `name.aspect.test.ts` | `useRoomSession.reset.test.ts` |

### Where a new file goes

1. A design-system atom with no app knowledge: `shared/ui/`.
2. It knows one feature's data or copy: that feature. New strings go in that feature's `i18n/` module (see the Translations section of [CONTRIBUTING.md](../CONTRIBUTING.md)).
3. Used by two or more features and knows neither: `shared/`, or `features/session/` when it is gateway or roster state.
4. A pure function with no Vue and no I/O: `shared/lib/<topic>` or the feature's own file.
5. It touches `window`, `localStorage` or `fetch`: `shared/services/` or `<feature>Api.ts`.
6. Nothing fits: add a feature. Never add a `misc` file.

A feature folder past about ten files gets sub-folders by sub-feature, or by role inside `voice/`, never by kind at the top of a feature.

### Styling and components

- Tailwind CSS v4 through `@tailwindcss/vite`. Tokens live in `web/src/shared/styles/tokens.css`; the default Tailwind palette is removed. Only semantic names exist: `surface-0/1/2`, `fg`, `fg-muted`, `line`, `line-strong`, `accent`, `accent-fg`, `success`, `warning`, `danger` with `-soft` tints, `scrim`, plus the fixed `media-*` and `brand-*` colors. Themes swap the values, so there are no `dark:` variants.
- A literal color exists only in `tokens.css`, and nothing outside it reads `var(--ws-*)` (the private theme layer).
- No `<style>` block in any `.vue` file. A rule no utility can express goes to `shared/styles/main.css` or a `cva` file, with a comment saying why.
- Font sizes, radii, shadows, z-indexes and breakpoints come from the `@theme` tokens (`text-caption`, `rounded-lg`, `shadow-lg`, `max-compact:`). Arbitrary values are only for layout dimensions and are counted by a ratchet that only shrinks.
- New UI goes into `web/src/shared/ui/<name>/`: a Vue component, a `cva` variants file merged with `cn()`, and an `index.ts` barrel. Behavior and accessibility come from reka-ui. Parts that share a context live in one family folder (`menu/`, `tabs/`, `field/`). Files used by several `ui/` folders go in `ui/shared/`. Import from the barrel, never from a file inside another folder. Show new components in the dev gallery (`views/gallery/`).
- No raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>` or hand-made `role="tab|dialog|switch|status"` outside `shared/ui/`. A `class=` on a library component may position it, never restyle it: add a variant to the component instead. The allowlist, with a reason per entry, is `web/scripts/raw-controls-budget.json`.
- Every touch target is 44 px on a phone or touch screen.

## Gateway (`src/`)

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
      bridge/                 # holds only the voiceBridge tests
    admin/                    # router, routes/, service, invites, settings, sessions, login rate limit, site copy
  transport/
    http/                     # Express and HTTPS, security headers, mounts the voice bridge and the admin router
    cli/                      # command-line entry points (admin password reset)
```

### Layers

```
index/relay  ->  transport  ->  modules  ->  infra  ->  config  ->  shared
```

- Inside `modules/` the order is `relay < teamspeak < join < screenShare < voice < admin`: a module imports only modules to its left, through their `index.ts`.
- `screenShare` never imports `voice`. `voice/audio/` and `voice/webrtc/` never import each other. `voice/session/` never imports `voice/messages/`.
- `voice/directory/` is a leaf: it imports no other voice subfolder. No voice subfolder imports `voiceBridge.ts`; the bridge assembles them, not the reverse.
- `infra/`, `config/` and `shared/` import no module; type imports count too.
- Only `index.ts` and `relay.ts` import `transport/`, and `transport/` never imports them.
- `index.ts` and `relay.ts` are the only places that construct concrete objects.
- `voiceBridge.ts` holds the `WebSocketServer`, the heartbeat, shutdown and hooks. `voiceAdmission.ts` admits a connection: it builds the per-connection `VoiceConnection` context and registers the listeners in a fixed order before `connect()`, because `clientEnter` and `clientLeave` fire during the handshake. Gateway state is plain TypeScript; there is no Pinia on the gateway.
- `@discordjs/opus` is CommonJS and is loaded with `createRequire`.

Gateway files are camelCase and prefixed by the module when they would otherwise be generic (`voiceCommands.ts`, not `commands.ts`). Tests are `name.aspect.test.ts` beside the file; cross-cutting tests live in `test/`, their helpers in `test/support/`.

## Gates

They run inside the two build chains, so a red gate fails the same command CI runs.

| Chain | Gates |
|---|---|
| `npm run build:gateway` | `tsc`, `check:gateway-types` (tests type-check too), `check:gateway-size` (under 400 lines, ratchet `scripts/gateway-size-budget.json`, covers `src/` and `test/`), `check:gateway-names`, `check:gateway-deps` (layers and module order), `check:gateway-literals` |
| `npm run build:web` | `vue-tsc`, `check:styles`, `check:scoped-style`, `check:tokens`, `check:raw-controls`, `check:i18n`, `check:i18n-literals`, `check:i18n-keys`, `check:deps` (layers), `check:names`, `check:file-size` (ratchet `web/scripts/file-size-budget.json`), then `vite build` and a build stamp |

`npm --prefix web run check:ui-usage` prints how often each library component is used outside the gallery; it is a report, not a gate.

Comments, test names and docs say why, not when. They carry no plan, step or finding ids.
