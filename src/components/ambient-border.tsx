"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * AmbientBorder — a full-viewport edge glow that reflects the self-improve
 * agent's current state, making the entire app feel alive.
 *
 *  - **off**:    invisible — no glow
 *  - **idle**:   gentle breathing blue glow on all edges
 *  - **active**: pulsing purple/blue glow that orbits the viewport edges
 *  - **commit**: bright emerald→gold flash that fades out
 *
 * Uses inset box-shadows for GPU-composited performance (single DOM element,
 * no canvas, no repaints beyond the compositor layer).
 */

type BorderState = "off" | "idle" | "active" | "commit";

export function AmbientBorder() {
  const [state, setState] = useState<BorderState>("off");
  const stateRef = useRef<BorderState>("off");
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync ref
  const updateState = useCallback((next: BorderState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Poll the self-improve API to determine agent state
  useEffect(() => {
    let cancelled = false;
    let lastEventId = 0;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/self-improve/activity?since=${lastEventId}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();

        const newEvents: { id: number; kind: string; content: string }[] =
          data.events ?? [];
        if (newEvents.length > 0) {
          lastEventId = newEvents[newEvents.length - 1].id;
        }

        // Detect commits
        const hasCommit = newEvents.some(
          (e) => e.kind === "text" && e.content.includes("DONE [")
        );

        if (hasCommit) {
          triggerCommit();
        } else if (data.running) {
          if (stateRef.current !== "commit") {
            updateState("active");
          }
        } else {
          // Check if agent is enabled
          try {
            const statusRes = await fetch("/api/self-improve");
            if (statusRes.ok) {
              const status = await statusRes.json();
              if (stateRef.current !== "commit") {
                updateState(status.enabled ? "idle" : "off");
              }
            }
          } catch {
            if (stateRef.current !== "commit") updateState("off");
          }
        }
      } catch {
        // Network error — hold state
      }

      if (!cancelled) setTimeout(poll, 2000);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [updateState]);

  // Listen for commit celebration events from the self-improve toggle
  useEffect(() => {
    function handleCommit() {
      triggerCommit();
    }
    window.addEventListener("self-improve:commit", handleCommit);
    return () => window.removeEventListener("self-improve:commit", handleCommit);
  }, []);

  function triggerCommit() {
    // Clear any existing commit timeout
    if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    updateState("commit");
    // After the commit animation plays (2.5s), transition back to idle
    commitTimeoutRef.current = setTimeout(() => {
      updateState("idle");
    }, 2500);
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    };
  }, []);

  if (state === "off") return null;

  return (
    <div
      className={`ambient-border ambient-border-${state}`}
      aria-hidden="true"
    />
  );
}
