# Installation und Konfiguration aus dem Quellcode

[English](../en/INSTALLATION.md) · Stand: 22.10.2026

Das Projekt wird lokal per Skript gebaut. Es gibt keine GitHub-Releases und keine erforderlichen vorgebauten Images. Einstellungen werden in deiner lokalen `.env` gepflegt. ChatGPT kann diese Datei und die Server-/OAuth-Konfiguration nicht ändern.

## 1. Voraussetzungen

- Node.js 24 LTS und pnpm 11.25.0, z. B. über Corepack.
- Git sowie Docker Engine und Docker Compose für den empfohlenen Containerbetrieb.
- Eigener Gitea-Server, HTTPS-Reverse-Proxy und eingerichteter OAuth/OIDC-Anbieter.

Der MCP-Dienst läuft auf deinem Rechner oder Server. ChatGPT benötigt eine erreichbare MCP-Verbindung; das ZIP stellt keinen Server bereit. OAuth-Clients, Audience, Scopes und genaue Callbacks werden beim eigenen Anbieter eingerichtet. Details: [Deployment](../DEPLOYMENT.md).

## 2. Projekt und Beispielkonfiguration

```bash
git clone https://github.com/Tracht-Digital-Solutions/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
corepack enable
corepack prepare pnpm@11.25.0 --activate
node scripts/install.mjs --init
```

Das Skript kopiert `.env.example` nach `.env` und erzeugt einmal einen zufälligen Verschlüsselungsschlüssel. Eine vorhandene `.env` samt Schlüssel wird niemals überschrieben. Sichere den Schlüssel separat; er schützt bestehende Verbindungen. Die Datei wird nicht committed oder ins Plugin aufgenommen. Neue Dateien verwenden unter Linux Modus 0600; unter Windows passende Dateizugriffsrechte setzen.

## 3. Eigene Einstellungen eintragen

Öffne `.env` im Editor. Ersetze alle Beispielhosts durch eigene Adressen. Das Skript verweigert einen Installationsbuild mit Beispieladressen.

| Einstellung                                                    | Bedeutung                                                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                                                   | Öffentliche HTTPS-Origin des MCP-Dienstes ohne Pfad.                                                           |
| `PORT`                                                         | Host-Port für Docker bzw. Port im nativen Betrieb. Docker nutzt intern 3000.                                   |
| `ENCRYPTION_KEY`                                               | Generierter 64-stelliger Hex-Schlüssel; bei Updates beibehalten.                                               |
| `OAUTH_ISSUER`                                                 | Exakter Issuer deines OAuth-Anbieters.                                                                         |
| `OAUTH_AUDIENCE`                                               | Ausgestellte Audience, gewöhnlich `PUBLIC_URL` plus `/mcp`.                                                    |
| `OAUTH_JWKS_URL`, `OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL` | HTTPS-Endpunkte aus der Anbieter-Discovery.                                                                    |
| `PORTAL_CLIENT_ID`                                             | Registrierter öffentlicher Portal-Client; Callback `PUBLIC_URL/callback`.                                      |
| `MCP_CLIENT_ID`                                                | Registrierter öffentlicher ChatGPT-/Codex-OAuth-Client; wird ins Plugin gebaut.                                |
| `GITEA_INSTANCES`                                              | JSON-Liste eigener Gitea-Server; keiner ist fest vorgegeben.                                                   |
| `ALLOW_USER_SERVERS`                                           | Standard `false`: Server hier konfigurieren. Optional `true` erlaubt zusätzliche öffentliche Server im Portal. |
| `ALLOWED_PRIVATE_CIDRS`                                        | Bei Bedarf kleinste Netzbereiche für konfigurierte interne Server, sonst leer.                                 |
| `REQUIRE_WRITE_APPROVAL`                                       | Standard `false`: Schreibaufträge laufen ohne Browserfreigabe. `true` verlangt eine exakte Einmalfreigabe.     |
| `DATABASE_PATH`                                                | Im Container beim Standard `data/gitea.sqlite` belassen.                                                       |

Beispiel für deine Serverliste, Platzhalter ersetzen:

```dotenv
GITEA_INSTANCES=[{"id":"mein-server","url":"https://DEIN-GITEA-HOST"}]
ALLOW_USER_SERVERS=false
REQUIRE_WRITE_APPROVAL=false
```

Weitere Server sind zusätzliche Objekte im Array. Standardmäßig muss mindestens ein tatsächlicher Server eingetragen werden. Für Gitea-OAuth kann das Instanzobjekt zusätzlich `oauthClientId`, `oauthClientSecret` und explizite `oauthScopes` enthalten; Secrets bleiben lokal. Alternativ ein eng berechtigtes Gitea-PAT später im geschützten Portal eingeben, niemals im Chat. `MCP_CLIENT_ID` und `PORTAL_CLIENT_ID` sind unterschiedliche Clients.

## 4. Prüfen, bauen und starten

```bash
node scripts/install.mjs --check
node scripts/install.mjs --start
```

Dies funktioniert in PowerShell, Linux und macOS. Der erste Aufruf prüft die Installationswerte ohne Build. Der zweite installiert die gesperrten Dependencies, baut TypeScript, validiert die vollständige Serverkonfiguration, erzeugt das Plugin mit deinem konkreten Endpunkt und deiner OAuth-Client-ID, baut das Docker-Image lokal und startet Compose mit Health-Prüfung. Es wird kein Release oder GHCR-Image benötigt.

Nur bauen: `node scripts/install.mjs`; dabei wird der laufende Container nicht ersetzt. Ohne Docker: `node scripts/install.mjs --no-docker`, anschließend mit eigener Prozessüberwachung `pnpm start`. Auch der native Start nutzt `NODE_ENV=production`. Eine andere Konfigurationsdatei ist mit `--config PFAD` möglich; sie wird auch beim Compose-Start verwendet.

Ergebnisse unter `artifacts/`:

- `gitea-chatgpt-plugin-VERSION.zip`: konkretes portables Plugin ohne Secrets.
- `chatgpt-connection.json`: öffentliche ChatGPT-Verbindungsdaten inklusive URL und OAuth-Client-ID.
- `gitea-deployment-VERSION.zip`: lokal erzeugtes Quell-/Installationspaket mit Skripten, Beispielkonfiguration und Dokumentation.
- `SHA256SUMS`: Prüfsummen der lokal erzeugten ZIPs.

## 5. HTTPS und Gitea-Konto

Richte den HTTPS-Proxy zum Dienst ein, erhalte Host und Authorization-Header und deaktiviere Proxybuffering für MCP. Der Host-Port ist standardmäßig nur an Loopback gebunden. Bei einem separaten Proxy-Container verwende ein gemeinsames privates Docker-Netz und den Dienstnamen `mcp`; dessen Loopback ist nicht der Serverhost.

Prüfe `docker compose ps` und `curl --fail http://127.0.0.1:3000/healthz`, Port ggf. anpassen. Öffne `PUBLIC_URL/portal`, melde dich an und verbinde dein Konto auf einem konfigurierten Gitea-Server. Tokens ausschließlich dort eingeben. Gitea-OAuth ist verfügbar, wenn auf dieser Instanz registriert und konfiguriert. Das Portal ersetzt keine lokale Serverkonfiguration.

## 6. In ChatGPT installieren

Unter **Plugins → + → Add custom MCP server** die tatsächlichen Werte aus `artifacts/chatgpt-connection.json` übernehmen: Server-URL mit `/mcp`, OAuth und die registrierte Client-ID. Falls verlangt, Authorization-/Token-URL übernehmen. Beim Anbieter exakt den von ChatGPT angezeigten Callback registrieren. Plugin erstellen und installieren, dann in einem neuen Work-Chat mit `@` auswählen. Konto- und Workspace-Richtlinien gelten. [Offizielle OpenAI-Anleitung](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Das ZIP ist für Clients und Authoring-/Importwege mit Unterstützung portabler Agent-Plugins gedacht. Diese Anleitung behauptet keinen allgemeinen ZIP-Upload-Knopf in ChatGPT. Codex kann alternativ seine unterstützte MCP-Konfiguration mit dem konkreten Endpunkt und OAuth verwenden. Ein GitHub-Repository oder ZIP bedeutet keine Freigabe im offiziellen Plugin-Verzeichnis.

Prüfe `list_instances`, `connection_status` und `list_repositories`. Schreibaufträge werden standardmäßig direkt ausgeführt; mit `REQUIRE_WRITE_APPROVAL=true` benötigen sie die separate Freigabe der konkreten Aktion im Browser. Die tatsächliche Installation in deinem ChatGPT-Konto ist projektseitig noch nicht verifiziert.

## 7. Änderungen und Updates

Bearbeite `.env` außerhalb von ChatGPT und führe erneut `node scripts/install.mjs --start` aus. Das baut Server und Plugin neu, ersetzt den Container zwingend (`--force-recreate`) und prüft anschließend Image, Build-Commit, Healthcheck und den effektiven Freigabemodus. `docker compose restart` übernimmt geänderte `.env`-Werte nicht. Den laufenden Stand ohne Änderungen prüft `node scripts/install.mjs --status`. Bei geänderter MCP-URL oder OAuth-Client-ID auch die ChatGPT-Verbindung aktualisieren bzw. das Paket erneut installieren. Datenvolume und Schlüssel beibehalten. Vor Code-/Datenbankupdates Dienst stoppen und Volume samt Schlüssel konsistent sichern. Niemals `docker compose down -v` als Update verwenden.

Für Code-Updates `node scripts/install.mjs --update` ausführen: Es verlangt einen sauberen Checkout, führt `git pull --ff-only` aus und danach `--start`. Details, Rollback und Diagnose von `approval_required`: [Schreibfreigabe betreiben und prüfen](SCHREIBFREIGABE.md). Bei Problemen vorherigen Commit und passendes Datenbankbackup verwenden. CI/Security prüfen weiterhin Quellcode und lokale Artefakte; Release- und Publish-Workflows wurden entfernt.
