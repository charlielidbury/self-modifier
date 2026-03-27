"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  GitCommit,
  Loader2,
  FileCode,
  Plus,
  Minus,
  ChevronRight,
  TrendingUp,
  Clock,
  Code2,
  Zap,
  Paintbrush,
  Bug,
  Wrench,
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Commit = {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
  additions?: number;
  deletions?: number;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return `${d}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Categorise a commit by its message prefix. */
function categorise(message: string): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
  icon: React.ReactNode;
} {
  const m = message.toLowerCase();
  if (m.startsWith("fix") || m.includes("bug"))
    return {
      label: "Fix",
      color: "text-red-400",
      bgColor: "bg-red-500/8 dark:bg-red-500/10",
      borderColor: "border-red-500/20",
      dotColor: "bg-red-400",
      icon: <Bug size={12} />,
    };
  if (m.startsWith("refactor") || m.includes("clean") || m.includes("quality"))
    return {
      label: "Refactor",
      color: "text-amber-400",
      bgColor: "bg-amber-500/8 dark:bg-amber-500/10",
      borderColor: "border-amber-500/20",
      dotColor: "bg-amber-400",
      icon: <Wrench size={12} />,
    };
  if (m.startsWith("add") || m.includes("new page") || m.includes("feature"))
    return {
      label: "Feature",
      color: "text-blue-400",
      bgColor: "bg-blue-500/8 dark:bg-blue-500/10",
      borderColor: "border-blue-500/20",
      dotColor: "bg-blue-400",
      icon: <Zap size={12} />,
    };
  if (m.includes("visual") || m.includes("polish") || m.includes("style") || m.includes("animation") || m.includes("ui"))
    return {
      label: "Polish",
      color: "text-violet-400",
      bgColor: "bg-violet-500/8 dark:bg-violet-500/10",
      borderColor: "border-violet-500/20",
      dotColor: "bg-violet-400",
      icon: <Paintbrush size={12} />,
    };
  // Default: "improve"
  return {
    label: "Improve",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/8 dark:bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    dotColor: "bg-emerald-400",
    icon: <Sparkles size={12} />,
  };
}

// ─── Diff viewer ─────────────────────────────────────────────────────────────

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return (
      <div className="px-2 py-0 font-mono text-[10px] leading-[18px] text-emerald-600 dark:text-emerald-300 bg-emerald-500/8 dark:bg-emerald-500/10 whitespace-pre overflow-x-auto">
        {line}
      </div>
    );
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return (
      <div className="px-2 py-0 font-mono text-[10px] leading-[18px] text-red-600 dark:text-red-300 bg-red-500/8 dark:bg-red-500/10 whitespace-pre overflow-x-auto">
        {line}
      </div>
    );
  }
  if (line.startsWith("@@")) {
    return (
      <div className="px-2 py-0 font-mono text-[10px] leading-[18px] text-blue-500/60 dark:text-blue-300/60 bg-blue-500/5 whitespace-pre overflow-x-auto">
        {line}
      </div>
    );
  }
  return (
    <div className="px-2 py-0 font-mono text-[10px] leading-[18px] text-muted-foreground/40 whitespace-pre overflow-x-auto">
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
    <div className="border-t border-border/50">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/30 transition-colors"
      >
        <ChevronRight
          size={10}
          className={`text-muted-foreground/50 transition-transform duration-150 flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
        <FileCode size={11} className="text-muted-foreground/50 flex-shrink-0" />
        <span className="text-[10px] text-muted-foreground/50 truncate">{dir}</span>
        <span className="text-[10px] text-foreground/70 font-medium truncate">
          {filename}
        </span>
        <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {file.additions > 0 && (
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-0.5">
              <Plus size={8} />
              {file.additions}
            </span>
          )}
          {file.deletions > 0 && (
            <span className="text-[9px] text-red-600 dark:text-red-400 font-mono flex items-center gap-0.5">
              <Minus size={8} />
              {file.deletions}
            </span>
          )}
        </span>
      </button>
      {expanded && patchLines.length > 0 && (
        <div className="max-h-48 overflow-y-auto bg-muted/30 border-t border-border/30">
          {patchLines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Timeline card ───────────────────────────────────────────────────────────

function TimelineCard({
  commit,
  index,
  isLatest,
}: {
  commit: Commit;
  index: number;
  isLatest: boolean;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cat = useMemo(() => categorise(commit.message), [commit.message]);

  const loadDiff = useCallback(() => {
    if (diff) {
      setShowDiff((v) => !v);
      return;
    }
    setShowDiff(true);
    setLoading(true);
    setError(null);
    fetch(`/api/self-improve/commits/${commit.hash}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json() as Promise<CommitDiff>;
      })
      .then(setDiff)
      .catch(() => setError("Could not load diff"))
      .finally(() => setLoading(false));
  }, [commit.hash, diff]);

  return (
    <div
      className="evo-card-in relative flex gap-4 md:gap-6"
      style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}
    >
      {/* Timeline stem + dot */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        {/* Dot */}
        <div className="relative mt-1">
          {isLatest && (
            <span className="absolute inset-0 rounded-full animate-ping opacity-40">
              <span className={`block w-full h-full rounded-full ${cat.dotColor}`} />
            </span>
          )}
          <div
            className={`relative z-10 w-3 h-3 rounded-full ring-2 ring-background ${cat.dotColor}`}
          />
        </div>
        {/* Vertical line */}
        <div className="flex-1 w-px bg-border/60 mt-1" />
      </div>

      {/* Card content */}
      <div
        className={`flex-1 mb-6 rounded-xl border ${cat.borderColor} ${cat.bgColor} overflow-hidden transition-shadow hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20`}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-start gap-3">
          <span className={`mt-0.5 ${cat.color}`}>{cat.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug">
              {commit.message}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
              <span className={`font-medium ${cat.color}`}>{cat.label}</span>
              <span className="text-muted-foreground/30">·</span>
              <span>{formatDate(commit.date)}</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="font-mono text-[10px]">{commit.shortHash}</span>
              {commit.author && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{commit.author}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={loadDiff}
            title={showDiff ? "Hide changes" : "View changes"}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              showDiff
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            <Code2 size={12} />
            <span className="hidden sm:inline">Diff</span>
          </button>
        </div>

        {/* Expandable diff */}
        {showDiff && (
          <div className="border-t border-border/30">
            {loading ? (
              <div className="py-6 flex items-center justify-center gap-2">
                <Loader2 size={12} className="text-muted-foreground animate-spin" />
                <span className="text-[11px] text-muted-foreground">Loading diff…</span>
              </div>
            ) : error ? (
              <div className="py-4 text-center text-[11px] text-red-400/70">{error}</div>
            ) : diff ? (
              <>
                <div className="px-4 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground border-b border-border/20">
                  <span>
                    {diff.files.length} file{diff.files.length !== 1 ? "s" : ""}
                  </span>
                  {diff.totalAdditions > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400/70 font-mono flex items-center gap-0.5">
                      <Plus size={8} />
                      {diff.totalAdditions}
                    </span>
                  )}
                  {diff.totalDeletions > 0 && (
                    <span className="text-red-600 dark:text-red-400/70 font-mono flex items-center gap-0.5">
                      <Minus size={8} />
                      {diff.totalDeletions}
                    </span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {diff.files.map((file, i) => (
                    <FileDiffView
                      key={file.path}
                      file={file}
                      defaultExpanded={i === 0 && diff.files.length <= 3}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stats banner ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border/60 min-w-[140px]">
      <div className={`${color} opacity-80`}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-foreground tabular-nums leading-none">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Activity sparkline ──────────────────────────────────────────────────────

function ActivitySparkline({ commits }: { commits: Commit[] }) {
  // Group commits into day buckets (last 14 days)
  const now = Date.now();
  const dayMs = 86400_000;
  const buckets = new Array(14).fill(0);

  for (const c of commits) {
    const age = now - new Date(c.date).getTime();
    const dayIdx = Math.floor(age / dayMs);
    if (dayIdx >= 0 && dayIdx < 14) {
      buckets[13 - dayIdx]++; // reverse so latest is rightmost
    }
  }

  const max = Math.max(...buckets, 1);

  return (
    <div className="flex items-end gap-[3px] h-8">
      {buckets.map((count, i) => (
        <div
          key={i}
          className="w-2 rounded-sm bg-rose-400/60 dark:bg-rose-400/50 transition-all duration-300 hover:bg-rose-400 dark:hover:bg-rose-400"
          style={{
            height: `${Math.max((count / max) * 100, 8)}%`,
            animationDelay: `${i * 40}ms`,
          }}
          title={`${count} commit${count !== 1 ? "s" : ""}`}
        />
      ))}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EvolutionPage() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);
  // null = show all; a string = show only that category label
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const fetchCommits = useCallback((isManual = false) => {
    if (isManual) setRefreshing(true);
    fetch("/api/self-improve/commits")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json() as Promise<{ commits: Commit[] }>;
      })
      .then((data) => setCommits(data.commits))
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        if (isManual) setRefreshing(false);
      });
  }, []);

  // Initial load
  useEffect(() => {
    fetchCommits();
  }, [fetchCommits]);

  // Auto-refresh commits every 60 seconds
  useEffect(() => {
    const iv = setInterval(() => fetchCommits(), 60_000);
    return () => clearInterval(iv);
  }, [fetchCommits]);

  // Refresh time-ago labels every 30s
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  // "R" keyboard shortcut to manually refresh
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "r" && e.key !== "R") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      fetchCommits(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fetchCommits]);

  // Compute stats
  const timeSpan = useMemo(() => {
    if (commits.length < 2) return "—";
    const oldest = new Date(commits[commits.length - 1].date).getTime();
    const newest = new Date(commits[0].date).getTime();
    const diffMs = newest - oldest;
    const hours = Math.floor(diffMs / 3600_000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(diffMs / 60_000)}m`;
  }, [commits]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of commits) {
      const cat = categorise(c.message);
      counts[cat.label] = (counts[cat.label] || 0) + 1;
    }
    return counts;
  }, [commits]);

  // Commits to actually render in the timeline (respects the active category filter)
  const filteredCommits = useMemo(
    () =>
      activeFilter
        ? commits.filter((c) => categorise(c.message).label === activeFilter)
        : commits,
    [commits, activeFilter]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading evolution history…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        {/* Page header */}
        <div className="mb-8 md:mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <TrendingUp size={22} className="text-rose-500" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Evolution
            </h1>
            <button
              onClick={() => fetchCommits(true)}
              disabled={refreshing}
              title="Refresh commit history (R)"
              aria-label="Refresh commit history"
              className="ml-1 flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
          <p className="text-muted-foreground text-sm md:text-base max-w-lg">
            A living record of every self-improvement. Each node marks a moment
            the app rewrote itself to become something better.
          </p>
        </div>

        {/* Stats row */}
        {commits.length > 0 && (
          <div className="mb-8 space-y-4">
            <div className="flex flex-wrap gap-3">
              <StatCard
                icon={<GitCommit size={18} />}
                label="Total commits"
                value={String(commits.length)}
                color="text-rose-500"
              />
              <StatCard
                icon={<Clock size={18} />}
                label="Time span"
                value={timeSpan}
                color="text-blue-500"
              />
              <StatCard
                icon={<ArrowUpRight size={18} />}
                label="Latest"
                value={timeAgo(commits[0].date)}
                color="text-emerald-500"
              />
            </div>

            {/* Activity sparkline */}
            <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-card border border-border/60">
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-2">
                  Activity — last 14 days
                </p>
                <ActivitySparkline commits={commits} />
              </div>
              {/* Category breakdown — click to filter the timeline */}
              <div className="flex flex-wrap gap-x-2 gap-y-1.5 text-[11px]">
                {Object.entries(categoryCounts).map(([label, count]) => {
                  const sample = categorise(label.toLowerCase() + ": x");
                  const isActive = activeFilter === label;
                  const isDimmed = activeFilter !== null && !isActive;
                  return (
                    <button
                      key={label}
                      onClick={() =>
                        setActiveFilter((prev) =>
                          prev === label ? null : label
                        )
                      }
                      title={
                        isActive
                          ? `Clear "${label}" filter`
                          : `Filter by "${label}"`
                      }
                      className={[
                        "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-all cursor-pointer select-none",
                        isActive
                          ? "bg-foreground/10 ring-1 ring-foreground/20"
                          : "hover:bg-foreground/5",
                        isDimmed ? "opacity-40" : "opacity-100",
                      ].join(" ")}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sample.dotColor}`}
                      />
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono text-foreground/70 font-medium">
                        {count}
                      </span>
                    </button>
                  );
                })}
                {activeFilter && (
                  <button
                    onClick={() => setActiveFilter(null)}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    title="Clear filter"
                  >
                    <X size={9} />
                    <span>All</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        {commits.length === 0 ? (
          <div className="text-center py-20">
            <Sparkles size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">
              No evolution history yet.
            </p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Enable Self-Improve to start the journey.
            </p>
          </div>
        ) : (
          <div className="relative">
            {/* Active filter notice */}
            {activeFilter && (
              <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
                <span>
                  Showing{" "}
                  <span className="font-medium text-foreground">
                    {filteredCommits.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-foreground">
                    {commits.length}
                  </span>{" "}
                  commits — filtered by{" "}
                  <span className="font-medium text-foreground">
                    {activeFilter}
                  </span>
                </span>
                <button
                  onClick={() => setActiveFilter(null)}
                  className="flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-foreground/5 transition-colors"
                  title="Clear filter"
                >
                  <X size={10} />
                  Clear
                </button>
              </div>
            )}

            {/* "Now" label at top */}
            <div className="flex items-center gap-3 mb-4 ml-[5px]">
              <div className="relative flex items-center justify-center w-5 h-5">
                <span className="absolute inset-0 rounded-full bg-rose-400/20 animate-ping" />
                <span className="relative w-2.5 h-2.5 rounded-full bg-rose-400 ring-2 ring-background" />
              </div>
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                Now
              </span>
            </div>

            {/* Cards */}
            {filteredCommits.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground text-sm">
                  No{" "}
                  <span className="font-medium text-foreground">
                    {activeFilter}
                  </span>{" "}
                  commits yet.
                </p>
              </div>
            ) : (
              filteredCommits.map((commit, i) => (
                <TimelineCard
                  key={commit.hash}
                  commit={commit}
                  index={i}
                  isLatest={i === 0 && activeFilter === null}
                />
              ))
            )}

            {/* Origin marker */}
            <div className="flex items-center gap-3 ml-[5px] pt-2">
              <div className="w-5 flex justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20 ring-2 ring-background" />
              </div>
              <span className="text-xs text-muted-foreground/50 italic">
                Origin
              </span>
            </div>
          </div>
        )}

        {/* Bottom spacer for scroll comfort */}
        <div className="h-24" />
      </div>
    </div>
  );
}
