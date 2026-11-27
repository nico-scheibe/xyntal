# Hetzner-Server (xyntal.com und api.xyntal.de)

Ein eigener Server (Hetzner Cloud CAX11, Nürnberg, IPv4 `91.98.171.233`) ersetzt Daki
und den Cloudflare-Tunnel. Darauf laufen mit Docker Compose:

| Dienst | Aufgabe |
|---|---|
| `caddy` | HTTPS (Let's Encrypt) für `xyntal.com`, `www.xyntal.com`, `api.xyntal.de`, `bot.xyntal.com` (und Weiterleitung von `bot.xyntal.de`) |
| `website` | `hosting/daki/server.cjs`; holt `public/` weiterhin alle 30 s von `main`, ohne Neustart |
| `api` | App-Backend aus `nico-scheibe/xyntal-app-windows` (`server/`), Daten in `/opt/xyntal/data/api` |
| `backup` | Tägliches, geprüftes Wiederherstellungs-Bündel nach `/opt/xyntal/backups`, 14 bleiben |
| `discord-guard` | Discord-Bot gegen Scam und Phishing mit Web-Panel auf `bot.xyntal.com` (`discord-bot/` in `xyntal-app-windows`); nur mit `COMPOSE_PROFILES=discord`, siehe unten |

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

**Web-Panel** auf `bot.xyntal.com`: bei IONOS (DNS von xyntal.com) A-Record `bot` → `91.98.171.233` und
AAAA-Record `bot` → `2a01:4f8:1c19:5598::1` anlegen, dann holt Caddy das Zertifikat selbst. Die alte Adresse
`bot.xyntal.de` (Cloudflare, „DNS only“) leitet weiter. Anmeldung mit dem Xyntal-Konto (nur Staff: Owner/Admin alles,
Moderation Schutz und Vorfälle); die Staff-Prüfung läuft intern über `http://api:8787`.
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

`xyntal.com`, `www.xyntal.com` und `api.xyntal.de` als **A-Record** auf `91.98.171.233` (AAAA auf die IPv6),
**„DNS only“ (graue Wolke)**, damit Caddy die Zertifikate bekommt und kein Umweg entsteht.
MX-, SPF-, DKIM- und DMARC-Einträge für IONOS-Mail bleiben unverändert.
Den Tunnel `xyntal-daki` erst löschen, wenn alles auf dem neuen Server läuft.

## Admin-Bereich (admin.xyntal.de)

Der Admin-Bereich wird nur für den Host `admin.xyntal.de` ausgeliefert (`hosting/daki/server.cjs`,
Test `tests/admin-host.cjs`). Dort zeigt `/` die Admin-Seite; Login und Passwort-Zurücksetzen bleiben,
alle anderen Seiten leiten auf `https://xyntal.com` um. Auf xyntal.com antworten `admin.html`, `admin*.css`,
`world-geo.js` und `pages/admin*.js` mit 404.

Kein Cloudflare Access davor: die Seite lädt für alle, Inhalte gibt es erst nach der Anmeldung.
Die Rechte prüfen Supabase (`is_admin` + 2FA) und der App-Server (Staff-Rolle).
Dieser Satz stimmt — am 20.11.2026 unangemeldet nachgemessen (`/`, `/admin.html`,
`/pages/admin-people.js` antworten mit 200, keine Umleitung auf `*.cloudflareaccess.com`).
Das `Caddyfile` behauptete an derselben Stelle jahrelang das Gegenteil (Access davor, Token-Prüfung
in `server.cjs`, 403 bei direkten IP-Aufrufen); nichts davon gab es. Der Kommentar dort ist seit
dem 20.11.2026 richtiggestellt. **Wer an Datenbankfunktionen oder Policies arbeitet, darf sich
nicht darauf berufen, der Admin-Bereich sei abgeschottet** — der Quelltext der Oberfläche ist
auf `admin.xyntal.de` öffentlich lesbar, und damit ist jeder RPC-, Tabellen- und Spaltenname
bekannt. `is_admin()` ist die einzige Verteidigung, nicht die zweite.

Nicht öffentlich sind dort seit dem 20.11.2026 nur noch die zwei Dinge, die ohne `is_admin()`
etwas verrieten: `/__deployment` antwortet auf `admin.xyntal.de` mit 404 (auf `xyntal.com`
unverändert), und der Antwort-Header `X-Xyntal-Commit` entfällt dort. `/api/waitlist-count`
antwortet weiter auf beiden Hosts.

### Cloudflare Access einrichten (nur im Dashboard, nicht in diesem Repo)

Nur der Inhaber des Cloudflare-Kontos kann das. `admin.xyntal.de` ist bereits **Proxied**
(belegt: `cf-ray` im Antwortkopf), also ist **keine DNS-Umstellung nötig**:

1. Zero Trust → Access → Applications → **Add an application** → *Self-hosted*.
2. Application domain: `admin.xyntal.de`, Pfad leer lassen (der ganze Host).
3. Session Duration kurz halten (24 h genügt für tägliche Arbeit).
4. Policy: Action **Allow**, Include → *Emails* → die Admin-Adressen einzeln eintragen.
   Keine Regel auf die ganze E-Mail-Domain, solange dort auch Nicht-Admins liegen.
5. Zweiter Faktor im Identitätsanbieter nicht abschalten — die 2FA der Anwendung
   (`mfa_ok()`) bleibt davon unberührt und ersetzt ihn nicht.

Gegenprobe nach dem Einrichten, unangemeldet und ohne Zugangsdaten:

```
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://admin.xyntal.de/
```

Erwartet ist **302** auf `*.cloudflareaccess.com`. Kommt weiter 200, ist die Anwendung
nicht aktiv (falscher Host, Pfad gesetzt, oder Policy auf *Bypass*). Danach den Kommentar
im `Caddyfile` über dem Site-Block `admin.xyntal.de` richtigstellen — erst dann stimmt er.

### ACHTUNG: Access allein reicht nicht (gemessen 20.11.2026)

Access schirmt nur den Weg **über** Cloudflare ab. Der Ursprungsserver ist selbst
öffentlich erreichbar, und Caddy liefert jeden Host aus, der im `Caddyfile` steht —
also auch `admin.xyntal.de`, wenn man den Host-Kopf direkt an die IP schickt:

```
curl -sk --resolve admin.xyntal.de:443:91.98.171.233 https://admin.xyntal.de/admin.html
```

Das antwortet mit **200 und ohne `cf-ray`**, Cloudflare ist dabei also komplett umgangen.
Die IP ist leicht zu finden: `api.xyntal.de` steht als „DNS only“ im DNS und zeigt offen
auf dieselbe Maschine. (Gegenprobe, dass das kein Catch-all ist: derselbe Aufruf mit
Host `nichtda.xyntal.de` scheitert schon im TLS, Caddy kennt den Host nicht.)

**Wer Access einschaltet, ohne den Ursprung zu sperren, hat genau die Scheinsicherheit,
die der alte Kommentar behauptet hat.** Die Sperre gehört ins `Caddyfile`, ist also eine
Änderung in diesem Repo und noch nicht gemacht. Möglichkeiten:

- Site-Block `admin.xyntal.de` auf die Cloudflare-IP-Bereiche begrenzen, sonst 403.
  Genau das versprochene Verhalten. Nachteil: Die Liste muss gepflegt werden, und ein
  Fehler darin sperrt den Admin-Bereich für alle aus. Die ACME-Verlängerung läuft über
  den Proxy und kommt damit aus denselben Bereichen, bricht also nicht.
- Authenticated Origin Pulls (mTLS): Caddy prüft Cloudflares Client-Zertifikat.
  Kein IP-Pflegeaufwand, mehr Einrichtung.
- Das Access-Token `Cf-Access-Jwt-Assertion` gegen die öffentlichen Team-Schlüssel
  prüfen — das, was der alte Kommentar für `server.cjs` behauptete.
- Cloudflare Tunnel: kein öffentlicher Ursprung mehr. Größter Umbau.
Die Anmeldung gilt auf `xyntal.com` und `www.xyntal.com`: `public/session-share.js` legt die Sitzungs-Tokens zusätzlich in ein
Cookie für `.xyntal.com` (Test `tests/session-share.cjs`). `admin.xyntal.de` hat ein eigenes Cookie für `.xyntal.de`;
dort meldet man sich einmal neu an (E-Mail, Passwort, 2FA).

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

Admins laden im Seiten-Editor (xyntal.com/name#gestalten) nicht zu Supabase hoch (dort höchstens 50 MB je Datei),
sondern über die Website (`hosting/daki/media-store.cjs`) in den Hetzner-Bucket: bis 5 GB je Datei, Ordner
`page-media/<konto>/`, ausgeliefert unter `xyntal.com/media/<konto>/<datei>`.
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
Aufräumen: `/etc/cron.d/xyntal-unbestaetigt` (täglich 04:10, legt `install.sh` an) löscht Konten, die ihre
Adresse seit über 24 Stunden nicht bestätigt und sich nie angemeldet haben (`public.purge_unconfirmed_accounts()`,
Migration `20261127120000_unbestaetigte_konten.sql`). Ergebnis: `journalctl -t xyntal-unbestaetigt`.

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
  60 für Profilseiten (`xyntal.com/name`) und `/api/*`. Darüber antwortet sie mit 429.
  Ändern lässt sich das mit `SITE_RATE_LIMIT` und `SITE_RATE_LIMIT_HEAVY` in
  `website.env` (0 = aus). Verbindungen ohne Kopfzeilen nach 20 s und ohne Datenfluss
  nach 2 Minuten werden getrennt.
- **App-Server:** 200 Anfragen pro Minute (`RATE_LIMIT_MAX`), Login und Registrierung
  10 pro Minute, und höchstens 5 neue Konten pro IP bzw. 3 pro Gerät in 24 Stunden
  (`SIGNUP_DAILY_PER_IP`, `SIGNUP_DAILY_PER_DEVICE` in `api.env`).
- **Gegen echte Überlastung (DDoS)** hilft nur ein vorgeschalteter Schutz: in Cloudflare
  bei `xyntal.com`, `www.xyntal.com`, `api.xyntal.de` und `db.xyntal.de` die Wolke auf orange („Proxied“) stellen,
  SSL/TLS auf „Full (strict)“ und unter Security → Bots „Bot Fight Mode“ einschalten.
  Caddy holt seine Zertifikate dann weiter, weil Cloudflare `/.well-known/acme-challenge`
  durchreicht.
