"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Entry = {
  id: string;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  status: "running" | "completed" | "failed";
};

type Status = {
  enabled: boolean;
  running: boolean;
  entries: Entry[];
};

function formatDuration(start: string, end?: string): string {
  const ms = new Date(end ?? new Date()).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SelfImproveToggle() {
  const [status, setStatus] = useState<Status>({ enabled: false, running: false, entries: [] });
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const tickRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/self-improve");
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  // Poll — faster when running
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, status.running ? 1500 : status.enabled ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [fetchStatus, status.running, status.enabled]);

  // Clock tick for live duration display
  useEffect(() => {
    if (!status.running) return;
    const t = setInterval(() => tickRef.current++, 1000);
    return () => clearInterval(t);
  }, [status.running]);

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

  const completedCount = status.entries.filter((e) => e.status === "completed").length;
  const currentEntry = status.entries.find((e) => e.status === "running");

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2 select-none">

      {/* ── Expanded log panel ── */}
      {expanded && (
        <div className="w-80 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-900/90 backdrop-blur-md shadow-2xl">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">
              Improvement Log
            </p>
          </div>
          {status.entries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-white/40">
              No improvements yet. Turn on Self-Improve to start.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {status.entries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 flex gap-3 items-start">
                  {entry.status === "running" ? (
                    <Loader2 size={14} className="text-emerald-400 animate-spin flex-shrink-0 mt-0.5" />
                  ) : entry.status === "completed" ? (
                    <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-white/80 leading-relaxed">
                      {entry.summary ?? (entry.status === "running" ? "Working…" : "—")}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {formatTime(entry.startedAt)}
                      {entry.status !== "running" && entry.completedAt
                        ? ` · ${formatDuration(entry.startedAt, entry.completedAt)}`
                        : entry.status === "running"
                        ? ` · ${formatDuration(entry.startedAt)} elapsed`
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Main pill ── */}
      <div className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-2xl border border-white/10 bg-neutral-900/85 backdrop-blur-md shadow-2xl">

        {/* Icon + label */}
        <div className="flex items-center gap-2">
          {status.running ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
          ) : status.enabled ? (
            <Sparkles size={13} className="text-emerald-400" />
          ) : (
            <Sparkles size={13} className="text-white/30" />
          )}

          <span className={`text-xs font-medium ${status.enabled ? "text-white/90" : "text-white/40"}`}>
            {status.running
              ? currentEntry
                ? "Improving…"
                : "Starting…"
              : status.enabled
              ? completedCount > 0
                ? `${completedCount} improvement${completedCount !== 1 ? "s" : ""}`
                : "Ready"
              : "Self-Improve"}
          </span>
        </div>

        {/* Expand/collapse log button */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="p-1 text-white/30 hover:text-white/70 transition-colors"
          title={expanded ? "Hide log" : "Show log"}
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
