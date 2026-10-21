# Gemeinsame Verträge

Die verbindlichen Tool-Eingaben werden derzeit zentral in `apps/mcp-server/src/tools/catalog.ts` als Zod-Schemas definiert und für MCP und die Manifestprüfung wiederverwendet. Ein separates Laufzeitpaket wird erst bei einem zweiten Verbraucher eingeführt.
