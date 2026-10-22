# Gitea for ChatGPT

<img src="plugin/assets/icon.png" width="96" height="96" alt="Gitea for ChatGPT">

[English](docs/en/README.md) · Apache-2.0

Open-Source-MCP-Server und portables Plugin zur Verwaltung eigener Gitea-Instanzen mit ChatGPT und kompatiblen Codex-Clients. 159 typisierte Tools für Repositories, Dateien, Issues, Pull Requests, Reviews, Actions, Kanban-Projekte, Zeiterfassung, Organisationen, Packages, Sprint-Meilensteine, Gitea-Releases und Wiki. Schreibende Aktionen verlangen eine separate menschliche Freigabe.

## Installation per Skript

Voraussetzungen: Node.js 24 LTS, pnpm 11.25.0, Git und für Containerbetrieb Docker Compose. Eigener HTTPS-Endpunkt und OAuth/OIDC-Anbieter sind erforderlich. Es wird kein laufender Dienst mitgeliefert.

```bash
git clone https://github.com/Tracht-Digital-Solutions/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
node scripts/install.mjs --init
# .env im Editor mit eigenen Gitea-/MCP-/OAuth-Einstellungen ausfüllen
node scripts/install.mjs --check
node scripts/install.mjs --start
```

Das Skript bewahrt vorhandene Einstellungen und Schlüssel, baut Server und Image lokal und erstellt ein Plugin mit konkretem Endpunkt. Ergebnis und öffentliche ChatGPT-Verbindungsdaten liegen unter `artifacts/`. Es gibt keine GitHub-Releases oder erforderlichen vorgebauten Images. [Vollständige Schritt-für-Schritt-Anleitung](docs/de/INSTALLATION.md).

## Einstellungen und ChatGPT

Die kommentierte [.env.example](.env.example) beschreibt alle Werte. Einstellungen werden ausschließlich lokal in `.env` gepflegt und per Skript angewendet; ChatGPT kann sie nicht ändern. Standardmäßig werden Gitea-Server über `GITEA_INSTANCES` konfiguriert und die freie Servereinrichtung ist deaktiviert. Kein Gitea-Server ist fest vorgegeben. Tokens ausschließlich im geschützten Portal oder in dokumentierten Betreiber-Secrets hinterlegen.

In ChatGPT die konkrete MCP-Verbindung aus `artifacts/chatgpt-connection.json` hinzufügen, OAuth konfigurieren und das Plugin installieren. Danach `list_instances`, `connection_status` und `list_repositories` prüfen. Zugangsdaten niemals im Chat senden. Die tatsächliche Kontoabnahme erfordert dein eigenes Deployment und ist noch nicht verifiziert.

## Entwicklung und Sicherheit

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
```

CI prüft Typen, Lint, Format, Coverage, MCP-Schemas, Build, Docker und das lokale Installationspaket. Security prüft Dependencies, Secrets, CodeQL und Container. Release-/Publish-Automatisierung wurde entfernt. Git-Historie und Tags bleiben als Quellcode-Nachweise erhalten.

OAuth, verschlüsselte Mandantentrennung, SSRF-/DNS-Rebinding-Schutz und konkrete Einmalfreigaben bleiben verpflichtend. [Deployment](docs/DEPLOYMENT.md), [Sicherheitsmodell](docs/SECURITY.md), [Fortschritt](docs/PROGRESS.md), [Mitwirken](CONTRIBUTING.md), [Lizenz](LICENSE).

[Parameter- und Funktionsumfang](docs/de/PARAMETER-UND-FUNKTIONSPRUEFUNG.md) · [Actions, Projekte und Zeit](docs/de/PROJEKTE-ACTIONS-ZEIT.md). GitHub-Quellcode und lokale Pakete bedeuten keine Freigabe im offiziellen Plugin-Verzeichnis.
