"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  GitCommit,
  Loader2,
  Check,
  FileCode,
  Plus,
  Minus,
  ChevronRight,
  X,
  PartyPopper,
  BarChart3,
  TrendingUp,
  Clock,
  Zap,
  Volume2,
  VolumeX,
  Send,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  ShieldAlert,
  Undo2,
  Brain,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { dispatchAmbientEvent } from "./ambient-canvas";
import { playCommitChimeIfUnmuted, isSoundMuted, setSoundMuted } from "@/lib/commit-sound";
import { useEventBus } from "@/hooks/use-event-bus";

type AgentStatus = {
  enabled: boolean;
  running: boolean;
  entries: { id: string; startedAt: string; status: string }[];
  suggestion: string;
};

type ActivityEvent = {
  id: number;
  ts: number;
  kind: "thinking" | "tool_call" | "tool_result" | "text" | "error";
  content: string;
  tool?: string;
};

/** Coalesce consecutive text/thinking events into single display lines */
type DisplayLine = {
  id: number;
  kind: ActivityEvent["kind"];
  content: string;
  tool?: string;
  ts: number;
};

type Commit = {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
  additions?: number;
  deletions?: number;
};

type BuildHealth = {
  lastCheck: string;
  passed: boolean;
  errors: string;
  commitHash: string;
  reverted: boolean;
};

type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
};

type CommitDiff = {
  hash: string;
  message: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function elapsed(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// ── Celebration sub-components ─────────────────────────────────────────────────

/** A single confetti particle that animates from origin and fades out. */
function ConfettiParticle({ index, total }: { index: number; total: number }) {
  const style = useMemo(() => {
    const angle = (index / total) * 360 + (Math.random() - 0.5) * 30;
    const distance = 40 + Math.random() * 60;
    const rad = (angle * Math.PI) / 180;
    const tx = Math.cos(rad) * distance;
    const ty = Math.sin(rad) * distance - 20; // bias upward
    const rotation = Math.random() * 720 - 360;
    const size = 3 + Math.random() * 4;
    const colors = [
      "#34d399", // emerald-400
      "#6ee7b7", // emerald-300
      "#fbbf24", // amber-400
      "#a78bfa", // violet-400
      "#60a5fa", // blue-400
      "#f472b6", // pink-400
      "#fb923c", // orange-400
    ];
    const color = colors[index % colors.length];
    const delay = Math.random() * 80;
    const duration = 600 + Math.random() * 400;
    const isRound = Math.random() > 0.5;

    return {
      position: "absolute" as const,
      bottom: "50%",
      right: "50%",
      width: isRound ? size : size * 0.6,
      height: isRound ? size : size * 1.4,
      borderRadius: isRound ? "50%" : "1px",
      backgroundColor: color,
      animation: `confettiParticleBurst ${duration}ms ${delay}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
      "--tx": `${tx}px`,
      "--ty": `${ty}px`,
      "--rot": `${rotation}deg`,
      opacity: 0,
    } as React.CSSProperties;
  }, [index, total]);

  return <span style={style} />;
}

/** Burst of confetti particles emanating from the pill. */
function ConfettiBurst({ count = 18 }: { count?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-10">
      {Array.from({ length: count }, (_, i) => (
        <ConfettiParticle key={i} index={i} total={count} />
      ))}
    </div>
  );
}

/** Toast notification that slides up when a new commit lands. */
function CommitToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="commit-toast-in mb-1 flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-emerald-500/20 bg-neutral-900/92 backdrop-blur-md shadow-2xl max-w-72">
      <PartyPopper
        size={14}
        className="text-emerald-400 flex-shrink-0 mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wider mb-0.5">
          New improvement
        </p>
        <p className="text-xs text-white/80 leading-snug line-clamp-2">
          {message}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="p-0.5 text-white/20 hover:text-white/60 transition-colors flex-shrink-0 mt-0.5"
      >
        <X size={10} />
      </button>
    </div>
  );
}

// ── Diff viewer sub-components ─────────────────────────────────────────────────

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return (
      <div className="diff-line-add px-2 py-0 font-mono text-[10px] leading-[18px] text-emerald-300 bg-emerald-500/10 whitespace-pre overflow-x-auto">
        {line}
      </div>
    );
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return (
      <div className="diff-line-del px-2 py-0 font-mono text-[10px] leading-[18px] text-red-300 bg-red-500/10 whitespace-pre overflow-x-auto">
        {line}
      </div>
    );
  }
  if (line.startsWith("@@")) {
    return (
      <div className="px-2 py-0 font-mono text-[10px] leading-[18px] text-blue-300/60 bg-blue-500/5 whitespace-pre overflow-x-auto">
        {line}
      </div>
    );
  }
  return (
    <div className="px-2 py-0 font-mono text-[10px] leading-[18px] text-white/40 whitespace-pre overflow-x-auto">
      {line}
    </div>
  );
}

function FileDiffView({
  file,
  defaultExpanded,
}: {
  file: DiffFile;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const filename = file.path.split("/").pop() ?? file.path;
  const dir = file.path.includes("/")
    ? file.path.slice(0, file.path.lastIndexOf("/") + 1)
    : "";

  // Parse the patch to get only the diff body lines (skip the header)
  const patchLines = (file.patch || "")
    .split("\n")
    .filter((line) => {
      // Skip the diff --git header, index line, and --- / +++ lines
      if (line.startsWith("diff --git")) return false;
      if (line.startsWith("index ")) return false;
      if (line.startsWith("--- ")) return false;
      if (line.startsWith("+++ ")) return false;
      if (line.startsWith("new file mode")) return false;
      if (line.startsWith("deleted file mode")) return false;
      if (line.startsWith("\\ No newline")) return false;
      return true;
    });

  return (
    <div className="border-t border-white/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 transition-colors group/file"
      >
        <ChevronRight
          size={10}
          className={`text-white/30 transition-transform duration-150 flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
        <FileCode size={11} className="text-white/30 flex-shrink-0" />
        <span className="text-[10px] text-white/30 truncate">{dir}</span>
        <span className="text-[10px] text-white/70 font-medium truncate">
          {filename}
        </span>
        <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {file.additions > 0 && (
            <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-0.5">
              <Plus size={8} />
              {file.additions}
            </span>
          )}
          {file.deletions > 0 && (
            <span className="text-[9px] text-red-400 font-mono flex items-center gap-0.5">
              <Minus size={8} />
              {file.deletions}
            </span>
          )}
        </span>
      </button>
      {expanded && patchLines.length > 0 && (
        <div className="max-h-48 overflow-y-auto bg-black/20 border-t border-white/5">
          {patchLines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommitDiffPanel({
  hash,
  onClose,
}: {
  hash: string;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/self-improve/commits/${hash}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch diff");
        return res.json() as Promise<CommitDiff>;
      })
      .then(setDiff)
      .catch(() => setError("Could not load diff"))
      .finally(() => setLoading(false));
  }, [hash]);

  return (
    <div className="diff-panel-in">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2 min-w-0">
          <GitCommit size={11} className="text-white/40 flex-shrink-0" />
          <span className="text-[10px] font-mono text-white/40 flex-shrink-0">
            {hash.slice(0, 7)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-8 flex items-center justify-center gap-2">
          <Loader2 size={12} className="text-white/30 animate-spin" />
          <span className="text-[11px] text-white/30">Loading diff…</span>
        </div>
      ) : error ? (
        <div className="py-6 text-center text-[11px] text-red-400/70">
          {error}
        </div>
      ) : diff ? (
        <>
          {/* Summary bar */}
          <div className="px-3 py-1.5 flex items-center gap-3 text-[10px] text-white/40 border-b border-white/5">
            <span>
              {diff.files.length} file{diff.files.length !== 1 ? "s" : ""}
            </span>
            {diff.totalAdditions > 0 && (
              <span className="text-emerald-400/70 font-mono flex items-center gap-0.5">
                <Plus size={8} />
                {diff.totalAdditions}
              </span>
            )}
            {diff.totalDeletions > 0 && (
              <span className="text-red-400/70 font-mono flex items-center gap-0.5">
                <Minus size={8} />
                {diff.totalDeletions}
              </span>
            )}
          </div>

          {/* File list with inline diffs */}
          <div className="max-h-72 overflow-y-auto">
            {diff.files.map((file, i) => (
              <FileDiffView
                key={file.path}
                file={file}
                defaultExpanded={i === 0 && diff.files.length <= 5}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Activity feed sub-component ─────────────────────────────────────────────

function coalesceEvents(events: ActivityEvent[]): DisplayLine[] {
  const lines: DisplayLine[] = [];
  for (const evt of events) {
    // Coalesce consecutive text or thinking deltas
    const last = lines[lines.length - 1];
    if (
      last &&
      last.kind === evt.kind &&
      (evt.kind === "text" || evt.kind === "thinking")
    ) {
      last.content += evt.content;
      last.ts = evt.ts;
      continue;
    }
    lines.push({
      id: evt.id,
      kind: evt.kind,
      content: evt.content,
      tool: evt.tool,
      ts: evt.ts,
    });
  }
  return lines;
}

function ActivityLine({ line }: { line: DisplayLine }) {
  if (line.kind === "tool_call") {
    // Truncate long tool inputs
    const preview = line.content.length > 120
      ? line.content.slice(0, 120) + "..."
      : line.content;
    return (
      <div className="flex items-start gap-1.5 px-2.5 py-1 text-[10px] leading-[16px] font-mono border-l-2 border-blue-400/40 bg-blue-500/5">
        <span className="text-blue-400 font-semibold flex-shrink-0 uppercase text-[9px] mt-px">
          {line.tool ?? "tool"}
        </span>
        <span className="text-white/50 truncate">{preview}</span>
      </div>
    );
  }

  if (line.kind === "tool_result") {
    const preview = line.content.length > 200
      ? line.content.slice(0, 200) + "..."
      : line.content;
    return (
      <div className="px-2.5 py-1 text-[10px] leading-[16px] font-mono text-white/30 border-l-2 border-emerald-500/30 bg-emerald-500/5 truncate">
        {preview}
      </div>
    );
  }

  if (line.kind === "thinking") {
    const preview = line.content.length > 300
      ? line.content.slice(-300)
      : line.content;
    return (
      <div className="px-2.5 py-1 text-[10px] leading-[16px] text-violet-300/60 italic border-l-2 border-violet-400/30">
        {preview}
      </div>
    );
  }

  if (line.kind === "error") {
    return (
      <div className="px-2.5 py-1 text-[10px] leading-[16px] text-red-400/80 border-l-2 border-red-400/40">
        {line.content}
      </div>
    );
  }

  // kind === "text"
  const preview = line.content.length > 300
    ? line.content.slice(-300)
    : line.content;
  return (
    <div className="px-2.5 py-1 text-[10px] leading-[16px] text-white/60">
      {preview}
    </div>
  );
}

function ActivityFeed({ isRunning }: { isRunning: boolean }) {
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const cursorRef = useRef<number>(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Fetch initial activity events, then listen via SSE
  useEffect(() => {
    if (!isRunning && lines.length === 0) return;
    let cancelled = false;

    async function fetchInitial() {
      try {
        const url = cursorRef.current >= 0
          ? `/api/self-improve/activity?since=${cursorRef.current}`
          : "/api/self-improve/activity";
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { events: ActivityEvent[]; running: boolean };
        if (data.events.length > 0) {
          cursorRef.current = data.events[data.events.length - 1].id;
          setLines(coalesceEvents(data.events));
        }
      } catch { /* ignore */ }
    }

    fetchInitial();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for real-time activity events via SSE
  useEventBus("self-improve:activity", useCallback((raw: unknown) => {
    const data = raw as { events: ActivityEvent[]; running: boolean };
    if (data.events.length > 0) {
      cursorRef.current = data.events[data.events.length - 1].id;
      setLines((prev) => {
        const newLines = coalesceEvents(data.events);
        const merged = [...prev];

        for (const nl of newLines) {
          const last = merged[merged.length - 1];
          if (
            last &&
            last.kind === nl.kind &&
            (nl.kind === "text" || nl.kind === "thinking")
          ) {
            last.content += nl.content;
            last.ts = nl.ts;
          } else {
            merged.push(nl);
          }
        }

        if (merged.length > 100) {
          merged.splice(0, merged.length - 100);
        }
        return merged;
      });
    }
  }, []));

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Detect if user has scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    autoScrollRef.current = atBottom;
  }, []);

  if (lines.length === 0 && !isRunning) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-white/20">
        Activity will appear here when the agent runs.
      </div>
    );
  }

  if (lines.length === 0 && isRunning) {
    return (
      <div className="px-4 py-6 flex items-center justify-center gap-2">
        <Loader2 size={12} className="text-emerald-400/50 animate-spin" />
        <span className="text-[11px] text-white/30">Waiting for agent output...</span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="max-h-52 overflow-y-auto overflow-x-hidden divide-y divide-white/[0.03] bg-black/30"
    >
      {lines.map((line, i) => (
        <ActivityLine key={`${line.id}-${i}`} line={line} />
      ))}
    </div>
  );
}

// ── Live working diff panel ──────────────────────────────────────────────────

type WorkingDiffFile = {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch: string;
};

type WorkingDiffData = {
  files: WorkingDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  isEmpty: boolean;
};

function WorkingDiffPanel({ isRunning }: { isRunning: boolean }) {
  const [diff, setDiff] = useState<WorkingDiffData | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDiff = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve/working-diff");
      if (res.ok) {
        const data = (await res.json()) as WorkingDiffData;
        setDiff(data);
      }
    } catch {
      // ignore
    }
  }, []);

  // Poll while the agent is running
  useEffect(() => {
    fetchDiff(); // initial fetch

    if (isRunning) {
      intervalRef.current = setInterval(fetchDiff, 3000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, fetchDiff]);

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (!diff || diff.isEmpty) {
    if (!isRunning) return null;
    return (
      <div className="border-t border-white/[0.06]">
        <div className="px-3 py-2 flex items-center gap-2 text-[10px] text-white/20">
          <FileCode size={10} className="text-white/15" />
          <span>No uncommitted changes yet</span>
        </div>
      </div>
    );
  }

  const statusIcon = (s: WorkingDiffFile["status"]) => {
    switch (s) {
      case "added": return <span className="text-[8px] font-bold text-emerald-400 bg-emerald-400/15 rounded px-1">A</span>;
      case "deleted": return <span className="text-[8px] font-bold text-red-400 bg-red-400/15 rounded px-1">D</span>;
      case "renamed": return <span className="text-[8px] font-bold text-blue-400 bg-blue-400/15 rounded px-1">R</span>;
      default: return <span className="text-[8px] font-bold text-amber-400 bg-amber-400/15 rounded px-1">M</span>;
    }
  };

  return (
    <div className="border-t border-amber-500/20 bg-amber-950/10">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        <ChevronRight
          size={10}
          className={`text-amber-400/50 transition-transform duration-150 flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
        <FileCode size={11} className="text-amber-400/60 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider">
          Working Changes
        </span>
        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
          <span className="text-[9px] text-white/30">
            {diff.files.length} file{diff.files.length !== 1 ? "s" : ""}
          </span>
          {diff.totalAdditions > 0 && (
            <span className="text-[9px] text-emerald-400/70 font-mono flex items-center gap-0.5">
              <Plus size={7} />
              {diff.totalAdditions}
            </span>
          )}
          {diff.totalDeletions > 0 && (
            <span className="text-[9px] text-red-400/70 font-mono flex items-center gap-0.5">
              <Minus size={7} />
              {diff.totalDeletions}
            </span>
          )}
          {isRunning && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
            </span>
          )}
        </span>
      </button>

      {/* File list with inline diffs */}
      {expanded && (
        <div className="max-h-48 overflow-y-auto border-t border-white/[0.04]">
          {diff.files.map((file) => {
            const isFileExpanded = expandedFiles.has(file.path);
            const filename = file.path.split("/").pop() ?? file.path;
            const dir = file.path.includes("/")
              ? file.path.slice(0, file.path.lastIndexOf("/") + 1)
              : "";
            const patchLines = (file.patch || "")
              .split("\n")
              .filter((line) => {
                if (line.startsWith("diff --git")) return false;
                if (line.startsWith("index ")) return false;
                if (line.startsWith("--- ")) return false;
                if (line.startsWith("+++ ")) return false;
                if (line.startsWith("new file mode")) return false;
                if (line.startsWith("deleted file mode")) return false;
                if (line.startsWith("\\ No newline")) return false;
                return true;
              });

            return (
              <div key={file.path} className="border-t border-white/[0.03] first:border-t-0">
                <button
                  onClick={() => toggleFile(file.path)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/[0.03] transition-colors group/wfile"
                >
                  <ChevronRight
                    size={9}
                    className={`text-white/20 transition-transform duration-150 flex-shrink-0 ${isFileExpanded ? "rotate-90" : ""}`}
                  />
                  {statusIcon(file.status)}
                  <span className="text-[9px] text-white/25 truncate">{dir}</span>
                  <span className="text-[10px] text-white/60 font-medium truncate">
                    {filename}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                    {file.additions > 0 && (
                      <span className="text-[9px] text-emerald-400/60 font-mono">
                        +{file.additions}
                      </span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-[9px] text-red-400/60 font-mono">
                        -{file.deletions}
                      </span>
                    )}
                  </span>
                </button>
                {isFileExpanded && patchLines.length > 0 && (
                  <div className="max-h-40 overflow-y-auto bg-black/20 border-t border-white/[0.03]">
                    {patchLines.map((line, i) => (
                      <DiffLine key={i} line={line} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Stats tab sub-components ─────────────────────────────────────────────────

/** Mini SVG area-chart sparkline of lines changed per commit. */
function CommitSparkline({ commits }: { commits: Commit[] }) {
  // Reverse so oldest is on the left, newest on right
  const data = [...commits].reverse().map((c) => (c.additions ?? 0) + (c.deletions ?? 0));

  if (data.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center text-[10px] text-white/20">
        Need at least 2 commits for a chart.
      </div>
    );
  }

  const W = 264;
  const H = 56;
  const PAD_TOP = 4;
  const PAD_BOT = 2;
  const max = Math.max(...data, 1);
  const stepX = W / (data.length - 1);

  const points = data.map((v, i) => ({
    x: i * stepX,
    y: PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOT),
  }));

  // Build the area path (line + fill down to bottom)
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div className="px-3 pt-2 pb-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="sparkStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1="0"
            y1={PAD_TOP + frac * (H - PAD_TOP - PAD_BOT)}
            x2={W}
            y2={PAD_TOP + frac * (H - PAD_TOP - PAD_BOT)}
            stroke="white"
            strokeOpacity="0.04"
            strokeWidth="0.5"
          />
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#sparkFill)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="url(#sparkStroke)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots on each point */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 2.5 : 1.5}
            fill={i === points.length - 1 ? "#34d399" : "#34d399"}
            fillOpacity={i === points.length - 1 ? 1 : 0.5}
          />
        ))}
        {/* Glow on latest point */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="6" fill="#34d399" fillOpacity="0.15" />
      </svg>
      <div className="flex justify-between text-[8px] text-white/20 px-0.5 -mt-0.5">
        <span>oldest</span>
        <span>latest</span>
      </div>
    </div>
  );
}

/** A single metric card for the stats grid. */
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className={color}>{icon}</span>
        <span className="text-[9px] uppercase tracking-wider text-white/30 font-semibold">{label}</span>
      </div>
      <span className="text-sm font-bold text-white/80 font-mono tabular-nums">{value}</span>
      {sub && <span className="text-[9px] text-white/25">{sub}</span>}
    </div>
  );
}

// ── File hotspots (most-modified files) ─────────────────────────────────────

type FileHotspot = {
  path: string;
  changes: number;
  additions: number;
  deletions: number;
  commitCount: number;
  lastModified: string;
};

/** Color for a file path based on its directory. */
function hotspotColor(filePath: string): string {
  if (filePath.startsWith("src/components/")) return "bg-blue-400";
  if (filePath.startsWith("src/app/api/")) return "bg-violet-400";
  if (filePath.startsWith("src/app/")) return "bg-emerald-400";
  if (filePath.startsWith("src/lib/")) return "bg-amber-400";
  if (filePath.startsWith("src/hooks/")) return "bg-cyan-400";
  if (filePath.endsWith(".css")) return "bg-pink-400";
  if (filePath.endsWith(".json")) return "bg-orange-400";
  if (filePath.endsWith(".md")) return "bg-gray-400";
  return "bg-white/40";
}

function hotspotColorText(filePath: string): string {
  if (filePath.startsWith("src/components/")) return "text-blue-400/70";
  if (filePath.startsWith("src/app/api/")) return "text-violet-400/70";
  if (filePath.startsWith("src/app/")) return "text-emerald-400/70";
  if (filePath.startsWith("src/lib/")) return "text-amber-400/70";
  if (filePath.startsWith("src/hooks/")) return "text-cyan-400/70";
  if (filePath.endsWith(".css")) return "text-pink-400/70";
  return "text-white/40";
}

function FileHotspotsChart() {
  const [hotspots, setHotspots] = useState<FileHotspot[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/self-improve/hotspots");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { files: FileHotspot[]; totalFiles: number };
        setHotspots(data.files);
        setTotalFiles(data.totalFiles);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="px-3 py-4 flex items-center justify-center gap-2">
        <Loader2 size={10} className="text-white/20 animate-spin" />
        <span className="text-[10px] text-white/20">Loading hotspots…</span>
      </div>
    );
  }

  if (hotspots.length === 0) {
    return null;
  }

  const maxChanges = hotspots[0]?.changes ?? 1;
  const visibleCount = expanded ? hotspots.length : Math.min(8, hotspots.length);
  const visible = hotspots.slice(0, visibleCount);

  return (
    <div className="border-t border-white/[0.06]">
      {/* Section header */}
      <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-1.5">
        <FileCode size={10} className="text-white/25" />
        <span className="text-[9px] uppercase tracking-wider text-white/30 font-semibold">
          File Hotspots
        </span>
        <span className="text-[9px] text-white/15 ml-auto">
          {totalFiles} files touched
        </span>
      </div>

      {/* Bar chart */}
      <div className="px-3 pb-1 space-y-[3px]">
        {visible.map((file) => {
          const filename = file.path.split("/").pop() ?? file.path;
          const dir = file.path.includes("/")
            ? file.path.slice(0, file.path.lastIndexOf("/") + 1)
            : "";
          const pct = Math.max(3, (file.changes / maxChanges) * 100);
          const barColor = hotspotColor(file.path);
          const textColor = hotspotColorText(file.path);

          return (
            <div key={file.path} className="group/hotspot">
              {/* File name row */}
              <div className="flex items-center gap-1.5 mb-[1px]">
                <span className="text-[8px] text-white/15 truncate max-w-[100px]" title={dir}>
                  {dir}
                </span>
                <span className={`text-[9px] font-medium truncate ${textColor}`} title={file.path}>
                  {filename}
                </span>
                <span className="text-[8px] text-white/15 ml-auto flex-shrink-0 flex items-center gap-1.5 font-mono tabular-nums">
                  <span className="text-emerald-400/50">+{file.additions}</span>
                  <span className="text-red-400/50">−{file.deletions}</span>
                  <span className="text-white/20">{file.commitCount}×</span>
                </span>
              </div>
              {/* Bar */}
              <div className="h-[4px] bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} opacity-50 group-hover/hotspot:opacity-80 transition-opacity duration-150`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {hotspots.length > 8 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full py-1.5 text-center text-[9px] text-white/20 hover:text-white/40 transition-colors"
        >
          {expanded ? "Show less" : `Show all ${hotspots.length} files`}
        </button>
      )}

      {/* Legend */}
      <div className="px-3 pb-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
        {[
          ["src/components/", "bg-blue-400", "Components"],
          ["src/app/api/", "bg-violet-400", "API"],
          ["src/app/", "bg-emerald-400", "Pages"],
          ["src/lib/", "bg-amber-400", "Lib"],
        ].map(([, color, label]) => (
          <div key={label} className="flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-sm ${color} opacity-50`} />
            <span className="text-[8px] text-white/20">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full stats panel content. */
function StatsPanel({ commits }: { commits: Commit[] }) {
  const totalAdds = commits.reduce((sum, c) => sum + (c.additions ?? 0), 0);
  const totalDels = commits.reduce((sum, c) => sum + (c.deletions ?? 0), 0);
  const totalChanges = totalAdds + totalDels;

  // Time span
  const dates = commits.map((c) => new Date(c.date).getTime()).filter(Boolean);
  const oldest = dates.length > 0 ? Math.min(...dates) : 0;
  const newest = dates.length > 0 ? Math.max(...dates) : 0;
  const spanMs = newest - oldest;
  const spanHours = spanMs / 3_600_000;

  // Pace: commits per hour
  const pace = spanHours > 0 ? commits.length / spanHours : 0;
  const paceStr = pace >= 1 ? `${pace.toFixed(1)}/hr` : pace > 0 ? `${(pace * 24).toFixed(1)}/day` : "—";

  // Time span human-readable
  let spanStr = "—";
  if (spanMs > 0) {
    const hours = Math.floor(spanHours);
    const mins = Math.floor((spanMs % 3_600_000) / 60_000);
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      spanStr = `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      spanStr = `${hours}h ${mins}m`;
    } else {
      spanStr = `${mins}m`;
    }
  }

  // Average lines per commit
  const avgLines = commits.length > 0 ? Math.round(totalChanges / commits.length) : 0;

  if (commits.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[11px] text-white/20">
        No data yet. Stats appear after commits are made.
      </div>
    );
  }

  return (
    <div className="stats-panel-in">
      {/* Sparkline chart */}
      <CommitSparkline commits={commits} />

      {/* Legend */}
      <div className="px-3 pb-1.5 flex items-center gap-1.5">
        <span className="inline-block w-2 h-[2px] rounded bg-emerald-400/70" />
        <span className="text-[9px] text-white/30">Lines changed per commit</span>
      </div>

      {/* Stats grid */}
      <div className="px-3 pb-3 grid grid-cols-2 gap-2">
        <StatCard
          icon={<GitCommit size={10} />}
          label="Commits"
          value={commits.length.toString()}
          sub={`~${avgLines} lines/commit`}
          color="text-emerald-400/70"
        />
        <StatCard
          icon={<Zap size={10} />}
          label="Pace"
          value={paceStr}
          sub={spanStr !== "—" ? `over ${spanStr}` : undefined}
          color="text-amber-400/70"
        />
        <StatCard
          icon={<TrendingUp size={10} />}
          label="Added"
          value={`+${totalAdds.toLocaleString()}`}
          color="text-emerald-400/70"
        />
        <StatCard
          icon={<Clock size={10} />}
          label="Removed"
          value={`−${totalDels.toLocaleString()}`}
          sub={totalChanges > 0 ? `${Math.round((totalAdds / totalChanges) * 100)}% adds` : undefined}
          color="text-red-400/70"
        />
      </div>

      {/* File hotspots */}
      <FileHotspotsChart />
    </div>
  );
}

// ── Genome panel ────────────────────────────────────────────────────────────

type GenomeData = {
  id: string;
  generation: number;
  focus: string;
  ambition: number;
  creativity: number;
  thoroughness: number;
  fitness: number;
  timesUsed: number;
  parentId: string | null;
};

type EvolutionSnapshotData = {
  generation: number;
  timestamp: string;
  avgFitness: number;
  bestFitness: number;
  worstFitness: number;
  dominantFocus: string;
  focusDistribution: Record<string, number>;
  populationSize: number;
  eliminated: number;
  survivorIds: string[];
};

type GenePoolData = {
  genomes: GenomeData[];
  generationCount: number;
  activeGenomeId: string | null;
  totalSessions: number;
  evolutionHistory: EvolutionSnapshotData[];
};

const FOCUS_COLORS: Record<string, string> = {
  "visual-polish": "text-pink-400",
  "code-quality": "text-blue-400",
  "new-feature": "text-emerald-400",
  "ux-enhancement": "text-amber-400",
  "meta-improvement": "text-violet-400",
  "bug-fix": "text-red-400",
  performance: "text-cyan-400",
};

const FOCUS_ICONS: Record<string, string> = {
  "visual-polish": "🎨",
  "code-quality": "🧹",
  "new-feature": "✨",
  "ux-enhancement": "🖱️",
  "meta-improvement": "🧬",
  "bug-fix": "🐛",
  performance: "⚡",
};

/** A single gene bar showing a 0–1 value with color gradient. */
function GeneBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-white/30 w-20 text-right font-medium uppercase tracking-wider">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      </div>
      <span className="text-[9px] text-white/20 w-6 font-mono">{value.toFixed(2)}</span>
    </div>
  );
}

/** A mini genome card showing focus + genes + fitness. */
function GenomeCard({
  genome,
  isActive,
  rank,
}: {
  genome: GenomeData;
  isActive: boolean;
  rank: number;
}) {
  const avgFitness =
    genome.timesUsed > 0
      ? (genome.fitness / genome.timesUsed).toFixed(2)
      : "—";
  const focusColor = FOCUS_COLORS[genome.focus] ?? "text-white/50";
  const focusIcon = FOCUS_ICONS[genome.focus] ?? "🔵";

  return (
    <div
      className={[
        "px-3 py-2 border-b border-white/[0.04] transition-colors",
        isActive
          ? "bg-emerald-950/30 border-l-2 border-l-emerald-400/60"
          : "hover:bg-white/[0.02]",
      ].join(" ")}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] text-white/15 font-mono w-4">#{rank}</span>
        <span className="text-xs">{focusIcon}</span>
        <span className={`text-[10px] font-medium ${focusColor}`}>
          {genome.focus}
        </span>
        <span className="text-[9px] text-white/15 font-mono ml-auto">
          Gen {genome.generation}
        </span>
        {isActive && (
          <span className="relative flex h-1.5 w-1.5 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        )}
      </div>

      {/* Gene bars */}
      <div className="space-y-1 mb-1.5">
        <GeneBar label="Ambition" value={genome.ambition} color="bg-amber-400/70" />
        <GeneBar label="Creative" value={genome.creativity} color="bg-violet-400/70" />
        <GeneBar label="Thorough" value={genome.thoroughness} color="bg-cyan-400/70" />
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 text-[9px] text-white/20">
        <span>
          Fitness:{" "}
          <span
            className={
              genome.fitness > 0
                ? "text-emerald-400/70"
                : genome.fitness < 0
                  ? "text-red-400/70"
                  : "text-white/30"
            }
          >
            {genome.fitness > 0 ? "+" : ""}
            {genome.fitness.toFixed(1)}
          </span>
        </span>
        <span>Avg: {avgFitness}</span>
        <span>Used: {genome.timesUsed}×</span>
        <span className="font-mono text-white/10 ml-auto">
          {genome.id.slice(0, 6)}
        </span>
      </div>
    </div>
  );
}

// ── Fitness Evolution Timeline ─────────────────────────────────────────────

const FOCUS_STROKE_COLORS: Record<string, string> = {
  "visual-polish": "#f472b6",
  "code-quality": "#60a5fa",
  "new-feature": "#34d399",
  "ux-enhancement": "#fbbf24",
  "meta-improvement": "#a78bfa",
  "bug-fix": "#f87171",
  performance: "#22d3ee",
};

function FitnessTimeline({ history }: { history: EvolutionSnapshotData[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (history.length < 2) {
    return (
      <div className="px-3 py-3 text-center">
        <p className="text-[9px] text-white/20">
          Fitness timeline appears after 2+ evolution cycles.
        </p>
        <p className="text-[8px] text-white/10 mt-0.5">
          Evolution triggers every 3 sessions.
        </p>
      </div>
    );
  }

  // Chart dimensions
  const W = 320;
  const H = 100;
  const PAD_L = 6;
  const PAD_R = 6;
  const PAD_T = 12;
  const PAD_B = 16;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  // Compute ranges
  const allValues = history.flatMap((h) => [h.bestFitness, h.worstFitness, h.avgFitness]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(1, ...allValues);
  const range = maxVal - minVal || 1;

  const xScale = (i: number) => PAD_L + (i / (history.length - 1)) * chartW;
  const yScale = (v: number) => PAD_T + chartH - ((v - minVal) / range) * chartH;

  // Build path strings
  const buildPath = (getter: (s: EvolutionSnapshotData) => number) =>
    history
      .map((s, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(getter(s)).toFixed(1)}`)
      .join(" ");

  const bestPath = buildPath((s) => s.bestFitness);
  const avgPath = buildPath((s) => s.avgFitness);
  const worstPath = buildPath((s) => s.worstFitness);

  // Build filled area between best and worst
  const areaPath = [
    ...history.map((s, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(s.bestFitness).toFixed(1)}`),
    ...history.map((s, i) => `L${xScale(history.length - 1 - i).toFixed(1)},${yScale(history[history.length - 1 - i].worstFitness).toFixed(1)}`),
    "Z",
  ].join(" ");

  // Zero line
  const zeroY = yScale(0);

  const hovered = hoveredIdx !== null ? history[hoveredIdx] : null;

  return (
    <div className="px-3 pt-2 pb-1">
      {/* Chart header */}
      <div className="flex items-center gap-2 mb-1.5">
        <TrendingUp size={9} className="text-white/25" />
        <span className="text-[9px] text-white/30 font-semibold uppercase tracking-wider">
          Fitness Evolution
        </span>
        <div className="ml-auto flex items-center gap-2 text-[8px]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-px bg-emerald-400" />
            <span className="text-white/20">best</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-px bg-violet-400" />
            <span className="text-white/20">avg</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-px bg-white/20" />
            <span className="text-white/20">worst</span>
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto", maxHeight: 100 }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Grid lines */}
        <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke="white" strokeOpacity={0.08} strokeDasharray="2,2" />
        <text x={PAD_L} y={zeroY - 2} fill="white" fillOpacity={0.12} fontSize={7}>0</text>

        {/* Filled range area */}
        <path d={areaPath} fill="white" fillOpacity={0.03} />

        {/* Worst line */}
        <path d={worstPath} fill="none" stroke="white" strokeOpacity={0.15} strokeWidth={1} />

        {/* Avg line */}
        <path d={avgPath} fill="none" stroke="#a78bfa" strokeOpacity={0.7} strokeWidth={1.5} />

        {/* Best line */}
        <path d={bestPath} fill="none" stroke="#34d399" strokeOpacity={0.8} strokeWidth={1.5} />

        {/* Dominant focus dots on avg line */}
        {history.map((s, i) => {
          const color = FOCUS_STROKE_COLORS[s.dominantFocus] ?? "#a78bfa";
          return (
            <circle
              key={i}
              cx={xScale(i)}
              cy={yScale(s.avgFitness)}
              r={hoveredIdx === i ? 3.5 : 2}
              fill={color}
              fillOpacity={hoveredIdx === i ? 1 : 0.6}
              stroke={hoveredIdx === i ? "white" : "none"}
              strokeWidth={hoveredIdx === i ? 0.5 : 0}
              className="transition-all duration-150"
            />
          );
        })}

        {/* Invisible hover targets */}
        {history.map((_, i) => (
          <rect
            key={`hover-${i}`}
            x={xScale(i) - chartW / history.length / 2}
            y={PAD_T}
            width={chartW / history.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)}
          />
        ))}

        {/* Hover crosshair */}
        {hoveredIdx !== null && (
          <line
            x1={xScale(hoveredIdx)}
            x2={xScale(hoveredIdx)}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="white"
            strokeOpacity={0.15}
            strokeWidth={0.5}
          />
        )}

        {/* Generation labels */}
        {history.length <= 20
          ? history.map((s, i) => (
              <text
                key={`label-${i}`}
                x={xScale(i)}
                y={H - 3}
                fill="white"
                fillOpacity={0.15}
                fontSize={6}
                textAnchor="middle"
              >
                {s.generation}
              </text>
            ))
          : // Show only first, last, and a few intermediate labels
            [0, Math.floor(history.length / 3), Math.floor((2 * history.length) / 3), history.length - 1].map((i) => (
              <text
                key={`label-${i}`}
                x={xScale(i)}
                y={H - 3}
                fill="white"
                fillOpacity={0.15}
                fontSize={6}
                textAnchor="middle"
              >
                {history[i].generation}
              </text>
            ))}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div className="mt-1 px-2 py-1.5 bg-white/[0.04] rounded-lg border border-white/[0.06] flex items-center gap-3 text-[9px]">
          <span className="text-white/40 font-mono">Gen {hovered.generation}</span>
          <span className="text-emerald-400/80">Best: {hovered.bestFitness > 0 ? "+" : ""}{hovered.bestFitness.toFixed(2)}</span>
          <span className="text-violet-400/80">Avg: {hovered.avgFitness > 0 ? "+" : ""}{hovered.avgFitness.toFixed(2)}</span>
          <span className="text-white/25">Worst: {hovered.worstFitness.toFixed(2)}</span>
          <span className="ml-auto text-[8px]">{FOCUS_ICONS[hovered.dominantFocus] ?? "?"} {hovered.dominantFocus}</span>
        </div>
      )}
    </div>
  );
}

function GenomePanel() {
  const [pool, setPool] = useState<GenePoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const fetchPool = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve/genome");
      if (res.ok) {
        const data = (await res.json()) as GenePoolData;
        setPool(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  const resetPool = useCallback(async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/self-improve/genome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as GenePoolData;
        setPool(data);
      }
    } finally {
      setResetting(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center gap-2">
        <Loader2 size={12} className="text-white/30 animate-spin" />
        <span className="text-[11px] text-white/30">Loading gene pool…</span>
      </div>
    );
  }

  if (!pool || pool.genomes.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Zap size={20} className="text-white/10 mx-auto mb-2" />
        <p className="text-[11px] text-white/20">No gene pool yet.</p>
        <p className="text-[9px] text-white/10 mt-1">
          Strategy genomes evolve automatically as
          <br />
          the self-improve agent runs sessions.
        </p>
      </div>
    );
  }

  // Sort by average fitness (best first), untested last
  const sorted = [...pool.genomes].sort((a, b) => {
    const aAvg = a.timesUsed > 0 ? a.fitness / a.timesUsed : -999;
    const bAvg = b.timesUsed > 0 ? b.fitness / b.timesUsed : -999;
    return bAvg - aAvg;
  });

  const totalFitness = pool.genomes.reduce((s, g) => s + g.fitness, 0);
  const testedCount = pool.genomes.filter((g) => g.timesUsed > 0).length;

  // Focus distribution
  const focusCounts: Record<string, number> = {};
  for (const g of pool.genomes) {
    focusCounts[g.focus] = (focusCounts[g.focus] ?? 0) + 1;
  }

  return (
    <div>
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">
            🧬 Gene Pool
          </span>
          <span className="text-[9px] text-white/15 font-mono ml-auto">
            Gen {pool.generationCount}
          </span>
          <button
            onClick={resetPool}
            disabled={resetting}
            title="Reset gene pool (start fresh evolution)"
            className="p-1 rounded text-white/15 hover:text-amber-400/70 hover:bg-amber-500/10 transition-colors"
          >
            {resetting ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <RotateCcw size={10} />
            )}
          </button>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[9px] text-white/25">
          <span>{pool.genomes.length} genomes</span>
          <span>{testedCount} tested</span>
          <span>{pool.totalSessions} sessions</span>
          <span
            className={
              totalFitness > 0
                ? "text-emerald-400/50"
                : totalFitness < 0
                  ? "text-red-400/50"
                  : ""
            }
          >
            Σ fitness: {totalFitness > 0 ? "+" : ""}
            {totalFitness.toFixed(1)}
          </span>
        </div>

        {/* Focus distribution as tiny colored dots */}
        <div className="flex items-center gap-1 mt-1.5">
          {Object.entries(focusCounts).map(([focus, count]) => (
            <div
              key={focus}
              className="flex items-center gap-0.5"
              title={`${focus}: ${count}`}
            >
              <span className="text-[8px]">{FOCUS_ICONS[focus] ?? "?"}</span>
              <span className="text-[8px] text-white/15">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fitness evolution timeline */}
      {pool.evolutionHistory && pool.evolutionHistory.length > 0 && (
        <div className="border-b border-white/[0.06]">
          <FitnessTimeline history={pool.evolutionHistory} />
        </div>
      )}

      {/* Genome list */}
      <div className="max-h-72 overflow-y-auto">
        {sorted.map((genome, i) => (
          <GenomeCard
            key={genome.id}
            genome={genome}
            isActive={genome.id === pool.activeGenomeId}
            rank={i + 1}
          />
        ))}
      </div>

      {/* Explanation footer */}
      <div className="px-3 py-2 border-t border-white/[0.04]">
        <p className="text-[8px] text-white/15 leading-relaxed">
          Each session selects a genome via tournament selection. Outcomes update
          fitness scores. Every 3 sessions, the pool evolves: top performers
          reproduce with crossover + mutation, weak genomes are replaced, and one
          random immigrant maintains genetic diversity.
        </p>
      </div>
    </div>
  );
}

// ── Memory types & panel ─────────────────────────────────────────────────────

type MemoryEntry = {
  id: string;
  timestamp: string;
  commitHash: string;
  summary: string;
  outcome: "completed" | "failed" | "reverted";
  lesson: string;
};

function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve/memory");
      if (res.ok) {
        const data = (await res.json()) as { memories: MemoryEntry[] };
        setMemories(data.memories);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  const deleteEntry = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch("/api/self-improve/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { memories: MemoryEntry[] };
        setMemories(data.memories);
      }
    } finally { setDeleting(null); }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAll: true }),
      });
      if (res.ok) setMemories([]);
    } catch { /* ignore */ }
  }, []);

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center gap-2">
        <Loader2 size={12} className="text-white/30 animate-spin" />
        <span className="text-[11px] text-white/30">Loading memories…</span>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <Brain size={20} className="text-white/10 mx-auto mb-2" />
        <p className="text-[11px] text-white/20">No memories yet.</p>
        <p className="text-[9px] text-white/10 mt-1">
          Memories accumulate after each self-improvement session,<br />
          helping the agent learn from its own history.
        </p>
      </div>
    );
  }

  const completedCount = memories.filter((m) => m.outcome === "completed").length;
  const revertedCount = memories.filter((m) => m.outcome === "reverted").length;
  const failedCount = memories.filter((m) => m.outcome === "failed").length;

  return (
    <div className="memory-panel-in">
      {/* Summary bar */}
      <div className="px-3 py-2 flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="flex items-center gap-1.5">
          <Brain size={10} className="text-cyan-400/70" />
          <span className="text-[9px] uppercase tracking-wider text-white/30 font-semibold">
            {memories.length} memor{memories.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] ml-auto">
          {completedCount > 0 && (
            <span className="text-emerald-400/60">{completedCount} ✓</span>
          )}
          {revertedCount > 0 && (
            <span className="text-amber-400/60">{revertedCount} ⏪</span>
          )}
          {failedCount > 0 && (
            <span className="text-red-400/60">{failedCount} ✗</span>
          )}
          <button
            onClick={clearAll}
            title="Clear all memories"
            className="p-1 rounded text-white/15 hover:text-red-400/70 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Memory entries */}
      <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
        {memories.map((m) => {
          const icon =
            m.outcome === "completed"
              ? "✅"
              : m.outcome === "reverted"
                ? "⏪"
                : "❌";
          const borderColor =
            m.outcome === "completed"
              ? "border-l-emerald-500/30"
              : m.outcome === "reverted"
                ? "border-l-amber-500/30"
                : "border-l-red-500/30";

          return (
            <div
              key={m.id}
              className={`px-3 py-2 border-l-2 ${borderColor} hover:bg-white/[0.02] transition-colors group/mem`}
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] flex-shrink-0 mt-0.5">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-white/70 leading-snug line-clamp-2">
                    {m.summary}
                  </p>
                  {m.lesson && m.lesson !== m.summary && (
                    <p className="text-[10px] text-cyan-400/40 italic mt-0.5 leading-snug line-clamp-2">
                      {m.lesson}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-mono text-white/20">
                      {m.commitHash.slice(0, 7)}
                    </span>
                    <span className="text-[9px] text-white/15">
                      {timeAgo(m.timestamp)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteEntry(m.id)}
                  disabled={deleting === m.id}
                  title="Delete memory"
                  className="p-0.5 rounded text-white/0 group-hover/mem:text-white/20 hover:!text-red-400/60 transition-colors flex-shrink-0 mt-0.5"
                >
                  {deleting === m.id ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <X size={10} />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SelfImproveToggle() {
  const [status, setStatus] = useState<AgentStatus>({
    enabled: false,
    running: false,
    entries: [],
    suggestion: "",
  });
  const [commits, setCommits] = useState<Commit[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [, setTick] = useState(0); // force re-render for live times

  // Which commit hash is currently showing its diff (null = none)
  const [viewingDiff, setViewingDiff] = useState<string | null>(null);
  // Panel tab: "activity" (live feed) vs "commits" vs "stats" vs "prompt" vs "memory" vs "genome"
  const [panelTab, setPanelTab] = useState<"activity" | "commits" | "stats" | "prompt" | "memory" | "genome">("activity");

  // ── User feedback state (thumbs up/down on commits) ────────────────────
  const [feedback, setFeedback] = useState<Record<string, { rating: "up" | "down" | null }>>({});
  const feedbackFetchedRef = useRef(false);

  // Fetch feedback ratings on mount
  useEffect(() => {
    if (feedbackFetchedRef.current) return;
    feedbackFetchedRef.current = true;
    fetch("/api/self-improve/feedback")
      .then((r) => r.ok ? r.json() : {})
      .then((data: Record<string, { rating: "up" | "down" | null }>) => {
        const mapped: Record<string, { rating: "up" | "down" | null }> = {};
        for (const [hash, entry] of Object.entries(data)) {
          mapped[hash] = { rating: entry.rating };
        }
        setFeedback(mapped);
      })
      .catch(() => {});
  }, []);

  const submitFeedback = useCallback(async (commitHash: string, rating: "up" | "down" | null) => {
    // Optimistic update
    setFeedback((prev) => ({ ...prev, [commitHash]: { rating } }));
    try {
      const res = await fetch("/api/self-improve/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitHash, rating }),
      });
      if (!res.ok) {
        // Revert on failure
        setFeedback((prev) => {
          const next = { ...prev };
          delete next[commitHash];
          return next;
        });
      }
    } catch {
      setFeedback((prev) => {
        const next = { ...prev };
        delete next[commitHash];
        return next;
      });
    }
  }, []);

  // ── Celebration state ───────────────────────────────────────────────────
  const [celebrating, setCelebrating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pillGlow, setPillGlow] = useState(false);
  const prevCommitHashRef = useRef<string | null>(null);
  const hasInitializedCommitsRef = useRef(false);

  // Sound mute state
  const [muted, setMuted] = useState(false);
  useEffect(() => { setMuted(isSoundMuted()); }, []);
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      setSoundMuted(next);
      return next;
    });
  }, []);

  // ── Suggestion state ─────────────────────────────────────────────────────
  const [suggestionInput, setSuggestionInput] = useState("");
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [suggestionSaved, setSuggestionSaved] = useState(false);

  // Sync local input with server state on first load
  const suggestionSyncedRef = useRef(false);
  useEffect(() => {
    if (!suggestionSyncedRef.current && status.suggestion) {
      setSuggestionInput(status.suggestion);
      suggestionSyncedRef.current = true;
    } else if (!suggestionSyncedRef.current && status.suggestion === "") {
      suggestionSyncedRef.current = true;
    }
  }, [status.suggestion]);

  const submitSuggestion = useCallback(async () => {
    const text = suggestionInput.trim();
    if (!text || suggestionSaving) return;
    setSuggestionSaving(true);
    try {
      const res = await fetch("/api/self-improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion: text }),
      });
      if (res.ok) {
        setStatus(await res.json());
        setSuggestionSaved(true);
        setTimeout(() => setSuggestionSaved(false), 2000);
      }
    } finally {
      setSuggestionSaving(false);
    }
  }, [suggestionInput, suggestionSaving]);

  const clearSuggestion = useCallback(async () => {
    setSuggestionInput("");
    setSuggestionSaved(false);
    try {
      const res = await fetch("/api/self-improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion: "" }),
      });
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  // ── Prompt editor state ──────────────────────────────────────────────────
  const [promptText, setPromptText] = useState("");
  const [promptOriginal, setPromptOriginal] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const promptFetchedRef = useRef(false);

  const fetchPrompt = useCallback(async () => {
    setPromptLoading(true);
    try {
      const res = await fetch("/api/self-improve/prompt");
      if (res.ok) {
        const data = (await res.json()) as { prompt: string };
        setPromptText(data.prompt);
        setPromptOriginal(data.prompt);
      }
    } catch { /* ignore */ }
    finally { setPromptLoading(false); }
  }, []);

  // Fetch prompt when switching to the prompt tab
  useEffect(() => {
    if (panelTab === "prompt" && !promptFetchedRef.current) {
      promptFetchedRef.current = true;
      fetchPrompt();
    }
  }, [panelTab, fetchPrompt]);

  const savePrompt = useCallback(async () => {
    if (promptSaving) return;
    setPromptSaving(true);
    try {
      const res = await fetch("/api/self-improve/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (res.ok) {
        const data = (await res.json()) as { prompt: string };
        setPromptOriginal(data.prompt);
        setPromptSaved(true);
        setTimeout(() => setPromptSaved(false), 2000);
      }
    } finally { setPromptSaving(false); }
  }, [promptText, promptSaving]);

  const resetPrompt = useCallback(() => {
    setPromptText(promptOriginal);
    setPromptSaved(false);
  }, [promptOriginal]);

  const promptDirty = promptText !== promptOriginal;

  // ── Build health state ──────────────────────────────────────────────────
  const [buildHealth, setBuildHealth] = useState<BuildHealth | null>(null);
  const [buildHealthExpanded, setBuildHealthExpanded] = useState(false);

  // Fetch build health once on mount, then refresh when commits change via SSE
  const fetchBuildHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve/health");
      if (res.ok) {
        const data = (await res.json()) as { health: BuildHealth | null };
        setBuildHealth(data.health);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchBuildHealth();
  }, [fetchBuildHealth]);

  // Re-fetch build health when new commits are detected (build check runs after each commit)
  useEventBus("self-improve:commits", useCallback(() => {
    // Small delay to let the build check finish after the commit
    setTimeout(fetchBuildHealth, 3000);
  }, [fetchBuildHealth]));

  // Panel animation state — keeps the element in the DOM during the exit animation.
  const [showPanel, setShowPanel] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (expanded) {
      if (panelCloseTimerRef.current) clearTimeout(panelCloseTimerRef.current);
      setShowPanel(true);
      setPanelClosing(false);
    } else if (showPanel) {
      setPanelClosing(true);
      panelCloseTimerRef.current = setTimeout(() => {
        setShowPanel(false);
        setPanelClosing(false);
        setViewingDiff(null); // close diff when collapsing panel
      }, 170);
    }
    return () => {
      if (panelCloseTimerRef.current) clearTimeout(panelCloseTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Copy-to-clipboard state for commit hashes.
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyHash = useCallback((fullHash: string) => {
    navigator.clipboard.writeText(fullHash).then(() => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedHash(fullHash);
      copiedTimerRef.current = setTimeout(() => setCopiedHash(null), 1500);
    }).catch(() => {
      // Fallback for environments where clipboard API is unavailable
      const el = document.createElement("textarea");
      el.value = fullHash;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedHash(fullHash);
      copiedTimerRef.current = setTimeout(() => setCopiedHash(null), 1500);
    });
  }, []);

  // ── Broadcast running state to ambient canvas ────────────────────────────
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (status.running !== prevRunningRef.current) {
      prevRunningRef.current = status.running;
      dispatchAmbientEvent({ type: "self-improve-running", running: status.running });
      // Auto-switch to live tab when agent starts running
      if (status.running) {
        setPanelTab("activity");
      }
    }
  }, [status.running]);

  // ── Fetch agent status ────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve");
      if (res.ok) setStatus(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for real-time status updates via SSE
  useEventBus("self-improve:status", useCallback((raw: unknown) => {
    setStatus(raw as AgentStatus);
  }, []));

  // ── Fetch commits (once on mount, then via SSE notification) ──────────────
  const fetchCommits = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve/commits");
      if (res.ok) {
        const data = (await res.json()) as { commits: Commit[] };
        setCommits(data.commits);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Initial commit fetch so count shows in pill right away
  useEffect(() => {
    fetchCommits();
  }, [fetchCommits]);

  // Re-fetch commits when the server detects new git activity
  useEventBus("self-improve:commits", useCallback(() => {
    fetchCommits();
  }, [fetchCommits]));

  // ── Detect new commits & trigger celebration ──────────────────────────
  useEffect(() => {
    if (commits.length === 0) return;
    const latestHash = commits[0].hash;
    if (!hasInitializedCommitsRef.current) {
      // First load — just store the hash, don't celebrate
      hasInitializedCommitsRef.current = true;
      prevCommitHashRef.current = latestHash;
      return;
    }
    if (prevCommitHashRef.current && prevCommitHashRef.current !== latestHash) {
      // New commit detected! Celebrate!
      setCelebrating(true);
      setPillGlow(true);
      setToastMessage(commits[0].message);
      dispatchAmbientEvent({ type: "self-improve-commit" });
      window.dispatchEvent(new CustomEvent("self-improve:commit"));
      playCommitChimeIfUnmuted();
      // Clear confetti after animation
      setTimeout(() => setCelebrating(false), 1200);
      // Clear glow after pulse
      setTimeout(() => setPillGlow(false), 2000);
    }
    prevCommitHashRef.current = latestHash;
  }, [commits]);

  const dismissToast = useCallback(() => setToastMessage(null), []);

  // Live clock tick for elapsed / time-ago display
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(iv);
  }, []);

  // ── Toggle on/off ─────────────────────────────────────────────────────────
  const toggle = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/self-improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !status.enabled }),
      });
      if (res.ok) setStatus(await res.json());
    } finally {
      setToggling(false);
    }
  };

  const runningEntry = status.entries.find((e) => e.status === "running");

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 select-none">

      {/* ── Toast notification ── */}
      {toastMessage && (
        <CommitToast message={toastMessage} onDismiss={dismissToast} />
      )}

      {/* ── Expanded panel ── */}
      {showPanel && (
        <div className={`w-80 rounded-2xl border border-white/10 bg-neutral-900/92 backdrop-blur-md shadow-2xl overflow-hidden ${panelClosing ? "self-improve-panel-out" : "self-improve-panel-in"}`}>

          {/* Tab bar */}
          <div className="flex items-center border-b border-white/10">
            <button
              onClick={() => setPanelTab("activity")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                panelTab === "activity"
                  ? "text-emerald-400 border-b-2 border-emerald-400/60 -mb-px"
                  : "text-white/30 hover:text-white/50",
              ].join(" ")}
            >
              {status.running && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
              )}
              Live
            </button>
            <button
              onClick={() => { setPanelTab("commits"); setViewingDiff(null); }}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                panelTab === "commits"
                  ? "text-white/70 border-b-2 border-white/40 -mb-px"
                  : "text-white/30 hover:text-white/50",
              ].join(" ")}
            >
              <GitCommit size={10} />
              Commits
              {commits.length > 0 && (
                <span className="text-[9px] font-mono text-white/30 ml-0.5">
                  {commits.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setPanelTab("stats")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                panelTab === "stats"
                  ? "text-amber-400 border-b-2 border-amber-400/60 -mb-px"
                  : "text-white/30 hover:text-white/50",
              ].join(" ")}
            >
              <BarChart3 size={10} />
              Stats
            </button>
            <button
              onClick={() => setPanelTab("prompt")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                panelTab === "prompt"
                  ? "text-violet-400 border-b-2 border-violet-400/60 -mb-px"
                  : "text-white/30 hover:text-white/50",
              ].join(" ")}
            >
              <Pencil size={10} />
              Prompt
            </button>
            <button
              onClick={() => setPanelTab("memory")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                panelTab === "memory"
                  ? "text-cyan-400 border-b-2 border-cyan-400/60 -mb-px"
                  : "text-white/30 hover:text-white/50",
              ].join(" ")}
            >
              <Brain size={10} />
              Memory
            </button>
            <button
              onClick={() => setPanelTab("genome")}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                panelTab === "genome"
                  ? "text-emerald-400 border-b-2 border-emerald-400/60 -mb-px"
                  : "text-white/30 hover:text-white/50",
              ].join(" ")}
            >
              <Zap size={10} />
              DNA
            </button>
          </div>

          {/* ── Build health indicator ── */}
          {buildHealth && (
            <div className={[
              "px-3 py-1.5 border-b transition-colors",
              buildHealth.passed
                ? "border-emerald-500/10 bg-emerald-950/20"
                : "border-red-500/10 bg-red-950/20",
            ].join(" ")}>
              <button
                onClick={() => setBuildHealthExpanded(v => !v)}
                className="w-full flex items-center gap-2 text-left"
              >
                {buildHealth.passed ? (
                  <ShieldCheck size={11} className="text-emerald-400 flex-shrink-0" />
                ) : buildHealth.reverted ? (
                  <Undo2 size={11} className="text-amber-400 flex-shrink-0" />
                ) : (
                  <ShieldAlert size={11} className="text-red-400 flex-shrink-0" />
                )}
                <span className={[
                  "text-[10px] font-medium flex-1",
                  buildHealth.passed
                    ? "text-emerald-400/80"
                    : buildHealth.reverted
                      ? "text-amber-400/80"
                      : "text-red-400/80",
                ].join(" ")}>
                  {buildHealth.passed
                    ? "Build OK"
                    : buildHealth.reverted
                      ? "Build failed — auto-reverted"
                      : "Build failed"}
                </span>
                <span className="text-[9px] text-white/20 font-mono flex-shrink-0">
                  {buildHealth.commitHash.slice(0, 7)}
                </span>
                <ChevronRight
                  size={9}
                  className={`text-white/20 transition-transform duration-150 flex-shrink-0 ${buildHealthExpanded ? "rotate-90" : ""}`}
                />
              </button>
              {buildHealthExpanded && !buildHealth.passed && buildHealth.errors && (
                <div className="mt-1.5 max-h-32 overflow-y-auto rounded-md bg-black/30 border border-white/5 p-2">
                  <pre className="text-[9px] font-mono text-red-300/70 whitespace-pre-wrap break-all leading-relaxed">
                    {buildHealth.errors.slice(0, 1500)}
                  </pre>
                </div>
              )}
              {buildHealthExpanded && buildHealth.passed && (
                <p className="mt-1 text-[9px] text-emerald-400/50">
                  TypeScript typecheck passed — no errors detected.
                </p>
              )}
            </div>
          )}

          {/* ── Suggestion box ── */}
          <div className="px-3 py-2 border-b border-white/[0.06] bg-white/[0.015]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquarePlus size={10} className="text-violet-400/70" />
              <span className="text-[9px] uppercase tracking-wider text-white/30 font-semibold">
                Next suggestion
              </span>
              {status.suggestion && !status.running && (
                <span className="ml-auto text-[8px] text-emerald-400/60 font-medium uppercase tracking-wider">
                  Queued
                </span>
              )}
              {status.running && status.suggestion && (
                <span className="ml-auto text-[8px] text-amber-400/60 font-medium uppercase tracking-wider">
                  In use
                </span>
              )}
            </div>
            <div className="flex items-end gap-1.5">
              <textarea
                value={suggestionInput}
                onChange={(e) => {
                  setSuggestionInput(e.target.value);
                  setSuggestionSaved(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitSuggestion();
                  }
                }}
                placeholder="e.g. Add a dark mode particle effect..."
                rows={2}
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px] text-white/70 placeholder:text-white/15 resize-none focus:outline-none focus:border-violet-500/30 focus:ring-1 focus:ring-violet-500/20 transition-all leading-relaxed"
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={submitSuggestion}
                  disabled={!suggestionInput.trim() || suggestionSaving}
                  title="Queue suggestion (Enter)"
                  className={[
                    "p-1.5 rounded-md transition-all duration-150",
                    suggestionSaved
                      ? "bg-emerald-500/20 text-emerald-400"
                      : suggestionInput.trim()
                        ? "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
                        : "bg-white/[0.04] text-white/15 cursor-not-allowed",
                  ].join(" ")}
                >
                  {suggestionSaved ? (
                    <Check size={12} />
                  ) : suggestionSaving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Send size={12} />
                  )}
                </button>
                {suggestionInput.trim() && (
                  <button
                    onClick={clearSuggestion}
                    title="Clear suggestion"
                    className="p-1.5 rounded-md bg-white/[0.04] text-white/20 hover:text-white/50 hover:bg-white/[0.08] transition-all duration-150"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            {suggestionSaved && (
              <p className="text-[9px] text-emerald-400/50 mt-1.5 leading-tight">
                ✓ Queued — will be used in the next improvement session.
              </p>
            )}
          </div>

          {/* Tab content */}
          {panelTab === "genome" ? (
            <GenomePanel />
          ) : panelTab === "memory" ? (
            <MemoryPanel />
          ) : panelTab === "prompt" ? (
            <div className="prompt-editor-in">
              {promptLoading ? (
                <div className="py-8 flex items-center justify-center gap-2">
                  <Loader2 size={12} className="text-white/30 animate-spin" />
                  <span className="text-[11px] text-white/30">Loading prompt…</span>
                </div>
              ) : (
                <>
                  {/* Description */}
                  <div className="px-3 pt-2.5 pb-1.5">
                    <p className="text-[10px] text-white/30 leading-relaxed">
                      Edit the system prompt that drives each self-improvement session. Changes take effect on the next run.
                    </p>
                  </div>

                  {/* Editor */}
                  <div className="px-3 pb-2">
                    <textarea
                      value={promptText}
                      onChange={(e) => {
                        setPromptText(e.target.value);
                        setPromptSaved(false);
                      }}
                      spellCheck={false}
                      className="w-full h-52 bg-black/30 border border-white/[0.08] rounded-lg px-3 py-2.5 text-[11px] text-white/70 font-mono leading-relaxed placeholder:text-white/15 resize-none focus:outline-none focus:border-violet-500/30 focus:ring-1 focus:ring-violet-500/20 transition-all scrollbar-thin scrollbar-thumb-white/10"
                    />
                  </div>

                  {/* Action bar */}
                  <div className="px-3 pb-3 flex items-center gap-2">
                    <button
                      onClick={savePrompt}
                      disabled={!promptDirty || promptSaving}
                      className={[
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150",
                        promptSaved
                          ? "bg-emerald-500/20 text-emerald-400"
                          : promptDirty
                            ? "bg-violet-500/20 text-violet-400 hover:bg-violet-500/30"
                            : "bg-white/[0.04] text-white/15 cursor-not-allowed",
                      ].join(" ")}
                    >
                      {promptSaved ? (
                        <><Check size={11} /> Saved</>
                      ) : promptSaving ? (
                        <><Loader2 size={11} className="animate-spin" /> Saving…</>
                      ) : (
                        <><Save size={11} /> Save</>
                      )}
                    </button>
                    <button
                      onClick={resetPrompt}
                      disabled={!promptDirty}
                      className={[
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150",
                        promptDirty
                          ? "bg-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.1]"
                          : "bg-white/[0.04] text-white/15 cursor-not-allowed",
                      ].join(" ")}
                    >
                      <RotateCcw size={11} /> Revert
                    </button>
                    {promptDirty && (
                      <span className="ml-auto text-[9px] text-amber-400/60 font-medium uppercase tracking-wider">
                        Unsaved
                      </span>
                    )}
                    {promptSaved && (
                      <span className="ml-auto text-[9px] text-emerald-400/60 font-medium uppercase tracking-wider">
                        ✓ Saved
                      </span>
                    )}
                  </div>

                  {/* Word count */}
                  <div className="px-3 pb-2.5 flex items-center gap-3 text-[9px] text-white/20">
                    <span>{promptText.length.toLocaleString()} chars</span>
                    <span>{promptText.split(/\s+/).filter(Boolean).length} words</span>
                    <span>{promptText.split("\n").length} lines</span>
                  </div>
                </>
              )}
            </div>
          ) : panelTab === "stats" ? (
            <StatsPanel commits={commits} />
          ) : panelTab === "activity" ? (
            <>
              {/* Running session header */}
              {status.running && runningEntry && (
                <div className="px-3 py-2 flex items-center gap-2.5 border-b border-white/[0.06] bg-emerald-950/30">
                  <Loader2 size={11} className="text-emerald-400 animate-spin flex-shrink-0" />
                  <p className="text-[10px] font-medium text-emerald-300/80">
                    Improving... <span className="text-white/25 font-normal">{elapsed(runningEntry.startedAt)}</span>
                  </p>
                </div>
              )}
              <ActivityFeed isRunning={status.running} />
              <WorkingDiffPanel isRunning={status.running} />
            </>
          ) : viewingDiff ? (
            <CommitDiffPanel
              hash={viewingDiff}
              onClose={() => setViewingDiff(null)}
            />
          ) : (
            <>
              {/* Commits list */}
              <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {commits.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-white/30">
                    No commits yet.
                    {!status.enabled && (
                      <span className="block mt-1 text-white/20">
                        Turn on Self-Improve to get started.
                      </span>
                    )}
                  </div>
                ) : (
                  commits.map((c) => {
                    const isCopied = copiedHash === c.hash;
                    return (
                      <div key={c.hash} className="px-4 py-2.5 flex gap-3 items-start hover:bg-white/5 transition-colors group/commit">
                        <button
                          onClick={() => copyHash(c.hash)}
                          title={isCopied ? "Copied!" : `Copy full hash: ${c.hash}`}
                          className={[
                            "text-[10px] font-mono mt-0.5 flex-shrink-0 pt-px rounded px-0.5 -mx-0.5",
                            "transition-colors duration-150 cursor-pointer",
                            isCopied
                              ? "text-emerald-400"
                              : "text-white/30 hover:text-white/70",
                          ].join(" ")}
                        >
                          {isCopied ? (
                            <Check size={10} className="inline" />
                          ) : (
                            c.shortHash
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-white/80 leading-snug truncate" title={c.message}>
                            {c.message}
                          </p>
                          <p className="text-[10px] text-white/30 mt-0.5">
                            {timeAgo(c.date)}
                            {c.author ? ` · ${c.author}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                          {/* Feedback buttons */}
                          {(() => {
                            const fb = feedback[c.shortHash] ?? feedback[c.hash];
                            const currentRating = fb?.rating ?? null;
                            return (
                              <>
                                <button
                                  onClick={() => submitFeedback(
                                    c.shortHash || c.hash,
                                    currentRating === "up" ? null : "up",
                                  )}
                                  title={currentRating === "up" ? "Remove rating" : "Good change"}
                                  className={[
                                    "p-1 rounded transition-all duration-150",
                                    currentRating === "up"
                                      ? "text-emerald-400 bg-emerald-400/15"
                                      : "text-white/15 hover:text-emerald-400/70 hover:bg-emerald-400/10 opacity-0 group-hover/commit:opacity-100",
                                  ].join(" ")}
                                >
                                  <ThumbsUp size={11} />
                                </button>
                                <button
                                  onClick={() => submitFeedback(
                                    c.shortHash || c.hash,
                                    currentRating === "down" ? null : "down",
                                  )}
                                  title={currentRating === "down" ? "Remove rating" : "Bad change"}
                                  className={[
                                    "p-1 rounded transition-all duration-150",
                                    currentRating === "down"
                                      ? "text-red-400 bg-red-400/15"
                                      : "text-white/15 hover:text-red-400/70 hover:bg-red-400/10 opacity-0 group-hover/commit:opacity-100",
                                  ].join(" ")}
                                >
                                  <ThumbsDown size={11} />
                                </button>
                              </>
                            );
                          })()}
                          <button
                            onClick={() => setViewingDiff(c.hash)}
                            title="View changes"
                            className="p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/10 transition-colors opacity-0 group-hover/commit:opacity-100"
                          >
                            <FileCode size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Main pill ── */}
      <div
        className={[
          "relative flex items-center gap-2 pl-3 pr-2 py-2 rounded-2xl border bg-neutral-900/85 backdrop-blur-md shadow-2xl",
          pillGlow
            ? "border-emerald-400/40 commit-pill-glow"
            : "border-white/10",
        ].join(" ")}
        style={{
          transition: "border-color 300ms ease, box-shadow 600ms ease",
        }}
      >
        {/* Confetti burst */}
        {celebrating && <ConfettiBurst />}

        {/* Status indicator + label */}
        <div className="flex items-center gap-2">
          {status.running ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
          ) : status.enabled ? (
            <Sparkles size={13} className="text-emerald-400" />
          ) : (
            <Sparkles size={13} className="text-white/25" />
          )}

          <span
            className={`text-xs font-medium ${
              status.enabled ? "text-white/90" : "text-white/40"
            }`}
          >
            {status.running
              ? "Improving…"
              : commits.length > 0
              ? `${commits.length} commit${commits.length !== 1 ? "s" : ""}`
              : "Self-Improve"}
          </span>
        </div>

        {/* Expand/collapse */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 text-white/30 hover:text-white/70 transition-colors"
          title={expanded ? "Hide commits" : "Show commits"}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>

        {/* Sound mute toggle */}
        <button
          onClick={toggleMute}
          className="p-1 text-white/30 hover:text-white/70 transition-colors"
          title={muted ? "Unmute commit sounds" : "Mute commit sounds"}
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>

        {/* Toggle switch */}
        <button
          onClick={toggle}
          disabled={toggling}
          title={status.enabled ? "Turn off" : "Turn on"}
          aria-pressed={status.enabled}
          className={[
            "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent",
            "transition-colors duration-200 ease-in-out focus:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            status.enabled ? "bg-emerald-500" : "bg-white/20",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg",
              "ring-0 transition duration-200 ease-in-out",
              status.enabled ? "translate-x-4" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}
