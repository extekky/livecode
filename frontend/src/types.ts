export type ConnectionState = "online" | "offline";

export type SessionPayload = {
  shareUrl?: string;
  localUrl?: string;
  httpPort?: number;
  wsPort?: number;
  maxLines?: number;
};

export type SyncMessage =
  | { type: "sync"; content: string; participants: number }
  | { type: "participants"; count: number }
  | { type: "typing"; name: string };
