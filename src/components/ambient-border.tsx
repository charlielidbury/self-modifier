"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useEventBus } from "@/hooks/use-event-bus";

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

  // Listen to SSE events to determine agent state (replaces polling)
  useEventBus("self-improve:activity", useCallback((raw: unknown) => {
    const data = raw as { events?: { id: number; kind: string; content: string }[]; running?: boolean };
    const newEvents = data.events ?? [];

    const hasCommit = newEvents.some(
      (e) => e.kind === "text" && e.content.includes("DONE [")
    );

    if (hasCommit) {
      triggerCommit();
    } else if (data.running) {
      if (stateRef.current !== "commit") {
        updateState("active");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState]));

  useEventBus("self-improve:status", useCallback((raw: unknown) => {
    const data = raw as { enabled?: boolean; running?: boolean };
    if (stateRef.current === "commit") return;

    if (data.running) {
      updateState("active");
    } else if (data.enabled) {
      updateState("idle");
    } else {
      updateState("off");
    }
  }, [updateState]));

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
