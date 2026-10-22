# Mitwirken / Contributing

Beiträge sind willkommen. Reproduzierbare Bugs und kleine fokussierte Pull Requests helfen besonders. Neue Tools benötigen einen klaren Benutzerzweck, striktes Eingabeschema, serverseitige Autorisierung und passende Sicherheitsannotationen. Schreiboperationen müssen das gemeinsame, per `REQUIRE_WRITE_APPROVAL` schaltbare Freigabe-Gate verwenden. Keine Credentials, privaten Repositoryinhalte oder echten Benutzerdaten in Tests.

Vor einem PR `pnpm check` ausführen. Bei API-/Transportänderungen zusätzlich `pnpm test:e2e` und Docker-Smokeprüfung. Deutsche Dokumentation und die englische Entsprechung aktualisieren. Conventional Commits: `fix:` Patch, `feat:` Minor, `feat!:` oder `BREAKING CHANGE:` Major. Apache-2.0 gilt für Beiträge.

Contributions are welcome. Keep PRs focused, update German and English documentation, and run `pnpm check`. Run isolated Gitea E2E and Docker smoke tests when changing APIs or transport. New tools need strict schemas, server-side authorization and accurate annotations. Every mutation must go through the shared approval gate controlled by `REQUIRE_WRITE_APPROVAL`. Use Conventional Commits and never add real credentials or private data. Contributions are provided under Apache-2.0.
