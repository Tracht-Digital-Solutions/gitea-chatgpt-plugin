# Gitea direkt aus ChatGPT einrichten

[English](../en/CHATGPT-SETUP.md)

Für Nutzer läuft die Einrichtung über das installierte Plugin. Du benötigst keine eigene Docker-Installation, `.env` oder OAuth-Serverkonfiguration. Ein Betreiber muss den gemeinsamen MCP-Dienst einmal bereitstellen und dessen Endpunkt mit dem Plugin verbinden. Ein GitHub-Download allein stellt diesen Dienst nicht bereit. Es ist derzeit kein produktiver Endpunkt dieses Projekts veröffentlicht.

## 1. Plugin in ChatGPT installieren

Wenn das Plugin bereits für dich oder deinen Workspace bereitgestellt wurde, öffne es unter **Plugins** und installiere es. Für eine private Installation am vorhandenen MCP-Dienst: **Plugins → + → Add custom MCP server**, dessen tatsächlichen HTTPS-Endpunkt mit `/mcp` angeben, OAuth konfigurieren und **Create as a plugin** wählen. Das erstellte Plugin anschließend installieren. Der Betreiber liefert Endpunkt und OAuth-Clientkonfiguration; nicht die Gitea-REST-API als MCP-Endpunkt eintragen.

Öffne einen neuen **Work**-Chat und wähle das Plugin mit `@`. Kontotarif, Client und Workspace-Richtlinien können diesen Weg einschränken. Die Installation und die tatsächliche Kontoverbindung sind ohne bereitgestellten Endpunkt noch nicht verifiziert. Grundlage: [offizielle OpenAI-Installationsanleitung](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## 2. Eigene Gitea-Verbindung herstellen

1. Schreibe: „Richte meinen Gitea-Server ein.“ Du kannst seine öffentliche HTTPS-Adresse angeben; Zugangsdaten niemals im Chat eingeben.
2. Das Plugin prüft bestehende Verbindungen mit `list_instances` und liefert über `connection_setup` einen Einrichtungslink. Eine mitgeteilte Serveradresse kann vorausgefüllt werden; der Tool-Aufruf verbindet noch kein Konto und sendet keine Zugangsdaten an Gitea.
3. Öffne den Link und melde dich am MCP-Dienst an. Gib einen Verbindungsnamen, deine Gitea-HTTPS-Adresse und ein möglichst eng berechtigtes persönliches Gitea-Token ausschließlich im geschützten Formular ein. Prüfe die Adresse, bevor du auf **Eigenen Server verbinden** klickst. Für vom Betreiber vorkonfigurierte Instanzen steht auch Gitea-OAuth bereit, sofern dort registriert. Bei frei gewählten Servern ist derzeit ein persönliches Token nötig; ein beliebiger Gitea-Server kann OAuth nicht ohne dort registrierten Client aktivieren.
4. Kehre zu ChatGPT zurück und schreibe: „Prüfe die Verbindung und zeige meine Repositories.“ Das Plugin prüft `list_instances` und `connection_status` tatsächlich. Erst ein erfolgreicher Aufruf bestätigt die Verbindung.
5. Weitere Server kannst du genauso hinzufügen. Verbindungen sind nach Benutzer getrennt, Adresse und Zugangsdaten verschlüsselt gespeichert. Pro Benutzer sind höchstens 20 neue Verbindungen vorgesehen. `custom-VERBINDUNGSNAME` ist die technische Instanz-ID für selbst eingerichtete Server.

## 3. Verwenden und trennen

Beispiele: „Zeige meine offenen Issues“, „Erstelle einen Sprint-Meilenstein“ oder „Starte den Workflow nach meiner Freigabe“. Schreibaufträge werden zunächst vorbereitet; du prüfst und bestätigst die genaue Aktion auf der geschützten Freigabeseite. ChatGPT darf diese Freigabe nicht für dich absenden.

Zum Trennen das Portal verwenden oder in ChatGPT die Verbindungstrennung anfordern und bestätigen. Für vollständigen Widerruf das persönliche Token zusätzlich in Gitea löschen.

## Grenzen und Betreiberaufgaben

Selbst eingerichtete Server müssen öffentliches HTTPS auf Port 443 anbieten. Private, lokale und Link-Local-Adressen, alternative Ports, URL-Zugangsdaten und Redirects werden verweigert; DNS-Antworten werden bei jedem Request geprüft und die Zieladresse an TLS gebunden. Für interne Gitea-Installationen richtet ausschließlich der Betreiber einen festen Instanzeintrag und eng begrenzte Netzwerkfreigaben ein. Diese Ausnahmen gelten niemals für frei eingegebene Serveradressen.

`ALLOW_USER_SERVERS=true` ist die Vorgabe. Ein Betreiber kann mit `false` ausschließlich vorkonfigurierte Instanzen erlauben und bestehende selbst eingerichtete Verbindungen sperren. Freie Servereinrichtung gewährt keine zusätzlichen Gitea-Berechtigungen. Der Dienst wird gemäß [Produktionsanleitung](PRODUKTION.md) bereitgestellt; eine Veröffentlichung im offiziellen Plugin-Verzeichnis bleibt ein eigener optionaler Schritt.
