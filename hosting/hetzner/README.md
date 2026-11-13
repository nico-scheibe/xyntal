# Hetzner-Server (xyntal.de und api.xyntal.de)

Ein eigener Server (Hetzner Cloud CAX11, Nürnberg, IPv4 `91.98.171.233`) ersetzt Daki
und den Cloudflare-Tunnel. Darauf laufen mit Docker Compose:

| Dienst | Aufgabe |
|---|---|
| `caddy` | HTTPS (Let's Encrypt) für `xyntal.de`, `www.xyntal.de`, `api.xyntal.de` |
| `website` | `hosting/daki/server.cjs`; holt `public/` weiterhin alle 30 s von `main`, ohne Neustart |
| `api` | App-Backend aus `nico-scheibe/xyntal-app-windows` (`server/`), Daten in `/opt/xyntal/data/api` |
| `backup` | Tägliches, geprüftes Wiederherstellungs-Bündel nach `/opt/xyntal/backups`, 14 bleiben |
| `discord-guard` | Discord-Bot gegen Scam und Phishing (`discord-bot/` in `xyntal-app-windows`); nur mit `COMPOSE_PROFILES=discord`, siehe unten |

## Automatische Updates

`autodeploy.sh` sieht alle 30 Sekunden nach neuen Commits auf `main` (dieses Repo) und
`master` (`xyntal-app-windows`) und rollt sie selbst aus (systemd-Timer
`xyntal-autodeploy.timer`). Anders als auf Daki merken Nutzer davon fast nichts:

- Neu gestartet wird nur ein Dienst, dessen Image sich ändert. Commits, die nur die
  Desktop-App oder `public/` betreffen, starten das Backend nicht neu.
- Läuft gerade ein Anruf, wartet das Update, bis er vorbei ist (höchstens 2 Stunden).
- Schlägt ein Build fehl, läuft die alte Version weiter; beim nächsten Durchlauf wird es erneut versucht.

| Was | Befehl |
|---|---|
| Was hat der Timer gemacht? | `journalctl -u xyntal-autodeploy -n 50` |
| Automatik aus / an | `systemctl disable --now xyntal-autodeploy.timer` / `enable --now` |
| Sofort prüfen statt warten | `systemctl start xyntal-autodeploy` |

## Einrichtung (einmalig)

1. Als root auf dem Server:
   ```sh
   curl -fsSL https://raw.githubusercontent.com/nico-scheibe/xyntal/main/hosting/hetzner/setup.sh | bash
   ```
2. GitHub-Token (fine-grained, nur `xyntal-app-windows`, „Contents: Read“; derselbe wie
   `.app-github-token` auf Daki) nach `/opt/xyntal/secrets/github-token`, `chmod 600`.
3. `/opt/xyntal/secrets/api.env`: Inhalt von `.app-backend.env` auf Daki (ohne `HOST`, `PORT`, `DB_PATH`).
   Für In-App-Anrufe zusätzlich `CALLS_MEDIA_ADDRESS=<öffentliche IPv4 des Servers>` eintragen. Port 44400 UDP und TCP
   muss von außen erreichbar sein (Hetzner-Cloud-Firewall), sonst zeigt die App keine Anruf-Buttons.
4. `/opt/xyntal/secrets/website.env`: die Website-Geheimnisse von Daki als `KEY=VALUE`:
   `BREVO_API_KEY` (= `.brevo-key`), `BREVO_LIST_ID` (= `.brevo-list`),
   `BREVO_SENDER_EMAIL` (= `.brevo-sender`) und die Zeilen aus `.smtp.env`.
5. Daten umziehen (unten), dann `/opt/xyntal/site/hosting/hetzner/deploy.sh`.

## Discord-Bot (Xyntal Guard)

Läuft erst, wenn er eingerichtet ist (Compose-Profil `discord`); vorher baut und startet
`deploy.sh` ihn nicht. Bot anlegen und Token holen: `discord-bot/README.md` in `xyntal-app-windows`.
Dann als root:

```sh
printf 'DISCORD_TOKEN=%s\n' 'DEIN-TOKEN' > /opt/xyntal/secrets/discord-guard.env
chmod 600 /opt/xyntal/secrets/discord-guard.env
mkdir -p /opt/xyntal/data/discord-guard && chown 1000:1000 /opt/xyntal/data/discord-guard
echo 'COMPOSE_PROFILES=discord' >> /opt/xyntal/site/hosting/hetzner/.env
/opt/xyntal/site/hosting/hetzner/deploy.sh
```

Der Einladungslink steht danach im Log: `docker compose logs discord-guard | grep Invite`.
Die Datenbank (`/opt/xyntal/data/discord-guard/guard.db`) enthält nur Einstellungen und Vorfälle
der letzten 30 Tage und ist nicht im täglichen Backup.

## Daten von Daki umziehen

Auf Daki das App-Backend stoppen (Server in Daki stoppen), dann aus
`/home/container/xyntal/.app-data/` herunterladen (Daki → Files oder SFTP):
`xyntalnet.db`, falls vorhanden `xyntalnet.db-wal`, den Ordner `uploads/` und `integrations.key`.
Diese nach `/opt/xyntal/data/api/` auf den neuen Server kopieren, z. B. aus Windows-PowerShell
(eine `xyntalnet.db-wal` genauso mitkopieren):

```sh
scp -i $env:USERPROFILE\.ssh\xyntal.ssh -r xyntalnet.db uploads integrations.key root@91.98.171.233:/opt/xyntal/data/api/
```

Danach auf dem Server `chown -R 1000:1000 /opt/xyntal/data/api`.

## DNS umstellen (Cloudflare)

`xyntal.de`, `www` und `api` als **A-Record** auf `91.98.171.233` (AAAA auf die IPv6),
**„DNS only“ (graue Wolke)**, damit Caddy die Zertifikate bekommt und kein Umweg entsteht.
MX-, SPF-, DKIM- und DMARC-Einträge für IONOS-Mail bleiben unverändert.
Den Tunnel `xyntal-daki` erst löschen, wenn alles auf dem neuen Server läuft.

## Admin-Bereich (admin.xyntal.de)

Der Admin-Bereich wird nur für den Host `admin.xyntal.de` ausgeliefert (`hosting/daki/server.cjs`,
Test `tests/admin-host.cjs`). Dort zeigt `/` die Admin-Seite; Login und Passwort-Zurücksetzen bleiben,
alle anderen Seiten leiten auf `https://xyntal.de` um. Auf xyntal.de antworten `admin.html`, `admin*.css`,
`world-geo.js` und `pages/admin*.js` mit 404.

Kein Cloudflare Access davor: die Seite lädt für alle, Inhalte gibt es erst nach der Anmeldung.
Die Rechte prüfen Supabase (`is_admin` + 2FA) und der App-Server (Staff-Rolle).
Die Anmeldung gilt auf allen xyntal.de-Adressen: `public/session-share.js` legt die Sitzungs-Tokens zusätzlich in ein
Cookie für `.xyntal.de` (Test `tests/session-share.cjs`). Wer auf xyntal.de angemeldet ist, muss sich im Admin nicht
noch einmal anmelden; fehlt der zweite Faktor, fragt der Admin nur noch den Code ab.

Cloudflare-Einstellungen:

- DNS: `admin` als A-Record auf `91.98.171.233`, **Proxied** (orange Wolke) – anders als die übrigen Einträge.
  Nur für das allererste Zertifikat auf „DNS only“ stellen (Cloudflare leitet HTTP auf HTTPS um, Let's Encrypt
  käme sonst nicht durch), danach wieder Proxied. Verlängerungen klappen über den Proxy, weil Caddy
  ACME-Challenges auch über HTTPS beantwortet und das alte Zertifikat dann noch gültig ist.
- Rules → Configuration Rules: „admin.xyntal.de SSL Strict“ (Host `admin.xyntal.de` → SSL **Strict**).
- Supabase (db.xyntal.de): `https://admin.xyntal.de/**` steht in `ADDITIONAL_REDIRECT_URLS` (`supabase/install.sh`).
  Nötig nur für Google/Apple-Login und Passwort-Mails im Admin; E-Mail + Passwort + 2FA geht auch ohne.
  Übernehmen: auf `xyntal-db` `install.sh` erneut ausführen (Schlüssel bleiben).
- App-Server: `https://admin.xyntal.de` steht im Standard von `WEBSITE_ORIGINS`; ist die Variable in `api.env` gesetzt, dort ergänzen.

`deploy.sh` startet Caddy neu, wenn sich das `Caddyfile` geändert hat (die Datei ist eingebunden; ein
geänderter Inhalt kommt sonst nicht im Container an).

## Uploads der freien Seite (Bilder, Hintergrund-Videos)

Admins laden im Seiten-Editor (xyntal.de/name#gestalten) nicht zu Supabase hoch (dort höchstens 50 MB je Datei),
sondern über die Website (`hosting/daki/media-store.cjs`) in den Hetzner-Bucket: bis 5 GB je Datei, Ordner
`page-media/<konto>/`, ausgeliefert unter `xyntal.de/media/<konto>/<datei>`.
Den Zugang (`MEDIA_S3_*`) schreibt `deploy.sh` bei jedem Ausrollen aus `api.env` nach
`/opt/xyntal/secrets/media.env`; die Website liest ihn von dort. Fehlt er, lädt der Editor wie bisher zu Supabase.
Ersetzte oder entfernte Dateien löscht der Editor direkt nach dem Veröffentlichen (auch wenn nur eine ältere Version sie noch nutzte); nur fremde Uploads der letzten 10 Minuten bleiben verschont.

## Eigenes Supabase (Server `xyntal-db`)

Supabase läuft auf einem eigenen Server, damit Datenbank und Website sich nicht den RAM teilen:
Hetzner Cloud CX23, Falkenstein, IPv4 `49.13.93.175`, erreichbar als `https://db.xyntal.de`
(A-Record in Cloudflare, „DNS only“). Von außen offen sind nur 22, 80 und 443 (ufw); Gateway und
Datenbank-Pooler hören nur auf `127.0.0.1`.

Einrichtung als root auf `xyntal-db` (Docker, 2 GB Swap und ufw vorher installieren):

1. `git clone --depth 1 https://github.com/nico-scheibe/xyntal.git /opt/xyntal/site`
2. `/opt/xyntal/secrets/api.env` nur mit den `MEDIA_S3_*`-Zeilen, `/opt/xyntal/secrets/website.env`
   nur mit `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` und `SMTP_*` (je `chmod 600`).
3. `sh /opt/xyntal/site/hosting/hetzner/supabase/install.sh`
4. Caddy: `hosting/hetzner/supabase/caddy/` nach `/opt/xyntal/caddy` kopieren, dort `docker compose up -d`.
5. Daten umziehen: `supabase/migrate.sh` (`dump`, `restore`, `files`, `check`).

Seit der Umstellung (9.11.2026) nutzen Website, API und App nur noch `db.xyntal.de`; Supabase-Cloud ist abgekoppelt.
Backup: `/usr/local/bin/xyntal-db-backup` (cron täglich 03:30, `/etc/cron.d/xyntal-db-backup`) schreibt
`pg_dumpall` nach `/opt/xyntal/backups/supabase-JJJJ-MM-TT.sql.gz`, 14 Tage. Zusätzlich auf einen zweiten Ort kopieren.

Der Login-Mail-Hook geht über `https://db.xyntal.de/functions/v1/send-auth-email`, weil GoTrue für Hooks
nur https annimmt; die Funktion prüft jede Anfrage per Signatur.

## Alltag

| Was | Befehl |
|---|---|
| Neue App-Version ausrollen | `/opt/xyntal/site/hosting/hetzner/deploy.sh` |
| Bestimmten Tag ausrollen | `APP_REF=v1.4.0 /opt/xyntal/site/hosting/hetzner/deploy.sh` |
| Status | `cd /opt/xyntal/site/hosting/hetzner && docker compose ps` |
| Logs | `docker compose logs -f api` (oder `website`, `caddy`, `backup`) |
| Backup prüfen | `docker compose exec backup npm run backup:verify -- /backups/<Bündel>` |

Website-Änderungen (`public/`) brauchen kein Deploy, sie sind nach spätestens 30 s online.
Backups zusätzlich regelmäßig auf einen zweiten Ort kopieren (z. B. Hetzner Storage Box).

## Bot-Schutz

- **Website (`hosting/daki/server.cjs`):** höchstens 600 Anfragen pro IP und Minute,
  60 für Profilseiten (`xyntal.de/name`) und `/api/*`. Darüber antwortet sie mit 429.
  Ändern lässt sich das mit `SITE_RATE_LIMIT` und `SITE_RATE_LIMIT_HEAVY` in
  `website.env` (0 = aus). Verbindungen ohne Kopfzeilen nach 20 s und ohne Datenfluss
  nach 2 Minuten werden getrennt.
- **App-Server:** 200 Anfragen pro Minute (`RATE_LIMIT_MAX`), Login und Registrierung
  10 pro Minute, und höchstens 5 neue Konten pro IP bzw. 3 pro Gerät in 24 Stunden
  (`SIGNUP_DAILY_PER_IP`, `SIGNUP_DAILY_PER_DEVICE` in `api.env`).
- **Gegen echte Überlastung (DDoS)** hilft nur ein vorgeschalteter Schutz: in Cloudflare
  bei `xyntal.de`, `www`, `api` und `db` die Wolke auf orange („Proxied“) stellen,
  SSL/TLS auf „Full (strict)“ und unter Security → Bots „Bot Fight Mode“ einschalten.
  Caddy holt seine Zertifikate dann weiter, weil Cloudflare `/.well-known/acme-challenge`
  durchreicht.
