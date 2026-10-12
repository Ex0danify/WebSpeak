<div align="center">
  <a id="readme-top"></a>

  <img src="./image.png" alt="WebSpeak project banner" width="100%" />

  <h1>WebSpeak</h1>

  <p>A self-hosted browser voice client for TeamSpeak 3 and TeamSpeak 6.</p>

  [![Latest Release](https://img.shields.io/github/v/release/EchoSixHIYA/WebSpeak-client-for-TeamSpeak?sort=semver&display_name=tag&style=flat-square&color=0f766e)](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/releases/latest)
  [![Docker Image](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/actions/workflows/docker-publish.yml/badge.svg?branch=master)](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/actions/workflows/docker-publish.yml)
  [![License](https://img.shields.io/badge/license-AGPL--3.0--only-0f766e?style=flat-square)](./LICENSE)
  [![GitHub Stars](https://img.shields.io/github/stars/EchoSixHIYA/WebSpeak-client-for-TeamSpeak?style=flat-square&logo=github&color=0f766e)](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/stargazers)
  <br />
  [![TeamSpeak](https://img.shields.io/badge/TeamSpeak-3%20%7C%206-2580C3?style=flat-square)](https://www.teamspeak.com/)
  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![Vue](https://img.shields.io/badge/Vue-3-42B883?style=flat-square&logo=vuedotjs&logoColor=white)](https://vuejs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/EchoSixHIYA/packages/container/package/webspeak)

  <p>
    <a href="./docs/README.en.md">English documentation</a> ·
    <a href="./docs/README.de.md">Deutsche Dokumentation</a>
  </p>
</div>

## Overview

| Question | Answer |
| --- | --- |
| **WHAT** | WebSpeak is a self-hosted browser client and voice gateway for TeamSpeak 3 and TeamSpeak 6. |
| **WHY** | Users can join a voice channel from a browser without installing a desktop client, while the operator keeps control of servers, access, and data. |
| **HOW** | Configure the TeamSpeak target and access policy in the administration console. The browser handles interaction and audio; WebSpeak provides the gateway connection. |

## Documentation

- [English](./docs/README.en.md)
- [Deutsch](./docs/README.de.md)

## Community

<div align="center">

<a href="http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=yhumUMDD9PmyYFWdXWUb_x7hM5trFQY8&authKey=Pw3HBGT7GwMinTQnuFGfnpf0aRSzXOJKcAiujVP1%2BXMpjheAKrncTRivicBJxpjV&noverify=0&group_code=869500475">
  <img src="./web/public/qq-group-qr.jpg" alt="WebSpeak QQ group QR code" width="290" />
</a>

**QQ group: `869500475`**

[Join directly](http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=yhumUMDD9PmyYFWdXWUb_x7hM5trFQY8&authKey=Pw3HBGT7GwMinTQnuFGfnpf0aRSzXOJKcAiujVP1%2BXMpjheAKrncTRivicBJxpjV&noverify=0&group_code=869500475)

[Telegram group](https://t.me/+8qShpTcuN9A3MWY9)

</div>

## Friend projects

### [NeteaseTSBot](https://github.com/yichen11818/NeteaseTSBot)

A multi-platform music bot for TeamSpeak 3/6 with Netease Cloud Music, QQ Music, and Bilibili playback, plus a web console.<br />
Ein plattformübergreifender Musikbot für TeamSpeak 3/6 mit Netease Cloud Music, QQ Music und Bilibili sowie Webkonsole.

## Translations

English and German ship. To add a language, run `npm run i18n:create <code>` (for example `fr`), translate the generated files, and run `npm --prefix web run check:i18n && npm test`. The full workflow is in [CONTRIBUTING.md](./CONTRIBUTING.md#translations-i18n).<br />
Englisch und Deutsch sind enthalten. Eine neue Sprache entsteht mit `npm run i18n:create <code>` (z. B. `fr`); die erzeugten Dateien übersetzen, dann `npm --prefix web run check:i18n && npm test` ausführen. Der gesamte Ablauf steht in [CONTRIBUTING.md](./CONTRIBUTING.md#translations-i18n).

## Contributors

Thanks to everyone who contributed a pull request:

- [LainHE](https://github.com/LainHE) — [PR #2](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak/pull/2): translation of browser-side errors and prompts.

## License

WebSpeak is released under the [GNU Affero General Public License v3.0 only](./LICENSE). If a modified version is offered to users over a network, its corresponding source code must be offered under AGPL-3.0.

WebSpeak wird unter der [GNU Affero General Public License v3.0 only](./LICENSE) veröffentlicht. Bei Bereitstellung einer veränderten Version über ein Netzwerk muss der entsprechende Quellcode unter AGPL-3.0 angeboten werden.

## Star History

<a href="https://star-history.com/#EchoSixHIYA/WebSpeak-client-for-TeamSpeak&Date">
  <img src="https://api.star-history.com/svg?repos=EchoSixHIYA/WebSpeak-client-for-TeamSpeak&type=Date" alt="WebSpeak Star History" width="100%" />
</a>

<div align="right"><a href="#readme-top">Back to top ↑</a></div>
