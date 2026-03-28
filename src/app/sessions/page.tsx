"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  History,
  ChevronRight,
  Clock,
  Wrench,
  CheckCircle2,
  XCircle,
  Undo2,
  Brain,
  Code2,
  MessageSquare,
  AlertTriangle,
  Loader2,
  Play,
  Pause,
  SkipForward,
  ChevronLeft,
  Terminal,
  Eye,
  Search,
  Dna,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionRecord = {
  id: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "failed" | "reverted";
  summary: string;
  genome: {
    id: string;
    generation: number;
    focus: string;
    ambition: number;
    creativity: number;
    thoroughness: number;
  } | null;
  durationMs: number;
  eventCount: number;
  toolCallCount: number;
  toolsUsed: string[];
};

type SessionStats = {
  totalSessions: number;
  completedCount: number;
  failedCount: number;
  revertedCount: number;
  avgDurationMs: number;
  avgToolCalls: number;
  totalEvents: number;
  mostUsedTools: { tool: string; count: number }[];
};

type ActivityEvent = {
  id: number;
  ts: number;
  kind: "thinking" | "tool_call" | "tool_result" | "text" | "error";
  content: string;
  tool?: string;
};

type SessionDetail = SessionRecord & {
  events: ActivityEvent[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "reverted":
      return <Undo2 className="w-4 h-4 text-amber-500" />;
    default:
      return null;
  }
}

function statusBadge(status: string) {
  const cls =
    status === "completed"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "failed"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

function eventIcon(kind: string, tool?: string) {
  switch (kind) {
    case "thinking":
      return <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    case "tool_call":
      return <Terminal className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    case "tool_result":
      return <Code2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    case "text":
      return <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
    case "error":
      return <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    default:
      return <Eye className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "completed" | "failed" | "reverted">("all");
  const [search, setSearch] = useState("");

  // Replay state
  const [replaying, setReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1); // events per tick
  const replayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventListRef = useRef<HTMLDivElement>(null);

  // Fetch session list + stats
  useEffect(() => {
    fetch("/api/self-improve/sessions?stats=true")
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setStats(data.stats ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch session detail
  const openSession = useCallback((id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    setReplaying(false);
    setReplayIndex(0);
    if (replayRef.current) clearInterval(replayRef.current);

    fetch(`/api/self-improve/sessions/${id}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, []);

  // Replay controls
  const startReplay = useCallback(() => {
    if (!detail) return;
    setReplaying(true);
    if (replayIndex >= detail.events.length) setReplayIndex(0);
  }, [detail, replayIndex]);

  const stopReplay = useCallback(() => {
    setReplaying(false);
    if (replayRef.current) {
      clearInterval(replayRef.current);
      replayRef.current = null;
    }
  }, []);

  // Replay tick
  useEffect(() => {
    if (!replaying || !detail) return;
    const interval = setInterval(() => {
      setReplayIndex((prev) => {
        const next = prev + replaySpeed;
        if (next >= detail.events.length) {
          setReplaying(false);
          return detail.events.length;
        }
        return next;
      });
    }, 80);
    replayRef.current = interval;
    return () => clearInterval(interval);
  }, [replaying, detail, replaySpeed]);

  // Auto-scroll during replay
  useEffect(() => {
    if (replaying && eventListRef.current) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
  }, [replayIndex, replaying]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (replayRef.current) clearInterval(replayRef.current);
    };
  }, []);

  // Filtered sessions
  const filtered = sessions.filter((s) => {
    if (filter !== "all" && s.status !== filter) return false;
    if (search && !s.summary.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Events to show (all if not replaying, or up to replayIndex if replaying)
  const visibleEvents =
    detail && replaying
      ? detail.events.slice(0, replayIndex)
      : detail?.events ?? [];

  // Collapse consecutive thinking events for readability
  const collapsedEvents = collapseThinking(visibleEvents);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-rose-500/10 dark:bg-rose-500/15">
          <History className="w-6 h-6 text-rose-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Session Replay
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Browse and replay past self-improve agent sessions
          </p>
        </div>
      </div>

      {/* Stats bar */}
      {stats && stats.totalSessions > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Sessions" value={stats.totalSessions} />
          <StatCard
            label="Success Rate"
            value={`${Math.round((stats.completedCount / stats.totalSessions) * 100)}%`}
            sub={`${stats.completedCount} completed`}
          />
          <StatCard
            label="Avg Duration"
            value={formatDuration(stats.avgDurationMs)}
          />
          <StatCard
            label="Avg Tool Calls"
            value={stats.avgToolCalls.toFixed(1)}
            sub={stats.mostUsedTools[0] ? `Top: ${stats.mostUsedTools[0].tool}` : undefined}
          />
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Session list */}
        <div className={`${selectedId ? "lg:w-80 shrink-0" : "w-full"} space-y-3`}>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search sessions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              />
            </div>
            {(["all", "completed", "failed", "reverted"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filter === f
                    ? "border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-300"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                {f === "all" ? `All (${sessions.length})` : f}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-8">No sessions found</p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedId === s.id
                      ? "border-rose-500/50 bg-rose-500/5 dark:bg-rose-500/10 shadow-sm"
                      : "border-zinc-200 dark:border-zinc-700/50 hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      {statusIcon(s.status)}
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(s.startedAt)} {formatTime(s.startedAt)}
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                  </div>
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-snug">
                    {s.summary}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(s.durationMs)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      {s.toolCallCount} calls
                    </span>
                    {s.genome && (
                      <span className="flex items-center gap-1">
                        <Dna className="w-3 h-3" />
                        {s.genome.focus}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="flex-1 min-w-0">
            {detailLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : detail ? (
              <div className="space-y-4">
                {/* Detail header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => { setSelectedId(null); setDetail(null); stopReplay(); }}
                        className="lg:hidden p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {statusBadge(detail.status)}
                      <span className="text-xs text-zinc-400 font-mono">
                        {detail.id.slice(0, 8)}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                      {detail.summary}
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      {formatDate(detail.startedAt)} {formatTime(detail.startedAt)} — {formatTime(detail.completedAt)} ({formatDuration(detail.durationMs)})
                    </p>
                  </div>
                </div>

                {/* Genome info */}
                {detail.genome && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-300">
                      Gen {detail.genome.generation}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-300">
                      {detail.genome.focus}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
                      Ambition: {detail.genome.ambition}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
                      Creativity: {detail.genome.creativity}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-zinc-500/10 text-zinc-600 dark:text-zinc-300">
                      Thoroughness: {detail.genome.thoroughness}
                    </span>
                  </div>
                )}

                {/* Tool usage summary */}
                <div className="flex flex-wrap gap-1.5">
                  {detail.toolsUsed.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono"
                    >
                      {t}
                    </span>
                  ))}
                  <span className="text-xs text-zinc-400 py-0.5">
                    {detail.toolCallCount} tool calls, {detail.eventCount} events
                  </span>
                </div>

                {/* Replay controls */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                  <button
                    onClick={replaying ? stopReplay : startReplay}
                    className="p-1.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 transition-colors"
                  >
                    {replaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      stopReplay();
                      setReplayIndex(detail.events.length);
                    }}
                    className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 transition-colors"
                    title="Show all"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                  <div className="flex-1 mx-2">
                    <input
                      type="range"
                      min={0}
                      max={detail.events.length}
                      value={replaying ? replayIndex : (replayIndex || detail.events.length)}
                      onChange={(e) => {
                        stopReplay();
                        setReplayIndex(parseInt(e.target.value));
                      }}
                      className="w-full h-1.5 rounded-full appearance-none bg-zinc-200 dark:bg-zinc-700 accent-rose-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs text-zinc-400 font-mono tabular-nums min-w-[5ch] text-right">
                    {replaying ? replayIndex : (replayIndex || detail.events.length)}/{detail.events.length}
                  </span>
                  <select
                    value={replaySpeed}
                    onChange={(e) => setReplaySpeed(parseInt(e.target.value))}
                    className="text-xs px-1.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                  >
                    <option value={1}>1x</option>
                    <option value={3}>3x</option>
                    <option value={5}>5x</option>
                    <option value={10}>10x</option>
                  </select>
                </div>

                {/* Event timeline */}
                <div
                  ref={eventListRef}
                  className="max-h-[calc(100vh-520px)] overflow-y-auto space-y-0.5 pr-1"
                >
                  {collapsedEvents.length === 0 && !replaying ? (
                    <p className="text-sm text-zinc-400 text-center py-8">
                      Press play to replay the session
                    </p>
                  ) : (
                    collapsedEvents.map((evt, i) => (
                      <EventRow key={evt.id} event={evt} isNew={replaying && i >= collapsedEvents.length - replaySpeed} />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400 text-center py-20">
                Session not found
              </p>
            )}
          </div>
        )}

        {/* Empty state when no session selected */}
        {!selectedId && sessions.length > 0 && (
          <div className="hidden lg:flex flex-1 items-center justify-center text-zinc-400">
            <div className="text-center">
              <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a session to view its replay</p>
            </div>
          </div>
        )}
      </div>

      {sessions.length === 0 && !loading && (
        <div className="text-center py-20">
          <History className="w-12 h-12 mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
          <h2 className="text-lg font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            No sessions yet
          </h2>
          <p className="text-sm text-zinc-400">
            Sessions will appear here after the self-improve agent runs
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/50">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">{label}</p>
      <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

type CollapsedEvent = ActivityEvent & { collapsed?: number };

function collapseThinking(events: ActivityEvent[]): CollapsedEvent[] {
  const result: CollapsedEvent[] = [];
  for (const evt of events) {
    const prev = result[result.length - 1];
    // Merge consecutive thinking events
    if (
      prev &&
      prev.kind === "thinking" &&
      evt.kind === "thinking"
    ) {
      result[result.length - 1] = {
        ...prev,
        content: prev.content + evt.content,
        collapsed: (prev.collapsed ?? 1) + 1,
      };
    } else {
      result.push({ ...evt });
    }
  }
  return result;
}

function EventRow({ event, isNew }: { event: CollapsedEvent; isNew: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const content = event.content;
  const isLong = content.length > 200;
  const displayContent = expanded ? content : content.slice(0, 200);

  const kindLabel =
    event.kind === "tool_call"
      ? event.tool ?? "tool_call"
      : event.kind === "tool_result"
        ? "result"
        : event.kind;

  const kindColor =
    event.kind === "thinking"
      ? "text-purple-500/60"
      : event.kind === "tool_call"
        ? "text-blue-500/80"
        : event.kind === "tool_result"
          ? "text-cyan-500/60"
          : event.kind === "error"
            ? "text-red-500/80"
            : "text-zinc-500/60";

  return (
    <div
      className={`group flex gap-2 px-2 py-1 rounded text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
        isNew ? "bg-rose-50/50 dark:bg-rose-500/5" : ""
      }`}
    >
      <div className="mt-1">{eventIcon(event.kind, event.tool)}</div>
      <div className="min-w-0 flex-1">
        <span className={`text-[10px] font-mono uppercase tracking-wider ${kindColor}`}>
          {kindLabel}
          {event.collapsed && event.collapsed > 1 ? ` (${event.collapsed} merged)` : ""}
        </span>
        <p
          className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${
            event.kind === "thinking"
              ? "text-purple-700/70 dark:text-purple-300/60 italic"
              : event.kind === "error"
                ? "text-red-700 dark:text-red-300"
                : "text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {displayContent}
          {isLong && !expanded && "..."}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-rose-500 hover:text-rose-600 mt-0.5"
          >
            {expanded ? "show less" : `show more (${content.length} chars)`}
          </button>
        )}
      </div>
    </div>
  );
}
