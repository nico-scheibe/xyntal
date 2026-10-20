#!/usr/bin/env python3
"""Lokale Vorschau der Xyntal-Website.

Start:  python3 server.py      → http://localhost:4173

Die Website besteht nur aus Dateien in public/. Daten und Login laufen über Supabase,
deshalb braucht es hier keinen eigenen Backend-Server. Dieses Skript liefert die Dateien
nur aus und unterstützt schöne Adressen wie /profil statt /profil.html
(so wie es Netlify, Vercel & Co. beim Hosting auch tun).
"""

import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC, **kwargs)

    def translate_path(self, path):
        parsed = urlparse(path).path
        if parsed != "/" and "." not in os.path.basename(parsed):
            candidate = super().translate_path(parsed.rstrip("/") + ".html")
            if os.path.isfile(candidate):
                return candidate
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4173"))
    print(f"Xyntal-Vorschau läuft auf http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
