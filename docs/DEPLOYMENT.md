# Deployment und Betrieb

[English deployment guide](en/DEPLOYMENT.md).

Für die Ersteinrichtung: [vollständige Schritt-für-Schritt-Anleitung](de/SCHRITT-FUER-SCHRITT.md) mit konkreten Kontrollpunkten vom Server bis zum ersten Schreibauftrag.

## 1. DNS, HTTPS und OAuth vorbereiten

Zwei eigene HTTPS-Adressen bereitstellen: z. B. `mcp.example.org` für diesen Server und `auth.example.org` für einen OAuth/OIDC-Anbieter. Beispielnamen sind keine bereitgestellten Dienste. Gitea kann unabhängig davon auf einem dritten Host laufen. Ein vorhandener Anbieter ist verwendbar, sofern er Authorization Code mit S256-PKCE, Discovery, JWT-Zugangstokens mit passender Audience und Scopes unterstützt. Keycloak ist eine kostenlose selbst hostbare Möglichkeit; [offizielle Containeranleitung](https://www.keycloak.org/server/containers).

Im Anbieter zwei Clients registrieren:

| Einstellung  | MCP-Client                                                              | Portal-Client                             |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------- |
| Client-ID    | `gitea-chatgpt`                                                         | `gitea-portal`                            |
| Typ          | öffentlich, Authorization Code, PKCE S256                               | öffentlich, Authorization Code, PKCE S256 |
| Redirect URI | exakte Callback-Adresse aus der tatsächlichen ChatGPT-/Codex-Verbindung | `https://<mcp-host>/callback`             |
| Scopes       | `gitea.read`, optional `gitea.write`                                    | `openid gitea.read gitea.write`           |
| Audience     | `https://<mcp-host>/mcp`                                                | `https://<mcp-host>/mcp`                  |

Keine Wildcard-Redirects. Kein Implicit Flow oder Password Grant. Consent für die angebotenen Scopes aktivieren. Login-Registrierung nur entsprechend der eigenen Benutzerverwaltung. JWT-Signaturalgorithmus RS256 oder ES256. Zugriffstokens kurzlebig (empfohlen fünf Minuten). Der Anbieter verwaltet Client-Refresh-Tokens und widerrufene Grants.

Bei Keycloak: Realm erstellen, zwei OIDC-Clients mit Standard Flow und PKCE S256 konfigurieren. Zwei Client Scopes `gitea.read`/`gitea.write` mit „Include in token scope“ anlegen und den Clients zuweisen. Einen Audience-Protocol-Mapper mit „Included Custom Audience“ = vollständiger MCP-Identifier und „Add to access token“ aktivieren. `gitea.read` als Default Scope, `gitea.write` als optionalen Scope beziehungsweise Portal-Default konfigurieren; tatsächliche Scope-Freigabe über Client-/Benutzerrichtlinien begrenzen. JWKS-, Token- und Authorization-URL stehen in der Realm-Discovery unter `https://<auth-host>/realms/<realm>/.well-known/openid-configuration`. Ein funktionierender Login allein beweist noch keine korrekte Token-Audience.

## 2. Konfiguration

`.env.example` nach `.env` kopieren. `ENCRYPTION_KEY` einmal zufällig erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Schlüssel sicher verwahren; ohne ihn sind vorhandene Verbindungen nicht wiederherstellbar. Die Datei nie committen, Zugriffsrechte auf den Betreiber beschränken. `PUBLIC_URL` ist eine reine HTTPS-Origin ohne Pfad. `OAUTH_AUDIENCE` ist derselbe Resource-Identifier, den der Anbieter in Zugangstokens ausstellt, gewöhnlich `PUBLIC_URL` plus `/mcp`. `OAUTH_ISSUER` muss exakt mit `iss` übereinstimmen. Discovery-URLs aus der Anbieter-Discovery übernehmen.

```dotenv
GITEA_INSTANCES=[{"id":"work","url":"https://git.example.org"},{"id":"personal","url":"https://code.example.net/gitea"}]
```

Standardmäßig gilt `ALLOW_USER_SERVERS=false`: Server in der lokalen `.env` konfigurieren und das Installationsskript erneut ausführen. ChatGPT kann diese Einstellungen nicht ändern. Optional erlaubt `true` zusätzliche öffentliche Server im Portal. Für interne Instanzen einen festen Eintrag und den kleinsten nötigen Bereich unter `ALLOWED_PRIVATE_CIDRS` angeben, z. B. `10.20.30.4/32`. Diese Ausnahmen gelten nie für frei eingegebene Nutzer-URLs.

Optional je Gitea-Instanz OAuth-App in Gitea registrieren, Callback `https://<mcp-host>/gitea/callback`, S256-PKCE, Client-ID und ggf. Secret ausschließlich in Betreiber-Secrets unter `oauthClientId`/`oauthClientSecret` der jeweiligen Instanz eintragen. Die Portal-Scopes müssen von der installierten Gitea-Version unterstützt werden. Andernfalls PAT mit `read:user`, `read:repository`, `read:issue` und nur bei Bedarf `write:repository`, `write:issue`, `write:user` für die jeweilige Aufgabe verwenden. Organisations-/Packagerechte nur für diese Aufgaben ergänzen: `write:organization`, `write:package`. Für Gitea-OAuth kann das Instanzobjekt explizite `oauthScopes` enthalten; die Vorgabe wird nicht automatisch erweitert. Nach Änderung im Portal neu verbinden. Siehe [Parameterprüfung und Scope-Beispiel](de/PARAMETER-UND-FUNKTIONSPRUEFUNG.md). Keine Admin-/Runnerrechte pauschal erteilen. Ein zu enger Scope führt zu einer sicheren Gitea-Verweigerung.

## 3. Docker Compose

Verwende die [skriptgesteuerte Installation](de/INSTALLATION.md). Der Standard-Compose baut das Produktionsimage lokal. Release-Downloads und vorgebaute GHCR-Images sind nicht erforderlich.

```bash
node scripts/install.mjs --start
docker compose ps
docker compose logs --tail=50 mcp
curl http://127.0.0.1:3000/healthz
```

Der Dienst läuft ohne Root, mit schreibgeschütztem Dateisystem und einem eigenen Datenvolume. Port 3000 wird standardmäßig nur an Loopback gebunden. Öffentlich ausschließlich den HTTPS-Reverse-Proxy anbieten. `DATABASE_PATH` im Container bei `/app/data/gitea.sqlite` beziehungsweise dem Standard `data/gitea.sqlite` belassen.

## 4. Reverse Proxy / Nginx Proxy Manager

Proxy Host für die MCP-Domain anlegen, Forward Scheme `http`, Host der Servermaschine, Port 3000, gültiges TLS-Zertifikat, „Force SSL“ aktivieren. Beim Betrieb des Proxy in einem anderen Container erreicht er **nicht** den Host über sein eigenes `127.0.0.1`. Beide Dienste in ein gemeinsames privates Docker-Netz aufnehmen und Forward Host `mcp` verwenden; dann die Host-Portfreigabe weglassen. Proxybuffering für `/mcp` deaktivieren. HTTP-Host beibehalten, Authorization und MCP-Header weiterleiten. Kein Basic-Auth-Vorsatz vor MCP; OAuth ist die Benutzergrenze.

Beispiel für eine gewöhnliche Nginx-Location:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Authorization $http_authorization;
    proxy_buffering off;
    proxy_read_timeout 60s;
}
```

Health, Portal, Callback und `/.well-known/oauth-protected-resource/mcp` gehören zum selben Host. Keine Pfadumschreibung und kein abweichender Hostheader. Der Server vertraut nicht ungeprüft `X-Forwarded-Host`. Für Browserlogin sind Secure-Cookies erforderlich; ein öffentliches HTTP-Portal funktioniert absichtlich nicht.

## 5. Lokal entwickeln und testen

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
docker build -t gitea-chatgpt-plugin:dev .
pnpm test:docker
pnpm dev
```

Die Anwendung lädt Umgebungsvariablen; für lokale `.env`-Dateien z. B. `node --env-file=.env --import tsx apps/mcp-server/src/index.ts` verwenden. Auch lokale Browserprüfung benötigt einen vertrauenswürdigen HTTPS-Proxy und passende OAuth-Callbacks. Testinjektionen mit HTTP-Loopback existieren ausschließlich in Testcode, nicht als Produktionsschalter.

## 6. Verbindung prüfen

Discovery per HTTPS abrufen, dann MCP Inspector oder kompatiblen Client mit OAuth und passender Audience verbinden. `list_instances` ausführen, `/portal` im Browser öffnen, Gitea verbinden, `connection_status`, `list_repositories` und `read_file` testen. Einen Schreibauftrag in einem eigenen Testrepository vorbereiten, Payload im Portal prüfen und freigeben, denselben Tool-Aufruf mit `approvalId` wiederholen. Ein zweiter Aufruf muss Replay verweigern. Keine Tests gegen fremde echte Repositories ausführen.

## 7. Updates, Backup, Rollback

Commit-ID des eigenen Builds festhalten. Vor Update Dienst stoppen und das gesamte Datenvolume inklusive SQLite-WAL konsistent sichern; Schlüssel separat sichern. Quellcode aktualisieren, `.env` beibehalten und `node scripts/install.mjs --start` ausführen. Bei Problemen vorherigen Quellstand bauen und das passende Datenbankbackup verwenden. Niemals `docker compose down -v` als Updatebefehl verwenden.

Prozessneustart beendet Browsersitzungen. Nach Verlust des Verschlüsselungsschlüssels müssen Benutzer alle Gitea-Verbindungen neu einrichten. Schlüsselrotation erfolgt in v0.1 durch kontrollierte Neuverbindung mit neuer Datenbank; eine automatische Re-Encryption-Migration wird noch nicht angeboten. Auditaufbewahrung und verschlüsselte Backups sind Betreiberaufgaben.
