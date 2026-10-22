# Gitea for ChatGPT

[Deutsch](../../README.md) · Apache-2.0

Self-hosted TypeScript MCP server and portable plugin with 159 tools for Gitea repositories, files, issues, pull requests, Actions, Kanban, time tracking, organizations, packages, milestones, releases and wiki. Writes run directly by default; `REQUIRE_WRITE_APPROVAL=true` requires exact independent human approval.

## Scripted installation

Install Node.js 24 LTS, pnpm 11.25.0, Git and Docker Compose, and prepare your own HTTPS/OAuth service.

```bash
git clone https://github.com/Tracht-Digital-Solutions/gitea-chatgpt-plugin.git
cd gitea-chatgpt-plugin
node scripts/install.mjs --init
# Edit .env with your actual Gitea/MCP/OAuth settings
node scripts/install.mjs --check
node scripts/install.mjs --start
```

The script preserves existing files/keys, builds locally and produces a plugin with a concrete endpoint plus public client settings in `artifacts/`. There are no GitHub releases or required prebuilt images. [Full installation guide](INSTALLATION.md).

Settings are edited in `.env` outside ChatGPT and applied by rerunning the script. Gitea hosts are configured in `GITEA_INSTANCES`, with free server registration disabled by default. No Gitea host is hardcoded. Enter credentials only in the protected portal or documented operator secrets. Connect ChatGPT using the actual values in `artifacts/chatgpt-connection.json`; actual account-level installation still requires your own deployment and is unverified.

Run `pnpm check` and `pnpm test:e2e` for development. CI and security checks remain; Release/Publish workflows are removed. Git history/tags remain source references. [Deployment](DEPLOYMENT.md), [security](SECURITY.md), [progress](../PROGRESS.md), [contributing](../../CONTRIBUTING.md), [license](../../LICENSE).
