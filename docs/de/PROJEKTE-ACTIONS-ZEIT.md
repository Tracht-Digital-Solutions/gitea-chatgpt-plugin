# Actions, Projekte/Kanban und Zeiterfassung

[English](../en/PROJECTS-ACTIONS-TIME.md). Verfügbar ab v0.2.0; im vorherigen Release v0.1.1 noch nicht enthalten. Die aktuelle [Gitea-28-API](https://docs.gitea.com/api/) und die [offizielle Spezifikation](https://docs.gitea.com/openapi3-28.json) beschreiben die verwendeten Endpunkte. Ältere oder eingeschränkte Instanzen können Funktionen verweigern.

## Sicherheit und Einrichtung

Zuerst die [Schritt-für-Schritt-Einrichtung](SCHRITT-FUER-SCHRITT.md) abschließen und einen Build mit diesen neuen Tools installieren. Alle Schreiboperationen benötigen `gitea.write`, die passenden Gitea-Rechte und die unabhängige Browserfreigabe der exakten Argumente. Lesende Tools benötigen `gitea.read`. Das Gitea-Token muss zusätzlich die passenden Actions-/Repository-/Issue-/Projektberechtigungen seiner Version besitzen. Organisations- und Benutzerprojekte können zusätzliche Organisations-/Benutzerrechte erfordern. Verwende keine pauschalen Adminrechte; ein verweigerter API-Aufruf wird nicht umgangen.

Freigabeablauf: Tool zuerst ohne `approvalId` aufrufen, zurückgegebenen Link selbst öffnen, die konkrete Änderung prüfen und bestätigen, anschließend denselben Aufruf mit der zurückgegebenen ID wiederholen. Freigaben gelten einmalig, zehn Minuten und nur für denselben Benutzer, dieselbe Verbindung und identische Argumente. Das Plugin startet keine Änderungen durch bloßes Lesen.

## Actions steuern

| Aufgabe                                                          | Tools                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflows, Läufe, Jobs und Logs lesen                            | `list_action_workflows`, `get_action_workflow`, `list_action_runs`, `list_action_workflow_runs`, `get_action_run`, `list_action_jobs`, `get_action_job_logs` |
| Workflow manuell starten                                         | `dispatch_action_workflow` mit `workflow`, explizitem `ref` und optionalen String-`inputs`                                                                   |
| Workflow aktivieren/deaktivieren                                 | `enable_action_workflow`, `disable_action_workflow`                                                                                                          |
| Gesamten Lauf / fehlgeschlagene Jobs / einzelnen Job wiederholen | `rerun_action_run`, `rerun_failed_action_jobs`, `rerun_action_job`                                                                                           |
| Lauf regulär abbrechen                                           | `cancel_action_run`                                                                                                                                          |

Beispielauftrag: „Zeige mir die fehlgeschlagenen Läufe von build.yml in work, owner/team-repo. Bereite danach die Wiederholung der fehlgeschlagenen Jobs von Lauf 123 zur Freigabe vor.“ Für einen manuellen Start muss die Workflowdatei `workflow_dispatch` unterstützen; Runner und Gitea Actions müssen eingerichtet sein. Der Workflow-Identifier ist beispielsweise `build.yml`. Ein manuell gestarteter oder wiederholter Workflow kann Deployments und andere externe Änderungen auslösen; prüfe Ref, Inputs und Code vor der Freigabe. Inputs sind keine Secret-Verwaltung und dürfen keine Zugangsdaten enthalten. Secrets bleiben in Gitea. Erzwungener Abbruch, Runnerverwaltung und Secret-Verwaltung werden nicht angeboten.

## Projekte und Kanban

Jeder Projekt-Toolname gilt standardmäßig für ein Repository (`owner`, `repo`). Mit Suffix `_organization` arbeitet er unter einer Organisation (`org`), mit `_user` unter dem authentifizierten Gitea-Benutzer. Beispiele: `create_project`, `create_project_organization`, `create_project_user`. Benutzerprojekte werden ausschließlich für das eigene Gitea-Konto verwaltet.

| Aufgabe                                             | Basis-Tools                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Projekte anzeigen                                   | `list_projects`, `get_project`                                            |
| Erstellen, bearbeiten, schließen/öffnen, löschen    | `create_project`, `update_project`, `delete_project`                      |
| Spalten anzeigen                                    | `list_project_columns`, `get_project_column`                              |
| Spalten erstellen, bearbeiten, löschen              | `create_project_column`, `update_project_column`, `delete_project_column` |
| Spalten sortieren / Standardspalte wählen           | `reorder_project_columns`, `set_default_project_column`                   |
| Karten anzeigen                                     | `list_project_column_issues`                                              |
| Issue hinzufügen, verschieben, aus Spalte entfernen | `add_project_issue`, `move_project_issue`, `remove_project_issue`         |

Beispielablauf:

1. „Erstelle nach Freigabe ein Repositoryprojekt Sprint mit Vorlage basic_kanban.“ Alternativen: `none`, `bug_triage`.
2. Projekt-ID aus dem Ergebnis übernehmen; vorhandene Spalten lesen.
3. „Bereite eine Spalte Blockiert mit Farbe #ff9900 vor.“ Jede Änderung separat freigeben.
4. Zielissue mit `get_issue` lesen. **Für Projektkarten zählt `data.id`, die globale Issue-ID; die sichtbare Issue-Nummer gehört in `get_issue.index`. Diese IDs sind nicht austauschbar.**
5. Issue mit `add_project_issue` in eine Spalte aufnehmen; danach mit `move_project_issue` und `column_id` verschieben. Optionales `sorting` bestimmt die Kartenposition.
6. Vor `reorder_project_columns` alle Spalten lesen; `column_ids` muss jede Spalten-ID genau einmal in der gewünschten Reihenfolge enthalten. Die API prüft die tatsächliche Projektzugehörigkeit.
7. Projekt über `update_project` mit `state: closed` schließen oder mit `open` wieder öffnen.

Löschen eines Projekts oder Entfernen einer Karte ist keine Issue-Löschung. Trotzdem können Struktur und Zuordnungen verloren gehen; prüfe betroffene Karten vor der Freigabe. Spaltenfarben verwenden sechs Hex-Ziffern mit führendem `#`. Seitenergebnisse sind keine vollständige Boardübersicht, solange weitere Seiten existieren.

## Zeiten und Stoppuhren

| Aufgabe                                                    | Tools                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Zeiten je Issue / Repository / eigenem Benutzer            | `list_issue_times`, `list_repository_times`, `list_my_times`               |
| Zeit nachtragen                                            | `add_issue_time`                                                           |
| Einzelnen Eintrag löschen                                  | `delete_issue_time`                                                        |
| Aktive Stoppuhren anzeigen                                 | `list_stopwatches`                                                         |
| Starten / stoppen und Zeit buchen / ohne Buchung verwerfen | `start_issue_stopwatch`, `stop_issue_stopwatch`, `discard_issue_stopwatch` |

Beispiele: „Buche nach Freigabe 90 Minuten auf Issue 42“ → `time: 5400` Sekunden. „Zeige meine Zeiten seit Montag“ → konkretes RFC-3339-Datum mit Zeitzone als `since` und gegebenenfalls `before` festlegen und Seiten durchgehen. Die API liefert Einträge, keine automatisch vollständige Summenauswertung. `user` kann bei Issue-/Repositorylisten filtern. `created` erlaubt bei einer manuellen Buchung ein ausdrücklich gewähltes Datum.

Manuelle Buchungen erfolgen für den authentifizierten Gitea-Benutzer; eine Buchung im Namen anderer wird nicht angeboten. Die Gitea-Zeiterfassung muss für das Repository aktiviert und für den Benutzer erlaubt sein. Start/Stopp wirken **zum Zeitpunkt der tatsächlichen Ausführung nach Freigabe**. Eine verzögerte Stoppfreigabe verlängert die gemessene Zeit; für eine exakt vorgegebene Dauer besser `add_issue_time` verwenden. Ein pauschales Zurücksetzen aller Issue-Zeiten ist absichtlich nicht verfügbar.

## Nachweise und Grenzen

Die Tests prüfen API-Verträge, Eingaben, Scopes, Mandantentrennung, Schreibfreigabe und Wiederholungsschutz für jedes neue Tool. Ein isolierter Gitea-28.2.0-Test über den MCP-Client prüft Repository-Kanban mit Kartenverschiebung, Zeitbuchung/-löschung, Stoppuhren sowie Workflow-Aktivierung, Dispatch und regulären Abbruch. Eine Runnerausführung oder ein echtes Deployment wird dabei nicht ausgelöst; Wiederholung von Jobs ist vertraglich und mit simulierten Antworten geprüft. Organisations-/Benutzerprojektverträge sind geprüft, ohne vollständige reale Kontoabnahme dieser beiden Bereiche.

HTTP 404 bedeutet „nicht vorhanden, nicht unterstützt oder nicht zugänglich“ und keine pauschale Aussage über eine bestimmte Version. Es gibt keine Browser-Scraping-Ausweichlösung und keine Umgehung von Berechtigungen. Die echte ChatGPT-/Codex-Kontoverbindung bleibt bis zu deinem Deployment unbestätigt. [Prüfstand](../PROGRESS.md).
