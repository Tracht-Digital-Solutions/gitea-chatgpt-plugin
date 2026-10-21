# Produktionsinstallation

[English](../en/PRODUCTION.md)

Lade aus dem gewünschten GitHub-Release **gitea-deployment-VERSION.zip** herunter und prüfe dessen SHA-256 gegen die ebenfalls veröffentlichte Datei `SHA256SUMS`. Entpacke das ZIP in einen eigenen Ordner. Dieses Paket benötigt weder Git, Node.js noch einen lokalen Build; Docker Engine und Docker Compose genügen für den MCP-Dienst. HTTPS-Reverse-Proxy und OAuth-Anbieter werden separat eingerichtet.

1. Kopiere `.env.example` nach `.env`. Behalte `GITEA_MCP_VERSION` auf der zum ZIP gehörenden Version. Sie wählt das geprüfte, veröffentlichte Image ausdrücklich aus.
2. Erzeuge einmal einen zufälligen 32-Byte-Schlüssel, z. B. mit `openssl rand -hex 32`, und trage ihn unter `ENCRYPTION_KEY` ein. Sichere den Schlüssel separat. Beschränke die Dateirechte auf den Betreiber (`chmod 600 .env` unter Linux).
3. Trage deine eigenen MCP-/OAuth-HTTPS-Adressen und die OAuth-Client-ID ein. Registriere Clients, PKCE, Scopes, Audience und exakte Callbacks gemäß [Schritt-für-Schritt-Anleitung](SCHRITT-FUER-SCHRITT.md). Verwende keinen OAuth-Entwicklungsmodus.
4. Ergänze deinen eigenen Gitea-Server in `GITEA_INSTANCES`. Ohne Eintrag startet der Dienst mit einem Einrichtungshinweis; es wird kein Server automatisch verbunden. Zugangsdaten gehören ausschließlich ins geschützte Browserportal oder die dokumentierte Secret-Konfiguration.
5. Starte den Dienst im entpackten Ordner:

```bash
docker compose pull
docker compose up -d --no-build --wait
docker compose ps
curl --fail http://127.0.0.1:3000/healthz
```

Die erwartete Antwort ist `{"status":"ok"}`. Der Dienst läuft mit `NODE_ENV=production`, ohne Root, mit schreibgeschütztem Root-Dateisystem, begrenzten Prozessen und rotierenden Containerlogs. Persistente Daten liegen im eigenen Volume. Es gibt keinen Watch-Prozess und keinen Entwicklungsserver. Das Image enthält SVG-/PNG-Icon und Portalgestaltung; der Plugin-Download enthält dasselbe Icon.

6. Verbinde den HTTPS-Proxy mit dem MCP-Dienst. Prüfe Discovery, Portal-Login, Gitea-Verbindung und einen lesenden Tool-Aufruf. Prüfe einen Schreibauftrag ausschließlich im eigenen Testrepository mit gesonderter Portal-Freigabe. Die konkrete Kontoabnahme lässt sich erst mit deinem tatsächlichen HTTPS-/OAuth-Deployment durchführen.
7. Lade zusätzlich das **gitea-chatgpt-plugin-VERSION.zip** desselben Releases für die Plugin-Installation herunter. Das Deployment-ZIP richtet den Server ein; das Plugin-ZIP verbindet einen kompatiblen Client mit dessen HTTPS-Endpunkt. Bei Bedarf erzeuge aus dem Quellcode ein Plugin-Paket mit konkretem `MCP_PUBLIC_URL`, wie in der ausführlichen Anleitung beschrieben.

## Updates und eigener Build

Sichere vor Updates das gestoppte Datenvolume und den Verschlüsselungsschlüssel. Übernimm die neue Versionsnummer bewusst in deine bestehende `.env`, kontrolliere neue Konfigurationsfelder, führe `docker compose pull` und `docker compose up -d --no-build --wait` aus und prüfe Health/Login/Tools erneut. Überschreibe bestehende Secrets nicht mit einer neuen Beispieldatei. Für einen Rollback gehören vorheriges Image und passendes Datenbankbackup zusammen. Niemals `docker compose down -v` als Update verwenden.

Entwickler können alternativ im ausgecheckten Quellcode ausdrücklich selbst bauen:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build --wait
```

Auch dieser Build läuft im Produktionsmodus. Das zusätzliche Build-Compose ist absichtlich nur im Quellcode enthalten. Eine öffentliche GitHub-Veröffentlichung stellt kein Hosting und keine Freigabe im offiziellen Plugin-Verzeichnis bereit.
