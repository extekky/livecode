#!/usr/bin/env python3
"""Teacher launcher — starts the sync server, HTTP server, and local file bridge."""

import pathlib
import time
import webbrowser

from client.startup import BRIDGE_HEALTH_URL, start_teacher, wait_for_url
from server.config import HTTP_PORT, SHARED_FILE
from server.network import detect_lan_ip

FILE_PATH = pathlib.Path(SHARED_FILE)
LOCAL_URL = f"http://127.0.0.1:{HTTP_PORT}"
EDITOR_HEALTH = f"{LOCAL_URL}/api/session"


def main() -> None:
    lan_ip = detect_lan_ip()
    share_url = f"http://{lan_ip}:{HTTP_PORT}"

    print("=" * 48)
    print("  LiveCode — Teacher mode")
    print("=" * 48)
    print(f"  Local editor  → {LOCAL_URL}")
    print(f"  Student link  → {share_url}")
    print("=" * 48)

    workers, stop = start_teacher(share_url, LOCAL_URL, FILE_PATH)

    try:
        if not wait_for_url(BRIDGE_HEALTH_URL) or not wait_for_url(EDITOR_HEALTH):
            print("ERROR: services did not start in time — check the logs above.")
            return

        print("Ready.  Opening editor…")
        webbrowser.open(LOCAL_URL)
        print("Press Ctrl+C to stop.\n")

        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping teacher session…")
    finally:
        stop.set()
        for w in workers:
            w.join(timeout=2)


if __name__ == "__main__":
    main()
