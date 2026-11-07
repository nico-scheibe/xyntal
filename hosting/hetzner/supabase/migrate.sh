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
    ls -la roles.sql schema.sql data.sql
    echo "Export fertig in $WORK."
    ;;
restore)
    for f in roles.sql schema.sql data.sql; do [ -s "$f" ] || die "$WORK/$f fehlt – zuerst: migrate.sh dump"; done
    echo "→ Import in die eigene Datenbank (eine Transaktion: klappt alles oder nichts)"
    { cat roles.sql schema.sql; echo "SET session_replication_role = replica;"; cat data.sql; } \
        | local_psql --single-transaction --variable ON_ERROR_STOP=1 --quiet --output /dev/null
    echo "→ PostgREST neu laden"
    local_psql -c "NOTIFY pgrst, 'reload schema';" >/dev/null
    echo "Import fertig."
    ;;
files)
    need_cloud
    ensure_rclone
    # rclone-Ziele nur für diesen Aufruf, über Umgebungsvariablen (keine Konfigurationsdatei mit Schlüsseln).
    export RCLONE_CONFIG_OLD_TYPE=s3 RCLONE_CONFIG_OLD_PROVIDER=Other
    RCLONE_CONFIG_OLD_ENDPOINT="$(get "$CLOUD" OLD_S3_ENDPOINT)"
    RCLONE_CONFIG_OLD_REGION="$(get "$CLOUD" OLD_S3_REGION)"
    RCLONE_CONFIG_OLD_ACCESS_KEY_ID="$(get "$CLOUD" OLD_S3_ACCESS_KEY)"
    RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY="$(get "$CLOUD" OLD_S3_SECRET_KEY)"
    export RCLONE_CONFIG_OLD_ENDPOINT RCLONE_CONFIG_OLD_REGION RCLONE_CONFIG_OLD_ACCESS_KEY_ID RCLONE_CONFIG_OLD_SECRET_ACCESS_KEY
    export RCLONE_CONFIG_NEW_TYPE=s3 RCLONE_CONFIG_NEW_PROVIDER=Other RCLONE_CONFIG_NEW_ENDPOINT=http://127.0.0.1:8000/storage/v1/s3
    RCLONE_CONFIG_NEW_REGION="$(get "$DIR/.env" REGION)"
    RCLONE_CONFIG_NEW_ACCESS_KEY_ID="$(get "$DIR/.env" S3_PROTOCOL_ACCESS_KEY_ID)"
    RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY="$(get "$DIR/.env" S3_PROTOCOL_ACCESS_KEY_SECRET)"
    export RCLONE_CONFIG_NEW_REGION RCLONE_CONFIG_NEW_ACCESS_KEY_ID RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY
    # Die Bucket-Einträge (storage.buckets) kamen mit dem Daten-Import; hier nur die Dateien.
    for bucket in $(rclone lsf OLD: | tr -d '/'); do
        echo "→ Bucket $bucket"
        rclone copy "OLD:$bucket" "NEW:$bucket" --transfers 4 --checkers 8 --stats-one-line --stats 10s
    done
    echo "Dateien kopiert."
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
