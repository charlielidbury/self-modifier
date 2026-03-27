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
};
