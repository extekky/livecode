"""Local file bridge — tiny HTTP server that reads/writes liveshare.py on disk.

Runs on 127.0.0.1 only, so it is only reachable from the browser on the same
machine.  No authentication needed for a trusted local-network tool.
"""

import json
import pathlib
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional

from server.config import BRIDGE_HOST, BRIDGE_PORT

FILE_PATH = pathlib.Path("liveshare.py")


class _Handler(BaseHTTPRequestHandler):
    # ── Helpers ─────────────────────────────────────────────────────────────

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_file(self) -> str:
        if not FILE_PATH.exists():
            FILE_PATH.write_text("", encoding="utf-8")
            return ""
        return FILE_PATH.read_text(encoding="utf-8")

    def _write_file(self, content: str) -> None:
        FILE_PATH.write_text(content, encoding="utf-8")

    # ── Routes ──────────────────────────────────────────────────────────────

    def do_OPTIONS(self) -> None:
        self._json(HTTPStatus.NO_CONTENT, {})

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(HTTPStatus.OK, {"status": "ok"})
        elif self.path == "/file":
            self._json(HTTPStatus.OK, {"content": self._read_file()})
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_PUT(self) -> None:
        self._write_route()

    def do_POST(self) -> None:
        self._write_route()

    def _write_route(self) -> None:
        if self.path != "/file":
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return

        length = self.headers.get("Content-Length")
        if not length:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "missing_length"})
            return

        raw = self.rfile.read(int(length))
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(HTTPStatus.BAD_REQUEST, {"error": "invalid_json"})
            return

        content = payload.get("content")
        if not isinstance(content, str):
            self._json(HTTPStatus.BAD_REQUEST, {"error": "content_must_be_string"})
            return

        self._write_file(content)
        self._json(HTTPStatus.OK, {"status": "saved"})

    def log_message(self, fmt: str, *args: object) -> None:  # silence access log
        pass


# ── Public API ───────────────────────────────────────────────────────────────

def create() -> ThreadingHTTPServer:
    return ThreadingHTTPServer((BRIDGE_HOST, BRIDGE_PORT), _Handler)


def run(
    server: ThreadingHTTPServer,
    stop_event: Optional[threading.Event] = None,
    ready_event: Optional[threading.Event] = None,
) -> None:
    print(f"File bridge     → http://{BRIDGE_HOST}:{BRIDGE_PORT}"
          f"  (writing {FILE_PATH.resolve()})")
    if ready_event is not None:
        ready_event.set()
    if stop_event is None:
        server.serve_forever()
        return

    server.timeout = 0.5
    while not stop_event.is_set():
        server.handle_request()
    server.server_close()
