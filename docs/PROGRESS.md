# Nachweisbarer Projektfortschritt

Start: 21.10.2026. Abschließender geprüfter Meilenstein: **98 %**.

## Produktionspaket und Branding (21.10.2026)

- Standard-Compose verwendet ein ausdrücklich versionsgebundenes GHCR-Image und `NODE_ENV=production`; eigener Quellcode-Build ist ein separates Override. Non-Root, schreibgeschütztes Root-Dateisystem, Init-Prozess, Prozesslimit, Logrotation und persistentes Datenvolume sind eingerichtet.
- Neues eigenständiges Deployment-ZIP mit Beispielkonfiguration, Compose und DE-/EN-Produktionsanleitung; kein Git/Node/Build beim Betreiber nötig. Release Please aktualisiert die Imageversionsvorgabe zusammen mit der Softwareversion. Reguläre Releases sind ausdrücklich weder Entwürfe noch Vorabversionen.
- Eigenes Teetassen-/Git-/Dialog-Icon als editierbares SVG und reproduzierbares 512-Pixel-PNG. Manifest, Plugin-ZIP, Serverarchiv und Docker-Image enthalten die benötigten Branding-Dateien; Portal mit Favicon, responsiver Gestaltung und Dark Mode. CSP erlaubt nur lokale Bilder/Styles, keine Skripte oder Inline-Styles.
- Lokaler Nachweis: **508 Tests erfolgreich**, sechs Real-E2E-Tests im normalen Lauf bewusst übersprungen; Kernabdeckung 98,08 % Statements / 94,53 % Branches / 100 % Functions / 98,96 % Lines. Typecheck, ESLint, Prettier, 159 Tool-Schemas und Produktionsbuild erfolgreich. Dependency-Audit: keine bekannten Schwachstellen.
- Zusätzlich tatsächlich ausgeführt: Produktionsimage ohne Root und mit schreibgeschütztem Dateisystem gestartet, PNG-Abmessungen/Erreichbarkeit, OAuth-Pflicht und Health geprüft. Deployment-ZIP isoliert entpackt, Compose-Konfiguration auf feste Version/Sicherheitsoptionen geprüft und mit Testimage samt eigenem Datenvolume erfolgreich gestartet und aufgeräumt. CI und Publish führen diese Prüfungen verpflichtend aus.
- Die neue Logo-Grafik erforderte eine Präzisierung des bisherigen XSS-Tests: Angreifer-HTML muss weiterhin maskiert sein, ausschließlich das feste lokale Logo wird als Bildelement zugelassen. Ein anfangs fehlerhafter HTTP-Testclient wurde korrigiert; Host-Validierung im Produkt bleibt unverändert.
- Fortschritt unverändert **98 %**: Produktive HTTPS-/OAuth-Konfiguration und Installation im tatsächlichen ChatGPT-/Codex-Konto bleiben wie vereinbart offen. Ein Produktionsbuild ist kein Nachweis eines bereitgestellten Hosts.

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

### Einrichtung mit eigenem Gitea-Server, 21.10.2026

- Die ausgelieferte Konfiguration enthält keine vorkonfigurierte Gitea-Instanz: `GITEA_INSTANCES=[]`. Der Dienst kann mit leerer Liste starten und zeigt im Browserportal die Einrichtung des eigenen Servers an. Eigene HTTPS-Hosts werden weiterhin ausdrücklich durch den Betreiber freigegeben.
- Deutsche und englische Einrichtung erklären die eigene Serveradresse und mehrere Instanzen. Kein Gitea-Host wird implizit ausgewählt oder automatisch kontaktiert. Eine nicht freigegebene Instanz bleibt auch bei leerer Liste gesperrt.
- `pnpm check` erfolgreich: **507 Tests bestanden**, sechs separate Gitea-/Runner-E2E-Fälle im Standardlauf bewusst übersprungen, 159 Schemas und Produktionsbuild erfolgreich. Ein neuer Integrationstest prüft den leeren Einrichtungszustand und verhindert API-Aufrufe an nicht konfigurierte Server. Kern-Zeilenabdeckung **98,96 %**.
- Gesamtfortschritt weiterhin **98 %**; die produktive Kontoabnahme bleibt zurückgestellt. Frühere Release-Tags und Commits sind historische Stände und werden durch eine neue Konfiguration nicht rückwirkend verändert.

### Vollständige Parameter und Veröffentlichungsfunktionen, 21.10.2026

- 30 weitere Tools, insgesamt **159** validierte MCP-Schemas. Vollständige Create-/Edit-Felder für Issues, Projekte, Organisationen, Repositoryerstellung, Releases, Meilensteine und Wiki gegen die offizielle Gitea-28-Spezifikation abgeglichen. 13 eigene Feldabdeckungsprüfungen und **151** direkte API-Vertragsprüfungen. Labels, Deadline, Pins, Sperren und Abhängigkeiten über die jeweils vorgesehenen Endpunkte.
- Organisationserstellung und Organisationsrepositories, Wiki-CRUD, Releasebearbeitung, Package-Metadaten/-Zuordnung/-Versionslöschung sowie begrenzter binärer Generic-Package-Upload ergänzt. Kein Universal-Upload für andere Registryformate. Sprints sind Meilensteine; eigenständige Sprint-, Story-Point- oder Prioritätsfelder werden nicht behauptet.
- Gitea-OAuth unterstützt ausdrücklich konfigurierte `oauthScopes` pro Instanz; Standardrechte werden nicht automatisch erweitert. Admin-/`all`-Scopes und fehlender User-Identitätsscope werden abgewiesen. Für `content_version` verhindert zusätzlich eine Vorprüfung die Bearbeitung, wenn die Version geändert oder vom Server nicht unterstützt ist.
- Abschließendes `pnpm check` erfolgreich: **506 bestandene Tests**, sechs echte E2E-Fälle im Standardlauf bewusst übersprungen, Typen/Lint/Format/Schemas/Build erfolgreich. Kern-Coverage: Statements **98,08 %**, Branches **94,50 %**, Functions **100 %**, Lines **98,96 %**.
- Separates `pnpm test:e2e`: sechs echte MCP-End-to-End-Fälle gegen Gitea **28.2.0** und Runner **5.2.0** erfolgreich, insgesamt **512 unterschiedliche Tests**, kein fehlgeschlagener Test im abschließenden Lauf. Normaler Benutzer ohne Site-Adminrolle; Token mit expliziten `write:user`, `write:repository`, `write:issue`, `write:organization`, `write:package` statt `all`.
- Nachgewiesen: Feldwerte werden tatsächlich zurückgelesen, Zuordnungen/Termine geleert und veraltete Änderungen verweigert; Organisationsrepository mit Initialisierungsvorlagen; Wiki anlegen/ändern/lesen/löschen; Sprint-Meilenstein schließen; Releaseentwurf veröffentlichen; binäres Generic-Package anhand Größe und SHA-256 geprüft. Projekt-/Spaltenfelder, Reihenfolge, Standardspalte und Karten in Repository-, Organisations- und Benutzerprojekten real geprüft.
- Echter Runner führt ausschließlich kontrollierte Testschritte aus: Fehler, fehlgeschlagene Jobs wiederholen, einen Job wiederholen, ganzen Lauf wiederholen, Erfolg und laufenden Job abbrechen. Gepinntes Runnerimage `gitea/runner@sha256:f4db24cc5f682483ffd01b8de6a6c6d15e6fd9320a0ce27fd18d4398db421eae`; internes Runnernetz, keine Hostmounts, kein Docker-Socket, kein privilegierter Modus. Gitea selbst besitzt zusätzlich einen Loopback-Testport. Der Test benötigt kein produktives Konto und löst kein produktives Deployment aus.
- [Deutsche Parametermatrix](de/PARAMETER-UND-FUNKTIONSPRUEFUNG.md), [English matrix](en/PARAMETER-AND-FUNCTION-VERIFICATION.md). Historische Nachweise unten bleiben ihrem jeweiligen Release zugeordnet. Gesamtfortschritt weiterhin **98 %**, weil produktives HTTPS-/OAuth-Deployment und echte ChatGPT-/Codex-Kontoabnahme zurückgestellt bleiben.

### Erweiterung Actions, Projekte/Kanban und Zeiterfassung, 21.10.2026

- 66 neue Tools; insgesamt **129** validierte MCP-Schemas. Actions: Workflowdetails, gefilterte Workflowläufe, Dispatch, Aktivierung/Deaktivierung, Wiederholung von Lauf/fehlgeschlagenen Jobs/einzelnen Jobs, regulärer Abbruch. Projekte: je 16 Operationen für Repository-, Organisations- und eigene Benutzerprojekte einschließlich Spalten, Karten, Reihenfolge und Standardspalte. Zeit: neun Operationen für Buchungen und Stoppuhren.
- `pnpm check` erfolgreich: **397 Tests bestanden**, ein echter Gitea-Test im Standardlauf bewusst übersprungen. Typprüfung, ESLint, Prettier, Schemas/Manifest und Produktionsbuild erfolgreich. Kern-Coverage unverändert: Statements 98,04 %, Branches 94,31 %, Functions 100 %, Lines 98,93 %.
- `pnpm test:e2e` separat erfolgreich gegen isoliertes Gitea **28.2.0**: zusätzlich Kanbanprojekt/-spalten mit Kartenverschiebung, Zeitbuchung/-löschung, Stoppuhrstart/-stopp/-verwerfen und Workflowaktivierung/-deaktivierung, Dispatch und regulärer Laufabbruch über MCP. Damit **398 unterschiedliche Tests**, kein fehlgeschlagener Test im abschließenden Lauf.
- 76 neue gezielte Integrationsprüfungen prüfen unter anderem für jedes neue Tool API-Vertrag, Mandantentrennung und bei Schreibvorgängen fehlende Scopes, unabhängige Freigabe und Replay-Schutz. Insgesamt 121 direkte API-Vertragsprüfungen.
- Reale Runnerausführung/Deployments und Wiederholung tatsächlich ausgeführter Jobs sind nicht nachgewiesen; Jobwiederholungen und Organisations-/Benutzerprojekte haben Vertrags- und simulierte Integrationsabdeckung. Keine pauschalen Zeitresets, fremden Zeitbuchungen, Actions-Secrets oder administrativen Runner-/Force-Operationen ergänzt.
- Bedienungsanleitung: [Deutsch](de/PROJEKTE-ACTIONS-ZEIT.md), [English](en/PROJECTS-ACTIONS-TIME.md). Quellcode über [PR #14](https://github.com/jtracht/gitea-chatgpt-plugin/pull/14), Commit `f469680ff5e1c97ace539fe445e2a57eb73e8ab8`, nach grünen Pflichtchecks veröffentlicht. Frühere Prüfungen unten beziehen sich auf v0.1.1.
- [v0.2.0](https://github.com/jtracht/gitea-chatgpt-plugin/releases/tag/v0.2.0) über [Release-PR #15](https://github.com/jtracht/gitea-chatgpt-plugin/pull/15) regulär freigegeben; Tag/Release-Commit `c75a4ac9907642011443625874b522b500e05de6`. [Release-/Publish-Lauf](https://github.com/jtracht/gitea-chatgpt-plugin/actions/runs/39581574868): Qualität, Dependencies/Secrets, CodeQL, Containerprüfung und Publish sämtlich erfolgreich. Die Schritt-für-Schritt-Anleitungen verwenden jetzt v0.2.0.
- Vier Release-Assets anonym heruntergeladen und geprüft: Plugin-ZIP, Serverarchiv, `SHA256SUMS`, `container-digest.txt`. Reproduzierbar: `pnpm exec tsx scripts/verify-release.ts jtracht/gitea-chatgpt-plugin v0.2.0`. ZIP-Inhalt und Prüfsummen gültig.
- Öffentliches Image `ghcr.io/jtracht/gitea-chatgpt-plugin:v0.2.0` mit leerer Docker-Anmeldekonfiguration erfolgreich gezogen. Digest `sha256:eaaed4ccdef68465baad01ed2f6db85e03e4180698e48bc7df88fa0ecfea6df3` stimmt mit dem Release-Asset überein. Das veröffentlichte Image startete als Nicht-Root mit schreibgeschütztem Root-Dateisystem und meldete `{"status":"ok"}`. Sein ausgelieferter Toolkatalog enthält **129** Operationen.
- Der Gesamtstand bleibt **98 %**: Produktivdeployment und echte ChatGPT-/Codex-Kontoabnahme bleiben ausdrücklich zurückgestellt. Diese lokale Erweiterungsprüfung ersetzt sie nicht.

### Vorheriger Release v0.1.1

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
