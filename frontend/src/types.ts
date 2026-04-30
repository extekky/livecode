export type ConnectionState = "online" | "offline";

export type SessionPayload = {
  shareUrl?: string;
  localUrl?: string;
  httpPort?: number;
  wsPort?: number;
  bridgePort?: number;
  maxLines?: number;
  debounceMs?: number;
  autosaveMs?: number;
};

export type SyncMessage =
  | { type: "sync"; content: string; participants: number }
  | { type: "participants"; count: number }
  | { type: "typing"; name: string };
