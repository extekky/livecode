#!/usr/bin/env python3
"""Student launcher — starts the local file bridge and opens the teacher's editor URL."""

import json
import sys
import time
import webbrowser
from pathlib import Path

from client.startup import BRIDGE_HEALTH_URL, start_student, wait_for_url
from server.config import HTTP_PORT

CONFIG_PATH = Path.home() / ".liveshare" / "config.json"


def _normalize_url(raw: str) -> str:
    value = raw.strip()
    if not value:
        raise ValueError("Teacher host is required")
    if value.startswith(("http://", "https://")):
        return value
    if ":" in value or "/" in value:
        return f"http://{value}"
    return f"http://{value}:{HTTP_PORT}"


def _load_saved_host() -> str:
    if not CONFIG_PATH.exists():
        return ""
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return data.get("teacher_host", "") if isinstance(data, dict) else ""
    except (OSError, json.JSONDecodeError):
        return ""


def _save_host(raw: str) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps({"teacher_host": raw.strip()}, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    if len(sys.argv) > 1:
        teacher_input = sys.argv[1]
    else:
        saved = _load_saved_host()
        prompt = f"Teacher IP or URL [{saved}]: " if saved else "Teacher IP or URL: "
        teacher_input = input(prompt).strip() or saved

    teacher_url = _normalize_url(teacher_input)
    _save_host(teacher_input)

    print("=" * 48)
    print("  LiveCode — Student mode")
    print("=" * 48)
    print(f"  Connecting to  → {teacher_url}")
    print("=" * 48)

    workers, stop = start_student()

    try:
        if not wait_for_url(BRIDGE_HEALTH_URL):
            print("ERROR: local bridge did not start — check the logs above.")
            return

        print("Ready.  Opening editor…")
        webbrowser.open(teacher_url)
        print("Press Ctrl+C to stop.\n")

        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping student session…")
    finally:
        stop.set()
        for w in workers:
            w.join(timeout=2)


if __name__ == "__main__":
    main()
