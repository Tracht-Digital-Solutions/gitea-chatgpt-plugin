# Gitea for ChatGPT v0.1.0

Erster öffentlicher Entwicklungsrelease unter Apache-2.0. Selbst hostbarer Node-24-/TypeScript-MCP-Server mit Streamable HTTP, OAuth-Resource-Server, verschlüsselten Mehrbenutzer-/Mehrinstanzverbindungen und unabhängigen Browserfreigaben für Schreibaufträge. Repository-, Datei-, Issue-, PR-, Release- und Actions-Werkzeuge sowie DE-/EN-Dokumentation sind enthalten.

ZIP: portables Agent-Plugins-Paket mit konfigurierbarer HTTPS-Adresse. Serverarchiv: Produktionsbuild und Lockdatei; Laufzeitabhängigkeiten mit `pnpm install --prod --frozen-lockfile` installieren. Alternativ veröffentlichtes GHCR-Image verwenden. SHA256SUMS prüfen.

Voraussetzungen: eigener HTTPS-Endpunkt, OAuth/OIDC-Anbieter mit passenden JWT-Audiences/Scopes und berechtigte Gitea-Verbindungen. Es wird kein öffentlicher SaaS-Dienst bereitgestellt.

Grenzen: echte ChatGPT-/Codex-Kontoinstallation und öffentliche Verzeichnisfreigabe nicht verifiziert. Begrenzte Inhaltssuche/Pagination, optionale Gitea-APIs abhängig von Instanzversion/Berechtigungen, ein Prozess/SQLite-Volume. Installationsanleitung und reale Testergebnisse im Repository beachten.

---

Initial public development release. Self-hosted Node 24/TypeScript MCP server, portable Agent Plugins package, OAuth, encrypted per-user/per-instance credentials and separate human browser approval for every write. Includes repository/file/issue/PR/release/Actions tools and German/English documentation.

Bring your own HTTPS endpoint, OAuth/OIDC provider and authorized Gitea instance. No hosted service is provided. ChatGPT/Codex account installation and public directory approval remain unverified. Verify SHA256SUMS and read the deployment/security guides before use.
