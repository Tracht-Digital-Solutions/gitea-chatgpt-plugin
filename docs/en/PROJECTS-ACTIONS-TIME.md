# Actions, projects/Kanban, and time tracking

[Deutsch](../de/PROJEKTE-ACTIONS-ZEIT.md). Available from v0.2.0; these tools are not part of the previous v0.1.1 release. The current [Gitea 28 API](https://docs.gitea.com/api/) and [official specification](https://docs.gitea.com/openapi3-28.json) document the endpoints. Older or restricted instances may reject operations.

## Setup and approval

Complete the [step-by-step setup](STEP-BY-STEP.md) and install a build containing these tools. Reads require `gitea.read`; every mutation requires `gitea.write`, appropriate Gitea permissions, and independent browser approval of the exact arguments. Gitea tokens need corresponding Actions/repository/issue/project permissions; organization/user projects may require additional organization/user scopes. Avoid blanket administrative permissions. Denied requests are never bypassed.

First call a write tool without `approvalId`, open its approval URL yourself, inspect and approve, then repeat identical arguments with that ID. Approvals expire after ten minutes, apply to one user/connection/payload, and cannot be reused.

## Actions control

| Task                                | Tools                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inspect workflows/runs/jobs/logs    | `list_action_workflows`, `get_action_workflow`, `list_action_runs`, `list_action_workflow_runs`, `get_action_run`, `list_action_jobs`, `get_action_job_logs` |
| Manual dispatch                     | `dispatch_action_workflow` with `workflow`, explicit `ref`, optional string `inputs`                                                                         |
| Enable/disable                      | `enable_action_workflow`, `disable_action_workflow`                                                                                                          |
| Rerun a run / failed jobs / one job | `rerun_action_run`, `rerun_failed_action_jobs`, `rerun_action_job`                                                                                           |
| Regular cancellation                | `cancel_action_run`                                                                                                                                          |

Example: “Inspect failed runs of build.yml in work, owner/team-repo. Prepare rerunning the failed jobs of run 123 for approval.” Manual dispatch requires `workflow_dispatch` in the workflow, enabled Actions, and configured runners. Use a workflow identifier such as `build.yml`. Dispatches and reruns can execute deployments: inspect ref, inputs, and code before approval. Inputs must not contain credentials; secrets remain in Gitea. Force cancellation, runner administration, and secret management are not exposed.

## Projects and Kanban

Base tool names operate on a repository (`owner`, `repo`). Append `_organization` for organization projects (`org`), or `_user` for the authenticated user's projects. For example: `create_project`, `create_project_organization`, `create_project_user`. User project mutations target only the current Gitea account.

| Task                            | Base tools                                                                |
| ------------------------------- | ------------------------------------------------------------------------- |
| Inspect projects                | `list_projects`, `get_project`                                            |
| Create/edit/close/reopen/delete | `create_project`, `update_project`, `delete_project`                      |
| Inspect columns                 | `list_project_columns`, `get_project_column`                              |
| Create/edit/delete columns      | `create_project_column`, `update_project_column`, `delete_project_column` |
| Reorder / choose default        | `reorder_project_columns`, `set_default_project_column`                   |
| Inspect cards                   | `list_project_column_issues`                                              |
| Add/move/remove cards           | `add_project_issue`, `move_project_issue`, `remove_project_issue`         |

Suggested workflow:

1. Create a project using template `basic_kanban`, `none`, or `bug_triage`, after approval.
2. Read its returned project ID and existing columns.
3. Prepare a “Blocked” column, for example with color `#ff9900`. Approve each mutation separately.
4. Read the issue with `get_issue`. **Cards use its global `data.id`, not the repository-local issue number passed as `get_issue.index`.**
5. Add the card with `add_project_issue`; move it using `move_project_issue`, target `column_id`, and optional `sorting` position.
6. Before reordering, list all columns. Supply every column ID exactly once in the intended order. Gitea validates membership.
7. Close/reopen the project with `update_project` and `state: closed`/`open`.

Removing a card or deleting a project does not delete its underlying issues. Structure and associations can still be lost; inspect affected cards before approval. Column colors use six hexadecimal digits prefixed by `#`. Paginated results are not complete board inventories until all pages are read.

## Time entries and stopwatches

| Task                                            | Tools                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Issue/repository/current-user time entries      | `list_issue_times`, `list_repository_times`, `list_my_times`               |
| Book time                                       | `add_issue_time`                                                           |
| Delete one entry                                | `delete_issue_time`                                                        |
| Inspect running timers                          | `list_stopwatches`                                                         |
| Start / stop and book / discard without booking | `start_issue_stopwatch`, `stop_issue_stopwatch`, `discard_issue_stopwatch` |

“Book 90 minutes against issue 42 after approval” means `time: 5400` seconds. Date filters `since`/`before` and optional manual-entry `created` use RFC 3339 timestamps with a timezone. Issue/repository lists optionally filter by `user`. Read all pages before calculating a complete total.

Manual entries are booked for the authenticated Gitea user; impersonation is not exposed. Enable repository time tracking and grant the required permissions. Timers start/stop **when the approved call executes**. Delayed stop approval increases measured time; use `add_issue_time` for an exact predefined duration. Bulk resetting all issue time entries is deliberately unavailable.

## Evidence and limitations

Every new tool has contract, validation, scope, tenant, approval, and replay checks. An isolated Gitea 28.2.0 MCP test covers repository Kanban/card movement, time entry creation/deletion, stopwatches, workflow enable/disable, dispatch, and regular cancellation. It does not execute a runner or deploy anything. Job reruns have contract and simulated-response coverage; organization/user project APIs have contract coverage without full real-account acceptance of those scopes.

HTTP 404 can indicate an absent, unsupported, or inaccessible endpoint. No browser scraping or permission bypass is used. Real ChatGPT/Codex account integration remains unverified until deployment. See [verification evidence](../PROGRESS.md).
