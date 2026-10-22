# Operating and verifying write approval (`REQUIRE_WRITE_APPROVAL`)

[Deutsch](../de/SCHREIBFREIGABE.md) · As of 2026-10-22

## 1. The two modes

| `REQUIRE_WRITE_APPROVAL` | Behaviour                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `false` (default)        | Write tools such as `create_issue` or `create_project` run immediately. No approval is staged or consumed and no `approval_required` response is returned.                                     |
| `true`                   | The first call returns `approval_required` with `approvalUrl`. The account owner inspects and approves the exact change in the browser, then the identical call is repeated with `approvalId`. |

A missing variable means `false`. Invalid values such as `TRUE`, `yes`, `1` or an empty value stop the server from starting and make the installer fail. A mode is never guessed.

## 2. Security differences

These stay active in both modes: OAuth token validation (signature, issuer, audience, expiry), the `gitea.write` scope for every write, the linked account's Gitea permissions, rate limits, tenant isolation, the feature-branch requirement and protected-branch check for file changes, `content_version` on issue edits, the current mergeable PR head check on merges, and the audit log.

Only `true` adds a second, independent control: a person sees the exact payload, and each approval is single-use, expires after ten minutes and is bound to user, connection, tool and payload. With `false`, an authorized ChatGPT client can make changes without that extra confirmation, for example after a prompt injection from repository content. Use `true` for high-value repositories and keep Gitea tokens narrowly scoped.

## 3. Configuration

Set it in the `.env` used by the installer (default: `.env` in the project folder, otherwise the path from `--config`):

```dotenv
REQUIRE_WRITE_APPROVAL=false
```

Docker Compose reads the same file through `env_file: ${GITEA_ENV_FILE:-.env}`. `docker-compose.yml` does not override the variable. If you use another file, always pass `--config PATH`. A changed `.env` takes effect only when the container is **recreated**. `docker compose restart` is not enough.

## 4. Update and restart

To update an installed instance (Git checkout with no local changes to tracked files):

```bash
cd /path/to/gitea-chatgpt-plugin
node scripts/install.mjs --update          # add --config /path/to/.env if needed
```

`--update` runs `git pull --ff-only` and then starts the freshly pulled installer with `--start`. `--start` builds the server, plugin and Docker image. If the build fails, it stops and the running container stays untouched. It then replaces the container with `docker compose up -d --no-build --force-recreate --wait` and runs the checks from section 5. On any mismatch it exits with code 1.

If you only changed `.env`, run `node scripts/install.mjs --start`.

The `gitea-mcp-data` volume, `.env` and `ENCRYPTION_KEY` are kept. Never use `docker compose down -v`. The previous image is kept as `gitea-chatgpt-plugin:previous`. To roll back:

```bash
docker tag gitea-chatgpt-plugin:previous gitea-chatgpt-plugin:local
docker compose up -d --no-build --force-recreate --wait
```

`node scripts/install.mjs` without `--start` only builds the image and does **not** replace the running container; the script says so. Because of `pull_policy: build`, a manual `docker compose up -d` also always builds from the current source. Without the script, though, the build commit is reported as `unknown`.

## 5. Verify the effective mode

On the server, without making changes:

```bash
node scripts/install.mjs --status
docker compose logs mcp | grep "Gitea MCP server ready"
```

Expected startup line:

```text
Gitea MCP server ready: version=0.4.0 commit=<git sha> writeApproval=disabled mode=production
```

`--status` checks that the running image is the last one built, that the `org.opencontainers.image.revision` label matches `git rev-parse HEAD`, that the health check reports `healthy`, and that the mode in the startup line matches `.env`. It also warns about other running Gitea MCP containers, such as ones from another Compose project or an earlier `docker run`. It never prints configuration values or secrets.

In ChatGPT, call the `get_runtime_status` tool. It requires a valid OAuth sign-in with `gitea.read` and returns no tokens or secrets:

```json
{
  "mcpVersion": "0.4.0",
  "buildCommit": "<git sha>",
  "writeApprovalRequired": false,
  "approvalMode": "direct",
  "deploymentMode": "production",
  "configurationLoaded": true
}
```

If `buildCommit` is not the commit you expect, a stale container or another instance is answering. The public `/healthz` endpoint intentionally returns only `{"status":"ok"}`.

## 6. Diagnosing `approval_required` while `false` is set

An `approval_required` response with an `approvalId` always comes from the server, never from ChatGPT. From this version on it is returned only when `requireWriteApproval=true`. So if your instance reports `false`, the response came from a different process. Steps:

1. Call `get_runtime_status` in ChatGPT. If the tool is unknown, either an older version is running or ChatGPT is using stale tool metadata (see 7).
2. `writeApprovalRequired: true`: the instance loaded `true`. Check the `.env` or `--config` in use and run `node scripts/install.mjs --start`.
3. `writeApprovalRequired: false` but `approval_required` still appears: another instance is answering. `node scripts/install.mjs --status` lists other containers. In Nginx Proxy Manager, check that the forward host and port point at exactly this container (the service name `mcp` on a shared Docker network, otherwise the host port from `PORT`). Stop stale containers.
4. `buildCommit` differs from `git rev-parse HEAD`: the update was not applied. Run `node scripts/install.mjs --update`.
5. The startup line has no `writeApproval=`: the image predates this version and must be rebuilt.

## 7. Refreshing tool metadata in ChatGPT

ChatGPT caches a connection's tool list. Write tool descriptions depend on the mode: with `false` they end with "Runs immediately without browser approval", with `true` with "Browser approval is required …", and only `true` offers the `approvalId` parameter. After switching modes, after an update that adds tools, or if `get_runtime_status` is missing, open the app or connector settings in ChatGPT and refresh the tool list, or disconnect and reconnect. Then start a new chat, because older chats keep earlier descriptions and responses in context. Server behaviour never depends on cached metadata.

## 8. Returning to approval mode

```bash
sed -i 's/^REQUIRE_WRITE_APPROVAL=.*/REQUIRE_WRITE_APPROVAL=true/' .env
node scripts/install.mjs --start
node scripts/install.mjs --status   # expect writeApproval=required
```

Then refresh the tool metadata in ChatGPT (section 7). Approvals stay single-use and expire after ten minutes.

## 9. Operator checklist

1. SSH to the server, change to the project folder and check that `git status` shows no local changes.
2. Set or check `REQUIRE_WRITE_APPROVAL=false` in the `.env` in use. If it lives elsewhere, pass `--config` everywhere.
3. Run `node scripts/install.mjs --update` and look for "Deployment-Prüfung erfolgreich, Schreibfreigabe: disabled".
4. If it warns about other containers, check which one Nginx Proxy Manager targets and stop stale ones with `docker stop <name>`. Do not delete their volumes.
5. `curl -fsS https://<mcp-host>/healthz` must return `{"status":"ok"}`.
6. Refresh the tool list in ChatGPT and start a new chat.
7. Call `get_runtime_status` and compare `buildCommit` with `git rev-parse HEAD` and check `writeApprovalRequired: false`.
8. In your own test repository, run a harmless write such as creating a test project and confirm that no `approval_required` response comes back.
