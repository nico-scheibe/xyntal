#!/usr/bin/env python3
"""Lokale Vorschau der Xyntal-Website.

Start:  python3 server.py      → http://localhost:4173

Die Website besteht nur aus Dateien in public/. Daten und Login laufen über Supabase,
deshalb braucht es hier keinen eigenen Backend-Server. Dieses Skript liefert die Dateien
nur aus und unterstützt schöne Adressen wie /profil statt /profil.html
(so wie es Netlify, Vercel & Co. beim Hosting auch tun).
"""

import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC, **kwargs)

    def redirect_project_slash(self):
        parsed = urlparse(self.path)
        if re.fullmatch(r"/[a-z0-9][a-z0-9_-]{0,19}-[a-z0-9][a-z0-9_-]{0,118}/", parsed.path):
            self.send_response(308)
            self.send_header("Location", parsed.path[:-1] + ("?" + parsed.query if parsed.query else ""))
            self.end_headers()
            return True
        return False

    def do_GET(self):
        if not self.redirect_project_slash():
            super().do_GET()

    def do_HEAD(self):
        if not self.redirect_project_slash():
            super().do_HEAD()

    def translate_path(self, path):
        parsed = urlparse(path).path
        if parsed != "/" and "." not in os.path.basename(parsed):
            candidate = super().translate_path(parsed.rstrip("/") + ".html")
            if os.path.isfile(candidate):
                return candidate
            if re.fullmatch(r"/[a-z0-9][a-z0-9_-]{0,19}-[a-z0-9][a-z0-9_-]{0,118}/?", parsed):
                return os.path.join(PUBLIC, "projekte.html")
            if re.fullmatch(r"/[a-zA-Z0-9][a-zA-Z0-9_-]{2,19}/?", parsed) and not os.environ.get("XYNTAL_NO_HANDLE_ROUTE"):
                return os.path.join(PUBLIC, "u.html")
        return super().translate_path(path)

    def send_error(self, code, message=None, explain=None):
        # Wie Daki: unbekannte Adressen zeigen 404.html
        page = os.path.join(PUBLIC, "404.html")
        if code == 404 and os.path.isfile(page):
            body = open(page, "rb").read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "4173"))
    print(f"Xyntal-Vorschau läuft auf http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
