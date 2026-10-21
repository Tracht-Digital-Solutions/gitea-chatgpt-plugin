# Gitea for ChatGPT

[![CI](https://github.com/jtracht/gitea-chatgpt-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/jtracht/gitea-chatgpt-plugin/actions/workflows/ci.yml)
[![Security](https://github.com/jtracht/gitea-chatgpt-plugin/actions/workflows/security.yml/badge.svg)](https://github.com/jtracht/gitea-chatgpt-plugin/actions/workflows/security.yml)

**Deutsch** · [English](docs/en/README.md)

Ein selbst hostbarer MCP-Server mit portablem Agent-Plugins-Paket für die Verwaltung eigener Gitea-Instanzen aus ChatGPT und kompatiblen Codex-Clients. Kein kostenpflichtiger Cloud-Dienst erforderlich. Unabhängiges Communityprojekt, keine offizielle OpenAI- oder Gitea-Erweiterung.

**Entwicklungsstand:** Die Reihe 0.1.x besteht aus frühen Entwicklungsreleases. [Nachweise und offene Abnahmen](docs/PROGRESS.md) sind verbindlich; die echte ChatGPT-Kontoverbindung und eine Aufnahme ins öffentliche Plugin-Verzeichnis sind noch nicht verifiziert. Das Paket enthält eine konfigurierbare HTTPS-Vorlage und keinen von diesem Projekt betriebenen Dienst.

## Funktionen

- Mehrere getrennte Gitea-Verbindungen pro OAuth-Benutzer, aktive Instanz, Status, Benutzer und API-Version.
- Repositories lesen, suchen, erstellen und ausgewählte Einstellungen ändern; Dateien, Verzeichnisse, Git-Bäume, Statistikfelder, Branches und Tags lesen.
- Begrenzte Suche in Dateiinhalten und Commit-Historie mit ausdrücklichem Hinweis auf unvollständige Ergebnisse.
- Feature-Branches und Datei-Commits erstellen, bearbeiten oder löschen, Diffs und Vergleiche lesen.
- Issues, Kommentare, Zuständige, Labels, Meilensteine und verfügbare Abhängigkeiten.
- Pull Requests, Diffs, Dateien, Reviews und ausdrücklich freigegebene Merges mit Head-SHA-Prüfung.
- Releases und Tags mit separater Freigabe; Actions-Workflows, Runs, Jobs und verfügbare Logs lesen.
- Keine öffentlichen Administrations-, Runner-, Webhook- oder Rechteänderungstools.

Alle Funktionen sind ohne ChatGPT-App-UI nutzbar. Die sichere Einrichtung und menschliche Schreibfreigabe erfolgen bewusst in einem eigenen Browserportal.

## Voraussetzungen

Node.js 24 LTS und pnpm 11.25.0 für Entwicklung, alternativ Docker/Compose; eine erreichbare Gitea-Instanz; ein OAuth/OIDC-Anbieter mit signierten JWT-Zugangstokens, PKCE und den Scopes `gitea.read`/`gitea.write`; HTTPS für MCP und Browserportal. Keycloak kann selbst gehostet werden.

## Installation mit Docker

```bash
git clone https://github.com/jtracht/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Schlüssel und die eigenen HTTPS-/OAuth-Adressen in .env eintragen.
docker compose up -d --build
```

Anschließend HTTPS-Reverse-Proxy auf Port 3000 einrichten. Der MCP-Endpunkt lautet `https://<eigener-host>/mcp`, das Browserportal `https://<eigener-host>/portal`. Alle OAuth-Variablen sind Pflicht; es gibt keinen unauthentifizierten Produktionsmodus. [Vollständige Einrichtung, OAuth, Nginx Proxy Manager und Rollback](docs/DEPLOYMENT.md).

## Gitea verbinden

1. Betreiber trägt erlaubte Instanzen unter `GITEA_INSTANCES` ein. Die Beispieladresse in `.env.example` ist austauschbar.
2. Browserportal öffnen und beim eigenen OAuth-Anbieter anmelden.
3. Gitea-OAuth nutzen, falls für diese Instanz eingerichtet; alternativ ein möglichst eng berechtigtes persönliches Access-Token ausschließlich im Passwortfeld des Portals eingeben.
4. `list_instances`, `connection_status` und `list_repositories` testen.
5. Verbindungen lassen sich im Portal oder über eine freigegebene Tool-Aktion trennen. Für vollständigen Widerruf zusätzlich die Berechtigung in Gitea löschen.

## ChatGPT und Codex

Nach der [aktuellen OpenAI-Anleitung](https://developers.openai.com/plugins/deploy/connect-chatgpt): **Plugins → + → Add custom MCP server**, eigenen HTTPS-Endpunkt eintragen, OAuth auswählen, erstellen, installieren und in einem neuen Work-Chat per `@` auswählen. Client, Tarif und Workspace-Richtlinien können diese Funktion beschränken; eine vollständige Tarifmatrix ist durch die geprüften Entwicklerquellen nicht belegt.

Für das portable Paket `pnpm install --frozen-lockfile && pnpm package` ausführen. Optional `MCP_PUBLIC_URL=https://<host>/mcp` beim Paketieren setzen. Das erzeugte ZIP unter `artifacts/` enthält `plugin.json`, `mcp.json`, Skill und Icon. Alternativ bindet Codex den Server über seine unterstützte MCP-Konfiguration mit `url` und OAuth an. [Details und Testfälle](docs/de/INSTALLATION.md).

Ein öffentliches GitHub-Repository stellt Quellcode bereit. Eine private MCP-Verbindung verbindet einen konkreten Server. Eine Veröffentlichung im universellen Plugin-Verzeichnis benötigt eine zusätzliche Einreichung und Prüfung und erfolgt nicht automatisch.

## Beispielaufträge

- „Zeige meine verbundenen Gitea-Instanzen und die ersten 20 Repositories.“
- „Lies das README in Repository X und fasse die offenen Issues zusammen.“
- „Erstelle einen Feature-Branch für diese Korrektur und bereite die Änderung vor.“
- „Zeige mir den Freigabelink für genau diesen Schreibauftrag.“
- „Prüfe den Diff und bereite einen Pull Request vor.“

## Sicherheitsmodell

OAuth-Signatur, Issuer, Audience, Ablauf und Scope werden serverseitig geprüft. Gitea-Tokens liegen getrennt je Benutzer und Instanz AES-256-GCM-verschlüsselt in SQLite. DNS-Adressen werden pro Anfrage geprüft und am TLS-Socket gepinnt; Redirects werden verweigert. Interne Netze sind standardmäßig gesperrt. Jede Mutation benötigt eine konkrete, zehn Minuten gültige, einmalige Browserfreigabe. Dateiänderungen verweigern den Standardbranch und geschützte/unklare Branches. [Sicherheit und Grenzen](docs/SECURITY.md).

## Entwicklung und Qualität

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e             # erstellt und entfernt eine isolierte Gitea-Dockerinstanz
docker build -t gitea-chatgpt-plugin:dev .
pnpm test:docker
pnpm dev                 # benötigt eigene Umgebungsvariablen/HTTPS-Proxy
```

`pnpm test` überspringt den echten Gitea-Test ohne isolierte Testumgebung. `pnpm test:e2e` führt ihn ausdrücklich aus. Sicherheitskritische Module haben eine verpflichtende Coverage-Schwelle von 85 %. Testergebnisse werden nicht aus übersprungenen Tests abgeleitet.

CI prüft Typen, Lint, Format, Tests, Manifeste, Build und Docker. Security prüft Dependencies, Secrets, CodeQL und Container-/Konfigurationsrisiken. Release Please pflegt Conventional-Commit-Releases; Publish wird aus dem Release-Workflow explizit aufgerufen und erzeugt ZIP, Serverarchiv, Prüfsummen und ein GHCR-Image. [Releaseprozess](docs/de/RELEASES.md).

## Versionen und Mitwirkung

v0.1.0: erster Entwicklungsrelease mit sicheren MCP-Kernabläufen. [Changelog](CHANGELOG.md), [Beitragen](CONTRIBUTING.md), [Sicherheitsmeldung](SECURITY.md). Lizenz: [Apache-2.0](LICENSE). Referenzdaten von Gitea: siehe [Drittanbieterhinweise](THIRD_PARTY_NOTICES.md).
