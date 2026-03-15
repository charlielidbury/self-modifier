"use client";

import { useState, useEffect, useCallback } from "react";
import type { SessionInfo, ChatMessage } from "@/lib/types";

type SessionsSidebarProps = {
  activeSessionId: string | null;
  onNewSession: () => void;
  onLoadSession: (messages: ChatMessage[], sessionId: string) => void;
};

export function SessionsSidebar({
  activeSessionId,
  onNewSession,
  onLoadSession,
}: SessionsSidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  // Default open on large screens (>= 1024px), collapsed on small screens.
  // Start with true so SSR/hydration doesn't flash; useEffect corrects it on the client.
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(window.innerWidth >= 1024);
  }, []);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: SessionInfo[]) => setSessions(data))
      .catch(() => {});
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        const data = await res.json();
        const loaded: ChatMessage[] = (
          data as {
            type: string;
            uuid: string;
            message: {
              content?: string | { type: string; text?: string }[];
            };
          }[]
        )
          .filter((m) => m.type === "user" || m.type === "assistant")
          .map((m) => {
            let content = "";
            if (typeof m.message.content === "string") {
              content = m.message.content;
            } else if (Array.isArray(m.message.content)) {
              content = m.message.content
                .filter(
                  (b: { type: string; text?: string }) => b.type === "text"
                )
                .map((b: { type: string; text?: string }) => b.text ?? "")
                .join("");
            }
            return {
              id: m.uuid,
              role: m.type as "user" | "assistant",
              content,
            };
          });
        onLoadSession(loaded, sessionId);
      } catch {
        onLoadSession([], sessionId);
      }
    },
    [onLoadSession]
  );

  return (
    <div
      className={`relative flex flex-col border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex-shrink-0 transition-all duration-300 ${
        isOpen ? "w-64" : "w-10"
      }`}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        className="absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 shadow-sm transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3.5 w-3.5 transition-transform duration-300 ${isOpen ? "" : "rotate-180"}`}
        >
          <path
            fillRule="evenodd"
            d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Sidebar content — hidden when collapsed */}
      <div
        className={`flex flex-col flex-1 min-h-0 overflow-hidden transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={onNewSession}
          className="m-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium whitespace-nowrap"
        >
          + New Agent
        </button>
        <div className="flex-1 overflow-y-auto">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => loadSession(s.sessionId)}
              className={`w-full text-left px-4 py-3 text-sm truncate hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${
                activeSessionId === s.sessionId
                  ? "bg-neutral-200 dark:bg-neutral-700"
                  : ""
              }`}
            >
              {s.summary || s.sessionId.slice(0, 8)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
