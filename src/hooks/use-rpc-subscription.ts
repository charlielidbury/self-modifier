"use client";

/**
 * Drop-in replacement for useEventBus that uses the Cap'n Web RPC connection
 * instead of SSE. Calls `backend.subscribe(onEvent)` once per connection and
 * dispatches events to per-channel listeners.
 *
 * Usage:
 *   useRpcSubscription("self-improve:status", (data) => { ... });
 *   useRpcSubscription("self-improve:commits", () => { fetchCommits(); });
 */

import { useEffect, useRef, useCallback } from "react";
import { useBackend } from "./use-backend";

type Listener = (data: unknown) => void;

// Module-level state shared across all hook instances in this tab.
type SubState = {
  listeners: Map<string, Set<Listener>>;
  subscribed: boolean;
};

const g = (typeof window !== "undefined" ? window : {}) as {
  __rpcSubState?: SubState;
};

function getState(): SubState {
  if (!g.__rpcSubState) {
    g.__rpcSubState = {
      listeners: new Map(),
      subscribed: false,
    };
  }
  return g.__rpcSubState;
}

function dispatch(channel: string, data: unknown) {
  const s = getState();
  const listeners = s.listeners.get(channel);
  if (!listeners) return;
  for (const cb of listeners) {
    try {
      cb(data);
    } catch {
      // Don't let one bad listener kill others
    }
  }
}

/**
 * Subscribe to a specific event channel via the RPC backend.
 * Drop-in replacement for `useEventBus(channel, callback)`.
 */
export function useRpcSubscription(channel: string, callback: (data: unknown) => void): void {
  const backend = useBackend();
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const stableCallback = useCallback((data: unknown) => {
    cbRef.current(data);
  }, []);

  // Register the per-channel listener
  useEffect(() => {
    const s = getState();
    if (!s.listeners.has(channel)) {
      s.listeners.set(channel, new Set());
    }
    s.listeners.get(channel)!.add(stableCallback);

    return () => {
      const set = s.listeners.get(channel);
      if (set) {
        set.delete(stableCallback);
        if (set.size === 0) s.listeners.delete(channel);
      }
    };
  }, [channel, stableCallback]);

  // Subscribe to the backend once per connection
  useEffect(() => {
    const s = getState();
    if (!backend || s.subscribed) return;
    s.subscribed = true;

    backend.subscribe((ch: string, data: unknown) => {
      dispatch(ch, data);
    }).catch(() => {
      // Connection lost — will re-subscribe on reconnect
      s.subscribed = false;
    });

    return () => {
      // On backend change (reconnect), allow re-subscription
      s.subscribed = false;
    };
  }, [backend]);
}
