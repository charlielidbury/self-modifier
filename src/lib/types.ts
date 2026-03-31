/** An ordered content part within an assistant message. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool-use";
      tool: string;
      input: Record<string, unknown>;
      toolCallId?: string;
      result?: string;
      /** Nested tool calls from sub-agents (Agent/Explore). */
      children?: ContentPart[];
    };

export type StreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "user_message"; content: string }
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_use"; tool: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool: string; content: string }
  | { type: "error"; message: string }
  | { type: "done"; sessionId: string };

export type SessionInfo = {
  sessionId: string;
  summary: string;
  lastModified: number;
  createdAt?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs for user-attached images
  reasoning?: string;
  /** Ordered content parts — preserves interleaving of text, reasoning, and tool calls. */
  parts?: ContentPart[];
  // Legacy fields — kept for backward compatibility with older persisted sessions.
  toolUses?: { tool: string; input: Record<string, unknown> }[];
  toolResults?: { tool: string; content: string }[];
  createdAt?: number; // Unix timestamp in ms — set when the message is created/completed
  queued?: boolean; // True if this user message is waiting to be sent (agent is busy)
};

// ── Git types ─────────────────────────────────────────────────────────────────

export type GitCommit = {
  hash: string;
  shortHash: string;
  message: string;
  body?: string;
  date: string;
  author: string;
  additions?: number;
  deletions?: number;
  agentSessionId?: string;
  agentCwd?: string;
};

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
};

export type CommitDiff = {
  hash: string;
  message: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
};

export type WorkingDiffFile = {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch: string;
};

export type WorkingDiffResponse = {
  files: WorkingDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  isEmpty: boolean;
};

export type FileHotspot = {
  path: string;
  changes: number;
  additions: number;
  deletions: number;
  commitCount: number;
  lastModified: string;
};

export type HotspotsResponse = {
  files: FileHotspot[];
  totalFiles: number;
  totalChanges: number;
};

export type RecentlyModifiedRoute = {
  route: string;
  lastModified: string;
  commitMessage: string;
  shortHash: string;
};
