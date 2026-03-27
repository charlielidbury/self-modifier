"use client";

import { useState, useCallback, useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import { ChatProvider } from "@/components/chat-provider";
import { SessionsSidebar } from "@/components/sessions-sidebar";
import { Thread } from "@/components/assistant-ui/thread";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MessageSquare } from "lucide-react";

export default function Home() {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionLabel, setActiveSessionLabel] = useState<string | null>(null);

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
