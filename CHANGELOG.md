# Changelog

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
