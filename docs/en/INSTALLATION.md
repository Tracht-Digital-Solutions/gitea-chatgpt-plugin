# Build, configure and install from source

[Deutsch](../de/INSTALLATION.md) · Updated: 2026-10-22

Build locally using the installation script. There are no GitHub releases or required prebuilt images. Settings belong in your local `.env`; ChatGPT cannot edit this file or change the server/OAuth configuration.

## 1. Requirements

Install Node.js 24 LTS, pnpm 11.25.0, Git and Docker Engine with Docker Compose for container deployment. Supply your own Gitea server, HTTPS reverse proxy and OAuth/OIDC provider. The plugin ZIP does not host the MCP service. See [deployment](DEPLOYMENT.md) for OAuth clients, scopes, exact audience/callbacks and proxy settings.

## 2. Create your configuration

```bash
git clone https://github.com/Tracht-Digital-Solutions/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
corepack enable
corepack prepare pnpm@11.25.0 --activate
node scripts/install.mjs --init
```

This copies `.env.example` to `.env` and generates a random encryption key once. Existing files and keys are never overwritten. Keep the key and database backups secure. The file is ignored by Git and excluded from plugin packages. New files use mode 0600 on Unix; restrict Windows file access as appropriate.

Edit `.env` using your actual addresses. Placeholder hosts are rejected by the installer:

- `PUBLIC_URL`: HTTPS origin of your MCP/portal service, without a path.
- `PORT`: host port for Docker or the native server port. Containers internally use 3000.
- `ENCRYPTION_KEY`: generated 64-character hex key; retain across updates.
- `OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `OAUTH_JWKS_URL`, `OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL`: provider discovery and token settings. Audience is normally `PUBLIC_URL` plus `/mcp`.
- `PORTAL_CLIENT_ID`: registered public portal OAuth client, callback `PUBLIC_URL/callback`.
- `MCP_CLIENT_ID`: registered public ChatGPT/Codex OAuth client; embedded in the generated plugin.
- `GITEA_INSTANCES`: JSON array of your own servers. No server is preconfigured.
- `ALLOW_USER_SERVERS=false`: default, configure servers in this file. Optional `true` enables extra public server registration in the portal.
- `ALLOWED_PRIVATE_CIDRS`: minimal explicit exceptions for configured internal servers, otherwise empty.
- `REQUIRE_WRITE_APPROVAL=false`: default, writes run without browser approval. `true` requires an exact single-use approval per write.
- `DATABASE_PATH`: keep container default `data/gitea.sqlite`.

Example, replace the host:

```dotenv
GITEA_INSTANCES=[{"id":"my-server","url":"https://YOUR-GITEA-HOST"}]
ALLOW_USER_SERVERS=false
REQUIRE_WRITE_APPROVAL=false
```

The default requires at least one actual server. Add more objects for multiple servers. Gitea OAuth optionally uses `oauthClientId`, `oauthClientSecret` and explicit `oauthScopes` per instance; keep secrets local. Alternatively enter a narrowly scoped personal Gitea token only in the protected portal, never in chat.

## 3. Validate, build and start

```bash
node scripts/install.mjs --check
node scripts/install.mjs --start
```

These commands work in PowerShell, Linux and macOS. The installer installs locked dependencies, compiles TypeScript, validates full server configuration, creates a plugin with your concrete endpoint/client ID, builds Docker locally and starts Compose with a health check. No GitHub release or GHCR image is needed.

Build only: `node scripts/install.mjs`; this does not replace the running container. Without Docker: `node scripts/install.mjs --no-docker`, followed by supervised `pnpm start` under an unprivileged account. Native startup also uses production mode. Use `--config PATH` for an alternative configuration, including Compose startup.

Outputs in `artifacts/`:

- `gitea-chatgpt-plugin-VERSION.zip`: concrete portable plugin without secrets.
- `chatgpt-connection.json`: public URL, OAuth client ID and connection endpoints.
- `gitea-deployment-VERSION.zip`: locally built source/install kit, scripts, example environment and documentation.
- `SHA256SUMS`: checksums of generated ZIPs.

## 4. HTTPS, account linking and ChatGPT

Configure HTTPS proxying, preserve Host/Authorization and disable MCP response buffering. Host binding defaults to loopback. A proxy in another container needs a shared private Docker network and service name `mcp`; its loopback is not the Docker host.

Check `docker compose ps` and `curl --fail http://127.0.0.1:3000/healthz`, adjusting the port if needed. Open `PUBLIC_URL/portal`, sign in and connect your account on a configured Gitea instance. Enter tokens only there. Gitea OAuth is available when registered/configured for that instance. The portal does not edit local server settings.

In ChatGPT select **Plugins → + → Add custom MCP server**. Copy the actual `/mcp` URL and OAuth settings from `artifacts/chatgpt-connection.json`; register the exact callback shown by ChatGPT at your provider. Create/install the plugin, open a new Work chat and select it with `@`. Account and workspace policies apply. See [official OpenAI instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).

The ZIP supports clients and authoring/import workflows that accept portable Agent Plugins; this guide does not claim a generic ZIP upload button in ChatGPT. Compatible Codex clients can use their supported MCP URL/OAuth configuration. GitHub source and local packages do not imply public directory approval. Verify `list_instances`, `connection_status` and `list_repositories`, then an explicitly approved write in your own test repository. Actual ChatGPT account installation remains unverified by this project.

## 5. Changes and updates

Edit `.env` outside ChatGPT and rerun `node scripts/install.mjs --start`. It rebuilds, always recreates the container (`--force-recreate`) and then verifies image, build commit, health and the effective approval mode. `docker compose restart` does not apply changed `.env` values. `node scripts/install.mjs --status` verifies the running deployment without changes. For code updates run `node scripts/install.mjs --update` (clean checkout, `git pull --ff-only`, then `--start`). See the [write approval guide](WRITE-APPROVAL.md) for rollback and diagnosing `approval_required`. If the MCP URL or OAuth client ID changes, update the client connection or reinstall the newly built package too. Preserve your key and data volume. Stop the service and consistently back up the database before code/database updates. Never use `docker compose down -v` to upgrade.

For code updates, use a clean checkout and `git pull --ff-only`, then rebuild. Roll back to the previous commit and matching database backup if needed. CI/security continue validating source and local artifacts. Release/Publish automation has been removed.
