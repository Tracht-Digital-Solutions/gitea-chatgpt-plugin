# Schreibfreigabe (`REQUIRE_WRITE_APPROVAL`) betreiben und prüfen

[English](../en/WRITE-APPROVAL.md) · Stand: 22.10.2026

## 1. Die beiden Modi

| `REQUIRE_WRITE_APPROVAL` | Verhalten                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (Standard)       | Schreibwerkzeuge wie `create_issue` oder `create_project` werden sofort ausgeführt. Es wird keine Freigabe angelegt oder verbraucht, und es gibt keine `approval_required`-Antwort.                     |
| `true`                   | Der erste Aufruf liefert `approval_required` mit `approvalUrl`. Der Kontoinhaber prüft im Browser die exakte Änderung und gibt sie frei. Danach wird der identische Aufruf mit `approvalId` wiederholt. |

Fehlt die Variable, gilt `false`. Ungültige Werte wie `TRUE`, `yes`, `1` oder ein leerer Wert verhindern den Start des Servers und das Installationsskript bricht ab. Es wird nie ein Modus geraten.

## 2. Sicherheitsunterschiede

Unabhängig vom Modus bleiben aktiv: OAuth-Tokenprüfung (Signatur, Issuer, Audience, Ablauf), der Scope `gitea.write` für jede Schreibaktion, die Gitea-Rechte des verbundenen Kontos, Rate Limits, Mandantentrennung, Feature-Branch-Pflicht und Prüfung geschützter Branches bei Dateiänderungen, `content_version` bei Issue-Änderungen, die Prüfung des aktuellen und mergebaren PR-Heads beim Merge sowie das Audit-Log.

Nur mit `true` kommt eine zweite, unabhängige Kontrolle hinzu. Ein Mensch sieht die exakte Payload, die Freigabe gilt einmalig und zehn Minuten lang, und sie ist an Benutzer, Verbindung, Werkzeug und Payload gebunden. Bei `false` kann ein autorisierter ChatGPT-Client, etwa nach einer Prompt-Injection aus Repository-Inhalten, Änderungen ohne diese Rückfrage ausführen. Für Repositories mit hohem Schutzbedarf `true` verwenden und Gitea-Tokens eng berechtigen.

## 3. Konfiguration

In der `.env`, die das Installationsskript verwendet (Standard: `.env` im Projektordner, sonst der Pfad aus `--config`):

```dotenv
REQUIRE_WRITE_APPROVAL=false
```

Docker Compose liest dieselbe Datei über `env_file: ${GITEA_ENV_FILE:-.env}`. `docker-compose.yml` überschreibt die Variable nicht. Wer eine andere Datei nutzt, muss sie immer mit `--config PFAD` angeben. Eine geänderte `.env` wirkt erst, wenn der Container **neu erstellt** wird. `docker compose restart` reicht dafür nicht.

## 4. Aktualisieren und Neustarten

Bereits installierte Instanz auf den aktuellen Stand bringen (Git-Checkout, keine lokalen Änderungen an versionierten Dateien):

```bash
cd /pfad/zu/gitea-chatgpt-plugin
node scripts/install.mjs --update          # ggf. --config /pfad/zur/.env
```

`--update` führt `git pull --ff-only` aus und startet danach das frisch geladene Skript mit `--start`. `--start` baut Server, Plugin und Docker-Image. Schlägt der Build fehl, bricht es ab, und der laufende Container bleibt unverändert. Anschließend ersetzt `docker compose up -d --no-build --force-recreate --wait` den Container, und die Prüfung aus Abschnitt 5 läuft. Bei einer Abweichung endet das Skript mit Exit-Code 1.

Nur die `.env` geändert: `node scripts/install.mjs --start`.

Datenvolume `gitea-mcp-data`, `.env` und `ENCRYPTION_KEY` bleiben erhalten. Niemals `docker compose down -v` verwenden. Das vorherige Image wird als `gitea-chatgpt-plugin:previous` aufbewahrt. Rollback:

```bash
docker tag gitea-chatgpt-plugin:previous gitea-chatgpt-plugin:local
docker compose up -d --no-build --force-recreate --wait
```

Nur `node scripts/install.mjs` ohne `--start` baut lediglich das Image und ersetzt den laufenden Container **nicht**. Das Skript weist darauf hin. Dank `pull_policy: build` baut auch ein manuelles `docker compose up -d` stets aus dem aktuellen Quellstand. Ohne das Skript bleibt der Build-Commit dabei allerdings `unknown`.

## 5. Effektiven Modus nachweisen

Auf dem Server, ohne Änderungen:

```bash
node scripts/install.mjs --status
docker compose logs mcp | grep "Gitea MCP server ready"
```

Erwartete Startmeldung:

```text
Gitea MCP server ready: version=0.4.0 commit=<Git-SHA> writeApproval=disabled mode=production
```

`--status` prüft und gibt aus: das laufende Image entspricht dem zuletzt gebauten, das Image-Label `org.opencontainers.image.revision` entspricht `git rev-parse HEAD`, der Healthcheck meldet `healthy` und der Modus der Startmeldung entspricht der `.env`. Zusätzlich warnt es vor weiteren laufenden Gitea-MCP-Containern, etwa aus einem anderen Compose-Projekt oder einem früheren `docker run`. Es werden keine Konfigurationswerte oder Secrets ausgegeben.

In ChatGPT: das Werkzeug `get_runtime_status` aufrufen. Es erfordert eine gültige OAuth-Anmeldung mit `gitea.read` und liefert keine Tokens oder Secrets:

```json
{
  "mcpVersion": "0.4.0",
  "buildCommit": "<Git-SHA>",
  "writeApprovalRequired": false,
  "approvalMode": "direct",
  "deploymentMode": "production",
  "configurationLoaded": true
}
```

Stimmt `buildCommit` nicht mit dem erwarteten Commit überein, antwortet ein veralteter Container oder eine andere Instanz. Der öffentliche Endpunkt `/healthz` liefert bewusst nur `{"status":"ok"}`.

## 6. Diagnose bei `approval_required` trotz `false`

Eine `approval_required`-Antwort mit `approvalId` erzeugt immer der Server, nicht ChatGPT. Ab diesem Stand gibt es sie nur bei `requireWriteApproval=true`. Antwortet die Instanz mit `false`, stammt die Antwort also von einem anderen Prozess. Vorgehen:

1. `get_runtime_status` in ChatGPT aufrufen. Ist das Werkzeug unbekannt, läuft eine ältere Version, oder ChatGPT nutzt alte Toolmetadaten (siehe 7).
2. `writeApprovalRequired: true`: Die Instanz hat `true` geladen. Die verwendete `.env` beziehungsweise `--config` prüfen und `node scripts/install.mjs --start` ausführen.
3. `writeApprovalRequired: false`, aber weiterhin `approval_required`: Eine andere Instanz beantwortet Anfragen. `node scripts/install.mjs --status` zeigt weitere Container. Im Nginx Proxy Manager prüfen, ob Forward Host/Port auf genau diesen Container zeigt (bei gemeinsamem Docker-Netz den Dienstnamen `mcp`, sonst den Host-Port aus `PORT`). Veraltete Container stoppen.
4. `buildCommit` weicht von `git rev-parse HEAD` ab: Das Update wurde nicht angewendet. `node scripts/install.mjs --update` ausführen.
5. Startmeldung ohne `writeApproval=`: Das Image ist älter als diese Version und muss neu gebaut werden.

## 7. Toolmetadaten in ChatGPT aktualisieren

ChatGPT speichert die Werkzeugliste einer Verbindung zwischen. Die Beschreibungen der Schreibwerkzeuge hängen vom Modus ab: Bei `false` enden sie mit „Runs immediately without browser approval“, bei `true` mit „Browser approval is required …“, und nur bei `true` gibt es den Parameter `approvalId`. Nach einem Moduswechsel, einem Update mit neuen Werkzeugen oder wenn `get_runtime_status` fehlt, in ChatGPT die App- bzw. Connector-Einstellungen öffnen, die Werkzeugliste aktualisieren (Refresh) oder die Verbindung trennen und neu verbinden. Danach einen neuen Chat beginnen, weil ältere Chats bisherige Beschreibungen und Antworten im Kontext behalten. Die Serverantwort hängt nie von den zwischengespeicherten Metadaten ab.

## 8. Zurück zum Freigabemodus

```bash
sed -i 's/^REQUIRE_WRITE_APPROVAL=.*/REQUIRE_WRITE_APPROVAL=true/' .env
node scripts/install.mjs --start
node scripts/install.mjs --status   # erwartet: writeApproval=required
```

Danach die Toolmetadaten in ChatGPT aktualisieren (Abschnitt 7). Bestehende Freigaben bleiben einmalig und laufen nach zehn Minuten ab.

## 9. Schritt für Schritt für den Serverbetreiber

1. Per SSH auf den Server, in den Projektordner wechseln und `git status` prüfen (keine lokalen Änderungen).
2. In der verwendeten `.env` `REQUIRE_WRITE_APPROVAL=false` setzen bzw. prüfen. Bei abweichendem Pfad überall `--config` angeben.
3. `node scripts/install.mjs --update` ausführen und auf „Deployment-Prüfung erfolgreich, Schreibfreigabe: disabled“ achten.
4. Bei einer Warnung zu weiteren Containern prüfen, welchen davon Nginx Proxy Manager anspricht, und veraltete Container mit `docker stop <name>` beenden. Ihre Volumes nicht löschen.
5. `curl -fsS https://<mcp-host>/healthz` muss `{"status":"ok"}` liefern.
6. In ChatGPT die Toolliste aktualisieren und einen neuen Chat beginnen.
7. `get_runtime_status` aufrufen und `buildCommit` mit `git rev-parse HEAD` sowie `writeApprovalRequired: false` vergleichen.
8. In einem eigenen Testrepository eine harmlose Schreibaktion ausführen, etwa ein Testprojekt anlegen, und prüfen, dass keine `approval_required`-Antwort kommt.
