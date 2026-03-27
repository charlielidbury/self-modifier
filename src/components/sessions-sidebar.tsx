"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Trash2, MessageSquare, Pencil } from "lucide-react";
import type { SessionInfo, ChatMessage } from "@/lib/types";
import type { AgentStatus } from "@/lib/agent";

/** Renders `text` with any occurrence of `query` wrapped in a highlight span. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded-[2px] px-0">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

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

/** Categorise a timestamp into a display group relative to `now`. */
function getSessionGroup(timestamp: number, now: number): string {
  const msPerDay = 86_400_000;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const yesterdayStart = todayStart - msPerDay;
  const weekStart = todayStart - 6 * msPerDay;

  if (timestamp >= todayStart) return "Today";
  if (timestamp >= yesterdayStart) return "Yesterday";
  if (timestamp >= weekStart) return "This Week";
  return "Older";
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
  // Number of currently-running sessions (derived from statuses map).
  const runningCount = useMemo(
    () => Object.values(statuses).filter((s) => s === "running").length,
    [statuses]
  );
  // Default open on large screens (>= 1024px), collapsed on small screens.
  // Start with true so SSR/hydration doesn't flash; useEffect corrects it on the client.
  const [isOpen, setIsOpen] = useState(true);
  // Track which session is "armed" for deletion (first click arms, second click deletes)
  const [armedForDelete, setArmedForDelete] = useState<string | null>(null);
  // Inline rename state
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const sessionIdsRef = useRef<string[]>([]);
  // Keyboard-navigation: index into the filtered sessions list (null = no kbd focus)
  const [kbdFocusIndex, setKbdFocusIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Current time, refreshed every minute so relative timestamps stay accurate.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setIsOpen(window.innerWidth >= 1024);
  }, []);

  // Alt+B: toggle sidebar open/closed  Alt+N: new session
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsOpen((o) => !o);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNewSession();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewSession]);

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

  // Focus the rename input whenever we enter rename mode.
  useEffect(() => {
    if (renamingSessionId !== null) {
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  }, [renamingSessionId]);

  const startRename = useCallback(
    (sessionId: string, currentLabel: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setArmedForDelete(null);
      setRenamingSessionId(sessionId);
      setRenameValue(currentLabel);
    },
    []
  );

  const commitRename = useCallback(async () => {
    if (!renamingSessionId) return;
    const trimmed = renameValue.trim();
    setRenamingSessionId(null);
    if (!trimmed) return;

    // Optimistically update local state
    setSessions((prev) =>
      prev.map((s) =>
        s.sessionId === renamingSessionId ? { ...s, summary: trimmed } : s
      )
    );

    try {
      await fetch(`/api/sessions/${renamingSessionId}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {
      // Silently ignore network errors; optimistic update stays
    }
  }, [renamingSessionId, renameValue]);

  const cancelRename = useCallback(() => {
    setRenamingSessionId(null);
    setRenameValue("");
  }, []);

  // Derived: sessions filtered by the current search query.
  const filteredSessions = useMemo(
    () =>
      sessions.filter((s) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const label = (s.summary || s.sessionId.slice(0, 8)).toLowerCase();
        return label.includes(q);
      }),
    [sessions, searchQuery]
  );

  // Reset keyboard focus whenever the search query changes.
  useEffect(() => {
    setKbdFocusIndex(null);
  }, [searchQuery]);

  // Scroll the keyboard-focused item into view whenever the index changes.
  useEffect(() => {
    if (kbdFocusIndex === null) return;
    itemRefs.current[kbdFocusIndex]?.scrollIntoView({ block: "nearest" });
  }, [kbdFocusIndex]);

  // Scroll the active session into view whenever the active session changes.
  const prevActiveSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSessionId) return;
    if (activeSessionId === prevActiveSessionIdRef.current) return;
    prevActiveSessionIdRef.current = activeSessionId;
    const idx = filteredSessions.findIndex((s) => s.sessionId === activeSessionId);
    if (idx === -1) return;
    requestAnimationFrame(() => {
      itemRefs.current[idx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, filteredSessions]);

  // Keyboard navigation handler for the session list container.
  // The list div has tabIndex={0} so it can receive focus and process arrow-key events.
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (filteredSessions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setKbdFocusIndex((prev) =>
          prev === null ? 0 : Math.min(prev + 1, filteredSessions.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setKbdFocusIndex((prev) => {
          if (prev === null) return filteredSessions.length - 1;
          if (prev === 0) {
            // Wrap focus back to the search input
            listRef.current?.blur();
            searchInputRef.current?.focus();
            return null;
          }
          return prev - 1;
        });
      } else if (e.key === "Enter" && kbdFocusIndex !== null) {
        e.preventDefault();
        loadSession(filteredSessions[kbdFocusIndex].sessionId);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setKbdFocusIndex(null);
        listRef.current?.blur();
        searchInputRef.current?.focus();
      }
    },
    [filteredSessions, kbdFocusIndex, loadSession]
  );

  // When the user presses ArrowDown from the search input, move focus to the list.
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown" && filteredSessions.length > 0) {
        e.preventDefault();
        setKbdFocusIndex(0);
        listRef.current?.focus();
      }
    },
    [filteredSessions.length]
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
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Filter sessions… ↓ to navigate"
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

        {/* Session list — receives focus so arrow-key navigation works */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto focus:outline-none"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          onBlur={() => setKbdFocusIndex(null)}
          aria-label="Session list"
        >
          {filteredSessions.map((s, idx) => {
            const label = s.summary || s.sessionId.slice(0, 8);
            const isActive = activeSessionId === s.sessionId;
            const isKbdFocused = kbdFocusIndex === idx;
            const isRenaming = renamingSessionId === s.sessionId;

            // Date group header — only shown when not actively searching
            const group = !searchQuery ? getSessionGroup(s.lastModified, now) : null;
            const prevGroup = !searchQuery && idx > 0
              ? getSessionGroup(filteredSessions[idx - 1].lastModified, now)
              : null;
            const showGroupHeader = group !== null && group !== prevGroup;

            return (
              <Fragment key={s.sessionId}>
                {showGroupHeader && (
                  <div className="px-4 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 select-none">
                    {group}
                  </div>
                )}
              <div
                ref={(el) => { itemRefs.current[idx] = el; }}
                className={[
                  "group relative flex items-center text-sm transition-colors mx-1 rounded-md",
                  isActive
                    ? "bg-neutral-200 dark:bg-neutral-700"
                    : isKbdFocused
                    ? "bg-neutral-100 dark:bg-neutral-800 ring-1 ring-inset ring-neutral-300 dark:ring-neutral-600"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                ].join(" ")}
              >
                <button
                  onClick={() => !isRenaming && loadSession(s.sessionId)}
                  onDoubleClick={(e) => startRename(s.sessionId, label, e)}
                  title={isRenaming ? undefined : "Double-click to rename"}
                  className="flex-1 min-w-0 text-left px-4 py-2.5 flex items-center gap-2"
                >
                  <StatusDot status={statuses[s.sessionId] ?? "unloaded"} />
                  <span className="flex flex-col min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 px-1.5 py-0.5 text-sm text-neutral-800 dark:text-neutral-100 outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-500"
                      />
                    ) : (
                      <span className="truncate text-sm leading-snug">
                        <HighlightedText text={label} query={searchQuery} />
                      </span>
                    )}
                    <span className="text-xs leading-snug text-neutral-400 dark:text-neutral-500 tabular-nums">
                      {formatRelativeTime(s.lastModified, now)}
                    </span>
                  </span>
                </button>
                {!isRenaming && (
                  <>
                    <button
                      onClick={(e) => startRename(s.sessionId, label, e)}
                      title="Rename session"
                      className="mr-1 flex-shrink-0 rounded p-1 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
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
                  </>
                )}
              </div>
              </Fragment>
            );
          })}
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-300 dark:text-neutral-600">
                <MessageSquare className="size-5" />
              </div>
              <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                No sessions yet
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                Click &ldquo;+ New Agent&rdquo; to get started
              </p>
            </div>
          ) : searchQuery && filteredSessions.length === 0 ? (
            <p className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500 italic">
              No sessions match &ldquo;{searchQuery}&rdquo;
            </p>
          ) : null}
        </div>

        {/* Session stats footer */}
        {sessions.length > 0 && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
            {runningCount > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                </span>
                {runningCount} running
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
