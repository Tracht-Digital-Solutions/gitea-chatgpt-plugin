# Gitea for ChatGPT

[Deutsch](../../README.md) · Apache-2.0 · Early development releases in the 0.x series.

**Installation and setup:** [Step-by-step guide](STEP-BY-STEP.md) covering Docker, OAuth/Keycloak, HTTPS, Gitea connections, ChatGPT/Codex, and troubleshooting.

A self-hosted Node.js 24/TypeScript MCP server and portable Agent Plugins package for ChatGPT and compatible Codex clients. Connect multiple Gitea instances per user, inspect repositories/files/commits/issues/PRs/releases/Actions, and make changes after exact, independent human browser approval. No paid cloud service is required. This is an independent community project, not an official OpenAI or Gitea product.

## Install

New on main: [complete issue/project fields, organizations, repository creation, generic packages, sprint milestones, releases and wiki](PARAMETER-AND-FUNCTION-VERIFICATION.md), plus real isolated runner execution/rerun/cancellation tests. These additions are not yet part of v0.2.0.

Available from v0.2.0: [Actions control, projects/Kanban, and time tracking](PROJECTS-ACTIONS-TIME.md), with exact browser approval for mutations.

```bash
git clone https://github.com/jtracht/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Configure encryption key, your HTTPS origin, OAuth endpoints and allowed Gitea instances.
docker compose up -d --build
```

You must provide your own HTTPS reverse proxy and OAuth/OIDC provider. The server has no unauthenticated production mode. See [deployment](DEPLOYMENT.md) and [security](SECURITY.md).

Open `https://<your-host>/portal`, sign in and connect Gitea using configured Gitea OAuth or a narrowly scoped PAT entered only into the portal password field. Never paste credentials into chat. Multiple connections are isolated by OAuth issuer/subject and instance. Disconnect through the portal; revoke the upstream grant in Gitea for complete revocation.

## ChatGPT / Codex

The [current official connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) uses **Plugins → + → Add custom MCP server**. Enter your HTTPS `/mcp` URL, configure OAuth and the registered client, create/install the plugin, then select it with `@` in a new Work chat. Register the exact callback displayed by the client. Availability depends on surface, plan, account and workspace policy; no complete plan matrix is established by the reviewed developer pages.

Run `pnpm package` to create the portable ZIP. Set `MCP_PUBLIC_URL=https://<your-host>/mcp` to materialize a concrete endpoint; otherwise the package declares a configurable HTTPS URL template. Clients must support that template or use a concrete configured package. Codex can also use its supported MCP URL/OAuth configuration. A GitHub release does not deploy a server or automatically publish to the universal plugin directory. Directory submission requires a separate verified publisher/domain, policies, review material and platform review. Account-level ChatGPT/Codex installation is **not verified** by this project run.

## Features and limits

Repositories, details/statistics, safe settings, branches/tags, file creation/update/delete commits, commit history/diffs, comparisons, issues/search/comments/assignees/labels/milestones/dependencies, pull requests/files/diffs/reviews/approved merges, releases/tags, and available Actions workflows/runs/jobs/logs. Content and commit-message searches are bounded and explicitly non-exhaustive. Optional endpoints may be unavailable on older/restricted instances. No site-admin, runner-administration or webhook tools. Organization creation includes an explicitly approved delegation setting.

File changes require a known unprotected feature branch and current blob SHA for replacement/deletion. Every mutation first returns an approval URL; the human signs in and approves the exact payload, then the client repeats identical arguments with `approvalId`. Approval is single-use, user/instance/credential-bound and expires after ten minutes. Failed writes require a fresh approval.

Example requests: “List my connected Gitea instances”; “Read this repository README and summarize open issues”; “Prepare a feature branch and file change”; “Show the approval URL for this exact change”; “Inspect the diff and prepare a pull request.”

## Development and releases

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
docker build -t gitea-chatgpt-plugin:dev .
pnpm test:docker
```

The normal test command skips real Gitea E2E unless launched in the isolated fixture. `test:e2e` creates and removes a disposable pinned Gitea container; it must never target production repositories. Security core coverage is gated at 85%. CI includes schemas, package validation, build and Docker health. Security uses dependency audit, Gitleaks, CodeQL and Trivy. Release Please uses Conventional Commits and explicitly calls Publish, avoiding GITHUB_TOKEN event-chaining gaps. Publish rechecks the tag and produces ZIP, server archive, checksums and GHCR image with provenance/SBOM.

Use `fix:` for patch, `feat:` for minor and breaking-change commits for major releases. Contributions must update both languages and preserve authorization/approval boundaries. See [contributing](../../CONTRIBUTING.md), [changelog](../../CHANGELOG.md), [license](../../LICENSE), [progress and actual evidence](../PROGRESS.md), and [vulnerability reporting](../../SECURITY.md). External verification is reported separately; a passing local MCP test does not prove ChatGPT account integration.
