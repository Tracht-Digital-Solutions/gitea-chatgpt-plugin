# Nachweisbarer Projektfortschritt

Start: 21.10.2026. Abschließender geprüfter Meilenstein: **98 %**.

Jede Phase hat vorab folgende prüfbare Teilaufgaben. Teilpunkte werden erst nach Prüfung vergeben.

| Phase            | Gewicht | Teilaufgaben (gleich gewichtet innerhalb der Phase)                                                        | Nachweis                                                  |
| ---------------- | ------: | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Recherche        |       5 | Offizielle Quellen prüfen; Entscheidungen und Grenzen dokumentieren                                        | 5/5                                                       |
| Architektur      |      10 | Strikte Workspace-Konfiguration; getrennte Module; Build erfolgreich                                       | 10/10                                                     |
| Gitea API        |      15 | Getrennte typisierte Operationen; Fehler/Pagination/Versionen; isolierter Integrationstest                 | 15/15                                                     |
| Auth/Sicherheit  |      15 | OAuth und Discovery; verschlüsselte Mandantentrennung; SSRF; unabhängige Schreibfreigabe; Sicherheitstests | 15/15                                                     |
| MCP/Plugin       |      20 | Tools/Schemas; Transport/Clienttest; portables Manifest; Archivprüfung                                     | 20/20                                                     |
| Tests            |      15 | Unit; Integration; Sicherheit/Coverage; realistisches Gitea-E2E; Docker/Health                             | 15/15                                                     |
| CI/CD            |      10 | CI grün; Security grün; Release Please geprüft; Publish geprüft                                            | 10/10                                                     |
| Dokumentation    |       5 | DE/EN; Deployment/Installation/Rollback                                                                    | 5/5                                                       |
| Veröffentlichung |       5 | Öffentliches Repository/Push; Schutz/CI; Tag/Assets/Image geprüft                                          | 3,33/5; Artefakte geprüft, Kontoendabnahme zurückgestellt |

Prozentwerte werden aus diesen Teilaufgaben berechnet und abgerundet. Ein geschriebener Workflow zählt noch nicht als funktionsgeprüft. ChatGPT-E2E und Verzeichnisfreigabe werden separat ausgewiesen.

Die terminale Releaseabnahme umfasst zusätzlich die vom Auftrag verlangte tatsächliche ChatGPT-/Codex-Kontoverbindung. Ohne diese Abnahme wird das letzte Veröffentlichungsdrittel nicht als vollständig abgeschlossen gezählt, auch wenn ZIP/Image bereits öffentlich sind. Eine Verzeichnisfreigabe ist eine separate Plattformentscheidung und wird nie aus einer GitHub-Veröffentlichung abgeleitet.

## Bisherige Prüfungen

- `pnpm check`: Typprüfung, ESLint, Prettier, **189 bestandene Tests**, Manifest-/63 MCP-Schemaprüfungen und Produktionsbuild erfolgreich. Der echte Gitea-Test wird im normalen Testlauf ausdrücklich übersprungen und separat erfolgreich ausgeführt: **190 unterschiedliche Tests insgesamt, 0 fehlgeschlagen**.
- Erweiterter sicherheitskritischer Kern einschließlich Konfiguration, MCP-Fehlerbehandlung und Tool-Autorisierung: Statements **98,04 %**, Branches **94,31 %**, Functions **100 %**, Lines **98,93 %**; Schwellen jeweils 85 % aggregiert. Einzelne Portalzweige sind nicht abgedeckt; kein Anspruch auf vollständige Pfadabdeckung.
- `pnpm test:e2e`: separater erfolgreicher MCP-Ablauf gegen isoliertes Gitea **28.2.0**, Image-Digest `sha256:30777c91280d973fa02be48b1ade735bd6859e8f6f7af3b4444d519437852504`. Repository, Feature-Branch, Dateiänderungen, Inhaltssuche, Commit-Suche, Issue/Kommentar, Labels, Meilenstein, PR/Diff, Review, Merge, Tag und Release nachgewiesen; Standardbranchschreiben verweigert.
- 55 Vertragsprüfungen der direkten API-Tools gegen die offizielle Gitea-OpenAPI bestanden.
- Dockerbuild und Start als Nicht-Root mit schreibgeschütztem Root-Dateisystem bestanden; `/healthz` liefert `{"status":"ok"}`.
- `pnpm audit --audit-level=high`: keine bekannten Dependency-Schwachstellen.
- Gitleaks-Datei- und vollständiger Historienscan: keine Secrets gefunden. Der zunächst fehlschlagende Action-Wrapper bei Root-Commits wurde durch eine gepinnte kostenlose CLI ersetzt; kein kostenpflichtiger Gitleaks-Dienst erforderlich. Produktionsabhängigkeiten: MIT/BSD/ISC laut pnpm-Lizenzinventar; Projektlizenz Apache-2.0.
- Trivy meldete zunächst hohe und kritische Befunde im Debian-Laufzeitimage. Dieses wurde durch ein gepinntes Alpine-Laufzeitimage ohne npm/Corepack ersetzt. Erneuter Image-Scan: **0 HIGH/CRITICAL**. Trivy-Konfigurationsscan: **0 HIGH/CRITICAL**. Keine Ausnahme-/Ignoreliste zur Umgehung des Gates.
- CodeQL meldete zunächst die eigene Ratenbegrenzung als nicht erkannt. Explizite Standard-Routenlimits ergänzen diese jetzt; keine hohen/kritischen Befunde im abgenommenen Stand. Ein zusätzlicher Downloadprüfer-Hinweis wurde durch vollständigen Verzicht auf Dateischreibzugriffe behoben.
- Lokale Nachweise: `reports/`, `coverage/`, `artifacts/` (absichtlich gitignoriert). Die GitHub-Prüfungen bestätigen Build, Coverage, Gitea-E2E, Docker und Sicherheit remote.

## Veröffentlichung und GitHub

- Öffentliches Repository: [jtracht/gitea-chatgpt-plugin](https://github.com/jtracht/gitea-chatgpt-plugin), Default-Branch `main`.
- Branchschutz: Pflichtchecks `quality`, `dependencies-and-secrets`, `codeql`, `container`, auch für Administratoren; keine Force Pushes/Löschungen, lineare Historie und aufgelöste Reviewgespräche. Solo-Maintenance verlangt 0 zusätzliche Reviewfreigaben; keine Fremdreview wird behauptet.
- Private Vulnerability Reporting und automatische Dependency-PRs aktiviert. Keine automatisch ungeprüft gemergten Dependency-Updates.
- [v0.1.0](https://github.com/jtracht/gitea-chatgpt-plugin/releases/tag/v0.1.0) wurde über den explizit gekoppelten Erst-Release-/Publishprozess erstellt. [Release-Lauf](https://github.com/jtracht/gitea-chatgpt-plugin/actions/runs/39554866696): sämtliche Jobs erfolgreich.
- Vier veröffentlichte Assets wurden ohne Anmeldung heruntergeladen; ZIP-Komponenten und SHA-256-Prüfsummen geprüft. Unabhängig wiederholbar: `pnpm exec tsx scripts/verify-release.ts jtracht/gitea-chatgpt-plugin v0.1.0`.
- `ghcr.io/jtracht/gitea-chatgpt-plugin:v0.1.0` wurde mit leerer Docker-Anmeldekonfiguration anonym heruntergeladen. Digest: `sha256:ec133e674551440cc73537334d3b3f5f07e88c48ae9c1082d8e46410c381202e`.
- Quellcode-Freigaben: [PR #5](https://github.com/jtracht/gitea-chatgpt-plugin/pull/5), Hauptbranch `250de18794d49c6d581fd623ebd42fa61afe02ff`; [PR #9](https://github.com/jtracht/gitea-chatgpt-plugin/pull/9), Hauptbranch `2519ddf28ea83ea1f0d53abcdff309e286fba556`. Reguläre Pflichtchecks bestanden; keine Adminumgehung verwendet.
- Patchkorrektur: abgelaufene Gitea-Zugangsdaten führen zur Gitea-Neuverbindung im Portal, nicht zu einem irreführenden neuen MCP-OAuth-Dialog. Der reguläre Release-Please-Prozess wurde daran vollständig nachgewiesen.
- Empfohlen: [v0.1.1](https://github.com/jtracht/gitea-chatgpt-plugin/releases/tag/v0.1.1), Release-Commit/Tag `28fe6adb022f42f77dbbd303e9ecdfa5d9b2e2f6`. Release Please erstellte [PR #10](https://github.com/jtracht/gitea-chatgpt-plugin/pull/10) mit konsistenten Paket-/Plugin-/Server-/Manifestversionen. Pflichtchecks bestanden und regulär gemergt. [Release-/Publish-Lauf](https://github.com/jtracht/gitea-chatgpt-plugin/actions/runs/39557081355): sämtliche Jobs erfolgreich.
- Auch für v0.1.1 wurden vier Assets anonym heruntergeladen, ZIP und Prüfsummen validiert. Wiederholbar: `pnpm exec tsx scripts/verify-release.ts jtracht/gitea-chatgpt-plugin v0.1.1`. ZIP, Serverarchiv, Prüfsummen und Containerdigest liegen zusätzlich lokal unter `artifacts/`.
- `ghcr.io/jtracht/gitea-chatgpt-plugin:v0.1.1`: anonymer Pull erfolgreich; Digest `sha256:ad4087f0a170986f2b01a0656f599a35993ec442af2ae2010b0d5c3fa5f6af86`. Dieses veröffentlichte Image wurde anschließend als Benutzer `node` mit schreibgeschütztem Root-Dateisystem gestartet; `/healthz` meldet `{"status":"ok"}`. SBOM und Provenance werden mit dem Image veröffentlicht.
- Generatorformatierung von Release Please wird akzeptiert; Quellcodeformat-, Schema- und Versionsprüfungen bleiben verpflichtend. Erstfreigabe des von GitHub angehaltenen Bot-Workflows erfolgte für den überprüften Release-PR; die expliziten Dispatch-Prüfungen waren ebenfalls erfolgreich. Keine Schutzregel wurde zum Merge abgeschaltet.
- Gesamtgewicht: 5 + 10 + 15 + 15 + 20 + 15 + 10 + 5 + 3,33 = 98,33 %, abgerundet **98 %**. Der verbleibende Teil ist die bewusst zurückgestellte Kontoverbindung; deshalb keine 100-%-Behauptung.

## Noch nicht verifiziert

Ergänzung vom 21.10.2026: vollständige [deutsche](de/SCHRITT-FUER-SCHRITT.md) und [englische](en/STEP-BY-STEP.md) Schritt-für-Schritt-Anleitungen für die Ersteinrichtung ergänzt und aus README, Installation und Deployment verlinkt. Sie dokumentieren ausdrücklich die vom Betreiber noch auszuführenden HTTPS-/OAuth- und Kontotests. Der Fortschritt bleibt bei **98 %**; Dokumentation ersetzt keine produktive Kontoabnahme.

- **Vom Benutzer ausdrücklich zurückgestellt:** produktives HTTPS-Deployment mit eigenem OAuth-Anbieter. Gewünscht sind Installationspaket und Anleitung.
- **Nicht verifiziert:** tatsächliche Installation/Toolauswahl im ChatGPT-/Codex-Konto. Die vorhandene lokale SDK-Clientprüfung ersetzt diese Abnahme nicht. Kein konkreter produktiver MCP-Endpunkt wird behauptet.
- Öffentliche Verzeichnisfreigabe, unabhängiger Penetrationstest und jede ältere Gitea-Version. Optional nicht vorhandene APIs scheitern geschlossen.

## Umgebung

- Leerer Arbeitsordner, Node 24.16.0, pnpm 11.25.0, Docker 29.8.2 mit erreichbarer Engine.
- GitHub CLI ist als `jtracht` angemeldet. Zielrepository existiert beim Start nicht.
- Gitea-Swagger unter `docs.gitea.com/swagger.v1.json` liefert 404; Fallback ist die offizielle Gitea-Quelldatei. Dies blockiert die Implementierung nicht.
