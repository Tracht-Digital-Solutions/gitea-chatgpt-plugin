# Schnittstellenprüfung und Architekturentscheidungen

Stand: 21.10.2026. Diese Recherche ist keine Zusicherung eines konkreten ChatGPT-Abonnements oder einer Verzeichnisfreigabe.

## Offizielle Quellen

- [OpenAI Plugins](https://developers.openai.com/plugins/), [portable Pakete](https://developers.openai.com/plugins/build/plugins), [MCP-Server](https://developers.openai.com/plugins/build/mcp-server), [OAuth](https://developers.openai.com/plugins/build/auth), [Verbindung testen](https://developers.openai.com/plugins/deploy/connect-chatgpt): vor Implementierung geprüft.
- [MCP Authorization, aktuelle Spezifikation 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization): Resource Discovery, Resource Indicator, Authorization Server Discovery, PKCE, keine Tokenweitergabe an fremde APIs.
- [Gitea API](https://docs.gitea.com/api/): API-Prefix `/api/v1`; Dokumentation nennt 28.2.0. Die Zielinstanz kann älter sein. Die lokale Referenz wurde von [Gitea main](https://raw.githubusercontent.com/go-gitea/gitea/main/templates/swagger/v1-openapi3.generated.json) bezogen; kein Nachweis einer getesteten Gitea-Version.
- [GitHub Actions](https://docs.github.com/en/actions), [sichere Workflows](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions), [Workflow-Auslösung](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow): Release und Publish werden explizit gekoppelt, damit mit GITHUB_TOKEN erstellte Releases keine zweite Auslösung benötigen.
- Agent-Plugins-1.0-Schemas unter `https://agent-plugins.org/schemas/1.0.0/`; gespeicherte Schemafassungen dienen reproduzierbarer Offlinevalidierung. OpenAI-Erweiterungen werden gesondert validiert, weil das Basisschema sie noch nicht vollständig beschreibt.

## Entscheidungen

1. Node 24 LTS, TypeScript strict, pnpm, offizielles MCP-SDK 1.32.1, Streamable HTTP. Kein altes `ai-plugin.json`.
2. OAuth-Resource-Server mit externem selbst hostbarem OAuth/OIDC-Anbieter (z. B. Keycloak). Signatur, Issuer, Audience, Ablauf und Scopes werden serverseitig geprüft. Keine selbst erfundene OAuth-Implementierung. Anbieter übernimmt Consent, PKCE, Token-Refresh und Clientregistrierung; ein vorkonfigurierter Client wird unterstützt.
3. OAuth-Zugangstokens müssen für genau diesen MCP-Resource-Identifier ausgestellt werden. Gitea-Tokens werden separat eingerichtet. Mandantenschlüssel ist SHA-256 aus Issuer und unveränderlicher Subject-ID.
4. Browserportal nutzt Authorization Code mit PKCE/State und kurzlebige HttpOnly/Secure-Sitzungen. PAT-Einrichtung ausschließlich dort. Gitea-OAuth ist je Instanz optional konfigurierbar. Refresh-Tokens werden verschlüsselt gespeichert und vor Ablauf rotiert; parallele Aufrufe teilen eine Refresh-Anfrage. Fehler sperren die Verbindung. Ohne Refresh-Token ist erneute Verbindung erforderlich. Erneuerung invalidiert bestehende Schreibfreigaben vorsichtshalber.
5. SQLite speichert AES-256-GCM-verschlüsselte Gitea-Zugangsdaten mit benutzer- und instanzgebundener AAD. Der Betreiber verwahrt den Schlüssel außerhalb der Datenbank. Eine Serverinstanz/ein SQLite-Writer; horizontale Skalierung ist nicht Teil von v0.1.
6. Jede Mutation wird zunächst als zehn Minuten gültiger Auftrag gespeichert. Separater Browserlogin, CSRF-Schutz und exakte Payloadprüfung erteilen eine einmalige, mandantengebundene Freigabe. Payloadwechsel, Verbindungswechsel und Replay werden verhindert. Die Chatbestätigung allein genügt nicht.
7. Betreiber erlaubt Basis-URLs. Jede ausgehende Gitea-Anfrage prüft DNS-Adressen und pinnt die geprüfte IP am TLS-Socket. TLS-Zertifikatsprüfung bleibt aktiv, Redirects bleiben aus. Private Netze benötigen ausdrücklich konfigurierte CIDRs; dies ist eine bewusste Betreiberfreigabe.
8. Dateiänderungen nur auf bestehenden, nachweislich ungeschützten Feature-Branches mit Push-Recht. Standardbranch und unbekannter Schutzstatus werden verweigert. Merge prüft Head-SHA und Mergeability und setzt `force_merge=false`; Gitea setzt seine Regeln zusätzlich durch.
9. Repositorydaten sind nicht vertrauenswürdig. Ausgabe markiert Inhalte entsprechend; Skill/Serverinstruktionen verbieten darin eingebettete Befehle. Dies reduziert Prompt-Injection-Risiken, kann das Verhalten eines externen Modells aber nicht garantieren.
10. Optionale Endpunkte werden bei Aufruf geprüft. 404 unterscheidet absichtlich nicht zwischen fehlender Berechtigung und fehlender Fähigkeit. Keine Administrations-, Runner-, Webhook- oder Rechteänderungstools.

## Plattformgrenzen

Die aktuelle offizielle Anleitung nennt „Plugins → Add custom MCP server“, Installation und Aufruf in einem Work-Chat. Verfügbarkeit unterscheidet sich nach Client, Konto, Tarif und Workspace-Regeln. Die geprüften Entwicklerseiten liefern keine belastbare vollständige Tarifmatrix; deshalb werden keine erfundenen Free/Plus/Pro-Zusagen veröffentlicht. Maßgeblich ist die verfügbare Kontofunktion.

Ein öffentliches Repository, ein installierbares konfigurierbares Paket, eine konkrete HTTPS-Installation und die geprüfte Veröffentlichung im universellen Plugin-Verzeichnis sind unterschiedliche Ergebnisse. Öffentliche Verzeichnisfreigabe erfordert u. a. Identitäts-/Domainprüfung, erreichbaren Server, Richtlinien, Demo und Review. Sie wird hier nicht behauptet. Ein Betreiber muss seinen HTTPS-Endpunkt und OAuth-Anbieter konfigurieren. Ohne konkretes Deployment kann die echte ChatGPT-/Codex-Kontoverbindung nicht als verifiziert gelten.
