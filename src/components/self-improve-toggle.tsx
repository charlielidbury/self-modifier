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
} from "lucide-react";

type AgentStatus = {
  enabled: boolean;
  running: boolean;
  entries: { id: string; startedAt: string; status: string }[];
};

type Commit = {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
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

// ── Main component ─────────────────────────────────────────────────────────────

export function SelfImproveToggle() {
  const [status, setStatus] = useState<AgentStatus>({
    enabled: false,
    running: false,
    entries: [],
  });
  const [commits, setCommits] = useState<Commit[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [, setTick] = useState(0); // force re-render for live times

  // Which commit hash is currently showing its diff (null = none)
  const [viewingDiff, setViewingDiff] = useState<string | null>(null);

  // ── Celebration state ───────────────────────────────────────────────────
  const [celebrating, setCelebrating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pillGlow, setPillGlow] = useState(false);
  const prevCommitHashRef = useRef<string | null>(null);
  const hasInitializedCommitsRef = useRef(false);

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
    const iv = setInterval(
      fetchStatus,
      status.running ? 1500 : status.enabled ? 3000 : 10_000
    );
    return () => clearInterval(iv);
  }, [fetchStatus, status.running, status.enabled]);

  // ── Fetch commits (when expanded or running) ──────────────────────────────
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

  useEffect(() => {
    if (!expanded && !status.running) return;
    fetchCommits();
    const iv = setInterval(fetchCommits, status.running ? 4000 : 15_000);
    return () => clearInterval(iv);
  }, [fetchCommits, expanded, status.running]);

  // Initial commit fetch so count shows in pill right away
  useEffect(() => {
    fetchCommits();
  }, [fetchCommits]);

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

          {/* Current session (if running) */}
          {status.running && runningEntry && (
            <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10 bg-emerald-950/40">
              <Loader2 size={13} className="text-emerald-400 animate-spin flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-emerald-300">Improving…</p>
                <p className="text-[10px] text-white/30 mt-0.5">
                  {elapsed(runningEntry.startedAt)} elapsed
                </p>
              </div>
            </div>
          )}

          {/* Diff viewer (replaces commit list when viewing a specific commit) */}
          {viewingDiff ? (
            <CommitDiffPanel
              hash={viewingDiff}
              onClose={() => setViewingDiff(null)}
            />
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
                <GitCommit size={12} className="text-white/40" />
                <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  Recent Commits
                </p>
              </div>

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
