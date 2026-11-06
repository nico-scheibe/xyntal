#!/usr/bin/env bash
# Neue Version ausrollen. Nur dann startet etwas neu, nicht bei jedem Commit.
#   /opt/xyntal/site/hosting/hetzner/deploy.sh            # neuester Stand von master
#   APP_REF=v1.4.0 /opt/xyntal/site/hosting/hetzner/deploy.sh   # ein bestimmter Tag
set -euo pipefail

ROOT=/opt/xyntal
APP_REF=${APP_REF:-master}

git -C "$ROOT/site" pull --ff-only --quiet

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
docker image prune -f >/dev/null
docker compose ps
