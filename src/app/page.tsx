"use client";

import { useState, useCallback, useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import { ChatProvider } from "@/components/chat-provider";
import { SessionsSidebar } from "@/components/sessions-sidebar";
import { Thread } from "@/components/assistant-ui/thread";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Home() {
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
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

  const handleLoadSession = useCallback(
    (loaded: ChatMessage[], sessionId: string) => {
      setActiveSessionId(sessionId);
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
        <div className="flex-1 flex flex-col min-w-0">
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
    </TooltipProvider>
  );
}
