# Production installation

[Deutsch](../de/PRODUKTION.md)

Download **gitea-deployment-VERSION.zip** from the desired GitHub release and verify its SHA-256 against the published `SHA256SUMS`. Extract it into a dedicated directory. This package needs Docker Engine and Docker Compose for the MCP service; Git, Node.js and a local build are unnecessary. Configure your HTTPS reverse proxy and OAuth provider separately.

1. Copy `.env.example` to `.env`. Keep `GITEA_MCP_VERSION` at the version shipped with the ZIP; it explicitly selects the verified published image.
2. Generate a random 32-byte key once, for example with `openssl rand -hex 32`, and set `ENCRYPTION_KEY`. Back up the key separately. Restrict file access to the operator (`chmod 600 .env` on Linux).
3. Enter your own MCP/OAuth HTTPS addresses and portal client ID. Register the clients, PKCE, scopes, audience and exact callbacks following the [step-by-step guide](STEP-BY-STEP.md). Do not use an OAuth development server in production.
4. Default `ALLOW_USER_SERVERS=true` lets users connect their own public HTTPS Gitea server through the setup link returned in ChatGPT. `GITEA_INSTANCES=[]` may stay empty. Fixed internal instances or prepared Gitea OAuth clients need operator entries. `ALLOW_USER_SERVERS=false` restricts connections to those entries. Credentials belong only in the protected portal or documented operator secrets.
5. Start from the extracted directory:

```bash
docker compose pull
docker compose up -d --no-build --wait
docker compose ps
curl --fail http://127.0.0.1:3000/healthz
```

Expect `{"status":"ok"}`. The service uses `NODE_ENV=production`, a non-root user, a read-only root filesystem, a process limit and rotating container logs. A dedicated volume stores persistent data. No watch process or development server runs. The image includes the SVG/PNG branding and portal stylesheet; the plugin download uses the same icon.

6. Connect your HTTPS proxy. Check discovery, portal login, Gitea connection and a read tool. Test writes only in your own test repository with independent portal approval. Actual account acceptance requires your concrete HTTPS/OAuth deployment.
7. Download **gitea-chatgpt-plugin-VERSION.zip** from the same release for plugin installation. The deployment ZIP sets up the server; the plugin ZIP connects a compatible client to its HTTPS endpoint. If needed, build a package with a concrete `MCP_PUBLIC_URL` from source as described in the detailed guide.

## Updates and source builds

Without Docker: extract the same release's server archive, install Node.js 24 LTS and pnpm 11.25.0, run `pnpm install --prod --frozen-lockfile`, securely supply `.env` and run `pnpm start` under a dedicated unprivileged service account. Startup loads `.env` and enforces `NODE_ENV=production` before loading the application. Supply process supervision, persistent storage, backups and HTTPS. Docker remains the simpler default.

Back up the stopped data volume and encryption key before upgrading. Intentionally update the version in your existing `.env`, review new configuration fields, run `docker compose pull` followed by `docker compose up -d --no-build --wait` and recheck health/login/tools. Do not overwrite existing secrets with a new example file. Rollbacks require both the previous image and its matching database backup. Never use `docker compose down -v` to update.

Developers can explicitly build from a source checkout instead:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build --wait
```

This build also uses production mode. The build override is intentionally only included in source checkouts. Public GitHub publication does not provide hosting or approval in the official plugin directory.
