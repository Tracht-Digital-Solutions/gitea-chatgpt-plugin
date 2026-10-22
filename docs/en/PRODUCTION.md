# Production from a local build

Follow the [installation guide](INSTALLATION.md). The installer builds the production image locally and starts it with `--start`. Use `--no-docker` followed by supervised `pnpm start` for native operation. No release downloads are required.

Edit `.env`, rerun the script and preserve your data/key. See [deployment](DEPLOYMENT.md) for HTTPS/OAuth/proxy setup. Never use `docker compose down -v` to upgrade.
