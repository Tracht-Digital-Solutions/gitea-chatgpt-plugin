# Parameter and function verification

[Deutsch](../de/PARAMETER-UND-FUNKTIONSPRUEFUNG.md). Updated 2026-10-21. These additions are available from v0.3.0.

Reference: the [Gitea 28 API](https://docs.gitea.com/api/), [OpenAPI specification](https://docs.gitea.com/openapi3-28.json), and [generic package protocol](https://docs.gitea.com/usage/packages/generic/). Complete field coverage means the documented create/edit payloads of this version, not every response property or future API. Inputs retain bounded types, lengths, and ranges.

## Issues and project tickets

A Kanban ticket is an issue displayed as a card. Edit ticket content using issue tools, and column/position using project tools. Global issue IDs differ from repository-local issue numbers.

| Payload / tool                       | Supported fields                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateIssueOption` / `create_issue` | `title`, `body`, deprecated `assignee`, `assignees`, `labels`, `milestone`, `projects`, `closed`, `due_date`, `ref`                           |
| `EditIssueOption` / `update_issue`   | `title`, `body`, deprecated `assignee`, `assignees`, `milestone`, `projects`, `due_date`, `ref`, `state`, `content_version`, `unset_due_date` |
| Project creation                     | `title`, `description`, `card_type`, `template_type`                                                                                          |
| Project editing                      | `title`, `description`, `card_type`, `state`                                                                                                  |
| Column creation / editing            | `title`, `color` / `title`, `color`, `sorting`                                                                                                |

Project arrays replace existing associations. Clear with `projects: []`, `assignees: []`, `milestone: 0`, or `body: ""`. Gitea 28.2.0 sometimes returns cleared lists as `null`. Prefer `assignees` over its deprecated singular counterpart. Cards use `get_issue.data.id`; issue tools use repository-local `index`.

Pass the last read `content_version` to prevent stale overwrites. After a conflict, read again and obtain a fresh approval. Edit labels with `set_issue_labels`; the edit-issue payload has no labels property. Set/clear deadlines with the issue fields or `set_issue_deadline`; Gitea retains only the date. Dedicated tools also support locking/unlocking, pinning/unpinning/reordering pins, and adding/removing dependencies.

IDs, issue numbers, authors, creation times, and counters are not arbitrary write fields. The returned `time_estimate` has no setter in the checked create/edit payloads or independent endpoint in this specification. Priority, story points, and custom fields are not invented or silently sent as ineffective parameters. Repository, organization, and current-user project fields and card operations are tested against real Gitea. See [Kanban usage](PROJECTS-ACTIONS-TIME.md).

## Actions pipelines

Dispatch supports `workflow`, `ref`, string `inputs`, and query parameters `return_run_details`/`scoped_workflow_source_repo_id`. Configure Actions and a runner; the workflow must support `workflow_dispatch`. Inputs must not contain secrets.

Run filters: `event`, `branch`, `status`, `actor`, `head_sha`, `exclude_pull_requests`, `page`, `limit`, plus `scoped_workflow_source_repo_id` for workflow-specific lists. Enable/disable, full rerun, failed-job rerun, individual-job rerun, and regular cancellation are exposed; force cancellation and public runner administration are not.

Real tests execute controlled shell steps in disposable Runner 5.2.0: intentional failure, failed-job rerun, individual-job rerun, full rerun, success, and cancellation while running. No host mounts, Docker socket, or privileged mode; the runner uses an internal network, and only the fixture Gitea server additionally exposes a loopback port. No production deployment is executed.

## Organizations and repositories

`create_organization` supports all eight create fields: `username`, `full_name`, `description`, `email`, `location`, `website`, `visibility`, `repo_admin_change_team_access`. Defaults are private visibility and disabled delegation of team-access changes. Inspect that delegation setting before approval. It uses the normal `/orgs` API, not site-admin endpoints.

Both personal and organization repository creation support all twelve fields: `name`, `description`, `private`, `auto_init`, `default_branch`, `gitignores`, `issue_labels`, `license`, `readme`, `template`, `trust_model`, `object_format_name`. Server templates and Git object-format capabilities must exist. Defaults are private, initialized repositories.

## Packages

Inspect packages, versions, and file hashes using `list_packages`, `list_package_versions`, `get_package`, `list_package_files`. Link/unlink repository metadata with `link_package_repository`/`unlink_package_repository`. `delete_package_version` destructively deletes one complete version and requires approval.

`upload_generic_package` publishes `owner`, `name`, `version`, `file_name`, and `content_base64` as unchanged binary bytes to `/api/packages/.../generic/...`, using `application/octet-stream`. Maximum **750,000 decoded bytes per file** bounds MCP and approval payloads. No arbitrary target URLs, local filesystem access, or silent overwrites. The real test includes null and non-UTF-8 bytes and verifies Gitea's file size and SHA-256.

This is generic-package publishing, not universal npm/Maven/container publishing. Other formats and large files require native registry clients. Metadata access does not imply format-specific upload support.

## Sprints and releases

The checked Gitea API has no separate sprint endpoint. Model a sprint as a milestone with `title`, `description`, `due_on`, and `state`; use milestone tools and associate issues through `milestone`. Partial milestone edits no longer require resending the title. Sprint start dates, velocity, and story points are not thereby available.

Release creation supports `tag_name`, `target_commitish`, `name`, `body`, `draft`, `prerelease`, `tag_message`. `update_release` supports all six edit fields, excluding `tag_message`. Draft creation, publication, notes, and prerelease state have real round-trip tests. Tags are never force-rewritten. The safe creation tool requires an explicit target ref and name.

## Wiki

Create/read/list/revisions/edit/delete tools use the official wiki API. Create/edit expose `title`, `content_base64`, `message`; `page_name` identifies the existing page using its actual API slug. Enable the internal wiki. Writes create wiki commits; read and review current content before replacement. Main repository branch protection is not wiki concurrency protection.

## Permissions and verification

MCP scopes and exact independent browser approval remain required. Gitea organization creation can need `write:organization`, package publishing `write:package`, personal project/repository creation `write:user`, with corresponding repository/issue permissions elsewhere. Permissions are never bypassed and blanket site-admin rights are unnecessary.

For Gitea OAuth, explicitly configure additional scopes per instance:

```json
{
  "id": "work",
  "url": "https://git.example.org",
  "oauthClientId": "YOUR_CLIENT_ID",
  "oauthScopes": [
    "read:user",
    "write:repository",
    "write:issue",
    "write:organization",
    "write:package"
  ]
}
```

Replace `read:user` with `write:user` only when required for personal projects/repository creation. Choose only necessary scopes. `all` and admin scopes are rejected; default scopes are not automatically broadened. Reconnect Gitea through the portal and review consent after changing scopes. Enter PATs only in the portal.

Run `pnpm check` and `pnpm test:e2e` with Node 24, pnpm, and Docker. Real tests use a normal user and explicit non-admin scopes in disposable infrastructure. Schema/forwarding coverage, approval checks, and real round trips are distinct evidence. See [PROGRESS.md](../PROGRESS.md). Production HTTPS/OAuth and real ChatGPT/Codex account installation remain unverified.
