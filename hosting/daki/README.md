# Daki hosting

The website runs on `paid1.daki.cc:4129`. Daki runs a copy of `server.cjs`
outside the public web root. No dependencies or GitHub credentials are required.
It checks the public `main` branch every 30 seconds and publishes `public/`
from a complete Git archive. The previous site stays live if a fetch fails.
Only the public directory is exposed; database migrations and server state are not.

Every push to `main` is detected within 30 seconds. Other branches do not publish.
Check `/__deployment` or the `X-Xyntal-Commit` response header for the deployed revision.

Daki startup (downloads the server from this repository before starting):

```sh
cd /home/container/xyntal && curl -fsSL https://raw.githubusercontent.com/nico-scheibe/xyntal/main/hosting/daki/start.cjs -o start.cjs && node start.cjs
```

Runtime changes to `hosting/daki/server.cjs` take effect after restarting Daki.
Website files update automatically, without a restart.
The generated `.deploy/` directory belongs on the server only.

Cloudflare tunnel `xyntal-daki` connects to `http://localhost:4129` inside Daki.
The launcher verifies a pinned Cloudflared binary and reads the tunnel token
from `.cloudflared-token` (permissions 0600). Never commit this file.

Domain configuration (22 October 2026): IONOS delegates `xyntal.de` to
`haley.ns.cloudflare.com` and `steven.ns.cloudflare.com`. Proxied CNAME records
for `@` and `www` target tunnel `7740193b-a9bb-4a15-a4b9-ee4b62d0859d.cfargotunnel.com`.
Both hostnames route to `http://localhost:4129` inside the encrypted tunnel.
Cloudflare Always Use HTTPS is enabled. MX, SPF, DMARC, autodiscover and both
IONOS DKIM selectors are preserved as DNS-only records. IONOS email stays in use.
Initial Cloudflare activation and certificate issuance can take time after the nameserver change.

## Zähler der Warteliste

`/api/waitlist-count` liefert die Anzahl der bestätigten Kontakte der Brevo-Warteliste
(zwischengespeichert für 10 Minuten). Die Startseite zeigt jede gültige Anzahl ab 0 an, auch einen einzelnen Eintrag.
Sie fragt jede Minute und beim Zurückkehren zur Seite erneut ab. Hintergrund-Tabs
pausieren die Abfragen. Durch den Server-Cache erscheinen neue Bestätigungen
bei geöffneter Seite normalerweise innerhalb von etwa elf Minuten.
Einrichtung in Daki (Ordner `/home/container/xyntal`, beide Dateien nie committen):

- `.brevo-key`: ein Brevo-API-Schlüssel (Brevo → SMTP & API → API-Schlüssel)
- `.brevo-list`: die ID der Warteliste (Brevo → Kontakte → Listen, Spalte „ID“)

Danach Daki einmal neu starten, damit der neue Server-Code geladen wird.
