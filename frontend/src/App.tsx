import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Link2,
  Moon,
  Radio,
  Sun,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import Editor from "./components/Editor";
import type { ConnectionState, SessionPayload, SyncMessage } from "./types";

const DEFAULT_BRIDGE_PORT = 8765;
const DEFAULT_WS_PORT = 5678;
const DEFAULT_DEBOUNCE_MS = 75;
const DEFAULT_AUTOSAVE_MS = 10_000;
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
  const [bridgeUrl, setBridgeUrl] = useState(`http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`);
  const [wsPort, setWsPort] = useState(DEFAULT_WS_PORT);
  const [debounceMs, setDebounceMs] = useState(DEFAULT_DEBOUNCE_MS);
  const [autosaveMs, setAutosaveMs] = useState(DEFAULT_AUTOSAVE_MS);
  const [copyLinkLabel, setCopyLinkLabel] = useState("Copy Link");
  const [copyCodeLabel, setCopyCodeLabel] = useState("Copy Code");
  const [lineCount, setLineCount] = useState(1);
  const [lineFlash, setLineFlash] = useState(false);
  const [maxLines, setMaxLines] = useState(150);
  const [participants, setParticipants] = useState(0);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [externalNotice, setExternalNotice] = useState<string | null>(null);
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
  const externalNoticeRef = useRef<number | null>(null);
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
      const r = await fetch(`${bridgeUrl}/file`, {
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
  }, [bridgeUrl, setBridgeOffline, setSaved]);

  const loadFromBridge = useCallback(async () => {
    try {
      const r = await fetch(`${bridgeUrl}/file`);
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
  }, [bridgeUrl, setBridgeOffline]);

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
    debounceRef.current = window.setTimeout(() => pushContent(text), debounceMs);
  }, [debounceMs, pushContent]);

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
    let closedByEffect = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.hostname}:${wsPort}`);
      socketRef.current = ws;

      ws.addEventListener("open", () => {
        setWsStatus("online");
        setSaveState("Connected");
      });

      ws.addEventListener("close", () => {
        if (closedByEffect) return;
        setWsStatus("offline");
        setSaveState("Reconnecting in 1 s…");
        reconnectRef.current = window.setTimeout(connect, 1000);
      });

      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(ev.data) as SyncMessage;

        if (msg.type === "sync") {
          const changedExternally = msg.content !== contentRef.current;
          const overwritesLocalDraft = contentRef.current !== lastSyncedRef.current;
          const hadKnownContent = Boolean(contentRef.current || lastSyncedRef.current);
          contentRef.current = msg.content;
          setContent(msg.content);
          setLineCount(countLines(msg.content));
          lastSyncedRef.current = msg.content;
          setParticipants(msg.participants);
          setSaveState("Remote update applied");
          if (changedExternally && hadKnownContent) {
            setExternalNotice(
              overwritesLocalDraft
                ? "External update overwrote local changes"
                : "Content updated externally"
            );
          }
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
      closedByEffect = true;
      if (reconnectRef.current !== null) clearTimeout(reconnectRef.current);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      socketRef.current?.close();
    };
  }, [saveToBridge, wsPort]);

  // ── Boot ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const boot = async () => {
      try {
        const r = await fetch("/api/session");
        if (!r.ok) throw new Error();
        const data = (await r.json()) as SessionPayload;
        if (data.shareUrl) setShareUrl(data.shareUrl);
        if (data.maxLines) setMaxLines(data.maxLines);
        if (data.wsPort) setWsPort(data.wsPort);
        if (data.bridgePort) setBridgeUrl(`http://127.0.0.1:${data.bridgePort}`);
        if (data.debounceMs) setDebounceMs(data.debounceMs);
        if (data.autosaveMs) setAutosaveMs(data.autosaveMs);
      } catch {
        setShareUrl(location.origin);
      }
    };
    void boot();
  }, []);

  useEffect(() => {
    void loadFromBridge();
  }, [loadFromBridge]);

  useEffect(() => {
    autosaveRef.current = window.setInterval(() => {
      void saveToBridge(contentRef.current);
    }, autosaveMs);
    return () => {
      if (autosaveRef.current !== null) clearInterval(autosaveRef.current);
    };
  }, [autosaveMs, saveToBridge]);

  useEffect(() => {
    if (!externalNotice) return;
    if (externalNoticeRef.current !== null) clearTimeout(externalNoticeRef.current);
    externalNoticeRef.current = window.setTimeout(() => {
      setExternalNotice(null);
      externalNoticeRef.current = null;
    }, 3500);
    return () => {
      if (externalNoticeRef.current !== null) clearTimeout(externalNoticeRef.current);
    };
  }, [externalNotice]);

  useEffect(() => {
    const onUnload = () => {
      if (contentRef.current === lastSyncedRef.current) return;
      void fetch(`${bridgeUrl}/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentRef.current }),
        keepalive: true,
      });
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [bridgeUrl]);

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

  const linkCopied = copyLinkLabel === "Copied!";
  const codeCopied = copyCodeLabel === "Copied!";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="title-block">
          <div className="brand-mark" aria-hidden="true">
            <Code2 size={20} strokeWidth={2.3} />
          </div>
          <div>
            <h1>StasikShare</h1>
          </div>
        </div>

        <div className="quick-actions">
          <button
            className={`action-button secondary ${linkCopied ? "success" : ""}`}
            type="button"
            onClick={() => void copyLink()}
          >
            {linkCopied ? <Check size={16} /> : <Link2 size={16} />}
            <span>{copyLinkLabel}</span>
          </button>
          <button
            className={`action-button ${codeCopied ? "success" : ""}`}
            type="button"
            onClick={() => void copyCode()}
          >
            {codeCopied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copyCodeLabel}</span>
          </button>
          <button
            className="theme-toggle"
            type="button"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setDark((d) => !d)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span
            className={`connection-pill ${connected ? "online" : "offline"}`}
            title={saveState}
          >
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span>{connected ? "Live" : "Offline"}</span>
          </span>
        </div>
      </section>

      <section className="workspace">
        <div className="editor-meta">
          <span className="save-state">
            <Radio size={14} />
            {saveState}
          </span>
          <div className="meta-right">
            {typingName && (
              <span className="typing-indicator">{typingName} is typing…</span>
            )}
            {externalNotice && (
              <span className="external-notice">{externalNotice}</span>
            )}
            <span className="participants" title="Participants">
              <Users size={14} />
              {participants}
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
