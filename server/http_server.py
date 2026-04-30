"""HTTP server — serves the compiled frontend and the /api/session endpoint."""

import json
import pathlib
import socket
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from socketserver import BaseServer
from typing import Optional

from server.config import HOST, HTTP_PORT, WS_PORT

FRONTEND_DIST = pathlib.Path(__file__).parent.parent / "frontend" / "dist"


class _Handler(SimpleHTTPRequestHandler):
    share_url: str = f"http://127.0.0.1:{HTTP_PORT}"
    local_url: str = f"http://127.0.0.1:{HTTP_PORT}"

    def __init__(
        self,
        request: socket.socket | tuple[bytes, socket.socket],
        client_address: tuple[str, int],
        server: BaseServer,
    ) -> None:
        super().__init__(request, client_address, server,
                         directory=str(FRONTEND_DIST))

    def do_GET(self) -> None:
        if self.path == "/api/session":
            body = json.dumps(
                {
                    "shareUrl": self.share_url,
                    "localUrl": self.local_url,
                    "httpPort": HTTP_PORT,
                    "wsPort": WS_PORT,
                }
            ).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, fmt: str, *args: object) -> None:  # silence access log
        pass


def create(share_url: str, local_url: str) -> Optional[ThreadingHTTPServer]:
    if not FRONTEND_DIST.exists():
        print(
            "Cannot start editor UI: frontend/dist is missing.\n"
            "Run `npm install && npm run build` inside frontend/ first."
        )
        return None
    _Handler.share_url = share_url
    _Handler.local_url = local_url
    try:
        return ThreadingHTTPServer((HOST, HTTP_PORT), _Handler)
    except OSError as exc:
        print(f"Cannot start HTTP server on port {HTTP_PORT}: {exc}")
        return None


def run(share_url: str, local_url: str) -> None:
    httpd = create(share_url, local_url)
    if httpd is None:
        return
    print(f"Editor UI       → {local_url}")
    print(f"Student link    → {share_url}")
    httpd.serve_forever()
