"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  GitCommit,
  Loader2,
  Check,
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
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Main pill ── */}
      <div className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-2xl border border-white/10 bg-neutral-900/85 backdrop-blur-md shadow-2xl">

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
