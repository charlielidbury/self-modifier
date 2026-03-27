"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
} from "@assistant-ui/react";
import type {
  AppendMessage,
  CompleteAttachment,
  ImageMessagePart,
  TextMessagePart,
  ThreadMessageLike,
} from "@assistant-ui/react";
import type { ChatMessage, ContentPart, StreamEvent } from "@/lib/types";

/**
 * Append a streaming event to the ordered parts array of an assistant message.
 * Returns a new parts array (immutable update).
 */
function appendToParts(
  parts: ContentPart[],
  event: StreamEvent
): ContentPart[] {
  const next = [...parts];
  switch (event.type) {
    case "text": {
      const last = next[next.length - 1];
      if (last && last.type === "text") {
        next[next.length - 1] = { ...last, text: last.text + event.content };
      } else {
        next.push({ type: "text", text: event.content });
      }
      break;
    }
    case "reasoning": {
      const last = next[next.length - 1];
      if (last && last.type === "reasoning") {
        next[next.length - 1] = { ...last, text: last.text + event.content };
      } else {
        next.push({ type: "reasoning", text: event.content });
      }
      break;
    }
    case "tool_use": {
      next.push({
        type: "tool-use",
        tool: event.tool,
        input: event.input,
      });
      break;
    }
    case "tool_result": {
      // Find the last tool-use part without a result and attach it.
      for (let i = next.length - 1; i >= 0; i--) {
        const p = next[i];
        if (p.type === "tool-use" && p.result === undefined) {
          next[i] = { ...p, result: event.content };
          break;
        }
      }
      break;
    }
  }
  return next;
}

type ChatProviderProps = {
  messages: readonly ChatMessage[];
  setMessages: (msgs: readonly ChatMessage[]) => void;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  children: React.ReactNode;
};

function convertMessage(msg: ChatMessage): ThreadMessageLike {
  if (msg.role === "user") {
    const content: ThreadMessageLike["content"] = [];
    if (msg.images && msg.images.length > 0) {
      for (const image of msg.images) {
        (content as { type: "image"; image: string }[]).push({
          type: "image",
          image,
        });
      }
    }
    (content as { type: "text"; text: string }[]).push({
      type: "text",
      text: msg.content,
    });
    return {
      role: "user",
      id: msg.id,
      content,
      ...(msg.createdAt ? { createdAt: new Date(msg.createdAt) } : {}),
    } as ThreadMessageLike;
  }

  const content: ThreadMessageLike["content"] = [];

  if (msg.parts && msg.parts.length > 0) {
    // New path: ordered parts preserve interleaving of text and tool calls.
    let toolCallIndex = 0;
    for (const part of msg.parts) {
      switch (part.type) {
        case "reasoning":
          (content as unknown[]).push({
            type: "reasoning" as const,
            text: part.text,
          });
          break;
        case "text":
          (content as { type: "text"; text: string }[]).push({
            type: "text",
            text: part.text,
          });
          break;
        case "tool-use":
          (content as unknown[]).push({
            type: "tool-call" as const,
            toolCallId: part.toolCallId ?? `${msg.id}-tc-${toolCallIndex}`,
            toolName: part.tool,
            args: part.input as Record<string, string | number | boolean | null>,
            result: part.result,
          });
          toolCallIndex++;
          break;
      }
    }
  } else {
    // Legacy fallback for older persisted sessions without parts.
    if (msg.reasoning) {
      (content as unknown[]).push({
        type: "reasoning" as const,
        text: msg.reasoning,
      });
    }

    if (msg.content) {
      (content as { type: "text"; text: string }[]).push({
        type: "text",
        text: msg.content,
      });
    }

    if (msg.toolUses && msg.toolUses.length > 0) {
      for (let i = 0; i < msg.toolUses.length; i++) {
        const toolUse = msg.toolUses[i];
        const toolResult = msg.toolResults?.[i];
        (content as unknown[]).push({
          type: "tool-call" as const,
          toolCallId: `${msg.id}-tc-${i}`,
          toolName: toolUse.tool,
          args: toolUse.input as Record<string, string | number | boolean | null>,
          result: toolResult?.content,
        });
      }
    }
  }

  if ((content as unknown[]).length === 0) {
    (content as { type: "text"; text: string }[]).push({
      type: "text",
      text: "",
    });
  }

  return {
    role: "assistant",
    id: msg.id,
    content,
    ...(msg.createdAt ? { createdAt: new Date(msg.createdAt) } : {}),
  } as ThreadMessageLike;
}

export function ChatProvider({
  messages,
  setMessages,
  isRunning,
  setIsRunning,
  activeSessionId,
  setActiveSessionId,
  children,
}: ChatProviderProps) {
  const abortControllerRef = useRef<AbortController | null>(null);

  // True while THIS window is processing its own POST stream — ignore SSE events.
  const isSendingRef = useRef(false);

  // Mutable state for SSE event handling (avoids stale closures in the effect).
  const sseStateRef = useRef<{
    messages: readonly ChatMessage[];
    assistantId: string | null;
  }>({ messages, assistantId: null });

  // Keep sseStateRef.messages in sync with React state.
  useEffect(() => {
    sseStateRef.current.messages = messages;
  }, [messages]);

  // Subscribe to the SSE stream for the active session.
  // Re-runs whenever activeSessionId changes (e.g., after loading a session).
  useEffect(() => {
    if (!activeSessionId) return;

    const es = new EventSource(`/api/sessions/${activeSessionId}/stream`);

    es.onmessage = (e: MessageEvent<string>) => {
      // Skip if this window is already processing its own POST response.
      if (isSendingRef.current) return;

      const event = JSON.parse(e.data) as StreamEvent;

      switch (event.type) {
        case "user_message": {
          // A new turn started in another window — add user + empty assistant msgs.
          const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: event.content,
            createdAt: Date.now(),
          };
          const assistantId = crypto.randomUUID();
          sseStateRef.current.assistantId = assistantId;
          const assistantMsg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            parts: [],
          };
          const next = [...sseStateRef.current.messages, userMsg, assistantMsg];
          sseStateRef.current.messages = next;
          setMessages(next);
          setIsRunning(true);
          break;
        }

        case "text":
        case "reasoning":
        case "tool_use":
        case "tool_result": {
          const { assistantId, messages: cur } = sseStateRef.current;
          if (!assistantId) break;
          const next = cur.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    event.type === "text"
                      ? m.content + event.content
                      : m.content,
                  parts: appendToParts(m.parts ?? [], event),
                }
              : m
          );
          sseStateRef.current.messages = next;
          setMessages(next);
          break;
        }

        case "error": {
          const { assistantId, messages: cur } = sseStateRef.current;
          if (!assistantId) break;
          const errorText = `\n\nError: ${event.message}`;
          const next = cur.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: m.content + errorText,
                  parts: appendToParts(m.parts ?? [], {
                    type: "text",
                    content: errorText,
                  }),
                }
              : m
          );
          sseStateRef.current.messages = next;
          setMessages(next);
          break;
        }

        case "done": {
          // Stamp the assistant message with its completion time.
          const { assistantId: doneId, messages: curMsgs } = sseStateRef.current;
          if (doneId) {
            const stamped = curMsgs.map((m) =>
              m.id === doneId ? { ...m, createdAt: Date.now() } : m
            );
            sseStateRef.current.messages = stamped;
            setMessages(stamped);
          }
          setIsRunning(false);
          sseStateRef.current.assistantId = null;
          break;
        }

        case "session":
          // Other window confirmed same session — nothing to do.
          break;
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect; nothing special needed here.
    };

    return () => {
      es.close();
    };
  }, [activeSessionId, setMessages, setIsRunning]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const text = (message.content as (TextMessagePart | ImageMessagePart)[])
        .filter((p): p is TextMessagePart => p.type === "text")
        .map((p) => p.text)
        .join("");

      // Images come from attachments (via SimpleImageAttachmentAdapter), not message.content.
      // Each completed attachment has a `content` array with image parts.
      const images = (
        (message as { attachments?: CompleteAttachment[] }).attachments ?? []
      ).flatMap((att) =>
        (att.content ?? [])
          .filter((p): p is ImageMessagePart => p.type === "image")
          .map((p) => p.image)
      );

      if (!text.trim() && images.length === 0) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        images: images.length > 0 ? images : undefined,
        createdAt: Date.now(),
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        parts: [],
      };

      setMessages([...messages, userMsg, assistantMsg]);
      setIsRunning(true);
      isSendingRef.current = true;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let currentMessages = [...messages, userMsg, assistantMsg];

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: activeSessionId ?? undefined,
            images: images.length > 0 ? images : undefined,
          }),
          signal: abortController.signal,
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event: StreamEvent = JSON.parse(line);

            switch (event.type) {
              case "session":
                setActiveSessionId(event.sessionId);
                break;

              case "text":
              case "reasoning":
              case "tool_use":
              case "tool_result": {
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content:
                          event.type === "text"
                            ? m.content + event.content
                            : m.content,
                        parts: appendToParts(m.parts ?? [], event),
                      }
                    : m
                );
                setMessages(currentMessages);
                break;
              }

              case "error": {
                const errorText = `\n\nError: ${event.message}`;
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content + errorText,
                        parts: appendToParts(m.parts ?? [], {
                          type: "text",
                          content: errorText,
                        }),
                      }
                    : m
                );
                setMessages(currentMessages);
                break;
              }

              case "done": {
                // Stamp the assistant message with its completion time.
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId ? { ...m, createdAt: Date.now() } : m
                );
                setMessages(currentMessages);
                break;
              }
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        const errorText = `\n\nConnection error: ${err instanceof Error ? err.message : String(err)}`;
        currentMessages = currentMessages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: m.content + errorText,
                parts: appendToParts(m.parts ?? [], {
                  type: "text",
                  content: errorText,
                }),
              }
            : m
        );
        setMessages(currentMessages);
      } finally {
        setIsRunning(false);
        isSendingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [messages, activeSessionId, setMessages, setIsRunning, setActiveSessionId]
  );

  const onCancel = useCallback(async () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
  }, [setIsRunning]);

  const attachmentsAdapter = useMemo(() => new SimpleImageAttachmentAdapter(), []);

  const runtime = useExternalStoreRuntime({
    messages,
    setMessages,
    isRunning,
    onNew,
    onCancel,
    convertMessage,
    adapters: { attachments: attachmentsAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
