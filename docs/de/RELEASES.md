# Lokale Builds und CI

GitHub-Releases sowie Release-Please-/Publish-Workflows wurden entfernt. Installation und Paketierung erfolgen aus dem Quellcode mit `node scripts/install.mjs`; siehe [Installationsanleitung](INSTALLATION.md). Die Paketversion beschreibt den lokalen Quellstand, nicht einen verfügbaren GitHub-Download. Historische Tags/Commits bleiben erhalten.

CI prüft weiterhin Typen, Lint, Format, Tests/Coverage, Schemas, Produktionsbuild, Docker und das entpackte lokale Installationspaket. Security prüft Dependencies, Secrets, CodeQL und Container-/Konfigurationsrisiken. Build-Artefakte aus CI sind Prüfnachweise, keine automatischen Veröffentlichungen.
