"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { SessionInfo, ChatMessage } from "@/lib/types";
import type { AgentStatus } from "@/lib/agent";

/** Convert a Unix-ms timestamp into a human-readable relative string. */
function formatRelativeTime(timestamp: number, now: number): string {
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;

  // Older: show short date (e.g. "Mar 15")
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type SessionsSidebarProps = {
  activeSessionId: string | null;
  onNewSession: () => void;
  onLoadSession: (messages: ChatMessage[], sessionId: string) => void;
};

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === "running") {
    return (
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span
        className="inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-400"
        title="Paused (loaded)"
      />
    );
  }
  // unloaded
  return (
    <span
      className="inline-flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-600"
      title="Unloaded"
    />
  );
}

export function SessionsSidebar({
  activeSessionId,
  onNewSession,
  onLoadSession,
}: SessionsSidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [searchQuery, setSearchQuery] = useState("");
  // Default open on large screens (>= 1024px), collapsed on small screens.
  // Start with true so SSR/hydration doesn't flash; useEffect corrects it on the client.
  const [isOpen, setIsOpen] = useState(true);
  // Track which session is "armed" for deletion (first click arms, second click deletes)
  const [armedForDelete, setArmedForDelete] = useState<string | null>(null);
  const sessionIdsRef = useRef<string[]>([]);

  // Current time, refreshed every minute so relative timestamps stay accurate.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setIsOpen(window.innerWidth >= 1024);
  }, []);

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: SessionInfo[]) => {
        setSessions(data);
        sessionIdsRef.current = data.map((s) => s.sessionId);
      })
      .catch(() => {});
  }, []);

  // Poll statuses every 2 seconds.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const ids = sessionIdsRef.current;
      if (ids.length === 0) return;
      try {
        const res = await fetch("/api/sessions/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionIds: ids }),
        });
        if (!cancelled) {
          const data = await res.json();
          setStatuses(data as Record<string, AgentStatus>);
        }
      } catch {
        // ignore
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Keep sessionIdsRef in sync whenever sessions list changes.
  useEffect(() => {
    sessionIdsRef.current = sessions.map((s) => s.sessionId);
  }, [sessions]);

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

  const deleteSession = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger the load-session click

      // Two-click confirmation: first click arms, second click executes
      if (armedForDelete !== sessionId) {
        setArmedForDelete(sessionId);
        // Auto-disarm after 3 seconds if user doesn't confirm
        setTimeout(() => setArmedForDelete((cur) => (cur === sessionId ? null : cur)), 3000);
        return;
      }

      // Confirmed — delete the session
      setArmedForDelete(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        }
      } catch {
        // Silently ignore network errors
      }
    },
    [armedForDelete]
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
          className="m-3 px-4 py-2 bg-green-200 text-green-900 rounded-lg hover:bg-green-300 transition-colors text-sm font-medium whitespace-nowrap"
        >
          + New Agent
        </button>

        {/* Search / filter */}
        <div className="px-3 pb-2 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter sessions…"
            className="w-full rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 pr-7 text-xs text-neutral-700 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              title="Clear filter"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="px-4 pb-2 flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
          <span className="flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            running
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
            paused
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-neutral-400 dark:bg-neutral-600" />
            unloaded
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions
            .filter((s) => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              const label = (s.summary || s.sessionId.slice(0, 8)).toLowerCase();
              return label.includes(q);
            })
            .map((s) => (
              <div
                key={s.sessionId}
                className={`group relative flex items-center text-sm transition-colors ${
                  activeSessionId === s.sessionId
                    ? "bg-neutral-200 dark:bg-neutral-700"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                <button
                  onClick={() => loadSession(s.sessionId)}
                  className="flex-1 min-w-0 text-left px-4 py-2.5 flex items-center gap-2"
                >
                  <StatusDot status={statuses[s.sessionId] ?? "unloaded"} />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate text-sm leading-snug">
                      {s.summary || s.sessionId.slice(0, 8)}
                    </span>
                    <span className="text-xs leading-snug text-neutral-400 dark:text-neutral-500 tabular-nums">
                      {formatRelativeTime(s.lastModified, now)}
                    </span>
                  </span>
                </button>
                <button
                  onClick={(e) => deleteSession(s.sessionId, e)}
                  title={armedForDelete === s.sessionId ? "Click again to confirm delete" : "Delete session"}
                  className={`mr-2 flex-shrink-0 rounded p-1 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                    armedForDelete === s.sessionId
                      ? "opacity-100 text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50"
                      : "text-neutral-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          {searchQuery &&
            sessions.filter((s) => {
              const q = searchQuery.toLowerCase();
              const label = (s.summary || s.sessionId.slice(0, 8)).toLowerCase();
              return label.includes(q);
            }).length === 0 && (
              <p className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500 italic">
                No sessions match &ldquo;{searchQuery}&rdquo;
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
