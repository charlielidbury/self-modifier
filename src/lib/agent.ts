import {
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { StreamEvent } from "./types";

const SYSTEM_PROMPT = `You are an AI assistant embedded in a Next.js application. You can read and modify the application's source code, including the code that powers this very chat interface. The project root is your cwd. Do whatever the user asks.

Important: Editing src/app/api/chat/route.ts, next.config.ts, tsconfig.json, or running npm install may interrupt your current turn due to dev server restarts. Batch those edits together and do them last when possible.`;

// A simple push-based async iterable — lets us feed messages into a running
// query() subprocess one at a time without closing it.
function createChannel() {
  const queue: SDKUserMessage[] = [];
  let resolver: ((r: IteratorResult<SDKUserMessage>) => void) | null = null;

  const push = (msg: SDKUserMessage) => {
    if (resolver) {
      resolver({ value: msg, done: false });
      resolver = null;
    } else {
      queue.push(msg);
    }
  };

  // Returns the same iterator every time — query() iterates this once.
  let iter: AsyncIterator<SDKUserMessage> | null = null;
  const iterable: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]() {
      if (!iter) {
        iter = {
          next(): Promise<IteratorResult<SDKUserMessage>> {
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift()!, done: false });
            }
            return new Promise((resolve) => {
              resolver = resolve;
            });
          },
        };
      }
      return iter;
    },
  };

  return { push, iterable };
}

type ImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

function dataUrlToImageBlock(dataUrl: string): ImageBlock {
  const [header, data] = dataUrl.split(",");
  const mediaType =
    (header.match(/data:([^;]+)/)?.[1] as ImageBlock["source"]["media_type"]) ??
    "image/png";
  return { type: "image", source: { type: "base64", media_type: mediaType, data } };
}

type SessionState = {
  // Push a new user message into the long-lived subprocess.
  push: (content: string, images?: string[]) => void;
  // The single iterator over all SDK events for this subprocess.
  iter: AsyncIterator<SDKMessage>;
  sessionId: string;
};

// Module-level map: sessionId -> live subprocess state.
// Survives between HTTP requests; dies on HMR module reload (fine — session
// history is on disk and will be resumed on the next request).
const sessions = new Map<string, SessionState>();

export async function* runAgent(
  message: string,
  sessionId?: string,
  images?: string[]
): AsyncGenerator<StreamEvent> {
  let state = sessionId ? sessions.get(sessionId) : undefined;

  if (!state) {
    // No live subprocess for this session — create one, resuming history from
    // disk if we have a sessionId.
    const { push: pushMsg, iterable } = createChannel();

    const q: Query = query({
      prompt: iterable,
      options: {
        cwd: process.cwd(),
        resume: sessionId,
        systemPrompt: SYSTEM_PROMPT,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest"],
          },
        },
      },
    });

    state = {
      push: (content: string, imgs?: string[]) => {
        const messageContent =
          imgs && imgs.length > 0
            ? [
                { type: "text" as const, text: content },
                ...imgs.map(dataUrlToImageBlock),
              ]
            : content;
        pushMsg({
          type: "user",
          message: { role: "user", content: messageContent },
          parent_tool_use_id: null,
          session_id: sessionId ?? "",
        });
      },
      iter: q[Symbol.asyncIterator](),
      sessionId: sessionId ?? "",
    };

    // Push the first message before we start iterating.
    state.push(message, images);
  } else {
    // Existing subprocess — just push the new message.
    state.push(message, images);
  }

  // Consume SDK events until we see a ResultMessage (end of this turn).
  while (true) {
    const { value: msg, done } = await state.iter.next();
    if (done) {
      sessions.delete(state.sessionId);
      break;
    }

    switch (msg.type) {
      case "system": {
        // Now we know the real session ID — register in the map.
        state.sessionId = msg.session_id;
        sessions.set(msg.session_id, state);
        yield { type: "session", sessionId: msg.session_id };
        break;
      }

      case "stream_event": {
        const event = msg.event;
        if (event.type === "content_block_delta" && "delta" in event) {
          if (event.delta.type === "text_delta") {
            yield { type: "text", content: event.delta.text };
          } else if (event.delta.type === "thinking_delta") {
            yield { type: "reasoning", content: (event.delta as { type: "thinking_delta"; thinking: string }).thinking };
          }
        }
        break;
      }

      case "assistant": {
        if (msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "tool_use") {
              yield {
                type: "tool_use",
                tool: block.name,
                input: block.input as Record<string, unknown>,
              };
            }
          }
        }
        break;
      }

      case "user": {
        if (msg.message && "content" in msg.message) {
          const content = msg.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                typeof block === "object" &&
                block !== null &&
                "type" in block &&
                block.type === "tool_result"
              ) {
                const toolBlock = block as {
                  type: "tool_result";
                  tool_use_id: string;
                  content?: string | unknown[];
                };
                yield {
                  type: "tool_result",
                  tool: toolBlock.tool_use_id,
                  content:
                    typeof toolBlock.content === "string"
                      ? toolBlock.content
                      : JSON.stringify(toolBlock.content ?? ""),
                };
              }
            }
          }
        }
        break;
      }

      case "result": {
        state.sessionId = msg.session_id;
        sessions.set(msg.session_id, state);
        yield { type: "done", sessionId: msg.session_id };
        return; // End of this turn — leave subprocess alive for next message.
      }
    }
  }
}
