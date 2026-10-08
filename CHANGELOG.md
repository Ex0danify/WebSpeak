# Changelog

## [0.2.4] — 2026-09-22

### English

- Added cross-platform P2P screen sharing: browser users can discover, start, and watch screen shares with native TeamSpeak 6 clients. Media between browsers, and between a browser and a native client, prefers a direct WebRTC/ICE path; WebSpeak handles session authorization, share state, and SDP/ICE signaling only and does not carry screen media.
- Added TeamSpeak's public STUN services for direct-candidate discovery by default, with optional administrator-configured external TURN. Even with TURN, media uses the external service rather than the WebSpeak gateway.
- Added live screen-share status, viewer counts, player volume, fullscreen, and exit controls, plus live sender/receiver WebRTC statistics.
- Added browser capture-resolution and frame-rate controls up to 1080p and 60 FPS; moved the controls into a standalone modal so member cards no longer stretch.
- Added homepage visitor numbering and refined screen-share member-card and viewing interactions.
- Fixed output-limit handling so the selected desktop or window keeps its native capture size while the sender encoder applies the requested scale and frame-rate cap; the homepage now also shows the total visitor count.
- Fixed handshake refusals being reported as connection timeouts; invalid nickname lengths now show a clear prompt to change the nickname.

### Deutsch

- Plattformübergreifendes P2P-Bildschirmteilen ergänzt: Browsernutzer können Bildschirmfreigaben mit nativen TeamSpeak-6-Clients erkennen, starten und ansehen. Die Medienübertragung zwischen Browsern sowie zwischen Browser und nativem Client nutzt möglichst direkte WebRTC-/ICE-Verbindungen; WebSpeak übernimmt nur Sitzungsberechtigung, Freigabestatus und SDP-/ICE-Signalisierung und transportiert keine Bildschirmmedien.
- Öffentliche TeamSpeak-STUN-Dienste werden standardmäßig zur Ermittlung direkter Kandidaten verwendet; ein externes TURN kann ausdrücklich durch den Administrator konfiguriert werden. Auch mit TURN läuft die Medienübertragung über den externen Dienst und nicht über das WebSpeak-Gateway.
- Live-Status, Zuschauerzahl, Lautstärke, Vollbild- und Beenden-Steuerung für Bildschirmfreigaben sowie laufende WebRTC-Statistiken für Sender und Empfänger ergänzt.
- Aufnahmeauflösung und Bildrate im Browser bis 1080p und 60 FPS konfigurierbar; die Einstellungen wurden in ein eigenes Modal verschoben, damit Mitgliederkarten nicht mehr in die Höhe wachsen.
- Besucherzählung auf der Startseite ergänzt und die Interaktion von Bildschirmfreigabe-Karten und Player verbessert.
- Die Ausgabelimits werden nun am Sender-Encoder angewendet, während die native Aufnahmegröße des ausgewählten Desktops oder Fensters erhalten bleibt; auf der Startseite wird zusätzlich die Gesamtzahl der Besucher angezeigt.
- Behoben, dass Ablehnungen während des TeamSpeak-Handshakes als Zeitüberschreitung angezeigt wurden; bei ungültiger Nicknamenslänge erscheint nun ein klarer Änderungshinweis.

### Русский

- Добавлена кроссплатформенная P2P-трансляция экрана: пользователи браузера могут обнаруживать, запускать и смотреть трансляции вместе с нативными клиентами TeamSpeak 6. Медиа между браузерами, а также между браузером и нативным клиентом по возможности передаётся напрямую через WebRTC/ICE; WebSpeak отвечает только за авторизацию сессии, состояние трансляции и SDP/ICE-сигналы и не переносит медиаданные экрана.
- По умолчанию добавлено обнаружение прямых кандидатов через публичные STUN-сервисы TeamSpeak; администратор может явно настроить внешний TURN. Даже при использовании TURN медиа идёт через внешний сервис, а не через шлюз WebSpeak.
- Добавлены статус трансляции, число зрителей, громкость проигрывателя, полноэкранный режим и выход, а также текущая статистика WebRTC для отправителя и получателя.
- Добавлены настройки разрешения и частоты кадров захвата в браузере до 1080p и 60 FPS; настройки вынесены в отдельное окно, чтобы карточки участников не растягивались.
- Добавлен номер посетителя на главной странице и улучшено управление карточками и просмотром трансляций.
- Исправлено применение ограничений вывода: выбранный рабочий стол или окно сохраняет исходный размер захвата, а запрошенное масштабирование и ограничение частоты кадров применяются кодировщиком отправителя; на главной странице также показывается общее число посетителей.
- Исправлено ошибочное отображение отказов TeamSpeak во время рукопожатия как тайм-аута; при недопустимой длине имени показывается понятная просьба изменить его.

## [0.2.3] — 2026-09-19

### English

- Added member-management entry points: drag-and-drop remains available, while the context menu now provides a “Move to” submenu with a “My channel” shortcut.
- Added permission-aware direct member moves: authorized users can move clients without redundant channel-password prompts, while the action is unavailable without the required TeamSpeak permission.
- Added client-avatar display, microphone mute-state synchronization, and remembered-identity recovery, with improved pointer-drag compatibility.
- Refreshed feature screenshots and documentation pages for all five supported languages.
- Fixed clipped lower content in the high-resolution desktop admin settings page and tightened relay-card width constraints.

### Deutsch

- Neue Einstiege für die Mitgliederverwaltung: Ziehen und Ablegen bleibt verfügbar, zusätzlich bietet das Kontextmenü ein Untermenü „Verschieben nach“ mit dem Eintrag „Mein Kanal“.
- Direkte, berechtigungsabhängige Mitgliederverschiebung ergänzt: Benutzer mit den erforderlichen TeamSpeak-Rechten benötigen keine erneute Kanalpasswortabfrage; ohne diese Rechte steht die Aktion nicht zur Verfügung.
- Anzeige von Client-Avataren, Synchronisierung des Mikrofon-Stummschaltstatus und Wiederherstellung gespeicherter Identitäten ergänzt; Zeigerbedienung verbessert.
- Funktionsscreenshots und Dokumentationsseiten für alle fünf unterstützten Sprachen aktualisiert.
- Das Abschneiden unterer Inhalte in den Admin-Einstellungen bei hoher Desktop-Auflösung behoben und die Breitenbegrenzung der Relay-Karten verbessert.

### Русский

- Добавлены способы управления участниками: перетаскивание сохранено, а в контекстном меню появился пункт «Переместить в» с быстрым вариантом «Мой канал».
- Добавлено прямое перемещение с учётом прав TeamSpeak: пользователям с нужными правами не нужно повторно вводить пароль канала, а без этих прав действие недоступно.
- Добавлены отображение аватаров клиентов, синхронизация состояния микрофона и восстановление сохранённой идентичности; улучшено перетаскивание указателем.
- Обновлены функциональные скриншоты и страницы документации для всех пяти поддерживаемых языков.
- Исправлено обрезание нижнего содержимого настроек администратора на десктопах с высоким разрешением и ограничена ширина карточек ретрансляторов.

## [0.2.2] — 2026-09-17

### English

- Added optional browser-side microphone noise suppression.
- Refined volume interaction: desktop microphone and master-volume controls open on hover, with noise suppression in the microphone menu.
- Improved error messages and error-code display on top of PR #2.
- Added Russian and Japanese UI support and per-language welcome text configuration.

### Deutsch

- Optionale browserseitige Mikrofon-Geräuschunterdrückung hinzugefügt.
- Lautstärkeinteraktion verbessert: Desktop-Mikrofon- und Gesamtlautstärkeregler öffnen sich beim Überfahren; die Geräuschunterdrückung befindet sich im Mikrofonmenü.
- Fehlertexte und Fehlercodes auf Basis von PR #2 verbessert.
- Russische und japanische Oberfläche sowie sprachabhängige Begrüßungstexte ergänzt.

### Русский

- Добавлено опциональное шумоподавление микрофона в браузере.
- Улучшено управление громкостью: на компьютере регуляторы открываются при наведении, а шумоподавление находится в меню микрофона.
- Улучшены сообщения и коды ошибок на основе PR #2.
- Добавлены русский и японский интерфейсы и отдельная настройка приветствия для каждого языка.

## [0.2.1] — 2026-09-13

### English

- Unified connection-error display on the welcome page: preserve error codes, safely truncate unknown codes, and show traceable server reasons.
- Added default IPv6 TeamSpeak target support and documented the required host, runtime, and network conditions.

### Deutsch

- Verbindungsfehler auf der Willkommensseite vereinheitlicht: Fehlercodes bleiben erhalten, unbekannte Codes werden sicher gekürzt und nachvollziehbare Serverursachen angezeigt.
- IPv6-Ziele für TeamSpeak standardmäßig unterstützt und erforderliche Host-, Laufzeit- und Netzwerkbedingungen dokumentiert.

## [0.2.0] — 2026-09-10

### English

- Added an “Advanced features” section to the README with WebRTC and relay configuration and usage steps.
- Documented WebRTC UDP, security-group, and firewall requirements, plus relay-token and administration-console setup.
- Clarified that the relay is built into WebSpeak, while WebRTC uses the MIT-licensed `werift` dependency and TeamSpeak connectivity uses the project-maintained SDK fork.
- Classified TeamSpeak connection failures and prompt users for a server password with a retry when authentication requires one.
- Improved administrator connection history: show a specific reason when available and use a generic failure message when older records cannot be traced, without guessing.
- Added a formal relay deployment mode: relay instances expose no visitor or admin UI and accept only token-authenticated gateway sessions.
- Administrators can configure multiple relay nodes, and visitors can choose direct access or a specific relay for each connection.
- Fixed normal user disconnects being shown as “request failed” in administrator connection history.

### Deutsch

- Einen Abschnitt „Erweiterte Funktionen“ mit Anleitungen für WebRTC und Relay-Server zur README hinzugefügt.
- UDP-, Sicherheitsgruppen- und Firewall-Anforderungen für WebRTC sowie Relay-Token und Administrationskonfiguration dokumentiert.
- Klargestellt, dass das Relay Bestandteil von WebSpeak ist; WebRTC verwendet die MIT-lizenzierte Abhängigkeit `werift`, die TeamSpeak-Verbindung den projektgepflegten SDK-Fork.
- TeamSpeak-Verbindungsfehler genauer klassifiziert und bei erforderlichem Serverpasswort eine Eingabe mit Wiederholung angeboten.
- Den Verlauf der Administrator-Verbindungen verbessert: verfügbare Ursachen werden angezeigt, ältere nicht nachvollziehbare Einträge erhalten eine allgemeine Fehlermeldung statt einer Vermutung.
- Einen dedizierten Relay-Bereitstellungsmodus ergänzt: Relay-Instanzen stellen keine Besucher- oder Admin-Oberfläche bereit und akzeptieren nur Gateway-Sitzungen mit Token.
- Administratoren können mehrere Relay-Knoten konfigurieren; Besucher wählen pro Verbindung Direktzugriff oder ein bestimmtes Relay.
- Behoben, dass normale Benutzertrennungen im Administrationsverlauf als „Anfrage fehlgeschlagen“ erschienen.

## [0.1.8] — 2026-09-08

### English

- Docker now uses host networking by default, allowing the gateway to reach a local TeamSpeak server and expose the WebRTC UDP range directly.
- Open access now validates every submitted target, including the administrator default, closing loopback and private-network bypasses.
- Added a 15-second TeamSpeak SDK handshake timeout with prompt cleanup after failed connections.
- The network performance panel now measures continuously and refreshes latency and packet loss every 3 seconds while open.

### Deutsch

- Docker verwendet standardmäßig das Host-Netzwerk, damit das Gateway einen lokalen TeamSpeak-Server erreicht und den WebRTC-UDP-Bereich direkt bereitstellt.
- Der offene Zugriffsmodus prüft nun jedes Ziel einschließlich des Administrator-Standards und schließt Umgehungen für Loopback- und private Netze.
- Für den TeamSpeak-SDK-Handshake gilt jetzt ein Timeout von 15 Sekunden; fehlgeschlagene Verbindungen werden zeitnah bereinigt.
- Das Netzwerkleistungsfeld misst bei geöffneter Ansicht fortlaufend und aktualisiert Latenz und Paketverlust alle 3 Sekunden.

## [0.1.7] — 2026-09-06

### English

- Added German UI support and a Telegram community link.
- Added a compact desktop master-volume slider that expands on hover.
- Fixed accompaniment volume fluctuations.
- Added an expandable network performance panel with latency and packet loss across the browser, WebSpeak, and TeamSpeak path.
- Updated the administrator connection test to use repeated host pings, report packet loss, and avoid creating temporary TeamSpeak clients.
- Unified the Chinese, English, and German flag/code language menu.
- Fixed false packet-loss reports caused by probing the TeamSpeak UDP service with TCP, and corrected excess space in the language menu.
- Removed RMS-based silence filtering from the WebRTC bridge; quiet frames are now retained for the codec timeline.
- Fixed Docker admin diagnostics falsely reporting 100% packet loss when the runtime lacked the ICMP ping tool.

### Deutsch

- Deutsche Benutzeroberfläche und Telegram-Community-Link hinzugefügt.
- Kompakten Gesamtlautstärkeregler für den Desktop ergänzt, der sich beim Überfahren öffnet.
- Schwankende Lautstärke bei der Begleittonfreigabe behoben.
- Aufklappbares Netzwerkleistungsfeld mit Latenz und Paketverlust zwischen Browser, WebSpeak und TeamSpeak ergänzt.
- Verbindungstest in der Administration auf wiederholte Host-Pings mit Paketverlustanzeige umgestellt, ohne temporäre TeamSpeak-Clients zu erzeugen.
- Einheitliches Sprachmenü mit Flaggen und Sprachcodes für Chinesisch, Englisch und Deutsch ergänzt.
- Falsche Paketverlustmeldungen durch TCP-Prüfung des UDP-Dienstes behoben und übermäßigen Leerraum im Sprachmenü korrigiert.
- RMS-basierte Stillefilterung aus der WebRTC-Brücke entfernt; leise Frames bleiben nun im Codec-Zeitverlauf erhalten.
- Falsche 100-%-Paketverlustmeldungen behoben, wenn dem Docker-Laufzeitimage das ICMP-Ping-Tool fehlte.

## [0.1.6] — 2026-09-04

### English

- Added a warning for concurrent remembered-identity connections in the same browser.
- Added desktop accompaniment sharing.
- Added a site favicon and refreshed the repository README branding.

## [0.1.5] — 2026-09-04

### English

- Fixed and refined the theme toggle so the first click switches themes, with sun/moon icons.
- Fixed browser identity persistence across exit and return.

All notable changes to WebSpeak are documented here. Versions follow SemVer.

## [0.1.4] — 2026-09-03

### English

- Fixed WebRTC voice transport and speaking-state synchronization.
- Fixed channel text messages between WebSpeak clients.
- Refined admin pages, log wrapping, and narrow-screen header layout.
- Added the Bilibili profile link and the admin-login home link.

## [0.1.3] — 2026-09-03

### Added

- Optional WebRTC audio transport for deployments that need lower and more stable realtime voice latency.
- A self-contained WebRTC media service controlled by one administrator switch; the gateway derives the media host from the current WebSpeak address and owns a fixed UDP range.
- Migrated the TeamSpeak integration to the maintained `EchoSixHIYA/teamspeak-js` fork, including live directory snapshots and member/channel synchronization.

### Changed

- WebRTC audio uses negotiated Opus parameters and a bounded newest-frame mixer instead of allowing stale audio to accumulate.
- The browser keeps the WebSocket path available for signaling, control, and compatibility fallback; Docker Compose publishes the built-in `40000–40099/UDP` media range alongside the web port.

### Fixed

- Prevented duplicate playback when WebRTC and the WebSocket audio path overlap during negotiation or fallback.
- Made WebRTC teardown and fallback explicit so a failed negotiation does not leave a server-side media session behind.
- Corrected native Opus decoder usage and cleaned up negotiated payload handling for TeamSpeak-to-browser audio.

### Verification

- After allowing inbound `40000–40099/UDP` on the public WebSpeak host, two browser sessions were tested against the same TeamSpeak target with WebRTC enabled: audio frames flowed in both directions, packet drops remained at `0`, ingress frame gaps peaked at about `27 ms`, and egress gaps peaked at about `81–83 ms`.
- The measured WebRTC path stayed below the previous WebSocket jitter peaks of about `268–376 ms` in the same browser test setup; these figures describe the observed test path, not a universal latency guarantee.

## [0.1.2] — 2026-09-02

### Added

- Current-version badge and a direct changelog link on the welcome page, next to the prominent GitHub repository button.
- Mobile member actions through a three-dot menu, while desktop member actions remain available through the context menu.

### Changed

- Mobile and narrow-screen header controls now collapse longer labels into icons to preserve usable spacing.
- The welcome page and connected workspace now present the GitHub, version, changelog, admin, theme, language, exit, and microphone controls as a consistent responsive control group.
- The version shown on the welcome page is read from the gateway's public configuration so it stays aligned with the running backend.
- Consolidated the post-0.1.1 mobile voice controls, microphone mute replacement for focus-dependent PTT, automatic protocol detection, simplified Docker Compose startup, and live-demo documentation.

### Fixed

- Replaced the visually off-center settings glyph and normalized icon alignment for settings-related controls across the client.
- Fixed narrow-screen exit and microphone controls so their text-collapse rules apply correctly.
- Bounded browser and gateway voice buffering, reset stale browser playback queues, and exposed low-overhead in-memory audio counters for diagnosing jitter without per-frame log writes.
- Moved microphone frame assembly to an `AudioWorklet` with a compatibility fallback to `ScriptProcessorNode`; both paths emit fixed 960-sample frames.

## [0.1.1] — 2026-09-02

### Added

- M009 admin operations dashboard for managed invites, active-session inspection, per-session termination, diagnostics, logs, audit access, diagnostic report download, and SQLite backup export.
- Persistent managed invites with expiry, optional maximum uses, revocation, hashed opaque tokens, and encrypted TeamSpeak credentials at rest.
- Mobile-aware invite joining through the `invite` URL parameter without placing a TeamSpeak password in the URL.
- M010 hardening for per-peer join-ticket rate limiting and bounded rotating runtime logs.
- Bilingual README documentation with parallel Chinese and English feature, deployment, security, and operations sections.

### Changed

- Database schema is now version 2 and migrates existing version 1 installations transactionally with a migration copy.
- Admin overview and diagnostics use the application package version instead of a hard-coded display value.
- The README architecture section now uses GitHub-native Markdown instead of a Mermaid rich-display block.
- The README badge set now uses stable static Shields badges without a repository-metadata 404 dependency.
- Version tags publish Windows/Linux deployment packages to GitHub Releases and publish the matching Docker image.
- Removed the focus-dependent normal browser Space-key PTT mode and replaced it with a one-click microphone mute/unmute control on desktop and mobile.
- Persisted the microphone mute state in browser preferences and suppresses upstream audio before it is sent to TeamSpeak while muted.

### Fixed

- Late WebSpeak browser sessions now reconcile and merge the complete TeamSpeak directory, so members who joined earlier remain visible.
- Private-message delivery no longer disconnects the browser session.
- Member actions are presented through the right-click context menu with hover feedback.
- Docker release builds copy the root `postinstall` patch script before running `npm ci`.
- Release builds skip `npm version` when the project version already matches the requested version, preventing false `Version not changed` failures.

### Verification

- `npm test` — 51 tests passed.
- `npm run build` — backend TypeScript build passed.
- `npm run web:build` — frontend production build passed.
- `npm audit --omit=dev --audit-level=high` — no high or critical vulnerabilities reported.
- Local `/demo` browser checks passed at the documented narrow and desktop widths; `/demo` does not connect to TeamSpeak.

Real TS3/TS6 interoperability, Android microphone behavior, multi-client smoke, and the 24-hour long-run gate require their respective test environments and are not claimed by this local release check.

## [0.1.0] — 2026-08-31

- First normalized release with the browser client, TeamSpeak 3 / 6 gateway, browser audio controls, access modes, administrator operations, and AGPL-3.0-only licensing.
