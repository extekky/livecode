"""Shared startup utilities (URL probing, thread wrappers)."""

import asyncio
import pathlib
import threading
import time
import urllib.request
from typing import Optional

from client import bridge
from server import http_server, ws_server
from server.config import BRIDGE_PORT, BRIDGE_HOST


def wait_for_url(url: str, timeout: float = 8.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as r:
                if r.status < 500:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


# ── Thread wrappers ──────────────────────────────────────────────────────────

def _run_bridge(
    stop: threading.Event,
    ready: Optional[threading.Event],
    file_path: pathlib.Path | None = None,
) -> None:
    try:
        server = bridge.create(file_path)
    except OSError as exc:
        print(f"Cannot start file bridge: {exc}")
        return
    bridge.run(server, stop_event=stop, ready_event=ready)


def _run_http(stop: threading.Event, share_url: str, local_url: str) -> None:
    httpd = http_server.create(share_url, local_url)
    if httpd is None:
        return
    httpd.timeout = 0.5
    while not stop.is_set():
        httpd.handle_request()
    httpd.server_close()


def _run_ws(stop: threading.Event, file_path: pathlib.Path) -> None:
    asyncio.run(ws_server.run(file_path, stop_event=stop))


# ── Launchers ────────────────────────────────────────────────────────────────

def start_teacher(
    share_url: str,
    local_url: str,
    file_path: pathlib.Path,
) -> tuple[list[threading.Thread], threading.Event]:
    stop = threading.Event()
    bridge_ready = threading.Event()

    workers = [
        threading.Thread(
            target=_run_bridge,
            args=(stop, bridge_ready, file_path),
            daemon=True,
        ),
        threading.Thread(target=_run_http, args=(stop, share_url, local_url), daemon=True),
        threading.Thread(target=_run_ws, args=(stop, file_path), daemon=True),
    ]
    for w in workers:
        w.start()
    return workers, stop


def start_student() -> tuple[list[threading.Thread], threading.Event]:
    stop = threading.Event()
    bridge_ready = threading.Event()

    t = threading.Thread(target=_run_bridge, args=(stop, bridge_ready), daemon=True)
    t.start()
    return [t], stop


BRIDGE_HEALTH_URL = f"http://{BRIDGE_HOST}:{BRIDGE_PORT}/health"
