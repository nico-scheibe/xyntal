#!/usr/bin/env bash
# Legt ein Reel an: _shared/new-reel.sh <ordner> <sekunden> "<titel>" [tonart] [modus]
set -euo pipefail
S=/root/.claude/plugins/synced/449de0d6-8683-433a-ac5f-c89098b3d572_15c3197c-2e29-426a-aa2d-dec0dbc843cf/d92346f7-5140-4ddb-b284-a3b42995e5b0/skills/motion-reel
d=$1; mkdir -p "$d/audio" "$d/docs"
cp _shared/index.html "$d/index.html"
printf '{ "title": "%s", "duration": %s, "formats": ["9x16"], "poster": 3 }\n' "$3" "$2" > "$d/film.json"
uv run -q "$S/scripts/beats.py" "$d" --synth --flavor lofi --mode "${5:-dorian}" --tonic "${4:-D}" --bpm 120 --seed $RANDOM | tail -1
