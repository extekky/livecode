"""WebSocket sync server — broadcasts edits and typing indicators to all participants."""

import asyncio
import json
import pathlib
import threading
from typing import Optional, Set

from websockets.asyncio.server import ServerConnection, serve

from server.config import HOST, WS_PORT
from server import file_store


class SyncServer:
    def __init__(self, file_path: pathlib.Path) -> None:
        self.file_path = file_path
        self.clients: Set[ServerConnection] = set()
        self.current_content = self._load_initial_content()
        # Asyncio lock prevents race conditions on concurrent remote updates.
        self._lock = asyncio.Lock()

    # ── File I/O ────────────────────────────────────────────────────────────

    def _load_initial_content(self) -> str:
        return file_store.read_text(self.file_path)

    def _write_file(self, content: str) -> None:
        file_store.write_text(self.file_path, content)

    # ── Messaging helpers ───────────────────────────────────────────────────

    async def _send(self, websocket: ServerConnection, payload: dict) -> None:
        try:
            await websocket.send(json.dumps(payload))
        except Exception:
            pass

    async def _broadcast(
        self, payload: dict, exclude: Optional[ServerConnection] = None
    ) -> None:
        targets = [c for c in self.clients if c is not exclude]
        if targets:
            await asyncio.gather(
                *(self._send(c, payload) for c in targets),
                return_exceptions=True,
            )

    # ── Per-connection state ────────────────────────────────────────────────

    async def _send_initial_state(self, websocket: ServerConnection) -> None:
        await self._send(
            websocket,
            {
                "type": "sync",
                "content": self.current_content,
                "participants": len(self.clients),
            },
        )

    async def _broadcast_participants(self) -> None:
        await self._broadcast({"type": "participants", "count": len(self.clients)})

    # ── Message handlers ────────────────────────────────────────────────────

    async def _handle_sync(
        self, payload: dict, sender: ServerConnection
    ) -> None:
        content = payload.get("content")
        if not isinstance(content, str):
            return

        async with self._lock:
            if content == self.current_content:
                return
            self.current_content = content
            self._write_file(content)

        await self._broadcast(
            {"type": "sync", "content": content, "participants": len(self.clients)},
            exclude=sender,
        )

    async def _handle_typing(
        self, payload: dict, sender: ServerConnection
    ) -> None:
        """Relay typing indicator to all other clients."""
        name = payload.get("name", "Someone")
        await self._broadcast(
            {"type": "typing", "name": name},
            exclude=sender,
        )

    # ── Main handler ────────────────────────────────────────────────────────

    async def handler(self, websocket: ServerConnection) -> None:
        self.clients.add(websocket)
        print(f"Client connected:    {websocket.remote_address}  "
              f"({len(self.clients)} total)")
        await self._send_initial_state(websocket)
        await self._broadcast_participants()

        try:
            async for raw in websocket:
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                msg_type = payload.get("type")
                if msg_type == "sync":
                    await self._handle_sync(payload, websocket)
                elif msg_type == "typing":
                    await self._handle_typing(payload, websocket)
        finally:
            self.clients.discard(websocket)
            print(f"Client disconnected: {websocket.remote_address}  "
                  f"({len(self.clients)} total)")
            await self._broadcast_participants()


async def run(
    file_path: pathlib.Path,
    stop_event: Optional[threading.Event] = None,
    ready_event: Optional[threading.Event] = None,
) -> None:
    server = SyncServer(file_path)
    try:
        async with serve(server.handler, HOST, WS_PORT):
            print(f"WebSocket sync  → ws://0.0.0.0:{WS_PORT}")
            if ready_event is not None:
                ready_event.set()
            if stop_event is None:
                await asyncio.Future()
            else:
                while not stop_event.is_set():
                    await asyncio.sleep(0.2)
    except OSError as exc:
        print(f"Cannot start WebSocket server on port {WS_PORT}: {exc}")
