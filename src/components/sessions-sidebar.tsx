"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Trash2, MessageSquare, Pencil, Plus, Pin } from "lucide-react";
import type { SessionInfo, ChatMessage, ContentPart } from "@/lib/types";
import { useEventBus } from "@/hooks/use-event-bus";
import type { AgentStatus } from "@/lib/agent";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Renders `text` with ALL occurrences of `query` wrapped in a highlight span. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const parts: (string | React.ReactElement)[] = [];
  let lastIdx = 0;
  let idx = lowerText.indexOf(lowerQuery);

  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <mark
        key={idx}
        className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded-[2px] px-0"
      >
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    lastIdx = idx + query.length;
    idx = lowerText.indexOf(lowerQuery, lastIdx);
  }

  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
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

/** Format a Unix-ms timestamp as a full, human-readable date + time string. */
function formatFullDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  onLoadSession: (messages: ChatMessage[], sessionId: string, label: string) => void;
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

/** Shimmer placeholder rendered while the initial sessions fetch is in-flight. */
function SessionSkeleton() {
  return (
    <div className="flex flex-col gap-0.5 px-1 pt-1" aria-hidden="true">
      {([0.9, 0.75, 0.6, 0.45] as const).map((opacity, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-2.5 rounded-md"
          style={{ opacity }}
        >
          <div className="size-2.5 flex-shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div
              className="h-3 rounded bg-neutral-200 dark:bg-neutral-700 animate-pulse"
              style={{ width: `${60 + i * 8}%` }}
            />
            <div className="h-2 w-10 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SessionsSidebar({
  activeSessionId,
  onNewSession,
  onLoadSession,
}: SessionsSidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
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

  // Pinned session IDs, persisted to localStorage.
  const PINNED_KEY = "pinned-sessions";
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  const togglePin = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      try {
        localStorage.setItem(PINNED_KEY, JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }, []);
  // IDs currently mid-exit-animation (fade out before removal)
  const [exitingSessionIds, setExitingSessionIds] = useState<Set<string>>(new Set());
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

  // Alt+B: toggle sidebar open/closed  Alt+N: new session  Alt+F: focus session search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsOpen((o) => !o);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNewSession();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        // Open sidebar first if collapsed, then focus search after transition starts
        setIsOpen(true);
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 50);
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
      .catch(() => {})
      .finally(() => setIsLoadingSessions(false));
  }, []);

  // Fetch initial statuses, then listen for push updates via SSE
  useEffect(() => {
    let cancelled = false;
    async function fetchInitial() {
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
    fetchInitial();
    return () => { cancelled = true; };
  }, []);

  // Listen for real-time session status updates via SSE
  useEventBus("sessions:status", useCallback((raw: unknown) => {
    const update = raw as Record<string, AgentStatus>;
    setStatuses((prev) => ({ ...prev, ...update }));
  }, []));

  // Keep sessionIdsRef in sync whenever sessions list changes.
  useEffect(() => {
    sessionIdsRef.current = sessions.map((s) => s.sessionId);
  }, [sessions]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      // Resolve the label from the sessions list before the async fetch
      const sessionLabel =
        sessions.find((s) => s.sessionId === sessionId)?.summary ||
        sessionId.slice(0, 8);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        const data = await res.json();
        // Parse raw SDK messages into ChatMessage objects, properly handling
        // tool_use / tool_result blocks that span multiple raw messages.
        //
        // The Claude Agent SDK stores messages as:
        //   1. user (text content)
        //   2. assistant (tool_use blocks)
        //   3. user (tool_result blocks — synthetic, not real user messages)
        //   4. assistant (text response)
        // We need to merge assistant tool_use messages with their subsequent
        // text response, and skip synthetic tool_result "user" messages.
        type RawBlock = {
          type: string;
          text?: string;
          name?: string;
          id?: string;
          input?: Record<string, unknown>;
          tool_use_id?: string;
          content?: string | { type: string; text?: string }[];
        };
        type RawMsg = {
          type: string;
          uuid: string;
          message: {
            content?: string | RawBlock[];
          };
        };

        const raw = data as RawMsg[];
        const loaded: ChatMessage[] = [];

        // Collect tool results from synthetic "user" messages into a lookup
        const toolResultsByUseId = new Map<
          string,
          { tool: string; content: string }
        >();
        for (const m of raw) {
          if (m.type !== "user" || !Array.isArray(m.message?.content)) continue;
          for (const block of m.message.content) {
            if (block.type === "tool_result" && block.tool_use_id) {
              let resultContent = "";
              if (typeof block.content === "string") {
                resultContent = block.content;
              } else if (Array.isArray(block.content)) {
                resultContent = block.content
                  .filter((b) => b.type === "text")
                  .map((b) => b.text ?? "")
                  .join("");
              }
              toolResultsByUseId.set(block.tool_use_id, {
                tool: block.tool_use_id,
                content: resultContent,
              });
            }
          }
        }

        // Track pending parts from assistant messages so we can merge
        // tool-use-only messages with subsequent text into one ChatMessage.
        let pendingParts: ContentPart[] = [];
        let pendingToolUseUuid: string | null = null;
        let pendingContent = "";

        for (const m of raw) {
          // Skip synthetic tool_result user messages
          if (
            m.type === "user" &&
            Array.isArray(m.message?.content) &&
            m.message.content.some((b: RawBlock) => b.type === "tool_result")
          ) {
            continue;
          }

          if (m.type === "user") {
            // Real user message
            let content = "";
            if (typeof m.message.content === "string") {
              content = m.message.content;
            } else if (Array.isArray(m.message.content)) {
              content = m.message.content
                .filter((b: RawBlock) => b.type === "text")
                .map((b: RawBlock) => b.text ?? "")
                .join("");
            }
            if (content) {
              loaded.push({
                id: m.uuid,
                role: "user",
                content,
              });
            }
            continue;
          }

          if (m.type === "assistant") {
            const blocks = Array.isArray(m.message?.content)
              ? m.message.content
              : [];
            const textParts = blocks
              .filter((b: RawBlock) => b.type === "text")
              .map((b: RawBlock) => b.text ?? "")
              .join("");
            const hasToolUse = blocks.some(
              (b: RawBlock) => b.type === "tool_use"
            );

            // Build ordered parts from this message's blocks
            for (const block of blocks) {
              if (block.type === "thinking" && block.text) {
                // Merge consecutive reasoning parts
                const last = pendingParts[pendingParts.length - 1];
                if (last && last.type === "reasoning") {
                  last.text += block.text;
                } else {
                  pendingParts.push({ type: "reasoning", text: block.text });
                }
              } else if (block.type === "text" && block.text) {
                // Merge consecutive text parts
                const last = pendingParts[pendingParts.length - 1];
                if (last && last.type === "text") {
                  last.text += block.text;
                } else {
                  pendingParts.push({ type: "text", text: block.text });
                }
                pendingContent += block.text;
              } else if (block.type === "tool_use") {
                const toolName = block.name ?? "unknown";
                const toolId = block.id ?? "";
                const result = toolResultsByUseId.get(toolId);
                const isContainer = toolName === "Agent";
                const toolPart: ContentPart = {
                  type: "tool-use",
                  tool: toolName,
                  input: (block.input as Record<string, unknown>) ?? {},
                  toolCallId: toolId,
                  result: result?.content,
                  ...(isContainer ? { children: [] } : {}),
                };
                // If there's an open container (Agent without result), nest inside it
                let openContainer: (ContentPart & { type: "tool-use" }) | undefined;
                for (let pi = pendingParts.length - 1; pi >= 0; pi--) {
                  const pp = pendingParts[pi];
                  if (pp.type === "tool-use" && pp.children !== undefined && pp.result === undefined) {
                    openContainer = pp as ContentPart & { type: "tool-use" };
                    break;
                  }
                }
                if (openContainer && !isContainer) {
                  openContainer.children = [
                    ...(openContainer.children ?? []),
                    toolPart,
                  ];
                } else {
                  pendingParts.push(toolPart);
                }
              }
            }

            pendingToolUseUuid = pendingToolUseUuid || m.uuid;

            if (hasToolUse && !textParts) {
              // Tool-use-only message — keep accumulating, merge with next
              continue;
            }

            // Flush: emit a ChatMessage with all accumulated parts
            loaded.push({
              id: pendingToolUseUuid || m.uuid,
              role: "assistant",
              content: pendingContent,
              parts: pendingParts.length > 0 ? pendingParts : undefined,
            });

            pendingParts = [];
            pendingToolUseUuid = null;
            pendingContent = "";
            continue;
          }
        }

        // Flush any remaining pending parts (edge case: session ended mid-tool)
        if (pendingParts.length > 0) {
          loaded.push({
            id: pendingToolUseUuid || "pending-" + Date.now(),
            role: "assistant",
            content: pendingContent,
            parts: pendingParts,
          });
        }
        onLoadSession(loaded, sessionId, sessionLabel);
      } catch {
        onLoadSession([], sessionId, sessionLabel);
      }
    },
    [onLoadSession, sessions]
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

      // Confirmed — start exit animation, fire API, then remove from list
      setArmedForDelete(null);
      setExitingSessionIds((prev) => new Set([...prev, sessionId]));

      // Fire the DELETE request immediately (don't block on animation)
      fetch(`/api/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});

      // After the CSS transition finishes, remove from local state
      setTimeout(() => {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        setExitingSessionIds((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }, 220);
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

  // Derived: sessions filtered by the current search query, with pinned ones sorted to the top.
  const filteredSessions = useMemo(() => {
    const filtered = sessions.filter((s) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const label = (s.summary || s.sessionId.slice(0, 8)).toLowerCase();
      return label.includes(q);
    });

    // When not actively searching, sort pinned sessions to the top while preserving
    // the existing lastModified-desc order within each group.
    if (!searchQuery) {
      return [...filtered].sort((a, b) => {
        const aPinned = pinnedIds.has(a.sessionId) ? 0 : 1;
        const bPinned = pinnedIds.has(b.sessionId) ? 0 : 1;
        if (aPinned !== bPinned) return aPinned - bPinned;
        return b.lastModified - a.lastModified;
      });
    }

    return filtered;
  }, [sessions, searchQuery, pinnedIds]);

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
        isOpen ? "w-64" : "w-0 sm:w-10"
      }`}
    >
      {/* Toggle button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setIsOpen((o) => !o)}
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            className={`absolute -right-3 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100 shadow-sm transition-colors ${!isOpen ? "hidden sm:flex" : ""}`}
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
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {isOpen ? "Collapse" : "Expand"} sidebar{" "}
          <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            Alt+B
          </kbd>
        </TooltipContent>
      </Tooltip>

      {/* Compact session stats shown in collapsed state */}
      {!isOpen && sessions.length > 0 && (
        /* Hidden on small screens when collapsed (sidebar is w-0 on mobile) */
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsOpen(true)}
              className="absolute top-14 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-1 py-1.5 w-8 rounded-md text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label={`${sessions.length} session${sessions.length !== 1 ? "s" : ""}${runningCount > 0 ? `, ${runningCount} running` : ""} — click to expand`}
            >
              <span className="text-[11px] font-medium tabular-nums select-none leading-none">
                {sessions.length}
              </span>
              {runningCount > 0 && (
                <span className="relative flex h-2 w-2 mt-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            {runningCount > 0 && (
              <> · <span className="text-green-500 font-medium">{runningCount} running</span></>
            )}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Sidebar content — hidden when collapsed */}
      <div
        className={`flex flex-col flex-1 min-h-0 overflow-hidden transition-opacity duration-200 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onNewSession}
              className="m-3 px-4 py-2 flex items-center justify-center gap-1.5 bg-green-100 dark:bg-green-900/25 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800/50 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/45 hover:border-green-300 dark:hover:border-green-700/60 active:scale-[0.98] transition-all text-sm font-medium whitespace-nowrap"
            >
              <Plus className="size-3.5" />
              New Agent
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            New agent{" "}
            <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
              Alt+N
            </kbd>
          </TooltipContent>
        </Tooltip>

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

        {/* Search result count — only shown when filtering narrows down the list */}
        {searchQuery && filteredSessions.length > 0 && filteredSessions.length < sessions.length && (
          <p className="animate-in fade-in duration-150 px-4 pb-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            {filteredSessions.length} of {sessions.length} sessions
          </p>
        )}

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
        <TooltipProvider delayDuration={500}>
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto focus:outline-none"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          onBlur={() => setKbdFocusIndex(null)}
          aria-label="Session list"
        >
          {isLoadingSessions ? (
            <SessionSkeleton />
          ) : null}
          {!isLoadingSessions && filteredSessions.map((s, idx) => {
            const label = s.summary || s.sessionId.slice(0, 8);
            const isActive = activeSessionId === s.sessionId;
            const isKbdFocused = kbdFocusIndex === idx;
            const isRenaming = renamingSessionId === s.sessionId;
            const isExiting = exitingSessionIds.has(s.sessionId);

            const isPinned = !searchQuery && pinnedIds.has(s.sessionId);
            const prevIsPinned = !searchQuery && idx > 0 && pinnedIds.has(filteredSessions[idx - 1].sessionId);

            // "Pinned" section header — shown before the first pinned session
            const showPinnedHeader = isPinned && (idx === 0 || !prevIsPinned);

            // Date group headers — only shown for unpinned sessions when not actively searching
            const group = !searchQuery && !isPinned ? getSessionGroup(s.lastModified, now) : null;
            const prevGroup = !searchQuery && !isPinned && idx > 0 && !prevIsPinned
              ? getSessionGroup(filteredSessions[idx - 1].lastModified, now)
              : null;
            const showGroupHeader = group !== null && group !== prevGroup;

            return (
              <Fragment key={s.sessionId}>
                {showPinnedHeader && (
                  <div className="px-4 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/70 dark:text-amber-400/60 select-none flex items-center gap-1">
                    <Pin className="h-2.5 w-2.5" />
                    Pinned
                  </div>
                )}
                {showGroupHeader && (
                  <div className="px-4 pt-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 select-none">
                    {group}
                  </div>
                )}
              <div
                ref={(el) => { itemRefs.current[idx] = el; }}
                className={[
                  "group relative flex items-center text-sm transition-all duration-200 mx-1 rounded-md",
                  isExiting
                    ? "opacity-0 -translate-x-3 pointer-events-none"
                    : isActive
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs leading-snug text-neutral-400 dark:text-neutral-500 tabular-nums cursor-default w-fit">
                          {formatRelativeTime(s.lastModified, now)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {formatFullDateTime(s.lastModified)}
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </button>
                {!isRenaming && (
                  <>
                    {/* Pin / unpin — always visible when pinned, appears on hover otherwise */}
                    <button
                      onClick={(e) => togglePin(s.sessionId, e)}
                      title={isPinned ? "Unpin session" : "Pin session to top"}
                      className={`mr-1 flex-shrink-0 rounded p-1 transition-all focus:opacity-100 ${
                        isPinned
                          ? "opacity-100 text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300"
                          : "opacity-0 group-hover:opacity-100 text-neutral-400 dark:text-neutral-500 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      }`}
                    >
                      <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
                    </button>
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
          {!isLoadingSessions && sessions.length === 0 ? (
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
          ) : !isLoadingSessions && searchQuery && filteredSessions.length === 0 ? (
            <p className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500 italic">
              No sessions match &ldquo;{searchQuery}&rdquo;
            </p>
          ) : null}
        </div>
        </TooltipProvider>

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
