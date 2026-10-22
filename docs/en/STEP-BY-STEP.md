# Step by step: install, configure, and test

[Deutsch](../de/SCHRITT-FUER-SCHRITT.md) · Updated: 2026-10-21 · Software: v0.4.0.

For installation without Git or a local build, see [production package setup](PRODUCTION.md). Default Compose uses a published image and `NODE_ENV=production`. Keep `GITEA_MCP_VERSION` from the release's `.env.example`; update it intentionally when upgrading. Source builds additionally require `docker-compose.build.yml`.

This guide takes you from your own server to your first approved write operation. Commands use a Linux shell. The project does not provide a hosted MCP service. Production HTTPS/OAuth deployment and installation in a real ChatGPT/Codex account remain unverified; run the checkpoints below on your own system.

## 1. Prepare infrastructure and addresses

You need a server with Docker Engine, Docker Compose, and Git; a Gitea account with access to a test repository; an HTTPS reverse proxy with a valid certificate; and an OAuth/OIDC provider. These instructions use Keycloak.

If Keycloak is not running yet, first configure a persistent production installation using its official [container guide](https://www.keycloak.org/server/containers) and [reverse proxy guide](https://www.keycloak.org/server/reverseproxy). Do not substitute an ephemeral `start-dev` server for production. Keycloak, its database, and the proxy are separate infrastructure; the MCP Compose file does not install them. An existing compatible provider can replace Keycloak.

Replace these example values consistently:

| Purpose           | Example                    |
| ----------------- | -------------------------- |
| MCP and portal    | `https://mcp.example.org`  |
| Keycloak          | `https://auth.example.org` |
| Gitea             | `https://git.example.org`  |
| Keycloak realm    | `gitea`                    |
| Gitea instance ID | `work`                     |

Create DNS records and certificates for your actual hosts. ChatGPT must be able to reach the public MCP HTTPS endpoint. The MCP server must be able to reach Gitea.

## 2. Download the verified release

```bash
git clone https://github.com/Tracht-Digital-Solutions/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
git switch --detach v0.4.0
docker version
docker compose version
```

**Checkpoint:** Docker can reach its engine and Compose reports a version. The installation uses a release tag; this guide is also available on the latest main branch.

## 3. Create a Keycloak realm and user

1. Open the administration console on your authentication host.
2. Select **Create realm** and create an application realm named `gitea`.
3. Under **Users → Add user**, create your user.
4. Set a password under **Credentials** and configure appropriate login and MFA policies.
5. Use RS256 or ES256 JWT signing and a short access token lifetime, for example five minutes.

Open this discovery URL:

```text
https://auth.example.org/realms/gitea/.well-known/openid-configuration
```

**Checkpoint:** The document contains `issuer`, `authorization_endpoint`, `token_endpoint`, and `jwks_uri`. Use the actual values later; the issuer must match exactly.

## 4. Configure MCP scopes and audience

These scopes govern access to MCP and are separate from Gitea token permissions.

1. Under **Client scopes**, create OIDC scopes `gitea.read` and `gitea.write`.
2. Enable **Include in token scope** for both and provide clear consent descriptions.
3. Add an **Audience** protocol mapper to `gitea.read`, using **Mappers → Configure a new mapper → Audience**.
4. Set **Included Custom Audience** to `https://mcp.example.org/mcp` and enable **Add to access token**. Apply this mapper to the portal client as well.
5. Restrict `gitea.write` to authorized users through your provider's user/client policies. Naming a scope alone does not restrict access.

**Checkpoint:** Access tokens contain the complete MCP identifier in `aud` and authorized scopes in `scope`. Inspect using Keycloak's client scope evaluation tools if necessary. Never submit real tokens to third-party JWT decoders.

## 5. Register the portal client

Under **Clients → Create client**, register an OIDC client:

| Setting                              | Value                                      |
| ------------------------------------ | ------------------------------------------ |
| Client ID                            | `gitea-portal`                             |
| Client authentication                | off, public client                         |
| Standard Flow                        | on                                         |
| Implicit Flow / Direct Access Grants | off                                        |
| PKCE Code Challenge Method           | require `S256`                             |
| Valid redirect URIs                  | exactly `https://mcp.example.org/callback` |
| Assigned scopes                      | `gitea.read` and `gitea.write`             |

Configure consent appropriately. The portal requests `openid gitea.read gitea.write`; both MCP scopes are needed for setup and write approvals. Apply the audience mapper from step 4. No portal client secret is needed.

## 6. Prepare the ChatGPT client

Register another public OIDC client, `gitea-chatgpt`, with Standard Flow, required S256 PKCE, and Implicit/Password Flow disabled. Assign `gitea.read` by default and `gitea.write` optionally for authorized users. Apply the same audience mapper.

Register the redirect URI only after obtaining the **actual callback address shown by your ChatGPT connection**. Do not invent a callback or use a wildcard. Codex can require a separate client registration and callback.

## 7. Create the environment configuration

The supplied configuration has no Gitea server: `GITEA_INSTANCES=[]`. Enter your own Gitea HTTPS address in the configuration below. All example hosts in this guide are placeholders to replace, not automatic connections. With an empty list and `ALLOW_USER_SERVERS=true`, users connect their own public HTTPS server through the setup link returned in ChatGPT. Fixed entries are only needed for internal or preconfigured instances.

```bash
umask 077
cp .env.example .env
docker run --rm node:24-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the generated 64-character hexadecimal key in `ENCRYPTION_KEY` and back it up securely, separately from the database. No local Node installation is required. Never publish the key or real tokens in chat or Git.

Edit `.env` with your actual values:

```dotenv
ENCRYPTION_KEY=REPLACE_WITH_YOUR_LOCALLY_GENERATED_64_CHARACTER_HEX_KEY
PUBLIC_URL=https://mcp.example.org
PORT=3000
DATABASE_PATH=data/gitea.sqlite
OAUTH_ISSUER=https://auth.example.org/realms/gitea
OAUTH_AUDIENCE=https://mcp.example.org/mcp
OAUTH_JWKS_URL=https://auth.example.org/realms/gitea/protocol/openid-connect/certs
OAUTH_AUTHORIZATION_URL=https://auth.example.org/realms/gitea/protocol/openid-connect/auth
OAUTH_TOKEN_URL=https://auth.example.org/realms/gitea/protocol/openid-connect/token
PORTAL_CLIENT_ID=gitea-portal
GITEA_INSTANCES=[{"id":"work","url":"https://git.example.org"}]
ALLOWED_PRIVATE_CIDRS=
```

The key placeholder is intentionally invalid and must be replaced. Compare OAuth URLs with step 3. `PUBLIC_URL` has no path; the audience includes `/mcp`. Add more instance objects to the JSON array to allow multiple hosts. Users then connect their own accounts to those instances.

For intentionally internal Gitea hosts, the operator must explicitly allow only the necessary address range, for example `10.20.30.4/32`. Private targets are otherwise blocked. See the [security model](../SECURITY.md).

## 8. Start the MCP server

```bash
docker compose pull
docker compose up -d --no-build --wait
docker compose ps
docker compose logs --tail=50 mcp
curl --fail http://127.0.0.1:3000/healthz
```

**Expected:** The container runs and health returns `{"status":"ok"}`. This checks the process and database, not OAuth or Gitea connectivity.

Connection data is stored in the named `gitea-mcp-data` volume. The host port binds to `127.0.0.1:3000` by default. Preserve the volume during updates.

## 9. Configure the HTTPS proxy

For Nginx on the same host, forward the MCP domain to `http://127.0.0.1:3000`. Use a valid certificate, preserve the original Host and Authorization/MCP headers, disable buffering, and forward all paths including the portal, callback, and discovery. See the [deployment guide](DEPLOYMENT.md) for a configuration example.

For **Nginx Proxy Manager running in Docker**:

1. Find the proxy manager's existing Docker network name.
2. Connect MCP to that private network persistently: add `networks: [proxy]` under `services.mcp`, then add the following top-level configuration, replacing the network placeholder:

   ```yaml
   networks:
     proxy:
       external: true
       name: YOUR_EXISTING_PROXY_NETWORK
   ```

3. Run `docker compose up -d --no-build --wait` again.
4. Add a **Proxy Host** for the MCP domain: Forward Scheme `http`, Forward Hostname `mcp`, Port `3000`.
5. Enable a valid SSL certificate and **Force SSL**, preserve the original Host header, and disable buffering for MCP. Do not place an additional Basic Auth gate in front of the MCP endpoint.

The proxy container's own `127.0.0.1` cannot reach another container. If the network already contains a service named `mcp`, use a unique network alias and configure the proxy accordingly. Only trusted services should share this network.

**Checkpoint from an external machine:**

```bash
curl --fail https://mcp.example.org/healthz
curl --fail https://mcp.example.org/.well-known/oauth-protected-resource/mcp
```

Discovery must advertise your audience, authorization server, and scopes. An unauthenticated `POST /mcp` should return HTTP 401 with OAuth information. `GET /mcp` may return HTTP 405.

## 10. Sign into the portal and connect Gitea

1. Open `https://mcp.example.org/portal` in your browser.
2. Sign in through Keycloak using the user from step 3.
3. Select instance `work`.
4. For initial setup without a Gitea OAuth application, create a personal access token in your Gitea user settings. Select only required user/repository/issue permissions; avoid administrative privileges.
5. Enter that token exclusively into the portal's password field and click **Verbinden**.
6. Confirm that `work` appears among connected instances.

Reading typically needs `read:user`, `read:repository`, and `read:issue`; writes need corresponding `write:` permissions. Creating repositories may also require `write:user`. Available scopes depend on Gitea. MCP scopes never grant extra Gitea permissions.

Alternatively, register a Gitea OAuth application with callback `https://mcp.example.org/gitea/callback` and add `oauthClientId` and, if applicable, `oauthClientSecret` to the operator's instance configuration. Restart the server, then choose **Mit Gitea OAuth verbinden** in the portal. Keep the secret out of Git. See [configuration details](DEPLOYMENT.md).

## 11. Connect ChatGPT

Follow the [current official connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt):

1. Open **Plugins → + → Add custom MCP server**.
2. Enter a name and server URL `https://mcp.example.org/mcp`.
3. Choose OAuth and your registered public client `gitea-chatgpt`, without a client secret.
4. Copy the actual callback URI into that Keycloak client's allowed redirects. If the interface does not show one, consult the client's connection/OAuth information; setup remains incomplete until the callback is confirmed.
5. Use discovery or the verified authorization/token endpoints. Allow `gitea.read`, and `gitea.write` only when write access is intended.
6. Complete connection, create the plugin, and install it.
7. Open a new Work chat and select the plugin using `@`.
8. Use **the same Keycloak user as in the portal**. Another identity sees different connections.

If the feature is unavailable, check your client, account, and workspace policies. These instructions do not override plan or administrator restrictions. Installation in a real account remains your verification step.

## 12. Test reads and the first write approval

Run these requests in sequence:

1. “List my connected Gitea instances.” → `work` appears.
2. “Show connection status for work.” → correct Gitea user and server version.
3. “List the first 20 repositories on work.” → authorized repositories only.
4. “Read README.md from my test repository.” → expected content.
5. “Prepare a test issue titled Installation test in my test repository.” → an approval link; no Gitea change yet.
6. Open the link yourself, inspect the instance, repository, and exact payload, then approve once.
7. Repeat the same tool call with identical arguments and the returned `approvalId`. → exactly one test issue is created.
8. Reusing that approval must fail. Close/remove the test issue through a new explicit approval or directly in Gitea.

Agents must not click browser approval on your behalf. File changes require a feature branch; writes to the default branch are refused.

From v0.2.0, also follow the [Actions, Kanban projects, and time tracking guide](PROJECTS-ACTIONS-TIME.md) for permissions, project/issue IDs, examples, and separate write approvals.

## 13. Optional: portable package or Codex

The [release ZIP](https://github.com/Tracht-Digital-Solutions/gitea-chatgpt-plugin/releases/tag/v0.4.0) contains an HTTPS URL template. If your client cannot resolve it, build a package for your endpoint:

```bash
pnpm install --frozen-lockfile
MCP_PUBLIC_URL=https://mcp.example.org/mcp pnpm package
```

This needs Node.js 24 and pnpm 11.25.0. In PowerShell use `$env:MCP_PUBLIC_URL='https://mcp.example.org/mcp'; pnpm package`. Find the ZIP in `artifacts/`. It connects to your server and does not include a hosting service.

For Codex, register a separate public `gitea-codex` client as in step 6, with the same scopes and audience. Register its actual callback with the provider. A current Codex CLI supports these commands according to the [official MCP guide](https://developers.openai.com/codex/mcp):

```bash
codex mcp add gitea --url https://mcp.example.org/mcp --oauth-client-id gitea-codex
codex mcp login gitea
codex mcp list
```

For older installations check `codex mcp --help` first. Client availability and OAuth registration can differ from ChatGPT. Do not copy ChatGPT redirects blindly. This actual account connection is also not yet project-verified.

## 14. Troubleshoot

| Symptom                     | Check / fix                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Container exits immediately | Required environment values, valid 64-character hexadecimal key, instance JSON, and local logs.            |
| Proxy returns 502           | Running container, correct port, shared Docker network; do not use container loopback for another service. |
| `INVALID_HOST`              | Forwarded Host must match `PUBLIC_URL`.                                                                    |
| Repeated login redirects    | HTTPS/Secure cookies, issuer, audience, scope assignments, and portal callback.                            |
| `invalid_redirect_uri`      | Register the exact actual callback on the correct client.                                                  |
| `INVALID_ACCESS_TOKEN`      | Issuer, JWKS, audience, and expiry; Gitea tokens are not MCP access tokens.                                |
| `INSUFFICIENT_SCOPE`        | Authorize the required MCP scope for this user/client and reconnect.                                       |
| `CONNECTION_REQUIRED`       | Sign into the portal with the same OAuth identity and connect Gitea.                                       |
| `NETWORK_ADDRESS_DENIED`    | Check DNS; allow an intended private Gitea address only through a minimal operator CIDR.                   |
| Gitea 401/403               | Expired token or insufficient Gitea permissions; reconnect or adjust Gitea permissions.                    |
| `HUMAN_APPROVAL_REQUIRED`   | Obtain a fresh approval for the exact payload and instance; old/consumed approvals cannot be reused.       |
| API 404                     | Endpoint may be unsupported or access denied; older versions may lack optional APIs.                       |

Do not copy passwords, tokens, or private repository content into public reports.

## 15. Back up and update

Stop the service before taking a consistent backup of the complete data volume; retain the encryption key separately. Select a new release tag intentionally, rebuild, and recheck health/login/reads. For rollback, restore the previous image together with its matching database backup. `docker compose down -v` deletes data and is not an update command. See [deployment, backups, and rollback](DEPLOYMENT.md), including key rotation limitations.

## What remains afterwards

Production HTTPS/OAuth and real account installation are verified only after your successful checkpoints. Official directory publication needs a separate submission and review. Public source and GitHub releases already exist. See [project evidence and limitations](../PROGRESS.md).
