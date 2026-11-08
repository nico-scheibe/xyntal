#!/bin/sh
# Daten vom bisherigen Supabase-Projekt (supabase.co) auf den eigenen Server holen.
# Nach install.sh, als root:
#
#   sh /opt/xyntal/site/hosting/hetzner/supabase/migrate.sh dump      # 1. Export (alte Seite läuft weiter)
#   sh /opt/xyntal/site/hosting/hetzner/supabase/migrate.sh restore   # 2. Import in den eigenen Server
#   sh /opt/xyntal/site/hosting/hetzner/supabase/migrate.sh files     # 3. Banner/Profilbilder kopieren
#   sh /opt/xyntal/site/hosting/hetzner/supabase/migrate.sh check     # 4. Zählen und vergleichen
#
# Folgt der offiziellen Anleitung „Restore a Platform Project to Self-Hosted“ und
# „Copy Storage Objects from Platform“ (supabase.com/docs/guides/self-hosting):
# Export mit `supabase db dump` (roles, schema, data), Import mit psql in einer
# Transaktion, Dateien per rclone über die S3-Schnittstelle beider Seiten.
#
# Zugangsdaten zum alten Projekt stehen in /opt/xyntal/secrets/supabase-cloud.env
# (chmod 600), nie in der Shell-History:
#   OLD_DB_URL=postgresql://postgres.<ref>:<passwort>@aws-0-<region>.pooler.supabase.com:5432/postgres
#   OLD_S3_ENDPOINT=https://<ref>.storage.supabase.co/storage/v1/s3
#   OLD_S3_REGION=<region, z. B. eu-central-1>
#   OLD_S3_ACCESS_KEY=...
#   OLD_S3_SECRET_KEY=...
set -eu

BASE=/opt/xyntal
DIR="$BASE/supabase"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$BASE/migration"
CLOUD="$BASE/secrets/supabase-cloud.env"
CLI_VERSION="${SUPABASE_CLI_VERSION:-2.122.1}"

die() { echo "Fehler: $*" >&2; exit 1; }
get() { sed -n "s/^$2=//p" "$1" | tail -n 1; }
[ "$(id -u)" = 0 ] || die "bitte als root ausführen"
[ -f "$DIR/.env" ] || die "zuerst install.sh ausführen"
mkdir -p "$WORK" && chmod 700 "$WORK"
cd "$WORK"

need_cloud() {
    [ -f "$CLOUD" ] || die "$CLOUD fehlt (siehe Kopf dieses Skripts)"
    chmod 600 "$CLOUD"
}

# Supabase CLI (für `db dump`) – einmal installieren, feste Version.
ensure_cli() {
    command -v supabase >/dev/null 2>&1 && return
    arch="$(dpkg --print-architecture)"
    url="https://github.com/supabase/cli/releases/download/v$CLI_VERSION/supabase_${CLI_VERSION}_linux_${arch}.deb"
    echo "→ Supabase CLI $CLI_VERSION installieren"
    curl -fsSL "$url" -o /tmp/supabase-cli.deb
    dpkg -i /tmp/supabase-cli.deb >/dev/null
    rm -f /tmp/supabase-cli.deb
}

ensure_rclone() {
    command -v rclone >/dev/null 2>&1 && return
    echo "→ rclone installieren"
    apt-get install -y -qq rclone >/dev/null
}

# psql im Datenbank-Container des eigenen Servers (als Superuser über den lokalen Socket).
local_psql() { docker exec -i supabase-db psql -U supabase_admin -d postgres "$@"; }

case "${1:-}" in
dump)
    need_cloud
    ensure_cli
    url="$(get "$CLOUD" OLD_DB_URL)"
    [ -n "$url" ] || die "OLD_DB_URL fehlt in $CLOUD"
    echo "→ Export: Rollen, Schema, Daten (nur lesend, die alte Seite läuft weiter)"
    supabase db dump --db-url "$url" -f roles.sql --role-only
    supabase db dump --db-url "$url" -f schema.sql
    supabase db dump --db-url "$url" -f data.sql --use-copy --data-only
    # Postgres-17-Einstellung, die ältere Versionen nicht kennen (laut Anleitung harmlos zu entfernen).
    sed -i 's/^SET transaction_timeout/-- &/' data.sql
    # Was `db dump` auslässt (Trigger auf auth-Tabellen, Storage-Zugriffsregeln), siehe extras-export.sql.
    docker run --rm -v "$HERE:/q:ro" postgres:17-alpine psql "$url" -X -v ON_ERROR_STOP=1 -q -f /q/extras-export.sql > extras.sql
    echo "Zusätze: $(grep -c '^create trigger\|^CREATE TRIGGER' extras.sql) Trigger, $(grep -c '^create policy' extras.sql) Storage-Regeln"
    ls -la roles.sql schema.sql data.sql extras.sql
    echo "Export fertig in $WORK."
    ;;
restore)
    for f in roles.sql schema.sql data.sql extras.sql; do [ -s "$f" ] || die "$WORK/$f fehlt – zuerst: migrate.sh dump"; done
    echo "→ Import in die eigene Datenbank (eine Transaktion: klappt alles oder nichts)"
    { cat roles.sql schema.sql; echo "SET session_replication_role = replica;"; cat data.sql; echo "SET session_replication_role = origin;"; cat extras.sql; } \
        | local_psql --single-transaction --variable ON_ERROR_STOP=1 --quiet --output /dev/null
    echo "→ PostgREST neu laden"
    local_psql -c "NOTIFY pgrst, 'reload schema';" >/dev/null
    echo "Import fertig."
    ;;
files)
    need_cloud
    ensure_rclone
    # Alte Dateien per S3 holen (rclone-Ziel nur über Umgebungsvariablen, keine Konfigurationsdatei mit Schlüsseln).
    export RCLONE_CONFIG_OLD_TYPE=s3 RCLONE_CONFIG_OLD_PROVIDER=Other RCLONE_CONFIG_OLD_FORCE_PATH_STYLE=true
    RCLONE_CONFIG_OLD_ENDPOINT="$(get "$CLOUD" OLD_S3_ENDPOINT)"
    RCLONE_CONFIG_OLD_REGION="$(get "$CLOUD" OLD_S3_REGION)"
    RCLONE_CONFIG_OLD_ACCESS_KEY_ID="$(get "$CLOUD" OLD_S3_ACCESS_KEY)"
    RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY="$(get "$CLOUD" OLD_S3_SECRET_KEY)"
    export RCLONE_CONFIG_OLD_ENDPOINT RCLONE_CONFIG_OLD_REGION RCLONE_CONFIG_OLD_ACCESS_KEY_ID RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY
    # Einspielen über die Storage-API (Service-Schlüssel). Die S3-Schnittstelle des eigenen Servers lehnt
    # Signaturen hinter dem Gateway ab (Pfad /storage/v1/s3 wird umgeschrieben).
    key="$(get "$DIR/.env" SERVICE_ROLE_KEY)"
    tmp="$WORK/files"; rm -rf "$tmp"; mkdir -p "$tmp"; chmod 700 "$tmp"
    for bucket in $(rclone lsf OLD: | tr -d '/'); do
        echo "→ Bucket $bucket"
        rclone copy "OLD:$bucket" "$tmp/$bucket"
    done
    ok=0; bad=0
    ( cd "$tmp" && find . -type f | sed 's#^\./##' ) > "$WORK/files.lst"
    while IFS= read -r f; do
        b="${f%%/*}"; p="${f#*/}"
        case "$f" in
            *.jpg|*.jpeg) ct=image/jpeg ;; *.png) ct=image/png ;; *.gif) ct=image/gif ;; *.webp) ct=image/webp ;;
            *.mp4) ct=video/mp4 ;; *.webm) ct=video/webm ;; *.pdf) ct=application/pdf ;; *) ct=application/octet-stream ;;
        esac
        code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:8000/storage/v1/object/$b/$p" \
            -H "apikey: $key" -H "Authorization: Bearer $key" -H "Content-Type: $ct" -H "x-upsert: true" --data-binary "@$tmp/$f")"
        if [ "$code" = 200 ]; then ok=$((ok + 1)); else bad=$((bad + 1)); echo "  Fehler $code: $f"; fi
    done < "$WORK/files.lst"
    rm -rf "$tmp" "$WORK/files.lst"
    echo "Dateien kopiert: $ok, fehlgeschlagen: $bad."
    [ "$bad" = 0 ] || exit 1
    ;;
check)
    echo "Eigener Server:"
    local_psql -At -c "select 'Konten: ' || count(*) from auth.users;
                        select 'Profile: ' || count(*) from public.profiles;
                        select 'Karten: ' || count(*) from public.waitlist_cards;
                        select 'Dateien: ' || count(*) from storage.objects;"
    if [ -f "$CLOUD" ]; then
        url="$(get "$CLOUD" OLD_DB_URL)"
        echo "Altes Projekt:"
        docker run --rm postgres:17-alpine psql "$url" -At -c "select 'Konten: ' || count(*) from auth.users;
                        select 'Profile: ' || count(*) from public.profiles;
                        select 'Karten: ' || count(*) from public.waitlist_cards;
                        select 'Dateien: ' || count(*) from storage.objects;"
    fi
    ;;
*)
    echo "Aufruf: $0 dump | restore | files | check" >&2
    exit 1
    ;;
esac
