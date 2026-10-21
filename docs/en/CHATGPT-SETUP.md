# Set up Gitea from ChatGPT

[Deutsch](../de/CHATGPT-EINRICHTUNG.md)

End users set up connections through the installed plugin, without installing Docker or configuring `.env` or an OAuth server. An operator deploys the shared MCP service once and connects the plugin to its endpoint. A GitHub download does not host that service. This project currently has no published production endpoint.

## Install in ChatGPT

If the plugin is already available personally or in your workspace, open it in **Plugins** and install it. For a private connection to an existing service, choose **Plugins → + → Add custom MCP server**, enter its actual HTTPS URL including `/mcp`, configure OAuth and select **Create as a plugin**, then install it. The operator supplies the endpoint and OAuth configuration. A Gitea REST API URL is not an MCP endpoint.

Start a new **Work** chat and select the plugin with `@`. Account, client and workspace policies apply. Installation and actual account linking remain unverified until a service is deployed. See the [official OpenAI installation guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Connect your own server

1. Ask “Set up my Gitea server.” You may include its public HTTPS address; never send credentials in chat.
2. The plugin checks `list_instances` and calls `connection_setup` for a secure setup link. The server address may be prefilled. This tool does not connect an account or send credentials to Gitea.
3. Open the link and sign in to the MCP service. Enter a connection name, your Gitea HTTPS address and a narrowly scoped personal Gitea token only in the protected form. Check the destination before selecting **Eigenen Server verbinden**. Operator-configured instances also offer Gitea OAuth when registered there. Arbitrary servers currently require a personal token: Gitea OAuth needs an application registered on that instance.
4. Return to ChatGPT and ask it to check the connection and list repositories. It calls `list_instances` and `connection_status`; success is only confirmed after these calls actually work.
5. Add more servers in the same way. Each user's connections are isolated; addresses and credentials are encrypted. Up to 20 new connections per user are allowed. Self-service connections use IDs such as `custom-work`.

Writes still require exact human approval in the protected portal. ChatGPT must never submit credential or approval forms for you. Disconnect in the portal or request a confirmed disconnection in chat; also revoke the token in Gitea for complete revocation.

## Restrictions and operator tasks

Self-service servers require public HTTPS on port 443. Private/local/link-local addresses, other ports, URL credentials and redirects are denied. Every request validates DNS and pins the destination to TLS. Internal servers require explicit operator configuration; private-network exceptions never apply to self-service URLs.

Self-service defaults to `ALLOW_USER_SERVERS=true`. Operators may set it to `false` to restrict connections to configured instances and disable existing self-service servers. This feature grants no extra Gitea permissions. Deploy the service following the [production guide](PRODUCTION.md); official directory submission remains a separate optional step.
