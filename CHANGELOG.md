# Changelog

Hinweis vom 22.10.2026: Historische Versionsnotizen. GitHub-Releases und automatische Release-/Publish-Workflows wurden entfernt; Installation erfolgt aus dem Quellcode per Skript.

## [0.4.0](https://github.com/jtracht/gitea-chatgpt-plugin/compare/v0.3.3...v0.4.0) (2026-10-21)


### Features

* **auth:** add ChatGPT guided self-service Gitea setup ([#26](https://github.com/jtracht/gitea-chatgpt-plugin/issues/26)) ([ad0ff00](https://github.com/jtracht/gitea-chatgpt-plugin/commit/ad0ff007330032fb2b0f76bbe6587d4ee21ec279))

## [0.3.3](https://github.com/jtracht/gitea-chatgpt-plugin/compare/v0.3.2...v0.3.3) (2026-10-21)


### Miscellaneous Chores

* release 0.3.3 ([#24](https://github.com/jtracht/gitea-chatgpt-plugin/issues/24)) ([046600a](https://github.com/jtracht/gitea-chatgpt-plugin/commit/046600a787dec1df53cccb953d441ed266c2070b))

## [0.3.2](https://github.com/jtracht/gitea-chatgpt-plugin/compare/v0.3.1...v0.3.2) (2026-10-21)


### Bug Fixes

* **release:** ship production deployment package and polished branding ([#21](https://github.com/jtracht/gitea-chatgpt-plugin/issues/21)) ([ecc8980](https://github.com/jtracht/gitea-chatgpt-plugin/commit/ecc89801c19de3c5c8601c7036cc9dd5157b4256))

## [0.3.1](https://github.com/jtracht/gitea-chatgpt-plugin/compare/v0.3.0...v0.3.1) (2026-10-21)


### Bug Fixes

* require explicit configuration of own Gitea server ([#19](https://github.com/jtracht/gitea-chatgpt-plugin/issues/19)) ([0ce4ca4](https://github.com/jtracht/gitea-chatgpt-plugin/commit/0ce4ca412bead9cd1d6a14d1ca16039a3ff83f2a))

## [0.3.0](https://github.com/jtracht/gitea-chatgpt-plugin/compare/v0.2.0...v0.3.0) (2026-10-21)


### Features

* complete issue parameters and add organization package and wiki publishing ([#17](https://github.com/jtracht/gitea-chatgpt-plugin/issues/17)) ([59f7347](https://github.com/jtracht/gitea-chatgpt-plugin/commit/59f7347a4a0c15b709dceb8117a116c3685a8328))

## [0.2.0](https://github.com/jtracht/gitea-chatgpt-plugin/compare/v0.1.1...v0.2.0) (2026-10-21)


### Features

* add Actions control, Kanban projects and time tracking ([#14](https://github.com/jtracht/gitea-chatgpt-plugin/issues/14)) ([f469680](https://github.com/jtracht/gitea-chatgpt-plugin/commit/f469680ff5e1c97ace539fe445e2a57eb73e8ab8))

## [0.1.1](https://github.com/jtracht/gitea-chatgpt-plugin/compare/v0.1.0...v0.1.1) (2026-10-21)


### Bug Fixes

* **ci:** preserve release generator formatting with schema gates ([#11](https://github.com/jtracht/gitea-chatgpt-plugin/issues/11)) ([6e624f1](https://github.com/jtracht/gitea-chatgpt-plugin/commit/6e624f1d2e4474b2d839331a948ec8b74095a55b))
* **mcp:** direct expired Gitea credentials to secure reconnection ([#9](https://github.com/jtracht/gitea-chatgpt-plugin/issues/9)) ([2519ddf](https://github.com/jtracht/gitea-chatgpt-plugin/commit/2519ddf28ea83ea1f0d53abcdff309e286fba556))

## 0.1.0 (2026-10-21)

Erster Entwicklungsrelease / Initial development release.

- Selbst hostbarer Streamable-HTTP-MCP-Server mit portablem Plugin.
- OAuth-Resource-Server, Gitea-OAuth/PAT, verschlüsselte Mehrbenutzer-/Mehrinstanzverbindungen.
- Repository-, Datei-, Issue-, PR-, Release- und Actions-Werkzeuge mit unabhängiger Schreibfreigabe.
- Isolierte Tests, Coverage-Gates, Docker, CI/Security und gekoppelter Release-/Publish-Prozess.

ChatGPT-Konto-E2E und öffentliche Verzeichnisfreigabe sind nicht verifiziert.
