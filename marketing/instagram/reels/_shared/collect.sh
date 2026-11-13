#!/usr/bin/env bash
# Kopiert fertige Reels und Titelbilder nach export/reels/.
cd "$(dirname "$0")/.." && mkdir -p ../export/reels
for d in out/r*/; do n=$(basename "$d"); [ -f "$d/final.mp4" ] && cp "$d/final.mp4" "../export/reels/$n.mp4" && { [ -f "$d/poster.png" ] && cp "$d/poster.png" "../export/reels/$n.png"; echo "$n"; }; done
