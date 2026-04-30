import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "./components/Editor";
import type { ConnectionState, SessionPayload, SyncMessage } from "./types";

const BRIDGE_URL = "http://127.0.0.1:8765";
const DEBOUNCE_MS = 75;
const AUTOSAVE_MS = 10_000;
const TYPING_TIMEOUT_MS = 2_000;

function countLines(s: string) {
  return s.split("\n").length;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function copyFallback(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.cssText = "position:absolute;left:-9999px";
  document.body.appendChild(el);
  el.select();
  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(el);
  }
}

export default function App() {
  const [content, setContent] = useState("");
  const [wsStatus, setWsStatus] = useState<ConnectionState>("offline");
  const [bridgeStatus, setBridgeStatus] = useState<ConnectionState>("offline");
  const [saveState, setSaveState] = useState("Waiting for connection");
  const [shareUrl, setShareUrl] = useState(window.location.origin);
  const [copyLinkLabel, setCopyLinkLabel] = useState("Copy Link");
  const [copyCodeLabel, setCopyCodeLabel] = useState("Copy Code");
  const [lineCount, setLineCount] = useState(1);
  const [lineFlash, setLineFlash] = useState(false);
  const [maxLines, setMaxLines] = useState(150);
  const [participants, setParticipants] = useState(0);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const autosaveRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const contentRef = useRef("");
  const lastSyncedRef = useRef("");

  // ── Theme ────────────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  // ── Bridge helpers ───────────────────────────────────────────────────────

  const setSaved = useCallback(() => setSaveState(`Saved ${formatTime(new Date())}`), []);
  const setBridgeOffline = useCallback(() => setSaveState("Bridge offline"), []);

  const saveToBridge = useCallback(async (text: string) => {
    try {
      const r = await fetch(`${BRIDGE_URL}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok) throw new Error();
      setBridgeStatus("online");
      setSaved();
    } catch {
      setBridgeStatus("offline");
      setBridgeOffline();
    }
  }, [setBridgeOffline, setSaved]);

  const loadFromBridge = useCallback(async () => {
    try {
      const r = await fetch(`${BRIDGE_URL}/file`);
      if (!r.ok) throw new Error();
      const data = (await r.json()) as { content?: string };
      if (typeof data.content === "string" && !lastSyncedRef.current) {
        contentRef.current = data.content;
        setContent(data.content);
        setLineCount(countLines(data.content));
        lastSyncedRef.current = data.content;
      }
      setBridgeStatus("online");
    } catch {
      setBridgeStatus("offline");
      setBridgeOffline();
    }
  }, [setBridgeOffline]);

  // ── WebSocket ────────────────────────────────────────────────────────────

  const pushContent = useCallback((text: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setSaveState("Waiting for sync server");
      return;
    }
    lastSyncedRef.current = text;
    ws.send(JSON.stringify({ type: "sync", content: text }));
    setSaveState("Synced");
  }, []);

  const sendTyping = useCallback(() => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "typing", name: "Teacher" }));
    }
  }, []);

  const scheduleDebounce = useCallback((text: string) => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => pushContent(text), DEBOUNCE_MS);
  }, [pushContent]);

  const handleChange = useCallback((text: string) => {
    contentRef.current = text;
    setContent(text);
    setLineCount(countLines(text));
    setSaveState("Typing…");
    scheduleDebounce(text);
    sendTyping();
  }, [scheduleDebounce, sendTyping]);

  const handleOverflow = useCallback(() => {
    setLineFlash(true);
    setTimeout(() => setLineFlash(false), 180);
  }, []);

  useEffect(() => {
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.hostname}:5678`);
      socketRef.current = ws;

      ws.addEventListener("open", () => {
        setWsStatus("online");
        setSaveState("Connected");
      });

      ws.addEventListener("close", () => {
        setWsStatus("offline");
        setSaveState("Reconnecting in 1 s…");
        reconnectRef.current = window.setTimeout(connect, 1000);
      });

      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(ev.data) as SyncMessage;

        if (msg.type === "sync") {
          contentRef.current = msg.content;
          setContent(msg.content);
          setLineCount(countLines(msg.content));
          lastSyncedRef.current = msg.content;
          setParticipants(msg.participants);
          setSaveState("Remote update applied");
          void saveToBridge(msg.content);
        } else if (msg.type === "participants") {
          setParticipants(msg.count);
        } else if (msg.type === "typing") {
          setTypingName(msg.name);
          if (typingTimerRef.current !== null) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = window.setTimeout(
            () => setTypingName(null),
            TYPING_TIMEOUT_MS
          );
        }
      });
    };

    connect();
    return () => {
      if (reconnectRef.current !== null) clearTimeout(reconnectRef.current);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      socketRef.current?.close();
    };
  }, [saveToBridge]);

  // ── Boot ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const boot = async () => {
      try {
        const r = await fetch("/api/session");
        if (!r.ok) throw new Error();
        const data = (await r.json()) as SessionPayload;
        if (data.shareUrl) setShareUrl(data.shareUrl);
        if (data.maxLines) setMaxLines(data.maxLines);
      } catch {
        setShareUrl(location.origin);
      }
    };
    void boot();
    void loadFromBridge();
  }, [loadFromBridge]);

  useEffect(() => {
    autosaveRef.current = window.setInterval(() => {
      void saveToBridge(contentRef.current);
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveRef.current !== null) clearInterval(autosaveRef.current);
    };
  }, [saveToBridge]);

  useEffect(() => {
    const onUnload = () => {
      if (contentRef.current === lastSyncedRef.current) return;
      navigator.sendBeacon?.(
        `${BRIDGE_URL}/file`,
        new Blob([JSON.stringify({ content: contentRef.current })], {
          type: "application/json",
        })
      );
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // ── Copy helpers ─────────────────────────────────────────────────────────

  const copyLink = useCallback(async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopyLinkLabel("Copied!"); }
    catch { setCopyLinkLabel(copyFallback(shareUrl) ? "Copied!" : "Failed"); }
    setTimeout(() => setCopyLinkLabel("Copy Link"), 2000);
  }, [shareUrl]);

  const copyCode = useCallback(async () => {
    const text = contentRef.current;
    try { await navigator.clipboard.writeText(text); setCopyCodeLabel("Copied!"); }
    catch { setCopyCodeLabel(copyFallback(text) ? "Copied!" : "Failed"); }
    setTimeout(() => setCopyCodeLabel("Copy Code"), 2000);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  const warnLines = Math.round(maxLines * 0.87);
  const connected = wsStatus === "online" && bridgeStatus === "online";

  const lineCountClass = useMemo(() => {
    const cls = ["line-count"];
    if (lineCount > warnLines && lineCount < maxLines) cls.push("warning");
    if (lineCount >= maxLines) cls.push("danger");
    if (lineFlash) cls.push("limit-hit");
    return cls.join(" ");
  }, [lineCount, lineFlash, maxLines, warnLines]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="title-block">
          <p className="eyebrow">LiveCode</p>
          <h1>liveshare.py</h1>
        </div>

        <div className="quick-actions">
          <button className="action-button secondary" type="button" onClick={() => void copyLink()}>
            {copyLinkLabel}
          </button>
          <button className="action-button" type="button" onClick={() => void copyCode()}>
            {copyCodeLabel}
          </button>
          <button
            className="theme-toggle"
            type="button"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setDark((d) => !d)}
          >
            {dark ? "☀️" : "🌙"}
          </button>
          <span className={`conn-dot ${connected ? "online" : "offline"}`} title={saveState} />
        </div>
      </section>

      <section className="workspace">
        <div className="editor-meta">
          <span className="save-state">{saveState}</span>
          <div className="meta-right">
            {typingName && (
              <span className="typing-indicator">{typingName} is typing…</span>
            )}
            <span className="participants" title="Participants">
              👥 {participants}
            </span>
            <span className={lineCountClass}>
              {lineCount} / {maxLines}
            </span>
          </div>
        </div>

        <Editor
          value={content}
          maxLines={maxLines}
          dark={dark}
          onChange={handleChange}
          onOverflowAttempt={handleOverflow}
        />
      </section>
    </main>
  );
}
