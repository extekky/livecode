#!/usr/bin/env python3
"""Student launcher — starts the local file bridge and opens the teacher's editor URL."""

import sys
import time
import webbrowser

from client.startup import BRIDGE_HEALTH_URL, start_student, wait_for_url
from server.config import BRIDGE_HOST, BRIDGE_PORT, HTTP_PORT

SETUP_URL = f"http://{BRIDGE_HOST}:{BRIDGE_PORT}/setup"


def _normalize_url(raw: str) -> str:
    value = raw.strip()
    if not value:
        raise ValueError("teacher IP is required")
    if value.startswith(("http://", "https://")):
        return value
    if ":" in value or "/" in value:
        return f"http://{value}"
    return f"http://{value}:{HTTP_PORT}"


def main() -> None:
    teacher_url = None
    if len(sys.argv) > 1:
        try:
            teacher_url = _normalize_url(sys.argv[1])
        except ValueError as exc:
            print(f"ERROR: {exc}")
            return

    print("=" * 48)
    print("  LiveCode — Student mode")
    print("=" * 48)
    if teacher_url is None:
        print(f"  Setup page     → {SETUP_URL}")
    else:
        print(f"  Connecting to  → {teacher_url}")
    print("=" * 48)

    workers, stop = start_student()

    try:
        if not wait_for_url(BRIDGE_HEALTH_URL):
            print("ERROR: local bridge did not start — check the logs above.")
            return

        if teacher_url is None:
            print("Ready.  Opening setup page…")
            webbrowser.open(SETUP_URL)
        else:
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
