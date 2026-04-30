"""Thread-safe helpers for reading and writing shared source files."""

import pathlib
import threading

_LOCKS_GUARD = threading.Lock()
_LOCKS: dict[pathlib.Path, threading.RLock] = {}


def _lock_for(path: pathlib.Path) -> threading.RLock:
    resolved = path.resolve()
    with _LOCKS_GUARD:
        lock = _LOCKS.get(resolved)
        if lock is None:
            lock = threading.RLock()
            _LOCKS[resolved] = lock
        return lock


def read_text(path: pathlib.Path) -> str:
    lock = _lock_for(path)
    with lock:
        if not path.exists():
            path.write_text("", encoding="utf-8")
            return ""
        return path.read_text(encoding="utf-8")


def write_text(path: pathlib.Path, content: str) -> None:
    lock = _lock_for(path)
    with lock:
        path.write_text(content, encoding="utf-8")
