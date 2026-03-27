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
  // Panel tab: "activity" (live feed) vs "commits" vs "stats" vs "prompt"
  const [panelTab, setPanelTab] = useState<"activity" | "commits" | "stats" | "prompt">("activity");

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
          {panelTab === "prompt" ? (
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
                        <button
                          onClick={() => setViewingDiff(c.hash)}
                          title="View changes"
                          className="mt-0.5 p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/10 transition-colors opacity-0 group-hover/commit:opacity-100 flex-shrink-0"
                        >
                          <FileCode size={12} />
                        </button>
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
