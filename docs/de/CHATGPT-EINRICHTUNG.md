# ChatGPT-Verbindung installieren

Zuerst [lokal konfigurieren und per Skript bauen](INSTALLATION.md). Die Datei `artifacts/chatgpt-connection.json` enthält danach den konkreten MCP-Endpunkt und die öffentliche OAuth-Clientkonfiguration. Diese Werte bei der unterstützten MCP-Verbindung in ChatGPT übernehmen und das Plugin installieren.

ChatGPT kann `.env`, Serverliste oder OAuth-Konfiguration nicht ändern. Änderungen außerhalb von ChatGPT vornehmen, erneut bauen/starten und bei geändertem Endpunkt oder Client-ID auch die Clientverbindung aktualisieren. Gitea-Zugangsdaten ausschließlich im geschützten Browserportal eingeben. Die tatsächliche Kontoabnahme benötigt dein eigenes Deployment und ist noch nicht verifiziert.
