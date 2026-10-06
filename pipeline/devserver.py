"""Serve app/ locally with caching disabled, so every reload shows the latest files."""
import functools
import http.server
import sys
from pathlib import Path


MOCK = "--mock" in sys.argv
MOCKLIB = Path(__file__).resolve().parent.parent / "build" / "mocklib"


class NoStore(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # --mock: serve the full-structure test library (pipeline/mock_library.py) instead of app/library
        if MOCK and path.split("?")[0].startswith("/library/"):
            return str(MOCKLIB / path.split("?")[0][len("/library/"):])
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(next((a for a in sys.argv[1:] if a.isdigit()), 8766))
root = Path(__file__).resolve().parent.parent / "app"
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(NoStore, directory=str(root))).serve_forever()
