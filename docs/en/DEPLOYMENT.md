# Deployment

For initial setup, use the [complete step-by-step guide](STEP-BY-STEP.md), including checkpoints from server installation to the first approved write.

Provide an HTTPS MCP origin and a trusted OAuth/OIDC provider (for example self-hosted Keycloak). Keep Gitea independently deployed. Example domains in this repository are placeholders, not running services.

## OAuth provider

For Gitea OAuth, explicitly configure per-instance `oauthScopes` when organization/package/personal-project tasks require extra permissions, then reconnect through the portal. Defaults are not automatically expanded; `all` and admin scopes are rejected. See the [scope example and parameter matrix](PARAMETER-AND-FUNCTION-VERIFICATION.md).

Register two public Authorization Code clients, both requiring S256-PKCE:

- `gitea-chatgpt`: exact callback displayed by the actual ChatGPT/Codex connection; no wildcard redirects.
- `gitea-portal`: callback `https://<mcp-host>/callback`.

Create `gitea.read` and `gitea.write` scopes. Assign read by default and write only where authorized. The portal requests `openid gitea.read gitea.write`. Both clients' access tokens need the exact MCP resource audience, normally `https://<mcp-host>/mcp`. Enable consent and short access-token lifetimes (recommended five minutes), disable implicit/password flows, and use RS256 or ES256 JWT signing. The provider handles its own client refresh grants. The MCP resource server does not accept Gitea tokens as its own access tokens.

In Keycloak, create an OIDC realm, Standard Flow clients, S256-PKCE, client scopes with “Include in token scope”, and an Audience protocol mapper with Included Custom Audience equal to the MCP resource identifier and Add to access token enabled. Get issuer, authorization, token and JWKS URLs from the realm's `.well-known/openid-configuration`. Validate actual JWT audience and scopes; a successful login alone is insufficient.

## Configure and start

Copy `.env.example` to `.env`; generate a random 32-byte hex encryption key. Set every OAuth URL and client ID, `PUBLIC_URL` (HTTPS origin only), `OAUTH_AUDIENCE`, allowed Gitea instances and database location. Keep configuration/secrets outside Git and restrict file access. `GITEA_INSTANCES` is a JSON array of `{ "id": "work", "url": "https://git.example.org" }`; subpath installations are supported. Default `ALLOW_USER_SERVERS=false` uses the configured instance list. Edit .env and rerun node scripts/install.mjs to apply changes outside ChatGPT. Explicitly setting true optionally permits extra public servers through the portal. Only configured instances can use operator private-CIDR exceptions; these never apply to self-service URLs.

For Gitea OAuth, register an application on each chosen instance with callback `https://<mcp-host>/gitea/callback` and PKCE, then set `oauthClientId` and optional `oauthClientSecret` on that instance using operator secrets. Otherwise use narrowly scoped Gitea PATs in the browser portal. Grant only required user/repository/issue read/write scopes. Never grant admin or runner access by default.

Private addresses are denied by default. Explicitly allow only required CIDRs using `ALLOWED_PRIVATE_CIDRS`, preferably individual `/32` or `/128` addresses. This is a privileged operator exception and must never be user-controlled.

```bash
node scripts/install.mjs --start
docker compose ps
docker compose logs --tail=50 mcp
curl http://127.0.0.1:3000/healthz
```

The container is non-root, read-only except its data volume, drops capabilities and binds the host port to loopback. Keep database under `/app/data`; protect and encrypt backups.

## Reverse proxy / Nginx Proxy Manager

Create a Proxy Host for your MCP domain, HTTP upstream port 3000, valid certificate and Force SSL. Preserve the exact Host header, Authorization and MCP headers; disable response buffering on `/mcp`. Proxy `/portal`, callbacks and discovery paths through the same origin. Do not add Basic Auth ahead of MCP. A proxy in another container cannot reach the server through its own loopback: join a private Docker network, use upstream host `mcp`, and remove the unnecessary host port mapping.

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Authorization $http_authorization;
    proxy_buffering off;
    proxy_read_timeout 60s;
}
```

Browser sessions require trusted HTTPS because cookies are Secure. Do not rewrite the Host; the server intentionally rejects unexpected hosts/origins. It does not blindly trust forwarded headers. Apply additional rate limits at your edge if required.

## Development and checks

Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:e2e`, then build the image and run `pnpm test:docker`. For local runtime with `.env`, use `node --env-file=.env --import tsx apps/mcp-server/src/index.ts`; a trusted HTTPS proxy and real OAuth callbacks remain necessary. HTTP loopback injections exist only in tests.

Verify protected-resource discovery, OAuth initialization in MCP Inspector, tool listing and a harmless repository read. Open the portal and connect Gitea. In your own test repository, stage a write, inspect/approve its exact browser payload, repeat the identical tool arguments with approvalId and verify that replay fails. Real ChatGPT account verification remains a separate step.

## Updates and rollback

Record the source commit used for your local build. Stop the service and consistently back up the entire database volume including SQLite WAL; back up the encryption key separately. Update the source, retain .env, run node scripts/install.mjs --start and recheck health/OAuth/read behavior. Roll back both image and matching database snapshot when needed. Never use `docker compose down -v` for upgrades. Restart clears browser sessions. Losing the key requires reconnecting all accounts. Automated encryption-key migration is not included in v0.1; use controlled reconnection with a new database/key. Define audit retention and deletion policies as the operator.
