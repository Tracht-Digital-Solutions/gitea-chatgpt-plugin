# Parameter- und Funktionsprüfung

[English](../en/PARAMETER-AND-FUNCTION-VERIFICATION.md). Stand: 21.10.2026. Die hier beschriebenen Ergänzungen sind ab v0.3.0 verfügbar.

Referenz sind die [offizielle Gitea-28-API](https://docs.gitea.com/api/), ihre [OpenAPI-Spezifikation](https://docs.gitea.com/openapi3-28.json) sowie die [Generic-Package-Dokumentation](https://docs.gitea.com/usage/packages/generic/). Die vollständige Feldabdeckung bezieht sich auf die dokumentierten Create-/Edit-Payloads dieser Version, nicht auf beliebige Felder eines zurückgelieferten Objekts oder zukünftige APIs. Alle Eingaben sind zusätzlich auf Typ, Länge und Wertebereich begrenzt.

## Issues und Projekttickets

Ein Kanban-Ticket ist ein Issue als Projektkarte. Inhalt und Ticketfelder werden mit `create_issue`/`update_issue` bearbeitet; Spalte und Position mit den Projekttools. Issue-Nummern und globale Issue-IDs sind verschieden.

| API-Payload                          | Vollständig verfügbare Felder                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateIssueOption` / `create_issue` | `title`, `body`, `assignee` (veraltet), `assignees`, `labels`, `milestone`, `projects`, `closed`, `due_date`, `ref`                           |
| `EditIssueOption` / `update_issue`   | `title`, `body`, `assignee` (veraltet), `assignees`, `milestone`, `projects`, `due_date`, `ref`, `state`, `content_version`, `unset_due_date` |
| `CreateProjectOption`                | `title`, `description`, `card_type`, `template_type`                                                                                          |
| `EditProjectOption`                  | `title`, `description`, `card_type`, `state`                                                                                                  |
| Spalte erstellen / bearbeiten        | `title`, `color` / `title`, `color`, `sorting`                                                                                                |

`projects` ersetzt beim Bearbeiten die Zuordnungen vollständig. `[]` entfernt sie; `assignees: []` entfernt die Zuständigen, `milestone: 0` die Meilensteinzuordnung, `body: ""` den Text. Gitea 28.2.0 liefert leere Zuordnungen teilweise als `null` zurück. Verwende bevorzugt `assignees`; `assignee` ist nur für API-Kompatibilität vorhanden. Für Projektkarten wird `get_issue.data.id` benötigt, für Issue-Tools `get_issue.index`.

`content_version` übernimmt die zuletzt gelesene Inhaltsversion und verhindert veraltetes Überschreiben. Eine Browserfreigabe ersetzt diese Versionsprüfung nicht. Bei Konflikten neu lesen, Änderung erneut vorbereiten und eine neue Freigabe einholen.

Labels werden beim Erstellen mitgegeben, beim Bearbeiten über `set_issue_labels` gesetzt. Die Edit-Issue-API besitzt kein `labels`-Feld. Fälligkeiten werden über `due_date`, `unset_due_date` oder `set_issue_deadline` gesetzt/entfernt. Gitea speichert dabei nur das Datum. Sperren und Pins haben eigene Tools: `lock_issue`, `unlock_issue`, `pin_issue`, `unpin_issue`, `move_issue_pin`, `list_pinned_issues`. Abhängigkeiten: `list_issue_dependencies`, `add_issue_dependency`, `remove_issue_dependency`.

Nicht frei schreibbar sind beispielsweise `id`, `number`, Autor, Erstellungsdatum und berechnete Zähler. Auch ein in Antworten sichtbares `time_estimate` ist in den geprüften Create-/Edit-Payloads nicht setzbar; ein eigener öffentlicher REST-Endpunkt fehlt in der geprüften Spezifikation. Priorität, Story Points oder benutzerdefinierte Felder werden nicht erfunden oder als wirkungslose Zusatzparameter verschickt.

Repository-, Organisations- und eigene Benutzerprojekte unterstützen dieselben Projekt-/Spaltenfelder. Die realen Tests prüfen alle drei Bereiche einschließlich Sortierung, Standardspalte, Kartenaufnahme/-verschiebung/-entfernung und Löschen. [Kanban-Bedienung](PROJEKTE-ACTIONS-ZEIT.md).

## Actions-Pipelines

`dispatch_action_workflow` übernimmt `workflow`, `ref`, String-`inputs` sowie die dokumentierten Queryparameter `return_run_details` und `scoped_workflow_source_repo_id`. Gitea Actions und ein passender Runner müssen eingerichtet sein. Die Workflowdatei benötigt `workflow_dispatch`. Inputs sind keine Secret-Verwaltung.

Die Laufauflistung unterstützt `event`, `branch`, `status`, `actor`, `head_sha`, `exclude_pull_requests`, `page`, `limit`; bei workflowbezogenen Listen zusätzlich `scoped_workflow_source_repo_id`. Weitere Steuerung: Aktivieren/Deaktivieren, gesamten Lauf wiederholen, nur fehlgeschlagene Jobs wiederholen, einzelnen Job wiederholen und regulär abbrechen. Force-Abbruch und öffentliche Runner-Administration sind nicht vorhanden.

Der reale Test führt ausschließlich kontrollierte Shell-Schritte in einem wegwerfbaren Runner 5.2.0 aus: absichtlicher Fehler, Wiederholung fehlgeschlagener Jobs, Wiederholung eines Jobs, Wiederholung des gesamten Laufs, erfolgreicher Lauf und Abbruch eines laufenden Jobs. Runner ohne Hostmounts, Docker-Socket oder privilegierten Modus, auf internem Docker-Netz; nur der Test-Gitea-Server ist zusätzlich über einen Loopback-Port erreichbar. Kein produktives Deployment wird ausgeführt.

## Organisationen und Repositories

`create_organization` unterstützt alle Felder von `CreateOrgOption`: `username`, `full_name`, `description`, `email`, `location`, `website`, `visibility`, `repo_admin_change_team_access`. Vorgaben sind private Sichtbarkeit und keine delegierte Änderung von Teamzugriffen. Der letzte Parameter verändert die Delegation und muss vor Freigabe bewusst geprüft werden. Es wird die normale `/orgs`-API verwendet, kein Site-Admin-Endpunkt.

`create_repository` und `create_organization_repository` unterstützen sämtliche `CreateRepoOption`-Felder: `name`, `description`, `private`, `auto_init`, `default_branch`, `gitignores`, `issue_labels`, `license`, `readme`, `template`, `trust_model`, `object_format_name`. Vorlagen müssen auf dem jeweiligen Server existieren. Unterstützte Objektformate sind `sha1`/`sha256`; tatsächliche Server-/Git-Unterstützung bleibt erforderlich. Private, initialisierte Repositories sind die Vorgabe.

## Packages

Lesen: `list_packages`, `list_package_versions`, `get_package`, `list_package_files`. Verknüpfung mit einem Repository desselben Eigentümers: `link_package_repository`/`unlink_package_repository`. `delete_package_version` löscht exakt eine Version samt Dateien und benötigt eine destruktive Freigabe.

Erstellung erfolgt über **`upload_generic_package`** mit `owner`, `name`, `version`, `file_name`, `content_base64`. Die dekodierten Bytes werden unverändert als `application/octet-stream` an den offiziellen `/api/packages/.../generic/...`-Endpunkt gesendet. Grenze: **750.000 Bytes pro Datei**, wegen begrenzter MCP-/Freigabepayloads. Keine freie Ziel-URL, keine lokale Dateipfadfreigabe, kein stilles Überschreiben vorhandener Dateien. Der reale Test publiziert Binärdaten mit Nullbyte und Bytes außerhalb von UTF-8 und prüft Dateigröße und SHA-256 über Gitea.

Das ist keine universelle Veröffentlichung für npm, Maven, Container usw. Diese Formate benötigen ihre eigenen Registryprotokolle und Werkzeuge. Die Metadaten der in Gitea unterstützten Typen können gelesen werden; formatübergreifende Uploads werden nicht vorgetäuscht.

## Sprints und Releases

Gitea hat in der geprüften API keinen separaten Sprint-Endpunkt. Ein Sprint wird als Meilenstein mit `title`, `description`, `due_on`, `state` geführt. Dazu `create_milestone`, `get_milestone`, `list_milestones`, `update_milestone`, `delete_milestone` nutzen und Issues über `milestone` zuordnen. Änderungen benötigen beim Bearbeiten keinen erneut übergebenen Titel mehr. Eigene Sprint-Startdaten, Velocity und Story Points sind keine dadurch verfügbaren API-Felder.

Release-Erstellung unterstützt alle Felder von `CreateReleaseOption`: `tag_name`, `target_commitish`, `name`, `body`, `draft`, `prerelease`, `tag_message`. `update_release` unterstützt alle sechs Felder von `EditReleaseOption` (ohne `tag_message`). Geprüft sind Entwurfserstellung, Veröffentlichungsumschaltung, Notizen und Vorabversionsstatus. Tags werden nicht durch Force-Operationen umgeschrieben. Der bestehende sichere Toolvertrag verlangt bei der Erstellung einen expliziten Zielref und Namen.

## Wiki

`create_wiki_page`, `get_wiki_page`, `list_wiki_pages`, `list_wiki_revisions`, `update_wiki_page`, `delete_wiki_page` arbeiten über die offizielle Wiki-API. Create/Edit unterstützen `title`, `content_base64`, `message`. Bei Änderungen heißt der Pfadparameter `page_name`; die tatsächliche URL-Slug-Angabe der API verwenden. Das interne Wiki muss aktiviert sein. Schreibzugriff erzeugt Wiki-Commits; vor vollständigem Inhaltsersatz aktuelle Seite lesen und die Änderung prüfen. Branch-Protection der Hauptrepositorydateien ist kein Versionsschutz für Wiki-Seiten.

## Rechte und reproduzierbare Prüfung

Zusätzlich zu MCP-Scopes und, bei `REQUIRE_WRITE_APPROVAL=true`, unabhängiger Browserfreigabe gelten Gitea-Rechte. Organisationserstellung kann `write:organization`, Packageveröffentlichung `write:package`, eigene Benutzerprojekte/Repositoryerstellung `write:user` verlangen. Repositories, Actions und Wikis benötigen entsprechende Repositoryrechte, Tickets entsprechende Issuerechte. Eine verweigerte Operation bleibt verweigert; Site-Adminrechte sind dafür nicht pauschal nötig.

Bei Gitea-OAuth lässt sich die zusätzliche Berechtigung **ausdrücklich pro Instanz** konfigurieren, etwa:

```json
{
  "id": "work",
  "url": "https://git.example.org",
  "oauthClientId": "DEINE_CLIENT_ID",
  "oauthScopes": [
    "read:user",
    "write:repository",
    "write:issue",
    "write:organization",
    "write:package"
  ]
}
```

Für eigene Benutzerprojekte oder Benutzerrepositoryerstellung bei Bedarf `write:user` statt `read:user` verwenden. Nur benötigte Scopes wählen; `all` und Admin-Scopes sind nicht erlaubt. Bestehende Standardscopes werden nicht automatisch erweitert. Nach einer Änderung Gitea im Portal neu verbinden und den erweiterten Consent prüfen. PATs ausschließlich im Portal eingeben.

Reproduzierbar mit Node 24, pnpm und Docker: `pnpm check`, danach `pnpm test:e2e`. Der echte Test verwendet einen normalen Benutzer mit expliziten Nicht-Admin-Scopes in einer wegwerfbaren Instanz. Schema-/Payload-Abdeckung, Freigabeschutz und echte Rückleseprüfung sind getrennte Nachweise. Historische und aktuelle Ergebnisse stehen in [PROGRESS.md](../PROGRESS.md). Dein produktives HTTPS-/OAuth-Deployment und die echte ChatGPT-/Codex-Kontoinstallation bleiben weiterhin unbestätigt.
