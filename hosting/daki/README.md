# Daki hosting

The website runs on `paid1.daki.cc:4129`. Daki runs a copy of `server.cjs`
outside the public web root. No dependencies or GitHub credentials are required.
It checks the public `main` branch every 30 seconds and publishes `public/`
from a complete Git archive. The previous site stays live if a fetch fails.
Only the public directory is exposed; database migrations and server state are not.

Every push to `main` is detected within 30 seconds. Other branches do not publish.
Check `/__deployment` or the `X-Xyntal-Commit` response header for the deployed revision.

Daki startup: `cd /home/container/xyntal && node auto-server.cjs`

Runtime changes to `hosting/daki/server.cjs` require replacing Daki's
`auto-server.cjs` and restarting. Website files update automatically.
The generated `.deploy/` directory belongs on the server only.
