# Daki hosting

The website runs on `paid1.daki.cc:4129`. Daki runs a copy of `server.cjs`
outside the public web root. No dependencies or GitHub credentials are required.
It checks the public `main` branch every 30 seconds and publishes `public/`
from a complete Git archive. The previous site stays live if a fetch fails.
Only the public directory is exposed; database migrations and server state are not.

Every push to `main` is detected within 30 seconds. Other branches do not publish.
Check `/__deployment` or the `X-Xyntal-Commit` response header for the deployed revision.

Daki startup (downloads the server from this repository before starting):

```sh
cd /home/container/xyntal && curl -fsSL https://raw.githubusercontent.com/nico-scheibe/xyntal/main/hosting/daki/start.cjs -o start.cjs && node start.cjs
```

Runtime changes to `hosting/daki/server.cjs` take effect after restarting Daki.
Website files update automatically, without a restart.
The generated `.deploy/` directory belongs on the server only.

Cloudflare tunnel `xyntal-daki` connects to `http://localhost:4129` inside Daki.
The launcher verifies a pinned Cloudflared binary and reads the tunnel token
from `.cloudflared-token` (permissions 0600). Never commit this file.
