"use client";

import { useState, useEffect, type ReactNode } from "react";

/**
 * DeferredIsland — defers rendering of heavy child components until the
 * browser is idle, keeping them off the critical rendering path.
 *
 * Uses `requestIdleCallback` where available, falls back to a short
 * `setTimeout` so the main thread can paint first.
 *
 * Once hydrated, the children fade in with a smooth opacity transition.
 */
export function DeferredIsland({
  children,
  fallback = null,
  timeoutMs = 2000,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  timeoutMs?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Use requestIdleCallback if available, with a timeout ceiling
    if ("requestIdleCallback" in window) {
      const id = (window as unknown as { requestIdleCallback: (cb: () => void, opts: { timeout: number }) => number })
        .requestIdleCallback(() => setReady(true), { timeout: timeoutMs });
      return () =>
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(id);
    }

    // Fallback: short delay so paint completes first
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, [timeoutMs]);

  if (!ready) return <>{fallback}</>;

  return (
    <div
      style={{
        animation: "deferredFadeIn 300ms ease-out forwards",
        opacity: 0,
      }}
    >
      <style>{`
        @keyframes deferredFadeIn {
          to { opacity: 1; }
        }
      `}</style>
      {children}
    </div>
  );
}
