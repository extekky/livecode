"""Central configuration for the sync server."""

import json
import pathlib

_CONFIG_FILE = pathlib.Path(__file__).parent.parent / "config.json"

_DEFAULTS = {
    "max_lines": 150,
    "http_port": 8000,
    "ws_port": 5678,
    "bridge_port": 8765,
    "debounce_ms": 75,
    "autosave_ms": 10000,
    "shared_file": "liveshare.py",
}


def _load() -> dict:
    if _CONFIG_FILE.exists():
        try:
            data = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {**_DEFAULTS, **data}
        except (OSError, json.JSONDecodeError):
            pass
    return dict(_DEFAULTS)


_cfg = _load()

MAX_LINES: int = int(_cfg["max_lines"])
HTTP_PORT: int = int(_cfg["http_port"])
WS_PORT: int = int(_cfg["ws_port"])
BRIDGE_PORT: int = int(_cfg["bridge_port"])
DEBOUNCE_MS: int = int(_cfg["debounce_ms"])
AUTOSAVE_MS: int = int(_cfg["autosave_ms"])
SHARED_FILE: str = str(_cfg["shared_file"])

HOST = "0.0.0.0"
BRIDGE_HOST = "127.0.0.1"
