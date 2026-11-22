# Umzug auf xyntal.com

Stand: 14.11.2026. Die Website zieht von `xyntal.de` auf `xyntal.com`. `xyntal.de` und `www.xyntal.de`
leiten danach dauerhaft (308) auf `https://xyntal.com` weiter; `www.xyntal.com` leitet auf `xyntal.com` weiter.

**Bleibt unverändert:**

- Subdomains `api.xyntal.de`, `db.xyntal.de`, `admin.xyntal.de`. Installierte Apps haben `api.xyntal.de` fest eingebaut.
  Ausnahme: Das Bot-Panel zieht auf `bot.xyntal.com` (braucht das Anmelde-Cookie von `.xyntal.com`); `bot.xyntal.de` leitet weiter.
- Alle E-Mail-Adressen (z. B. `hallo@xyntal.de`, `nico@xyntal.de`) und ihre DNS-Einträge (MX, SPF, DKIM, DMARC).
- Die iPhone-App: ihre Links laufen über die Weiterleitung.

Die Reihenfolge ist wichtig: Erst DNS und Backend, dann dieses Repo pushen. Sonst holt Caddy keine Zertifikate für `.com`.

## 1. DNS für xyntal.com und www.xyntal.com

Die DNS-Verwaltung für `xyntal.com` liegt bei **IONOS** (Nameserver `ui-dns.*`, Stand 14.11.2026; `xyntal.de` liegt bei Cloudflare).
Bisher zeigt `xyntal.com` auf die IONOS-Parkseite (`217.160.0.220`, `2001:8d8:100f:f000::200`).

- In IONOS unter *Domains & SSL → xyntal.com*: eine aktive Weiterleitung oder „Domain mit Website verbinden“ ausschalten.
- Den A-Eintrag `@ → 217.160.0.220` und den AAAA-Eintrag `@ → 2001:8d8:100f:f000::200` löschen.
- Neu anlegen: A `@` → `91.98.171.233`, AAAA `@` → `2a01:4f8:1c19:5598::1`, CNAME `www` → `xyntal.com`.
- MX-, SPF-, DKIM- und DMARC-Einträge nicht anfassen (über sie läuft `admin@xyntal.com`).
- Sonstige alte Einträge unter `*.xyntal.com`, die auf nichts mehr zeigen, löschen: Das Login-Cookie gilt für alle Subdomains von `xyntal.com`.
- `xyntal.de` und `www.xyntal.de` behalten ihre Einträge. Sie zeigen weiter auf den Server und liefern die Weiterleitung aus.

Prüfen: `dig +short A xyntal.com` und `dig +short A www.xyntal.com` ergeben `91.98.171.233`.

## 2. Backend: api.env, dann ausrollen

In `/opt/xyntal/secrets/api.env`:

Diese drei Zeilen setzen (vorhandene Zeilen gleichen Namens ersetzen):

```
WEBSITE_ORIGINS=https://xyntal.com,https://www.xyntal.com,https://xyntal.de,https://www.xyntal.de,https://admin.xyntal.de
PAIR_SITE_URL=https://xyntal.com
WEBSITE_URL=https://xyntal.com
```

Dann nur den API-Container mit der neuen Umgebung starten (kurze Unterbrechung der API, laufende Anrufe brechen ab):

```
cd /opt/xyntal/site/hosting/hetzner && docker compose up -d --force-recreate --no-deps api
```

So braucht es kein neues Backend-Release: Die Standardwerte im App-Server (Repo `xyntal-app-windows`) sind ebenfalls
auf `.com` umgestellt, kommen aber erst mit dem nächsten regulären Release auf `master`.

## 3. Login-Dienst (db.xyntal.de)

Der Login-Dienst auf `db.xyntal.de` bleibt. Die Website nutzt ihn weiter (`supabaseUrl` in `public/config.js`).
Auf dem DB-Server die `.env` des Supabase-Stacks in `/opt/xyntal/supabase/.env` (siehe `hosting/hetzner/supabase/install.sh`) anpassen:

- `SITE_URL=https://xyntal.com`
- `ADDITIONAL_REDIRECT_URLS=https://xyntal.com/**,https://www.xyntal.com/**,https://xyntal.de/**,https://www.xyntal.de/**,https://admin.xyntal.de/**,http://127.0.0.1:*/supabase/callback`

Danach den Auth-Dienst neu starten. Ein bloßes `docker compose restart auth` lädt die `.env` nicht neu, daher:

```
cd /opt/xyntal/supabase && docker compose up -d auth
```

Begründung: GoTrue akzeptiert als Ziel nur Adressen aus `ADDITIONAL_REDIRECT_URLS`, sonst fällt es auf `SITE_URL` zurück. Ohne diesen Schritt landen Google-, Apple- und LinkedIn-Login sowie Bestätigungs- und Passwort-Mails nicht auf der richtigen Seite.

Die OAuth-Rückleitung bei Google, Apple und LinkedIn bleibt `https://db.xyntal.de/auth/v1/callback` und muss dort nicht geändert werden.

Hinweis für Nutzer: Konten bleiben erhalten, niemand muss sich neu registrieren. Nur einmal auf `xyntal.com` neu anmelden.

## 4. Dieses Repo pushen

Erst danach `main` pushen. Caddy holt die Zertifikate für `xyntal.com` und `www.xyntal.com`. Das `Caddyfile` wird
mit `deploy.sh` neu eingebunden. Die übrige Website (`public/`) ist nach spätestens 30 s online.

## 5. Prüfen

- `https://xyntal.com/` lädt mit gültigem Zertifikat.
- `https://www.xyntal.com/preise` leitet auf `https://xyntal.com/preise` weiter.
- `https://xyntal.de/preise` antwortet mit 308 und `Location: https://xyntal.com/preise`.
- `https://www.xyntal.de/?x=1` antwortet mit 308 und `Location: https://xyntal.com/?x=1`.
- Ein POST an `https://xyntal.de/` bleibt ein POST (308, nicht 301).
- `https://api.xyntal.de` und `https://admin.xyntal.de` antworten wie vorher.
- Registrierung, Bestätigungsmail und Passwort-Reset führen auf `xyntal.com` zurück.

## Hinweise für Nutzer

- Anmeldungen und Spracheinstellungen liegen im Browser je Domain. Nutzer müssen sich auf `xyntal.com` **einmal neu anmelden**.
- Die Anmeldung teilt sich nicht mehr mit `admin.xyntal.de`. Der Admin hat ein eigenes Cookie für `.xyntal.de`
  und bleibt dort angemeldet, bis sein Token abläuft.
