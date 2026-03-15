"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
} from "@assistant-ui/react";
import type {
  AppendMessage,
  ImageMessagePart,
  TextMessagePart,
  ThreadMessageLike,
} from "@assistant-ui/react";
import type { ChatMessage, StreamEvent } from "@/lib/types";

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
    return { role: "user", id: msg.id, content };
  }

  const content: ThreadMessageLike["content"] = [];

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
  };
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
          };
          const assistantId = crypto.randomUUID();
          sseStateRef.current.assistantId = assistantId;
          const assistantMsg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            reasoning: "",
            toolUses: [],
            toolResults: [],
          };
          const next = [...sseStateRef.current.messages, userMsg, assistantMsg];
          sseStateRef.current.messages = next;
          setMessages(next);
          setIsRunning(true);
          break;
        }

        case "text": {
          const { assistantId, messages: cur } = sseStateRef.current;
          if (!assistantId) break;
          const next = cur.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + event.content }
              : m
          );
          sseStateRef.current.messages = next;
          setMessages(next);
          break;
        }

        case "reasoning": {
          const { assistantId, messages: cur } = sseStateRef.current;
          if (!assistantId) break;
          const next = cur.map((m) =>
            m.id === assistantId
              ? { ...m, reasoning: (m.reasoning ?? "") + event.content }
              : m
          );
          sseStateRef.current.messages = next;
          setMessages(next);
          break;
        }

        case "tool_use": {
          const { assistantId, messages: cur } = sseStateRef.current;
          if (!assistantId) break;
          const next = cur.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolUses: [
                    ...(m.toolUses ?? []),
                    { tool: event.tool, input: event.input },
                  ],
                }
              : m
          );
          sseStateRef.current.messages = next;
          setMessages(next);
          break;
        }

        case "tool_result": {
          const { assistantId, messages: cur } = sseStateRef.current;
          if (!assistantId) break;
          const next = cur.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolResults: [
                    ...(m.toolResults ?? []),
                    { tool: event.tool, content: event.content },
                  ],
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
          const next = cur.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + `\n\nError: ${event.message}` }
              : m
          );
          sseStateRef.current.messages = next;
          setMessages(next);
          break;
        }

        case "done": {
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
      const images = (message.content as (TextMessagePart | ImageMessagePart)[])
        .filter((p): p is ImageMessagePart => p.type === "image")
        .map((p) => p.image);

      if (!text.trim() && images.length === 0) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        images: images.length > 0 ? images : undefined,
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        reasoning: "",
        toolUses: [],
        toolResults: [],
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

              case "text": {
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.content }
                    : m
                );
                setMessages(currentMessages);
                break;
              }

              case "reasoning": {
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId
                    ? { ...m, reasoning: (m.reasoning ?? "") + event.content }
                    : m
                );
                setMessages(currentMessages);
                break;
              }

              case "tool_use": {
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolUses: [
                          ...(m.toolUses ?? []),
                          { tool: event.tool, input: event.input },
                        ],
                      }
                    : m
                );
                setMessages(currentMessages);
                break;
              }

              case "tool_result": {
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolResults: [
                          ...(m.toolResults ?? []),
                          { tool: event.tool, content: event.content },
                        ],
                      }
                    : m
                );
                setMessages(currentMessages);
                break;
              }

              case "error": {
                currentMessages = currentMessages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content:
                          m.content + `\n\nError: ${event.message}`,
                      }
                    : m
                );
                setMessages(currentMessages);
                break;
              }

              case "done":
                break;
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        currentMessages = currentMessages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  m.content +
                  `\n\nConnection error: ${err instanceof Error ? err.message : String(err)}`,
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
