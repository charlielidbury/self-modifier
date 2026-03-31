"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useBackend } from "@/hooks/use-backend";
import { useRpcSubscription } from "@/hooks/use-rpc-subscription";

type CodebaseId = {
  shortHash: string;
  fullHash: string;
  commitCount: number;
  message: string;
  timestamp: string;
  loc: number;
  fileCount: number;
  generation: number;
  filesChanged: number;
};

/**
 * CodebaseHeartbeat
 *
 * A living DNA signature displayed in the navbar. Shows the current git hash
 * as a styled "genome marker" that pulses subtly and morphs with a satisfying
 * animation when the codebase evolves (e.g. after a self-improve commit).
 *
 * Clicking it reveals a detailed popover with codebase vitals.
 */
export function CodebaseHeartbeat() {
  const [data, setData] = useState<CodebaseId | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [justMutated, setJustMutated] = useState(false);
  const [prevHash, setPrevHash] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mutationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const backend = useBackend();

  const fetchData = useCallback(async () => {
    if (!backend) return;
    try {
      const json = await backend.getCodebaseId() as CodebaseId;

      // Detect mutation
      if (prevHash && json.shortHash !== prevHash) {
        setJustMutated(true);
        clearTimeout(mutationTimerRef.current);
        mutationTimerRef.current = setTimeout(() => setJustMutated(false), 2400);
      }
      setPrevHash(json.shortHash);
      setData(json);
    } catch {
      // Silently fail — not critical
    }
  }, [backend, prevHash]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when self-improve commits land
  useRpcSubscription("self-improve:status", () => {
    // Small delay so git has time to settle
    setTimeout(fetchData, 1500);
  });

  // Close popover when clicking outside
  useEffect(() => {
    if (!showPopover) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setShowPopover(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [showPopover]);

  // Cleanup
  useEffect(() => {
    return () => clearTimeout(mutationTimerRef.current);
  }, []);

  if (!data) return null;

  // Format the hash as a DNA-like display: split into codons
  const codons = data.shortHash.match(/.{1,2}/g) ?? [data.shortHash];

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowPopover((v) => !v)}
        className={[
          "group flex items-center gap-1 h-7 px-2 rounded-md border transition-all duration-300 text-[10px] font-mono tracking-widest",
          justMutated
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 heartbeat-mutate"
            : "border-border/40 bg-muted/30 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60 hover:border-border/60",
        ].join(" ")}
        aria-label="Codebase identity"
        title="Codebase genome"
      >
        {/* Pulsing dot — "alive" indicator */}
        <span className="relative flex h-1.5 w-1.5 mr-0.5">
          <span
            className={[
              "absolute inline-flex h-full w-full rounded-full opacity-50",
              justMutated
                ? "bg-emerald-400 animate-ping"
                : "bg-current heartbeat-pulse",
            ].join(" ")}
          />
          <span
            className={[
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              justMutated ? "bg-emerald-400" : "bg-current",
            ].join(" ")}
          />
        </span>

        {/* Hash codons with staggered color */}
        {codons.map((codon, i) => (
          <span
            key={i}
            className={[
              "transition-all duration-500",
              justMutated ? "heartbeat-codon-flash" : "",
            ].join(" ")}
            style={{
              animationDelay: justMutated ? `${i * 80}ms` : undefined,
              opacity: justMutated ? undefined : 0.5 + (i / codons.length) * 0.5,
            }}
          >
            {codon}
          </span>
        ))}

        {/* Generation badge */}
        {data.generation > 0 && (
          <span
            className={[
              "ml-0.5 text-[8px] font-semibold tabular-nums",
              justMutated
                ? "text-emerald-400/80"
                : "text-muted-foreground/30 group-hover:text-muted-foreground/50",
            ].join(" ")}
          >
            G{data.generation}
          </span>
        )}
      </button>

      {/* Popover with codebase vitals */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute top-full mt-2 right-0 z-50 w-64 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl overflow-hidden heartbeat-popover-in"
        >
          {/* Header */}
          <div className="px-3.5 pt-3 pb-2 border-b border-border/40">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                Codebase Genome
              </span>
              <span className="ml-auto text-[9px] font-mono text-muted-foreground/30">
                {data.shortHash}
              </span>
            </div>
            {data.message && (
              <p className="mt-1 text-[11px] text-foreground/70 leading-snug truncate">
                {data.message}
              </p>
            )}
          </div>

          {/* Vitals grid */}
          <div className="grid grid-cols-2 gap-px bg-border/20">
            <Vital label="Lines of Code" value={data.loc.toLocaleString()} icon="📝" />
            <Vital label="Source Files" value={data.fileCount.toLocaleString()} icon="📁" />
            <Vital label="Total Commits" value={data.commitCount.toLocaleString()} icon="🔗" />
            <Vital label="Generations" value={data.generation.toLocaleString()} icon="🧬" />
          </div>

          {/* Full hash */}
          <div className="px-3.5 py-2 border-t border-border/30">
            <button
              onClick={() => {
                navigator.clipboard.writeText(data.fullHash);
              }}
              className="w-full text-left text-[9px] font-mono text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors truncate"
              title="Click to copy full hash"
            >
              {data.fullHash}
            </button>
          </div>

          {/* Timestamp */}
          {data.timestamp && (
            <div className="px-3.5 pb-2.5">
              <span className="text-[9px] text-muted-foreground/25">
                Last evolved: {formatTimestamp(data.timestamp)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Vital({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-popover px-3.5 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px]">{icon}</span>
        <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <p className="mt-0.5 text-sm font-bold text-foreground/80 tabular-nums font-mono">
        {value}
      </p>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
  } catch {
    return ts;
  }
}
