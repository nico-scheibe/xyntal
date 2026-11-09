#!/bin/sh
# Supabase auf dem Hetzner-Server einrichten (einmalig, als root):
#
#   sh /opt/xyntal/site/hosting/hetzner/supabase/install.sh
#
# Was passiert:
#   1. Das offizielle Supabase-Docker-Setup in der festen Version $SUPABASE_REF nach
#      /opt/xyntal/supabase (setup.sh von Supabase erzeugt alle Passwörter und Schlüssel).
#   2. Adressen, Mail-Versand, Dateien im Hetzner-Bucket und Xyntals Anpassungen
#      (docker-compose.xyntal.yml) eintragen.
#   3. Die Edge Function send-auth-email aus diesem Repo übernehmen.
#   4. Supabase starten. Daten zieht danach migrate.sh um.
#
# Läuft das Skript ein zweites Mal, bleibt eine vorhandene Einrichtung samt
# Schlüsseln erhalten; nur die Xyntal-Teile (Schritt 2 und 3) werden aufgefrischt.
set -eu

SUPABASE_REF="${SUPABASE_REF:-self-hosted/v0.8.4}"
BASE=/opt/xyntal
DIR="$BASE/supabase"
HERE="$(cd "$(dirname "$0")" && pwd)"
SECRETS="$BASE/secrets"
DOMAIN="${SUPABASE_DOMAIN:-db.xyntal.de}"

die() { echo "Fehler: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "bitte als root ausführen"
[ -f "$SECRETS/api.env" ] || die "$SECRETS/api.env fehlt"
[ -f "$SECRETS/website.env" ] || die "$SECRETS/website.env fehlt"

# Wert aus einer KEY=VALUE-Datei lesen (ohne die Datei zu „sourcen“).
get() { sed -n "s/^$2=//p" "$1" | tail -n 1; }
# Wert in .env setzen oder anhängen. Werte kommen über die Umgebung, nicht über sed-Muster.
put() {
    KEY="$1" VAL="$2" awk -v OFS="" '
        BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; done = 0 }
        index($0, k "=") == 1 { print k, "=", v; done = 1; next }
        { print }
        END { if (!done) print k, "=", v }
    ' "$DIR/.env" > "$DIR/.env.tmp" && mv "$DIR/.env.tmp" "$DIR/.env"
}

for k in MEDIA_S3_ENDPOINT MEDIA_S3_REGION MEDIA_S3_BUCKET MEDIA_S3_ACCESS_KEY MEDIA_S3_SECRET_KEY; do
    [ -n "$(get "$SECRETS/api.env" "$k")" ] || die "$k fehlt in $SECRETS/api.env"
done
[ -n "$(get "$SECRETS/website.env" BREVO_API_KEY)" ] || die "BREVO_API_KEY fehlt in $SECRETS/website.env"

# 1. Offizielles Setup (nur beim ersten Mal)
if [ ! -f "$DIR/.env" ]; then
    echo "→ Supabase $SUPABASE_REF nach $DIR"
    cd "$BASE"
    curl -fsSL "https://raw.githubusercontent.com/supabase/supabase/$SUPABASE_REF/docker/setup.sh" -o /tmp/supabase-setup.sh
    sh /tmp/supabase-setup.sh --ref "$SUPABASE_REF" --project-dir supabase --skip-deps -y
    rm -f /tmp/supabase-setup.sh
else
    echo "→ $DIR ist schon eingerichtet, Schlüssel bleiben"
fi
cd "$DIR"
chmod 600 .env

# 2. Xyntal-Einstellungen
echo "→ Einstellungen"
put SUPABASE_PUBLIC_URL "https://$DOMAIN"
put API_EXTERNAL_URL "https://$DOMAIN/auth/v1"
put SITE_URL "https://xyntal.de"
put ADDITIONAL_REDIRECT_URLS "https://xyntal.de/**,https://www.xyntal.de/**"
put ENABLE_EMAIL_SIGNUP "true"
put ENABLE_EMAIL_AUTOCONFIRM "false"
put ENABLE_ANONYMOUS_USERS "false"
# Kein SMS-Anbieter eingerichtet: sonst zeigt die Login-Seite ein Handynummer-Feld, das nicht funktioniert.
put ENABLE_PHONE_SIGNUP "false"
put ENABLE_PHONE_AUTOCONFIRM "false"
put DISABLE_SIGNUP "false"
for k in MEDIA_S3_ENDPOINT MEDIA_S3_REGION MEDIA_S3_BUCKET MEDIA_S3_ACCESS_KEY MEDIA_S3_SECRET_KEY; do
    put "$k" "$(get "$SECRETS/api.env" "$k")"
done
put BREVO_API_KEY "$(get "$SECRETS/website.env" BREVO_API_KEY)"
# Ersatz-Weg für Mails, falls der Hook ausfällt: SMTP aus website.env, sonst Brevo-SMTP.
for k in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS; do
    v="$(get "$SECRETS/website.env" "$k")"
    [ -n "$v" ] && put "$k" "$v"
done
sender="$(get "$SECRETS/website.env" BREVO_SENDER_EMAIL)"
[ -n "$sender" ] && put SMTP_ADMIN_EMAIL "$sender"
put SMTP_SENDER_NAME "Xyntal"
# Geheimnis für den Mail-Hook: einmal erzeugen, danach behalten.
if [ -z "$(get .env SEND_EMAIL_HOOK_SECRET)" ]; then
    put SEND_EMAIL_HOOK_SECRET "v1,whsec_$(openssl rand -base64 32)"
fi
# Geheimnis für den Bot-Schutz-Hook (before-user-created): ebenso einmalig.
if [ -z "$(get .env BEFORE_USER_CREATED_HOOK_SECRET)" ]; then
    put BEFORE_USER_CREATED_HOOK_SECRET "v1,whsec_$(openssl rand -base64 32)"
fi

cp "$HERE/docker-compose.xyntal.yml" ./docker-compose.xyntal.yml
compose="$(get .env COMPOSE_FILE)"
case ":$compose:" in
    *":docker-compose.xyntal.yml:"*) ;;
    *) put COMPOSE_FILE "${compose:-docker-compose.yml}:docker-compose.xyntal.yml" ;;
esac

# 3. Edge Functions für Login-Mails und Bot-Schutz
echo "→ Edge Functions send-auth-email, before-user-created"
mkdir -p volumes/functions/send-auth-email
cp "$HERE/../../../supabase/functions/send-auth-email/"* volumes/functions/send-auth-email/
mkdir -p volumes/functions/before-user-created
cp "$HERE/../../../supabase/functions/before-user-created/"* volumes/functions/before-user-created/

# 4. Starten
echo "→ Supabase starten (der erste Start lädt die Images, das dauert ein paar Minuten)"
docker compose pull --quiet
docker compose up -d

echo
echo "Fertig. Supabase läuft lokal auf 127.0.0.1:8000; von außen über https://$DOMAIN,"
echo "sobald der DNS-Eintrag steht und Caddy neu geladen ist (siehe README)."
echo "Dashboard-Login: Benutzer und Passwort stehen in $DIR/.env (DASHBOARD_USERNAME / DASHBOARD_PASSWORD)."
