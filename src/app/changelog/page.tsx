"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GitCommitHorizontal,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Sparkles,
  Wrench,
  Bug,
  Paintbrush,
  Zap,
  FileCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
  additions?: number;
  deletions?: number;
}

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

interface CommitGroup {
  label: string;
  dateKey: string;
  commits: Commit[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyCommit(message: string): {
  Icon: LucideIcon;
  color: string;
  bgColor: string;
  tag: string;
} {
  const lower = message.toLowerCase();
  if (lower.startsWith("improve:") || lower.startsWith("improve "))
    return {
      Icon: Sparkles,
      color: "text-violet-500",
      bgColor: "bg-violet-500/15",
      tag: "improve",
    };
  if (lower.startsWith("fix:") || lower.startsWith("fix ") || lower.includes("bug"))
    return {
      Icon: Bug,
      color: "text-red-500",
      bgColor: "bg-red-500/15",
      tag: "fix",
    };
  if (lower.startsWith("feat:") || lower.startsWith("feat ") || lower.includes("add"))
    return {
      Icon: Zap,
      color: "text-amber-500",
      bgColor: "bg-amber-500/15",
      tag: "feature",
    };
  if (lower.includes("style") || lower.includes("visual") || lower.includes("ui") || lower.includes("polish"))
    return {
      Icon: Paintbrush,
      color: "text-pink-500",
      bgColor: "bg-pink-500/15",
      tag: "style",
    };
  if (lower.includes("refactor") || lower.includes("clean") || lower.includes("quality"))
    return {
      Icon: Wrench,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/15",
      tag: "refactor",
    };
  return {
    Icon: FileCode,
    color: "text-blue-500",
    bgColor: "bg-blue-500/15",
    tag: "commit",
  };
}

function groupCommitsByDay(commits: Commit[]): CommitGroup[] {
  const groups: Map<string, Commit[]> = new Map();
  for (const commit of commits) {
    const d = new Date(commit.date);
    const key = d.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(commit);
  }
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  return Array.from(groups.entries()).map(([dateKey, commits]) => {
    let label: string;
    if (dateKey === today) label = "Today";
    else if (dateKey === yesterday) label = "Yesterday";
    else {
      label = new Date(dateKey + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    return { label, dateKey, commits };
  });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── CommitCard component ────────────────────────────────────────────────────

function CommitCard({
  commit,
  index,
  isLast,
}: {
  commit: Commit;
  index: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const { Icon, color, bgColor, tag } = classifyCommit(commit.message);

  // Intersection observer for staggered entrance
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleDiff = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (diff) return;
    setLoadingDiff(true);
    try {
      const res = await fetch(`/api/self-improve/commits/${commit.hash}`);
      if (res.ok) {
        const data = await res.json();
        setDiff(data.files ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoadingDiff(false);
    }
  }, [expanded, diff, commit.hash]);

  const copyHash = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(commit.shortHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [commit.shortHash]
  );

  const additions = commit.additions ?? 0;
  const deletions = commit.deletions ?? 0;

  return (
    <div className="relative flex gap-4 sm:gap-6" ref={cardRef}>
      {/* Timeline line + node */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div
          className={[
            "w-8 h-8 rounded-full flex items-center justify-center border-2 border-border transition-all duration-500 z-10",
            bgColor,
            visible ? "scale-100 opacity-100" : "scale-50 opacity-0",
          ].join(" ")}
          style={{ transitionDelay: `${index * 60}ms` }}
        >
          <Icon size={14} className={color} />
        </div>
        {!isLast && (
          <div className="flex-1 w-px bg-border/60 min-h-[24px]" />
        )}
      </div>

      {/* Card */}
      <div
        className={[
          "flex-1 mb-4 transition-all duration-500",
          visible
            ? "opacity-100 translate-x-0"
            : "opacity-0 translate-x-4",
        ].join(" ")}
        style={{ transitionDelay: `${index * 60 + 80}ms` }}
      >
        <div
          className="group rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:border-border/80 hover:bg-card/80 transition-all duration-200 cursor-pointer"
          onClick={toggleDiff}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span
                    className={[
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider",
                      bgColor,
                      color,
                    ].join(" ")}
                  >
                    {tag}
                  </span>
                  <button
                    onClick={copyHash}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                    title="Copy commit hash"
                  >
                    {copied ? (
                      <Check size={10} className="text-green-500" />
                    ) : (
                      <Copy size={10} />
                    )}
                    {commit.shortHash}
                  </button>
                  <span className="text-[11px] text-muted-foreground/40">
                    {timeAgo(commit.date)}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground leading-snug">
                  {commit.message}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {(additions > 0 || deletions > 0) && (
                  <div className="hidden sm:flex items-center gap-2 text-[11px]">
                    {additions > 0 && (
                      <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                        <Plus size={10} />
                        {additions}
                      </span>
                    )}
                    {deletions > 0 && (
                      <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400">
                        <Minus size={10} />
                        {deletions}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
                  {expanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </div>
              </div>
            </div>

            {/* Stat bar */}
            {(additions > 0 || deletions > 0) && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden flex">
                  {additions > 0 && (
                    <div
                      className="h-full bg-green-500/70 rounded-l-full transition-all duration-500"
                      style={{
                        width: `${(additions / (additions + deletions)) * 100}%`,
                      }}
                    />
                  )}
                  {deletions > 0 && (
                    <div
                      className="h-full bg-red-500/60 rounded-r-full transition-all duration-500"
                      style={{
                        width: `${(deletions / (additions + deletions)) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/40 font-mono tabular-nums">
                  {additions + deletions} lines
                </span>
              </div>
            )}
          </div>

          {/* Expandable diff */}
          {expanded && (
            <div className="border-t border-border/50">
              {loadingDiff ? (
                <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground/60">
                  <div className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground/60 rounded-full animate-spin" />
                  Loading diff...
                </div>
              ) : diff && diff.length > 0 ? (
                <div className="max-h-[400px] overflow-y-auto">
                  {diff.map((file, fi) => (
                    <div key={fi} className="border-b border-border/30 last:border-0">
                      <div className="px-4 py-2 bg-muted/30 flex items-center gap-2 text-xs font-mono sticky top-0 z-10">
                        <FileCode size={12} className="text-muted-foreground/60" />
                        <span className="text-foreground/80 truncate">
                          {file.path}
                        </span>
                        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                          {file.additions > 0 && (
                            <span className="text-green-600 dark:text-green-400">
                              +{file.additions}
                            </span>
                          )}
                          {file.deletions > 0 && (
                            <span className="text-red-500 dark:text-red-400">
                              -{file.deletions}
                            </span>
                          )}
                        </div>
                      </div>
                      <pre className="px-4 py-2 text-[11px] font-mono leading-relaxed overflow-x-auto">
                        {file.patch.split("\n").map((line, li) => {
                          let lineClass = "text-muted-foreground/70";
                          if (line.startsWith("+") && !line.startsWith("+++"))
                            lineClass = "text-green-600 dark:text-green-400 bg-green-500/5";
                          else if (line.startsWith("-") && !line.startsWith("---"))
                            lineClass = "text-red-500 dark:text-red-400 bg-red-500/5";
                          else if (line.startsWith("@@"))
                            lineClass = "text-blue-500/60";
                          return (
                            <div key={li} className={`${lineClass} px-1 -mx-1 rounded-sm`}>
                              {line || " "}
                            </div>
                          );
                        })}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : diff && diff.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground/40">
                  No file changes in this commit.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Aggregate stats ─────────────────────────────────────────────────────────

function ChangelogStats({ commits }: { commits: Commit[] }) {
  const totalAdditions = commits.reduce((s, c) => s + (c.additions ?? 0), 0);
  const totalDeletions = commits.reduce((s, c) => s + (c.deletions ?? 0), 0);
  const uniqueAuthors = new Set(commits.map((c) => c.author)).size;
  const daySpan =
    commits.length > 1
      ? Math.max(
          1,
          Math.ceil(
            (new Date(commits[0]!.date).getTime() -
              new Date(commits[commits.length - 1]!.date).getTime()) /
              86400000
          )
        )
      : 1;

  const stats = [
    {
      label: "Commits",
      value: commits.length,
      color: "text-blue-500",
    },
    {
      label: "Lines added",
      value: totalAdditions.toLocaleString(),
      color: "text-green-500",
    },
    {
      label: "Lines removed",
      value: totalDeletions.toLocaleString(),
      color: "text-red-500",
    },
    {
      label: "Contributors",
      value: uniqueAuthors,
      color: "text-amber-500",
    },
    {
      label: "Commits/day",
      value: (commits.length / daySpan).toFixed(1),
      color: "text-violet-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-10">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-border bg-card/40 backdrop-blur-sm p-4 text-center"
        >
          <div className={`text-2xl font-bold tabular-nums ${stat.color}`}>
            {stat.value}
          </div>
          <div className="text-xs text-muted-foreground/60 mt-1">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Filter pills ────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "improve", label: "Improve" },
  { key: "feature", label: "Feature" },
  { key: "fix", label: "Fix" },
  { key: "style", label: "Style" },
  { key: "refactor", label: "Refactor" },
] as const;

type FilterKey = (typeof FILTER_OPTIONS)[number]["key"];

// ─── Main Changelog page ────────────────────────────────────────────────────

export default function ChangelogPage() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/changelog");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCommits(data.commits ?? []);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    filter === "all"
      ? commits
      : commits.filter((c) => classifyCommit(c.message).tag === filter);

  const groups = groupCommitsByDay(filtered);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Header */}
        <div className="mb-8 changelog-hero-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-500/10 dark:bg-violet-500/15">
              <GitCommitHorizontal className="text-violet-500" size={20} />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                Changelog
              </h1>
            </div>
          </div>
          <p className="text-muted-foreground leading-relaxed max-w-xl mt-2">
            A living record of every improvement this app has made to itself.
            Each node on the timeline is a commit — click to explore the diff.
          </p>
        </div>

        {/* Stats */}
        {!loading && commits.length > 0 && (
          <ChangelogStats commits={commits} />
        )}

        {/* Filter pills */}
        {!loading && commits.length > 0 && (
          <div className="flex items-center gap-2 mb-8 flex-wrap">
            {FILTER_OPTIONS.map((opt) => {
              const isActive = filter === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setFilter(opt.key)}
                  className={[
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                    isActive
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  ].join(" ")}
                >
                  {opt.label}
                  {opt.key !== "all" && (
                    <span className="ml-1 opacity-60">
                      {commits.filter((c) => classifyCommit(c.message).tag === opt.key).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-muted-foreground/20 border-t-violet-500 rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground/60">Loading history...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <GitCommitHorizontal size={32} className="text-muted-foreground/30" />
            <p className="text-muted-foreground/60">
              {filter !== "all"
                ? "No commits match this filter."
                : "No commits found yet. Enable Self-Improve and watch the timeline grow."}
            </p>
          </div>
        )}

        {/* Timeline */}
        {!loading &&
          groups.map((group) => (
            <div key={group.dateKey} className="mb-6">
              {/* Day header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider px-1">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              {/* Commits in this day */}
              {group.commits.map((commit, ci) => (
                <CommitCard
                  key={commit.hash}
                  commit={commit}
                  index={ci}
                  isLast={ci === group.commits.length - 1}
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
