# Sicherheitsmodell und Betrieb

## Identität und Geheimnisse

Der MCP-Server ist OAuth-Resource-Server. Der selbst gewählte Authorization Server muss `/.well-known/openid-configuration` oder OAuth-Metadaten bereitstellen und Authorization Code mit S256-PKCE unterstützen. Zugriffstokens sind RS256-/ES256-signierte JWTs mit `iss`, `sub`, `aud`, `exp`, `iat`, `scope`. `aud` muss exakt dem konfigurierten MCP-Identifier entsprechen. `gitea.write` ersetzt nicht `gitea.read`; Benutzer benötigen für Einrichtung und vollständige Abläufe beide. Bei jedem Tool-Aufruf werden Ablauf und Scope erneut geprüft. JWT-Widerruf wirkt spätestens beim kurzen Ablauf (empfohlen maximal fünf Minuten); sofortige Provider-Introspection ist nicht implementiert.

Gitea-PATs oder OAuth-Tokens dürfen ausschließlich im eigenen Portal beziehungsweise per Gitea-OAuth eingerichtet werden. Sie werden nie als MCP-Parameter angenommen. AES-256-GCM nutzt pro Secret einen zufälligen Nonce und bindet Issuer/Subject-abgeleiteten Benutzer und Instanz als authentifizierte Zusatzdaten. Schlüssel, Backups und OAuth-Client-Secrets gehören in Betreiber-Secrets und nie ins Repository. Ein gestohlener Schlüssel plus Datenbank kompromittiert gespeicherte Tokens. Datenbankvolume und Backups benötigen restriktive Dateirechte und Verschlüsselung im Betrieb.

Gitea-Refresh-Tokens werden bei Bedarf rotiert; gleichzeitige Aufrufe teilen eine Erneuerung. Fehlgeschlagene Rotation sperrt die Verbindung; ohne Refresh-Token ist erneute Anmeldung notwendig. Trennen löscht lokale Secrets/Freigaben; upstream PAT/OAuth-Zustimmung zusätzlich in Gitea widerrufen.

## Menschliche Freigabe

Schreiben verlangt `gitea.write` und einen separat angemeldeten Benutzer im Browser. Der Freigabelink enthält kein Authentifizierungsgeheimnis und funktioniert allein nicht. CSRF/Originprüfung, HttpOnly/Secure/SameSite-Cookie, feste Payload, Credential-Revision, zehn Minuten Ablauf und atomare Einmalverwendung verhindern Fremdfreigaben und Replay. Das Portal escaped Repositorytexte und dekodierte Dateiinhalte und sperrt Skripte/Frames durch CSP. Die Vertrauenswürdigkeit des vom Benutzer verwendeten Browsers und Endgeräts bleibt Voraussetzung. Browserfreigaben dürfen nie vom Agenten stellvertretend geklickt werden.

Dateischreiben erfordert Push-Recht und einen nachweislich ungeschützten Feature-Branch. Der Standardbranch ist ausgeschlossen. Update/Delete erfordern aktuelle Blob-SHA. Merge benötigt unveränderte PR-Head-SHA und `mergeable=true`; `force_merge=false`, Gitea setzt Review- und Branchregeln weiterhin selbst durch.

## Netzwerkschutz und Grenzen

Aktueller Standard: `ALLOW_USER_SERVERS=false`. Server-/OAuth-Einstellungen werden lokal in `.env` gepflegt und per Installationsskript angewendet, nicht im Chat. Der folgende zusätzliche Portalweg ist ausschließlich bei expliziter Aktivierung verfügbar.

Selbsteinrichtung über `connection_setup` und das CSRF-geschützte Portal speichert Adresse und Token zusammen verschlüsselt pro Benutzer/Instanz. Nur öffentliche HTTPS-Ziele auf Port 443 sind erlaubt; jeder Request erhält eine eigene feste Basisfreigabe mit DNS-Prüfung und TLS-Pinning. Betreiber-CIDR-Ausnahmen werden niemals übernommen. `ALLOW_USER_SERVERS=false` sperrt diesen Weg einschließlich bestehender selbst eingerichteter Verbindungen. Zugangsdaten sind keine MCP-Parameter. Änderungen der Verbindung erneuern deren Revision und entwerten ausstehende Schreibfreigaben.

Für interne oder vorkonfigurierte Instanzen erlauben Betreiber genaue HTTPS-Basis-URLs. Öffentliche selbst eingerichtete Instanzen sind zusätzlich nach den oben beschriebenen Regeln zulässig. DNS wird bei jeder Anfrage vollständig geprüft; eine private/unsichere Antwort sperrt die Anfrage. Die geprüfte IP wird beim TLS-Verbindungsaufbau gepinnt. Zertifikatsprüfung bleibt aktiv. Redirects, URL-Credentials, fremde Hosts und Basis-Prefix-Tricks werden verweigert.

Interne IPs, Loopback und Metadatenadressen sind standardmäßig gesperrt. `ALLOWED_PRIVATE_CIDRS` ist eine ausdrücklich privilegierte Ausnahme für vertrauenswürdige Netze; nur die kleinstmöglichen Bereiche eintragen, keine öffentlichen Benutzer verwalten diese Ausnahme. OAuth-Anbieter/JWKS sind vertrauenswürdige Betreiberkonfiguration; ihre Absicherung und Erreichbarkeit bleiben Betreiberpflicht.

Anfragen haben 15 Sekunden Gesamttimeout und maximal 2 MiB Antwortgröße. Nur GET/503 wird einmal wiederholt; Mutationen nie automatisch. Gitea-429 stoppt den Aufruf; keine automatischen Folgeseiten. Zusätzlich gelten Prozess-/Benutzerraten und höchstens 20 offene Freigaben. Hinter einem Proxy limitiert die IP-Grenze den Proxy gemeinsam; `trust proxy` ist absichtlich nicht pauschal aktiviert. Betreiber können zusätzliche Edge-Limits konfigurieren.

Repositorydaten sind untrusted. Toolresultate markieren dies, Skill und MCP-Instruktionen verbieten eingebettete Befehle. Prompt Injection kann nicht allein durch Markierungen sicher verhindert werden; das harte Schutzmittel bleibt serverseitige Autorisierung plus menschliche exakte Freigabe. Keine Secrets in Logs: Audit enthält nur Zeit, pseudonymisierten Benutzer, Instanz, Tool und Ergebniscode. Auditdaten enthalten weiterhin Nutzungsmetadaten; Aufbewahrungsfrist und Löschung durch den Betreiber festlegen.

## Prüfumfang

Automatisierte Tests decken Tokenvalidierung/-ablauf, Scopes, Tenant-Isolation, AEAD-Manipulation, CSRF, OAuth-State/PKCE, Freigabereplay, Payload-/Instanzwechsel, Branchschutz, Redirects, DNS-Rebinding und Limits ab. Das ersetzt keinen unabhängigen Penetrationstest. Aktuelle Ergebnisse und tatsächlich durchgeführte Scans stehen in `PROGRESS.md`.
