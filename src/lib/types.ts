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
  toolUses?: { tool: string; input: Record<string, unknown> }[];
  toolResults?: { tool: string; content: string }[];
};
