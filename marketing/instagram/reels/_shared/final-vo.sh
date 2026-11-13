#!/usr/bin/env bash
# Rendert Reels mit Voice-over, ohne Musik und Effekte: _shared/final-vo.sh <ordner>...
S=/root/.claude/plugins/synced/449de0d6-8683-433a-ac5f-c89098b3d572_15c3197c-2e29-426a-aa2d-dec0dbc843cf/d92346f7-5140-4ddb-b284-a3b42995e5b0/skills/motion-reel
for f in "$@"; do
  mkdir -p $f/audio/alt; for x in music sfx; do [ -f $f/audio/$x.wav ] && mv $f/audio/$x.wav $f/audio/alt/; done
  node $S/scripts/render.mjs --film $f --format 9x16 --video-only >/dev/null 2>&1 && \
  node $S/scripts/mix.mjs $f --vo-db 0 2>&1 | grep master && \
  node $S/scripts/render.mjs --film $f --poster >/dev/null 2>&1 && echo "OK $f" || echo "FEHLER $f"
done
