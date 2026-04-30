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
from urllib.parse import urlparse

from server.config import BRIDGE_HOST, BRIDGE_PORT, HTTP_PORT
from server import file_store

FILE_PATH = pathlib.Path("liveshare.py")
SETUP_PATH = "/setup"

SETUP_HTML = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StasikShare Student</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #151b24;
      --bg-top: #222b37;
      --panel: rgba(24, 31, 42, 0.96);
      --border: rgba(184, 199, 220, 0.18);
      --text: #f0f5fc;
      --muted: #aeb9c8;
      --accent: #7aa2f7;
      --accent-hover: #91b4ff;
      --accent-soft: rgba(122, 162, 247, 0.15);
      --danger: #ff8585;
      font-family: "SF Pro Display", "Segoe UI", system-ui, sans-serif;
    }}

    * {{ box-sizing: border-box; }}

    html, body {{
      min-height: 100vh;
      margin: 0;
    }}

    body {{
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 16% 0%, rgba(122, 162, 247, 0.16), transparent 32%),
        radial-gradient(circle at 86% 8%, rgba(121, 214, 159, 0.08), transparent 26%),
        linear-gradient(180deg, var(--bg-top) 0%, var(--bg) 100%);
      color: var(--text);
    }}

    main {{
      width: min(440px, 100%);
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--panel);
      box-shadow: 0 26px 76px rgba(0, 0, 0, 0.32);
      padding: 26px;
    }}

    .brand {{
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 28px;
    }}

    .mark {{
      width: 44px;
      height: 44px;
      border: 1px solid rgba(122, 162, 247, 0.38);
      border-radius: 12px;
      display: grid;
      place-items: center;
      color: var(--accent);
      background: rgba(24, 31, 42, 0.9);
      font-size: 20px;
      font-weight: 800;
    }}

    h1 {{
      margin: 0;
      font-size: 26px;
      line-height: 1.05;
    }}

    label {{
      display: block;
      margin: 0 0 8px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }}

    input {{
      width: 100%;
      height: 48px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #111822;
      color: var(--text);
      outline: none;
      padding: 0 14px;
      font-size: 16px;
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }}

    input:focus {{
      border-color: rgba(122, 162, 247, 0.62);
      box-shadow: 0 0 0 4px var(--accent-soft);
    }}

    button {{
      width: 100%;
      height: 48px;
      margin-top: 14px;
      border: 1px solid rgba(122, 162, 247, 0.52);
      border-radius: 12px;
      background: #6f98ee;
      color: #0f1724;
      cursor: pointer;
      font: inherit;
      font-weight: 800;
      transition: background 140ms ease, transform 140ms ease;
    }}

    button:hover {{
      background: var(--accent-hover);
      transform: translateY(-1px);
    }}

    .error {{
      min-height: 20px;
      margin: 10px 0 0;
      color: var(--danger);
      font-size: 13px;
      font-weight: 650;
    }}
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <div class="mark">&lt;/&gt;</div>
      <h1>StasikShare</h1>
    </div>

    <form id="connect-form">
      <label for="teacher-ip">Teacher IP</label>
      <input id="teacher-ip" name="teacher-ip" autocomplete="off" inputmode="decimal"
             placeholder="192.168.1.42" autofocus>
      <button type="submit">Connect</button>
      <p id="error" class="error"></p>
    </form>
  </main>

  <script>
    const form = document.getElementById("connect-form");
    const input = document.getElementById("teacher-ip");
    const error = document.getElementById("error");

    function normalize(raw) {{
      const value = raw.trim();
      if (!value) throw new Error("Enter teacher IP");
      if (value.startsWith("http://") || value.startsWith("https://")) return value;
      if (value.includes(":") || value.includes("/")) return `http://${{value}}`;
      return `http://${{value}}:{HTTP_PORT}`;
    }}

    form.addEventListener("submit", (event) => {{
      event.preventDefault();
      try {{
        window.location.href = normalize(input.value);
      }} catch (exc) {{
        error.textContent = exc.message;
        input.focus();
      }}
    }});
  </script>
</body>
</html>
"""


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

    def _html(self, status: int, html: str) -> None:
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_file(self) -> str:
        return file_store.read_text(FILE_PATH)

    def _write_file(self, content: str) -> None:
        file_store.write_text(FILE_PATH, content)

    # ── Routes ──────────────────────────────────────────────────────────────

    def do_OPTIONS(self) -> None:
        self._json(HTTPStatus.NO_CONTENT, {})

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self._json(HTTPStatus.OK, {"status": "ok"})
        elif path == "/file":
            self._json(HTTPStatus.OK, {"content": self._read_file()})
        elif path in ("/", SETUP_PATH):
            self._html(HTTPStatus.OK, SETUP_HTML)
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

def create(file_path: Optional[pathlib.Path] = None) -> ThreadingHTTPServer:
    global FILE_PATH
    if file_path is not None:
        FILE_PATH = file_path
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
