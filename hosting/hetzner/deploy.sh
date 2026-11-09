#!/usr/bin/env bash
# Neue Version ausrollen. Nur dann startet etwas neu, nicht bei jedem Commit.
#   /opt/xyntal/site/hosting/hetzner/deploy.sh            # neuester Stand von master
#   APP_REF=v1.4.0 /opt/xyntal/site/hosting/hetzner/deploy.sh   # ein bestimmter Tag
set -euo pipefail

ROOT=/opt/xyntal
APP_REF=${APP_REF:-master}

git -C "$ROOT/site" pull --ff-only --quiet
# Bucket-Zugang (MEDIA_S3_*) aus api.env auch der Website geben: Uploads der freien Seite (media-store.cjs)
if [ -f "$ROOT/secrets/api.env" ]; then (umask 077; grep '^MEDIA_S3_' "$ROOT/secrets/api.env" > "$ROOT/secrets/media.env" || true); fi

TOKEN=$(tr -d '[:space:]' < "$ROOT/secrets/github-token")
# Der Token geht als Header mit, nie in eine URL oder in .git/config.
AUTH="Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"
REPO=https://github.com/nico-scheibe/xyntal-app-windows.git
if [ ! -d "$ROOT/app/.git" ]; then
  git -c http.extraHeader="$AUTH" clone --quiet --depth 1 --branch "$APP_REF" "$REPO" "$ROOT/app"
else
  git -C "$ROOT/app" -c http.extraHeader="$AUTH" fetch --quiet --depth 1 origin "$APP_REF"
  git -C "$ROOT/app" checkout --quiet --force FETCH_HEAD
fi
echo "App-Backend: $(git -C "$ROOT/app" log -1 --format='%h %s')"

cd "$ROOT/site/hosting/hetzner"
docker compose build --pull --quiet
docker compose up -d --remove-orphans
# Caddyfile ist als Datei eingebunden: nach einer Änderung sieht Caddy sie erst in einem neuen Container.
CADDY_SUM=$(sha256sum Caddyfile | cut -d' ' -f1)
if [ "$CADDY_SUM" != "$(cat "$ROOT/state/caddyfile.sha256" 2>/dev/null)" ]; then
  docker compose up -d --force-recreate --no-deps caddy
  mkdir -p "$ROOT/state" && echo "$CADDY_SUM" > "$ROOT/state/caddyfile.sha256"
fi
docker image prune -f >/dev/null
docker compose ps
