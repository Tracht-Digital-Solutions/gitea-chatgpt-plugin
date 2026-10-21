# Schritt für Schritt: installieren, einrichten und testen

[English](../en/STEP-BY-STEP.md) · Stand: 21.10.2026 · Software: v0.3.1.

Diese Anleitung führt vom eigenen Server bis zum ersten freigegebenen Schreibauftrag. Die Befehle verwenden eine Linux-Shell. Es wird kein öffentlicher MCP-Dienst bereitgestellt. HTTPS-Deployment und die Verbindung in deinem tatsächlichen ChatGPT-/Codex-Konto sind noch nicht projektseitig verifiziert; die nachfolgenden Kontrollpunkte sind von dir auf deinem System auszuführen.

## 1. Voraussetzungen und eigene Adressen festlegen

Du benötigst:

- Einen eigenen Server mit Docker Engine, Docker Compose und Git.
- Eine Gitea-Instanz mit einem Benutzer, der auf ein eigenes Testrepository zugreifen darf.
- Einen eingerichteten HTTPS-Reverse-Proxy mit gültigem Zertifikat.
- Einen erreichbaren OAuth/OIDC-Anbieter. Die folgenden Einrichtungsschritte verwenden Keycloak.

Falls Keycloak noch nicht läuft, richte zuerst einen dauerhaften Produktionsbetrieb nach der [offiziellen Containeranleitung](https://www.keycloak.org/server/containers) und der [Reverse-Proxy-Anleitung](https://www.keycloak.org/server/reverseproxy) ein. Ein kurzlebiger Entwicklungsserver mit `start-dev` ist kein Ersatz für dieses Produktionssetup. Keycloak, seine Datenbank und der Proxy sind eigenständige Infrastruktur und werden durch das MCP-Compose nicht mitinstalliert. Bei einem vorhandenen passenden OAuth-Anbieter brauchst du keinen zusätzlichen Keycloak.

Ersetze die folgenden **Beispieladressen überall konsistent**:

| Zweck            | Beispiel für diese Anleitung |
| ---------------- | ---------------------------- |
| MCP und Portal   | `https://mcp.example.org`    |
| Keycloak         | `https://auth.example.org`   |
| Gitea            | `https://git.example.org`    |
| Keycloak-Realm   | `gitea`                      |
| Gitea-Instanz-ID | `work`                       |

Lege DNS-Einträge und Zertifikate für deine tatsächlichen Hosts an. Ein öffentliches ChatGPT-Setup muss den MCP-Host über HTTPS erreichen können; Gitea selbst muss für den MCP-Server erreichbar sein.

## 2. Repository holen und den geprüften Stand auswählen

```bash
git clone https://github.com/jtracht/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
git switch --detach v0.3.1
docker version
docker compose version
```

**Kontrolle:** Docker erreicht seine Engine und Compose zeigt eine Version. Die Installation verwendet den unveränderlichen Release-Tag; diese Anleitung selbst ist zusätzlich im aktuellen Hauptbranch verfügbar.

## 3. Einen Keycloak-Realm und einen Benutzer erstellen

1. Öffne die Keycloak-Administrationsoberfläche auf deinem Authentifizierungshost.
2. Wähle **Create realm** und lege den Realm `gitea` an. Verwende einen eigenen Anwendungsrealm.
3. Lege unter **Users → Add user** deinen Benutzer an.
4. Setze unter **Credentials** ein eigenes Passwort; wähle die für deinen Betrieb passenden Anmelde- und MFA-Regeln.
5. Verwende RS256 oder ES256 als JWT-Signaturalgorithmus. Setze die Access-Token-Lebensdauer beispielsweise auf fünf Minuten.

Öffne anschließend:

```text
https://auth.example.org/realms/gitea/.well-known/openid-configuration
```

**Kontrolle:** Die Antwort enthält `issuer`, `authorization_endpoint`, `token_endpoint` und `jwks_uri`. Übernimm später die tatsächlichen Werte; der Issuer muss exakt stimmen.

## 4. Die zwei MCP-Scopes und die Audience einrichten

Diese Scopes gehören zum MCP-Zugang und sind von den späteren Gitea-Tokenrechten unabhängig.

1. Erstelle unter **Client scopes** die beiden OIDC-Scopes `gitea.read` und `gitea.write`.
2. Aktiviere bei beiden **Include in token scope** und beschreibe sie im Consent-Dialog verständlich.
3. Füge dem Scope `gitea.read` einen **Audience**-Protocol-Mapper hinzu, etwa über **Mappers → Configure a new mapper → Audience**.
4. Setze **Included Custom Audience** auf `https://mcp.example.org/mcp` und aktiviere **Add to access token**. Der Mapper muss auch für den Portal-Client wirksam sein.
5. Begrenze die Vergabe von `gitea.write` über die Benutzer-/Clientrichtlinien deines Anbieters auf berechtigte Benutzer. Ein selbst definierter Scope-Name allein ist keine Zugriffsbeschränkung.

**Kontrolle:** Ein Zugangstoken für diese Anwendung muss im `aud`-Feld den vollständigen MCP-Identifier und im `scope`-Feld die tatsächlich freigegebenen Scopes enthalten. Prüfe das bei Bedarf über Keycloaks **Client scopes → Evaluate**. Verwende keinen externen JWT-Dekodierdienst für echte Tokens.

## 5. Portal-Client registrieren

Lege unter **Clients → Create client** einen OIDC-Client mit folgenden Einstellungen an:

| Einstellung                          | Wert                                     |
| ------------------------------------ | ---------------------------------------- |
| Client ID                            | `gitea-portal`                           |
| Client authentication                | aus, öffentlicher Client                 |
| Standard Flow                        | an                                       |
| Implicit Flow / Direct Access Grants | aus                                      |
| PKCE Code Challenge Method           | `S256`, verpflichtend                    |
| Valid redirect URIs                  | exakt `https://mcp.example.org/callback` |
| Zugewiesene Scopes                   | `gitea.read` und `gitea.write`           |

Aktiviere Consent passend zu deinem Betrieb. Das Portal fordert `openid gitea.read gitea.write` an. Der Browser benötigt beide Gitea-MCP-Scopes für Einrichtung und Schreibfreigaben. Der Audience-Mapper aus Schritt 4 muss auf diesen Client angewendet werden. Es wird kein Portal-Client-Secret benötigt.

## 6. ChatGPT-Client vorbereiten

Registriere einen zweiten öffentlichen OIDC-Client `gitea-chatgpt`, ebenfalls mit Standard Flow, verpflichtendem S256-PKCE und deaktiviertem Implicit/Password Flow. Weise `gitea.read` standardmäßig und `gitea.write` optional für berechtigte Benutzer zu; wende denselben Audience-Mapper an.

Die Redirect URI trägst du **erst anhand der tatsächlich angezeigten Callback-Adresse deiner ChatGPT-Verbindung** ein. Erfinde keine Callback-URL und verwende keinen Wildcard-Redirect. Für einen separaten Codex-Client können eine eigene Registrierung und dessen tatsächlicher Callback erforderlich sein.

## 7. `.env` erstellen und ausfüllen

Die mitgelieferte Konfiguration enthält keinen Gitea-Server: `GITEA_INSTANCES=[]`. Trage im folgenden Beispiel die HTTPS-Adresse deines eigenen Gitea-Servers ein. Die Beispielhosts in dieser Anleitung sind ausschließlich zu ersetzende Platzhalter und werden nicht automatisch verbunden. Bei leerer Liste startet der Dienst mit einem Einrichtungshinweis im Portal.

```bash
umask 077
cp .env.example .env
docker run --rm node:24-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Den erzeugten 64-stelligen Hex-Schlüssel in `ENCRYPTION_KEY` eintragen und separat sicher sichern. Dafür ist keine lokale Node-Installation erforderlich. Niemals echte Tokens oder diesen Schlüssel im Chat oder in Git veröffentlichen.

Bearbeite `.env` mit deinen tatsächlichen Werten:

```dotenv
ENCRYPTION_KEY=HIER_DEN_LOKAL_ERZEUGTEN_64_STELLIGEN_HEX_SCHLUESSEL_EINTRAGEN
PUBLIC_URL=https://mcp.example.org
PORT=3000
DATABASE_PATH=data/gitea.sqlite
OAUTH_ISSUER=https://auth.example.org/realms/gitea
OAUTH_AUDIENCE=https://mcp.example.org/mcp
OAUTH_JWKS_URL=https://auth.example.org/realms/gitea/protocol/openid-connect/certs
OAUTH_AUTHORIZATION_URL=https://auth.example.org/realms/gitea/protocol/openid-connect/auth
OAUTH_TOKEN_URL=https://auth.example.org/realms/gitea/protocol/openid-connect/token
PORTAL_CLIENT_ID=gitea-portal
GITEA_INSTANCES=[{"id":"work","url":"https://git.example.org"}]
ALLOWED_PRIVATE_CIDRS=
```

Der Schlüsselplatzhalter ist absichtlich ungültig und muss ersetzt werden. Vergleiche die vier OAuth-Adressen mit Schritt 3. `PUBLIC_URL` enthält keinen Pfad; die Audience enthält `/mcp`. Mehrere erlaubte Instanzen lassen sich als weitere Objekte im JSON-Array eintragen. Benutzer verbinden anschließend ihre eigenen Konten mit diesen Instanzen.

Bei einer absichtlich internen Gitea-Instanz muss der Betreiber zusätzlich ausschließlich den benötigten IP-Bereich erlauben, z. B. `10.20.30.4/32`. Ohne diese Ausnahme sind private Adressen gesperrt. Details: [Sicherheitsmodell](../SECURITY.md).

## 8. MCP-Server starten

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 mcp
curl --fail http://127.0.0.1:3000/healthz
```

**Erwartung:** Der Container läuft, und Health liefert `{"status":"ok"}`. Dieses Health-Ergebnis prüft den Prozess und die Datenbank; es beweist noch keinen funktionierenden OAuth- oder Gitea-Zugang.

Der Container speichert Verbindungen im benannten Volume `gitea-mcp-data`. Der Host-Port ist standardmäßig nur unter `127.0.0.1:3000` erreichbar. Lösche das Volume nicht bei Updates.

## 9. HTTPS-Reverse-Proxy einrichten

Bei Nginx auf demselben Host leite die MCP-Domain auf `http://127.0.0.1:3000` weiter. Verwende ein gültiges Zertifikat, erhalte den originalen Host sowie Authorization-/MCP-Header, deaktiviere Buffering und leite alle Pfade einschließlich Portal, Callback und Discovery weiter. Ein Konfigurationsbeispiel steht unter [Deployment → Reverse Proxy](../DEPLOYMENT.md#4-reverse-proxy--nginx-proxy-manager).

Für **Nginx Proxy Manager in Docker**:

1. Ermittle das bestehende Docker-Netz des Proxy-Managers; verwende dessen tatsächlichen Netzwerknamen.
2. Verbinde den MCP-Dienst dauerhaft über Compose mit diesem privaten Netz. Dazu `networks: [proxy]` unter `services.mcp` und auf oberster Ebene Folgendes ergänzen; `DEIN_BESTEHENDES_PROXY_NETZ` ersetzen:

   ```yaml
   networks:
     proxy:
       external: true
       name: DEIN_BESTEHENDES_PROXY_NETZ
   ```

3. Starte `docker compose up -d --build` erneut.
4. Lege einen **Proxy Host** mit deiner MCP-Domain an: Forward Scheme `http`, Forward Hostname `mcp`, Port `3000`.
5. Aktiviere ein gültiges SSL-Zertifikat und **Force SSL**, erhalte den Hostheader und deaktiviere Proxybuffering für MCP. Setze keine zusätzliche Basic-Auth-Sperre vor den MCP-Endpunkt.

Das eigene `127.0.0.1` im Proxy-Container erreicht den MCP-Container nicht. Wenn in dem Proxy-Netz schon ein Dienst `mcp` existiert, verwende einen eindeutigen Netzwerkalias und diesen im Proxy. Das Proxy-Netz darf nur vertrauenswürdige Dienste enthalten.

**Kontrolle von einem externen Rechner:**

```bash
curl --fail https://mcp.example.org/healthz
curl --fail https://mcp.example.org/.well-known/oauth-protected-resource/mcp
```

Discovery muss deine Audience, deinen Authorization Server und die beiden Scopes melden. Bei einem nicht authentifizierten `POST /mcp` ist HTTP 401 mit OAuth-Hinweis richtig; `GET /mcp` darf HTTP 405 liefern.

## 10. Im Portal anmelden und Gitea verbinden

1. Öffne `https://mcp.example.org/portal` im normalen Browser.
2. Melde dich mit dem Benutzer aus Schritt 3 über Keycloak an.
3. Wähle die Instanz `work`.
4. Für die erste Einrichtung ohne zusätzliche Gitea-OAuth-App: Erzeuge in Gitea unter den Benutzereinstellungen ein persönliches Access-Token. Wähle nur die für deine Aufgaben notwendigen Benutzer-/Repository-/Issue-Rechte; keine pauschalen Adminrechte.
5. Gib das Token ausschließlich in das Passwortfeld des Portals ein und klicke **Verbinden**.
6. Prüfe, dass `work` unter den verbundenen Instanzen erscheint.

Für Lesen sind typischerweise `read:user`, `read:repository` und `read:issue` nötig; Schreibaufgaben benötigen passende `write:`-Rechte. Repositoryerstellung kann zusätzlich `write:user` benötigen. Die tatsächlich angebotenen Scopes hängen von Gitea ab. MCP-Scopes gewähren niemals zusätzliche Gitea-Rechte.

Optional kannst du stattdessen Gitea-OAuth einrichten: in Gitea eine Anwendung mit Callback `https://mcp.example.org/gitea/callback` registrieren und `oauthClientId` sowie gegebenenfalls `oauthClientSecret` im Instanzobjekt der Betreiberkonfiguration ergänzen. Danach Server neu starten und im Portal **Mit Gitea OAuth verbinden** wählen. Das Secret bleibt außerhalb von Git. Die vollständigen Felder stehen in der [Deploymentanleitung](../DEPLOYMENT.md#2-konfiguration).

## 11. ChatGPT verbinden

Nach der [aktuellen offiziellen Anleitung](https://developers.openai.com/plugins/deploy/connect-chatgpt):

1. Öffne **Plugins → + → Add custom MCP server**.
2. Trage einen Namen und `https://mcp.example.org/mcp` als Server-URL ein.
3. Wähle OAuth und den registrierten öffentlichen Client `gitea-chatgpt` ohne Client-Secret.
4. Übernimm die tatsächlich angezeigte Callback-URI exakt in die erlaubten Redirects dieses Keycloak-Clients. Falls die Oberfläche noch keine URI zeigt, verwende die Verbindungs-/OAuth-Hinweise des Clients; ohne bestätigten Callback ist die Einrichtung noch nicht abgeschlossen.
5. Verwende Discovery beziehungsweise die geprüften Authorization-/Token-URLs. Erlaube `gitea.read` und nur für Schreibzugriff zusätzlich `gitea.write`.
6. Schließe den Verbindungsdialog ab, erstelle und installiere das Plugin.
7. Öffne einen neuen Work-Chat und wähle das Plugin per `@` aus.
8. Melde dich mit **demselben Keycloak-Benutzer wie im Portal** an. Ein anderer Benutzer sieht andere Gitea-Verbindungen.

Fehlt diese Funktion, prüfe Client, Konto und Workspace-Richtlinien. Diese Anleitung schaltet keine Tarif- oder Administratorbeschränkungen frei. Die hier beschriebene Kontoinstallation ist weiterhin von dir zu verifizieren.

## 12. Lesen und die erste Schreibfreigabe testen

Führe nacheinander diese Aufträge aus:

1. „Liste meine verbundenen Gitea-Instanzen.“ → `work` muss erscheinen.
2. „Zeige den Verbindungsstatus von work.“ → richtiger Gitea-Benutzer und Serverversion.
3. „Liste die ersten 20 Repositories von work.“ → nur berechtigte Repositories.
4. „Lies README.md in meinem Testrepository.“ → erwarteter Inhalt.
5. „Bereite ein Testissue mit Titel Installationstest in meinem Testrepository vor.“ → ein Freigabelink, noch keine Änderung in Gitea.
6. Öffne den Link selbst im Browser, prüfe Instanz, Repository und exakte Payload und gib den Auftrag einmal frei.
7. Lass denselben Tool-Aufruf mit identischen Argumenten und der zurückgegebenen `approvalId` wiederholen. → genau ein Testissue wird erstellt.
8. Ein erneuter Versuch mit derselben Freigabe muss abgewiesen werden. Entferne/schließe das Testissue anschließend mit einer neuen konkreten Freigabe oder direkt in Gitea.

Agenten dürfen die Browserfreigabe nicht stellvertretend anklicken. Dateiänderungen benötigen einen Feature-Branch; direktes Schreiben auf den Standardbranch wird verweigert.

Ab v0.2.0 kannst du zusätzlich [Actions steuern, Kanban-Projekte verwalten und Zeiten erfassen](PROJEKTE-ACTIONS-ZEIT.md). Die dortige Anleitung erklärt die benötigten Rechte, Projekt-/Issue-IDs, Beispiele und gesonderten Schreibfreigaben.

## 13. Optional: portables Paket oder Codex

Das [Release-ZIP](https://github.com/jtracht/gitea-chatgpt-plugin/releases/tag/v0.3.1) enthält eine HTTPS-URL-Vorlage. Unterstützt dein Client diese Vorlage nicht, erstelle ein Paket für deinen eigenen Endpunkt:

```bash
pnpm install --frozen-lockfile
MCP_PUBLIC_URL=https://mcp.example.org/mcp pnpm package
```

Dafür sind Node.js 24 und pnpm 11.25.0 erforderlich. Unter PowerShell: `$env:MCP_PUBLIC_URL='https://mcp.example.org/mcp'; pnpm package`. Das neue ZIP liegt unter `artifacts/`. Es enthält den Anschluss an deinen Server, keinen eingebauten Hostingdienst.

Für Codex registrierst du entsprechend Schritt 6 einen eigenen öffentlichen Client `gitea-codex` mit denselben Scopes und derselben Audience. Trage dessen tatsächlich verwendete Callback-Adresse beim Anbieter ein. Eine aktuelle Codex CLI unterstützt nach der [offiziellen MCP-Konfigurationsanleitung](https://developers.openai.com/codex/mcp) diese Befehle:

```bash
codex mcp add gitea --url https://mcp.example.org/mcp --oauth-client-id gitea-codex
codex mcp login gitea
codex mcp list
```

Prüfe bei einer älteren Installation zunächst `codex mcp --help`. Verfügbarkeit und Clientregistrierung können sich von ChatGPT unterscheiden. Übernimm nicht blind die ChatGPT-Redirects. Auch diese echte Kontoverbindung ist noch nicht projektseitig verifiziert.

## 14. Fehler eingrenzen

| Beobachtung                            | Prüfen / Beheben                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Container beendet sich sofort          | Pflichtvariablen, gültiger 64-stelliger Hex-Schlüssel, JSON in `GITEA_INSTANCES`; lokale Logs ansehen.          |
| HTTP 502 am Proxy                      | Container läuft? Richtiger Port? Gemeinsames Docker-Netz? Kein Container-Loopback als fremden Dienst verwenden. |
| `INVALID_HOST`                         | Weitergeleiteter Host muss zu `PUBLIC_URL` passen.                                                              |
| Login kehrt immer zur Anmeldung zurück | HTTPS/Secure-Cookies, `iss`, `aud`, Scope-Zuweisung und Portal-Callback prüfen.                                 |
| `invalid_redirect_uri`                 | Tatsächliche Callback-Adresse exakt beim richtigen Client eintragen.                                            |
| `INVALID_ACCESS_TOKEN`                 | Issuer, JWKS, Audience und Tokenablauf prüfen; keine Gitea-Tokens als MCP-Zugangstokens verwenden.              |
| `INSUFFICIENT_SCOPE`                   | Gewünschten MCP-Scope für diesen Benutzer/Client autorisieren und neu verbinden.                                |
| `CONNECTION_REQUIRED`                  | Im Portal mit derselben OAuth-Identität anmelden und Gitea verbinden.                                           |
| `NETWORK_ADDRESS_DENIED`               | DNS prüfen; eine benötigte interne Gitea-Adresse nur durch minimale Betreiber-CIDR freigeben.                   |
| Gitea 401/403                          | Gitea-Token abgelaufen oder Rechte zu eng; im Portal neu verbinden bzw. Berechtigung in Gitea prüfen.           |
| `HUMAN_APPROVAL_REQUIRED`              | Frische Freigabe für exakt dieselbe Payload und Instanz nötig; alte/verbrauchte Freigaben funktionieren nicht.  |
| API 404                                | Endpunkt kann fehlen oder Zugriff verweigert sein; ältere Versionen unterstützen nicht alle optionalen APIs.    |

Keine Tokens, Passwörter oder privaten Repositoryinhalte in öffentliche Fehlerberichte kopieren.

## 15. Aktualisieren und sichern

Vor Updates den Dienst stoppen, das gesamte Datenvolume konsistent sichern und den Verschlüsselungsschlüssel separat aufbewahren. Danach bewusst einen neuen Release-Tag auswählen, bauen und Health/Login/Lesen erneut prüfen. Für einen Rollback vorheriges Image und zugehöriges Datenbankbackup gemeinsam verwenden. `docker compose down -v` löscht Daten und ist kein Updatebefehl. Details und Grenzen der Schlüsselrotation: [Updates und Rollbacks](../DEPLOYMENT.md#7-updates-backup-rollback).

## Was danach noch offen ist

Erst nach deinen eigenen erfolgreichen Kontrollpunkten sind das produktive HTTPS-/OAuth-Setup und die Kontoverbindung verifiziert. Eine Veröffentlichung im offiziellen Plugin-Verzeichnis benötigt eine separate Einreichung und Review. Der öffentliche Quellcode und GitHub-Releases sind bereits vorhanden. [Projekt-Nachweise und Grenzen](../PROGRESS.md).
