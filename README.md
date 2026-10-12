<div align="center">
  <a id="readme-top"></a>

  <h1>WebSpeak</h1>

  <p>A self-hosted browser voice client for TeamSpeak 3 and TeamSpeak 6.</p>

  [![License](https://img.shields.io/badge/license-AGPL--3.0--only-0f766e?style=flat-square)](./LICENSE)
  <br />
  [![TeamSpeak](https://img.shields.io/badge/TeamSpeak-3%20%7C%206-2580C3?style=flat-square)](https://www.teamspeak.com/)
  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![Vue](https://img.shields.io/badge/Vue-3-42B883?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

  <p>
    <a href="./docs/README.en.md">English documentation</a> ·
    <a href="./docs/README.de.md">Deutsche Dokumentation</a>
  </p>
</div>

> [!WARNING]
> **Heavy work in progress.** This fork is under active, large-scale development. Expect breaking changes (configuration, database, APIs and the user interface) between versions, and bugs. Once enough features and fixes are in place, the project will be renamed, and the name, repository links, container image and documentation will change with it. Pin a version if you depend on it.
>
> **Aktive Entwicklung, vieles im Umbruch.** Dieser Fork wird intensiv und umfassend weiterentwickelt. Zwischen den Versionen sind inkompatible Änderungen (Konfiguration, Datenbank, APIs und Oberfläche) und Fehler zu erwarten. Sobald genug Funktionen und Korrekturen umgesetzt sind, wird das Projekt umbenannt; Name, Repository-Links, Container-Image und Dokumentation ändern sich dann entsprechend. Wer sich darauf verlässt, sollte eine Version festhalten.

## Overview

| Question | Answer |
| --- | --- |
| **WHAT** | WebSpeak is a self-hosted browser client and voice gateway for TeamSpeak 3 and TeamSpeak 6. |
| **WHY** | Users can join a voice channel from a browser without installing a desktop client, while the operator keeps control of servers, access, and data. |
| **HOW** | Configure the TeamSpeak target and access policy in the administration console. The browser handles interaction and audio; WebSpeak provides the gateway connection. |

## Documentation

- [English](./docs/README.en.md)
- [Deutsch](./docs/README.de.md)

## Translations

English and German ship. To add a language, run `npm run i18n:create <code>` (for example `fr`), translate the generated files, and run `npm --prefix web run check:i18n && npm test`. The full workflow is in [CONTRIBUTING.md](./CONTRIBUTING.md#translations-i18n).<br />
Englisch und Deutsch sind enthalten. Eine neue Sprache entsteht mit `npm run i18n:create <code>` (z. B. `fr`); die erzeugten Dateien übersetzen, dann `npm --prefix web run check:i18n && npm test` ausführen. Der gesamte Ablauf steht in [CONTRIBUTING.md](./CONTRIBUTING.md#translations-i18n).

## Attribution

WebSpeak in this repository is a fork of [EchoSixHIYA/WebSpeak-client-for-TeamSpeak](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak) by EchoSixHIYA, who created the original project. It is not the original project and is not affiliated with it. The original is licensed under the AGPL-3.0-only like this fork, and its copyright and license notices are kept.

Thanks to everyone who contributed to the original project, including [LainHE](https://github.com/LainHE) ([PR #2](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/2): translation of browser-side errors and prompts).

Der Quellcode in diesem Repository ist ein Fork von [EchoSixHIYA/WebSpeak-client-for-TeamSpeak](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak) von EchoSixHIYA, dem Urheber des ursprünglichen Projekts. Er ist nicht das Originalprojekt und steht in keiner Verbindung zu ihm. Das Original steht wie dieser Fork unter der AGPL-3.0-only; seine Urheberrechts- und Lizenzhinweise bleiben erhalten.

Dank an alle, die zum ursprünglichen Projekt beigetragen haben, darunter [LainHE](https://github.com/LainHE) ([PR #2](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/2): Übersetzung der Fehlermeldungen und Hinweise im Browser).

## License

WebSpeak is released under the [GNU Affero General Public License v3.0 only](./LICENSE). If a modified version is offered to users over a network, its corresponding source code must be offered under AGPL-3.0.

WebSpeak wird unter der [GNU Affero General Public License v3.0 only](./LICENSE) veröffentlicht. Bei Bereitstellung einer veränderten Version über ein Netzwerk muss der entsprechende Quellcode unter AGPL-3.0 angeboten werden.

<div align="right"><a href="#readme-top">Back to top ↑</a></div>
