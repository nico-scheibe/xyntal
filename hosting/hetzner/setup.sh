#!/usr/bin/env bash
# Einmalig auf dem frischen Server ausführen (als root):
#   curl -fsSL https://raw.githubusercontent.com/nico-scheibe/xyntal/main/hosting/hetzner/setup.sh | bash
set -euo pipefail

ROOT=/opt/xyntal
mkdir -p "$ROOT/secrets" "$ROOT/data/api" "$ROOT/backups"
chmod 700 "$ROOT/secrets"
# Das App-Backend läuft im Container als Benutzer "node" (uid 1000).
chown -R 1000:1000 "$ROOT/data/api"

command -v git >/dev/null || { apt-get update && apt-get install -y git; }
command -v docker >/dev/null || { curl -fsSL https://get.docker.com | sh; }

# Sicherheitsupdates automatisch einspielen.
apt-get install -y unattended-upgrades >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades

# 2 GB Swap als Reserve, falls ein Build viel Speicher braucht.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

[ -d "$ROOT/site/.git" ] || git clone https://github.com/nico-scheibe/xyntal.git "$ROOT/site"

# Automatische Updates von GitHub (alle 5 Minuten, siehe autodeploy.sh).
install -m 644 "$ROOT/site/hosting/hetzner/xyntal-autodeploy.service" "$ROOT/site/hosting/hetzner/xyntal-autodeploy.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now xyntal-autodeploy.timer

for f in api.env website.env; do
  [ -f "$ROOT/secrets/$f" ] || { touch "$ROOT/secrets/$f"; chmod 600 "$ROOT/secrets/$f"; }
done

echo
echo "Fertig. Als Nächstes (siehe hosting/hetzner/README.md):"
echo "  1. GitHub-Token nach $ROOT/secrets/github-token"
echo "  2. Einstellungen in $ROOT/secrets/api.env und website.env"
echo "  3. $ROOT/site/hosting/hetzner/deploy.sh"
