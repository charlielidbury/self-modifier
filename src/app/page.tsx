"use client";

import { useState, useCallback, useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import { ChatProvider } from "@/components/chat-provider";
import { SessionsSidebar } from "@/components/sessions-sidebar";
import { Thread } from "@/components/assistant-ui/thread";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MessageSquare, DownloadIcon, ClipboardCopyIcon, CheckIcon } from "lucide-react";

/**
 * Export the given messages as a Markdown file and trigger a browser download.
 */
function exportConversation(
  messages: readonly ChatMessage[],
  label: string | null
): void {
  const title = label || "Chat Export";
  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push(`*Exported on ${new Date().toLocaleString()}*`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    const timeStr = msg.createdAt
      ? new Date(msg.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    const roleLabel = msg.role === "user" ? "**You**" : "**Assistant**";
    lines.push(
      timeStr ? `### ${roleLabel} · ${timeStr}` : `### ${roleLabel}`
    );
    lines.push("");

    // Optional reasoning block
    if (msg.reasoning) {
      lines.push("> *Reasoning*");
      lines.push(">");
      for (const reasonLine of msg.reasoning.split("\n")) {
        lines.push(`> ${reasonLine}`);
      }
      lines.push("");
    }

    // Tool calls summary
    if (msg.toolUses && msg.toolUses.length > 0) {
      for (const tool of msg.toolUses) {
        lines.push(`*Tool call: \`${tool.tool}\`*`);
        const inputStr = JSON.stringify(tool.input, null, 2);
        lines.push("```json");
        lines.push(inputStr);
        lines.push("```");
        lines.push("");
      }
    }

    // Main content
    lines.push(msg.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const safeName = (label || "chat")
    .replace(/[^a-z0-9\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60);
  anchor.download = `${safeName || "chat"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy the conversation as plain text to the system clipboard.
 * Returns a Promise so callers can await completion (e.g. to show feedback).
 */
async function copyConversationToClipboard(
  messages: readonly ChatMessage[],
  label: string | null
): Promise<void> {
  const lines: string[] = [];

  if (label) {
    lines.push(label);
    lines.push("=".repeat(label.length));
    lines.push("");
  }

  for (const msg of messages) {
    const roleLabel = msg.role === "user" ? "You" : "Assistant";
    const timeStr = msg.createdAt
      ? new Date(msg.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    lines.push(timeStr ? `[${roleLabel} · ${timeStr}]` : `[${roleLabel}]`);

    // Optional reasoning block (collapsed inline)
    if (msg.reasoning) {
      lines.push(`<thinking> ${msg.reasoning.trim()} </thinking>`);
    }

    // Tool call summaries
    if (msg.toolUses && msg.toolUses.length > 0) {
      for (const tool of msg.toolUses) {
        lines.push(`(Tool: ${tool.tool})`);
      }
    }

    lines.push(msg.content.trim());
    lines.push("");
  }

  await navigator.clipboard.writeText(lines.join("\n").trimEnd());
}

export default function Home() {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Number of user turns in the current session (each user message = 1 turn)
  const turnCount = messages.filter((m) => m.role === "user").length;

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    setActiveSessionLabel(null);
    setMessages([]);
  }, []);

  // Alt+N: create a new chat session (only active while on this page)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewSession();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNewSession]);

  // "/": focus the chat composer when not already in an input field
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;
      e.preventDefault();
      const composer = document.querySelector<HTMLElement>(".aui-composer-input");
      composer?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLoadSession = useCallback(
    (loaded: ChatMessage[], sessionId: string, label: string) => {
      setActiveSessionId(sessionId);
      setActiveSessionLabel(label);
      setMessages(loaded);
    },
    []
  );

  return (
    <TooltipProvider>
      <div className="flex h-full">
        <SessionsSidebar
          activeSessionId={activeSessionId}
          onNewSession={handleNewSession}
          onLoadSession={handleLoadSession}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeSessionLabel && (
            <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-background/80 backdrop-blur-sm">
              <MessageSquare className="size-3.5 flex-shrink-0 text-neutral-400 dark:text-neutral-500" />
              <span
                className="text-sm font-medium text-neutral-700 dark:text-neutral-200 truncate"
                title={activeSessionLabel}
              >
                {activeSessionLabel}
              </span>
              {/* Dynamic session status: pulsing dot while running, turn count when idle */}
              {isRunning ? (
                <span className="flex-shrink-0 flex items-center gap-1.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                  </span>
                  <span className="hidden sm:inline">Thinking…</span>
                </span>
              ) : turnCount > 0 ? (
                <span
                  className="flex-shrink-0 inline-flex items-center rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400 tabular-nums whitespace-nowrap"
                  title={`${turnCount} user turn${turnCount !== 1 ? "s" : ""} in this session`}
                >
                  {turnCount} turn{turnCount !== 1 ? "s" : ""}
                </span>
              ) : null}
              {messages.length > 0 && (
                <div className="ml-auto flex-shrink-0 flex items-center gap-1">
                  <button
                    onClick={async () => {
                      await copyConversationToClipboard(messages, activeSessionLabel);
                      setCopiedToClipboard(true);
                      setTimeout(() => setCopiedToClipboard(false), 2000);
                    }}
                    title="Copy conversation to clipboard"
                    aria-label="Copy conversation to clipboard"
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {copiedToClipboard ? (
                      <CheckIcon className="size-3 text-green-500" />
                    ) : (
                      <ClipboardCopyIcon className="size-3" />
                    )}
                    <span className="hidden sm:inline">
                      {copiedToClipboard ? "Copied!" : "Copy"}
                    </span>
                  </button>
                  <button
                    onClick={() => exportConversation(messages, activeSessionLabel)}
                    title="Export conversation as Markdown"
                    aria-label="Export conversation as Markdown"
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <DownloadIcon className="size-3" />
                    <span className="hidden sm:inline">Export</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <ChatProvider
              messages={messages}
              setMessages={setMessages}
              isRunning={isRunning}
              setIsRunning={setIsRunning}
              activeSessionId={activeSessionId}
              setActiveSessionId={setActiveSessionId}
            >
              <Thread />
            </ChatProvider>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
