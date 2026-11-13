#!/usr/bin/env bash
# Holt neue Commits von GitHub und rollt sie selbst aus (läuft alle 30 Sekunden
# über xyntal-autodeploy.timer). Zwei Schutzregeln, damit Nutzer nichts merken:
#   1. Neu gestartet wird nur ein Dienst, dessen Image sich wirklich ändert.
#      Ein Commit, der nur die Desktop-App betrifft, startet das Backend nicht neu.
#   2. Läuft gerade ein Anruf, wird gewartet (höchstens MAX_WAIT_MIN Minuten).
set -euo pipefail

# Alles steckt in main(): deploy.sh aktualisiert dieses Repo und damit auch
# diese Datei, während sie läuft. Bash hat main() dann schon komplett gelesen.
main() {

  ROOT=/opt/xyntal
  STATE=$ROOT/state
  MAX_WAIT_MIN=${MAX_WAIT_MIN:-120}
  mkdir -p "$STATE"
  exec 9>"$STATE/autodeploy.lock"
  flock -n 9 || return 0

  TOKEN=$(tr -d '[:space:]' < "$ROOT/secrets/github-token")
  AUTH="Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"
  APP_REF=${APP_REF:-master}

  app_head=$(git -c http.extraHeader="$AUTH" ls-remote https://github.com/nico-scheibe/xyntal-app-windows.git "refs/heads/$APP_REF" | cut -f1)
  site_head=$(git ls-remote https://github.com/nico-scheibe/xyntal.git refs/heads/main | cut -f1)
  [[ $app_head =~ ^[0-9a-f]{40}$ && $site_head =~ ^[0-9a-f]{40}$ ]] || { echo "GitHub nicht erreichbar"; return 1; }

  wanted="$app_head $site_head"
  [ "$wanted" = "$(cat "$STATE/deployed" 2>/dev/null)" ] && { rm -f "$STATE/waiting-since"; return 0; }

  # Laufende Anrufe: aktive Anrufe mit mindestens einer Person darin.
  calls=$(docker compose -f "$ROOT/site/hosting/hetzner/compose.yaml" exec -T api node -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('/app/data/xyntalnet.db', { readOnly: true });
    const r = db.prepare(\"SELECT COUNT(DISTINCT c.id) AS n FROM calls c JOIN call_participants p ON p.call_id = c.id WHERE c.ended_at IS NULL AND c.started_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-12 hours')\").get();
    console.log(r.n);" 2>/dev/null || echo 0)
  # Nur die letzte Zeile und nur Ziffern. Schreibt node irgendwann eine Warnung vor
  # die Zahl, steht hier sonst etwas Mehrzeiliges, und "[ ... -gt 0 ]" scheitert –
  # in einer if-Bedingung, wo set -e NICHT greift. Das Skript liefe weiter, als wäre
  # kein Anruf aktiv, und würde mitten in ein Gespräch hinein ausrollen. Genau die
  # Schutzregel, die oben im Kopf steht, wäre dann still wirkungslos.
  calls=$(printf '%s' "$calls" | tail -n 1 | tr -cd '0-9')
  if [ -z "$calls" ]; then
    echo "Anrufzahl nicht lesbar – rolle aus, als liefe keiner. (Prüfung ansehen!)"
    calls=0
  fi
  if [ "$calls" -gt 0 ]; then
    [ -f "$STATE/waiting-since" ] || date +%s > "$STATE/waiting-since"
    waited=$(( ($(date +%s) - $(cat "$STATE/waiting-since")) / 60 ))
    if [ "$waited" -lt "$MAX_WAIT_MIN" ]; then
      echo "Neue Version bereit, aber $calls Anruf(e) laufen – warte (seit $waited min)."
      return 0
    fi
    echo "Seit $waited min laufen Anrufe – rolle trotzdem aus."
  fi

  echo "Neue Version: app ${app_head:0:7}, site ${site_head:0:7}"
  APP_REF=$app_head "$ROOT/site/hosting/hetzner/deploy.sh"
  echo "$wanted" > "$STATE/deployed"
  rm -f "$STATE/waiting-since"
}

main "$@"
exit $?
