# Nachweisbarer Projektfortschritt

Start: 21.10.2026. Letzter geprüfter Meilenstein: **85 %**.

Jede Phase hat vorab folgende prüfbare Teilaufgaben. Teilpunkte werden erst nach Prüfung vergeben.

| Phase            | Gewicht | Teilaufgaben (gleich gewichtet innerhalb der Phase)                                                        | Nachweis |
| ---------------- | ------: | ---------------------------------------------------------------------------------------------------------- | -------- |
| Recherche        |       5 | Offizielle Quellen prüfen; Entscheidungen und Grenzen dokumentieren                                        | 5/5      |
| Architektur      |      10 | Strikte Workspace-Konfiguration; getrennte Module; Build erfolgreich                                       | 10/10    |
| Gitea API        |      15 | Getrennte typisierte Operationen; Fehler/Pagination/Versionen; isolierter Integrationstest                 | 15/15    |
| Auth/Sicherheit  |      15 | OAuth und Discovery; verschlüsselte Mandantentrennung; SSRF; unabhängige Schreibfreigabe; Sicherheitstests | 15/15    |
| MCP/Plugin       |      20 | Tools/Schemas; Transport/Clienttest; portables Manifest; Archivprüfung                                     | 20/20    |
| Tests            |      15 | Unit; Integration; Sicherheit/Coverage; realistisches Gitea-E2E; Docker/Health                             | 15/15    |
| CI/CD            |      10 | CI grün; Security grün; Release Please geprüft; Publish geprüft                                            | Offen    |
| Dokumentation    |       5 | DE/EN; Deployment/Installation/Rollback                                                                    | 5/5      |
| Veröffentlichung |       5 | Öffentliches Repository/Push; Schutz/CI; Tag/Assets/Image geprüft                                          | Offen    |

Prozentwerte werden aus diesen Teilaufgaben berechnet und abgerundet. Ein geschriebener Workflow zählt noch nicht als funktionsgeprüft. ChatGPT-E2E und Verzeichnisfreigabe werden separat ausgewiesen.

Die terminale Releaseabnahme umfasst zusätzlich die vom Auftrag verlangte tatsächliche ChatGPT-/Codex-Kontoverbindung. Ohne diese Abnahme wird das letzte Veröffentlichungsdrittel nicht als vollständig abgeschlossen gezählt, auch wenn ZIP/Image bereits öffentlich sind. Eine Verzeichnisfreigabe ist eine separate Plattformentscheidung und wird nie aus einer GitHub-Veröffentlichung abgeleitet.

## Bisherige Prüfungen

- `pnpm check`: Typprüfung, ESLint, Prettier, 182 bestandene Tests, Manifest-/63 MCP-Schemaprüfungen und Produktionsbuild erfolgreich. Ein echter Gitea-Test wird im normalen Testlauf ausdrücklich übersprungen und separat ausgeführt.
- Sicherheitskritischer Kern: Statements 97,48 %, Branches 93,21 %, Functions 100 %, Lines 98,78 %; Schwellen jeweils 85 % aggregiert. Einzelne Portalzweige sind nicht abgedeckt; kein Anspruch auf vollständige Pfadabdeckung.
- `pnpm test:e2e`: separater erfolgreicher MCP-Ablauf gegen isoliertes Gitea **28.2.0**, Image-Digest `sha256:30777c91280d973fa02be48b1ade735bd6859e8f6f7af3b4444d519437852504`. Repository, Feature-Branch, Dateiänderungen, Issue/Kommentar, PR/Diff, Tag und Release nachgewiesen; Standardbranchschreiben verweigert. Weitere Szenarien werden vor Push erneut ausgeführt.
- 55 Vertragsprüfungen der direkten API-Tools gegen die offizielle Gitea-OpenAPI bestanden.
- Dockerbuild und Start als Nicht-Root mit schreibgeschütztem Root-Dateisystem bestanden; `/healthz` liefert `{"status":"ok"}`.
- `pnpm audit --audit-level=high`: keine bekannten Dependency-Schwachstellen.
- Gitleaks-Dateiscan: keine Secrets gefunden. Produktionsabhängigkeiten: MIT/BSD/ISC laut pnpm-Lizenzinventar; Projektlizenz Apache-2.0.
- Trivy meldete zunächst hohe und kritische Befunde im Debian-Laufzeitimage. Dieses wurde durch ein gepinntes Alpine-Laufzeitimage ohne npm/Corepack ersetzt. Erneuter Image-Scan: **0 HIGH/CRITICAL**. Trivy-Konfigurationsscan: **0 HIGH/CRITICAL**. Keine Ausnahme-/Ignoreliste zur Umgehung des Gates.
- Lokale Nachweise: `reports/`, `coverage/`, `artifacts/` (absichtlich gitignoriert). CI muss dieselben Ergebnisse remote bestätigen.

## Noch nicht verifiziert

- Remote GitHub-Actions-Läufe, Repositoryschutz, Release Please, Release-Assets und anonymer GHCR-Pull.
- Öffentlich erreichbares produktives HTTPS-Deployment mit einem vom Betreiber eingerichteten OAuth-Anbieter.
- Tatsächliche Installation/Toolauswahl im ChatGPT-/Codex-Konto. Die vorhandene lokale SDK-Clientprüfung ersetzt diese Abnahme nicht.
- Öffentliche Verzeichnisfreigabe, unabhängiger Penetrationstest und jede ältere Gitea-Version. Optional nicht vorhandene APIs scheitern geschlossen.

## Umgebung

- Leerer Arbeitsordner, Node 24.16.0, pnpm 11.25.0, Docker 29.8.2 mit erreichbarer Engine.
- GitHub CLI ist als `jtracht` angemeldet. Zielrepository existiert beim Start nicht.
- Gitea-Swagger unter `docs.gitea.com/swagger.v1.json` liefert 404; Fallback ist die offizielle Gitea-Quelldatei. Dies blockiert die Implementierung nicht.
