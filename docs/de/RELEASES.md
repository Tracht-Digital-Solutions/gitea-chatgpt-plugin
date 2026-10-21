# Releases und CI/CD

Conventional Commits steuern SemVer: `fix:` Patch, `feat:` Minor, `!` oder `BREAKING CHANGE:` Major. Git-Tags heißen `vMAJOR.MINOR.PATCH`. Root-Paket, portables Manifest und MCP-Serverversion werden gemeinsam aktualisiert.

Release Please verwaltet die Formatierung von `CHANGELOG.md`, `.release-please-manifest.json` und `plugin/plugin.json`. Diese drei Generator-Dateien sind von Prettier ausgenommen; die JSON-, Schema- und Versionsprüfungen bleiben aktiv. So blockiert die abweichende Generatorformatierung keine automatischen Release-PRs.

`ci.yml` ist für Push/PR, manuell und als wiederverwendbarer Qualitätsworkflow verfügbar. `security.yml` prüft Dependencies mit pnpm audit, Secrets mit Gitleaks, CodeQL und Image-/Konfiguration mit Trivy. Externe Actions sind auf Commit-SHAs fixiert. PRs erhalten keine Schreibrechte/Produktionssecrets; kein `pull_request_target`.

`release-please.yml` wartet auf beide wiederverwendbaren Gates. Release Please erstellt/aktualisiert Release-PRs, Changelog, Versionsdateien und später Tags/Releases. Vom GITHUB_TOKEN angelegte Release-PRs starten CI nicht automatisch; deshalb werden CI und Security ausdrücklich per `workflow_dispatch` auf deren Branch ausgeführt. Die Checks gelten für den tatsächlichen Branchcommit. Das Repository muss Actions erlauben, Pull Requests anzulegen.

Nach einer Releaseerstellung wird `publish.yml` direkt per `workflow_call` aufgerufen. Damit wird nicht darauf vertraut, dass ein automatisch erstellter Tag ein weiteres Ereignis auslöst. Publish baut und testet den konkreten Tag erneut, erstellt ZIP/Serverarchiv/SHA256SUMS, pusht das GHCR-Image mit SBOM/Provenance und lädt Assets hoch. Assetdownload und Prüfsummenvergleich schließen den Job ab. `container-digest.txt` nennt den unveränderlichen Image-Digest. Eine manuelle Wiederholung von Publish ist für vorhandene Releases möglich.

Erstveröffentlichung nach grünen Gates: `gh workflow run release-please.yml -f bootstrap=true`. Diese explizite Erstveröffentlichung erzeugt v0.1.0 als Prerelease. Danach den normalen Release-Please-Weg verwenden. Nicht erneut bootstrap ausführen; ein bestehender Tag darf nicht verschoben werden.

Branchschutz sollte Pflichtchecks `quality`, `dependencies-and-secrets`, `codeql`, `container` verlangen, Force Pushes/Löschen sperren und PRs bevorzugen. Bei Solo-Maintenance kann eine verpflichtende fremde Review blockieren; die tatsächliche Repositorykonfiguration steht im Fortschrittsbericht. Für Communitybetrieb mindestens ein unabhängiges Review erwägen. Sicherheitsmeldungen privat aktivieren. GHCR-Sichtbarkeit muss öffentlich sein; bei der Erstveröffentlichung anonymen Pull verifizieren.

Ein grüner Workflow ist kein Beweis einer echten ChatGPT-Kontoverbindung. Der veröffentlichte Bericht muss verbleibende externe Abnahmen nennen.
