# Produktionsbetrieb aus eigenem Build

Folge der [Installationsanleitung](INSTALLATION.md). Das Installationsskript baut das Produktionsimage lokal und startet es mit `--start`. Ohne Docker `--no-docker` verwenden und anschließend `pnpm start` mit eigener Prozessüberwachung ausführen. Es gibt keine Release-Downloads als Installationsvoraussetzung.

Einstellungen in `.env` bearbeiten, Skript erneut ausführen, Datenvolume und Schlüssel beibehalten. HTTPS-/OAuth-/Proxy-Details: [Deployment](../DEPLOYMENT.md). Niemals `docker compose down -v` als Update verwenden.
