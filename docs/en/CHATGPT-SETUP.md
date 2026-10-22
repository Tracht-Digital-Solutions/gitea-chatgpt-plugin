# Install the ChatGPT connection

First [configure locally and build using the script](INSTALLATION.md). The generated `artifacts/chatgpt-connection.json` supplies the concrete MCP endpoint and public OAuth client settings. Use these in ChatGPT's supported MCP connection flow and install the plugin.

ChatGPT cannot edit `.env`, server lists or OAuth configuration. Change settings externally, rebuild/restart, and update the client connection if its endpoint/client ID changes. Enter Gitea credentials only in the protected browser portal. Actual account acceptance requires your own deployment and remains unverified.
