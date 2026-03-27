"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Client-side hook that connects to the server's SSE event bus (/api/events).
 *
 * Provides a single persistent EventSource connection per browser tab.
 * Components register listeners for specific channels. When the server
 * pushes an event, the matching callbacks fire immediately — no polling.
 *
 * Usage:
 *   useEventBus("self-improve:status", (data) => { ... });
 *   useEventBus("self-improve:commits", () => { fetchCommits(); });
 */

// ── Singleton EventSource shared across all hook instances ─────────────────

type Listener = (data: unknown) => void;

type EventBusSingleton = {
  source: EventSource | null;
  listeners: Map<string, Set<Listener>>;
  refCount: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
};

const g = (typeof window !== "undefined" ? window : {}) as {
  __eventBusSingleton?: EventBusSingleton;
};

function getSingleton(): EventBusSingleton {
  if (!g.__eventBusSingleton) {
    g.__eventBusSingleton = {
      source: null,
      listeners: new Map(),
      refCount: 0,
      reconnectTimer: null,
      reconnectDelay: 1000,
    };
  }
  return g.__eventBusSingleton;
}

function connect() {
  const s = getSingleton();
  if (s.source) return; // Already connected

  const es = new EventSource("/api/events");
  s.source = es;

  es.onopen = () => {
    s.reconnectDelay = 1000; // Reset backoff on success
  };

  es.onerror = () => {
    // EventSource auto-reconnects, but if it closes permanently we handle it
    if (es.readyState === EventSource.CLOSED) {
      s.source = null;
      // Exponential backoff reconnect
      if (!s.reconnectTimer && s.refCount > 0) {
        s.reconnectTimer = setTimeout(() => {
          s.reconnectTimer = null;
          if (s.refCount > 0) connect();
        }, s.reconnectDelay);
        s.reconnectDelay = Math.min(s.reconnectDelay * 2, 30_000);
      }
    }
  };

  // Register handlers for all known channels.
  // SSE named events arrive via addEventListener (not onmessage).
  for (const channel of s.listeners.keys()) {
    registerChannel(es, channel);
  }
}

function registerChannel(es: EventSource, channel: string) {
  es.addEventListener(channel, ((event: MessageEvent) => {
    const s = getSingleton();
    const listeners = s.listeners.get(channel);
    if (!listeners) return;
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      data = event.data;
    }
    for (const cb of listeners) {
      try {
        cb(data);
      } catch {
        // Don't let one bad listener kill others
      }
    }
  }) as EventListener);
}

function disconnect() {
  const s = getSingleton();
  if (s.source) {
    s.source.close();
    s.source = null;
  }
  if (s.reconnectTimer) {
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
  }
}

function addListener(channel: string, cb: Listener) {
  const s = getSingleton();
  if (!s.listeners.has(channel)) {
    s.listeners.set(channel, new Set());
    // If already connected, register this new channel
    if (s.source) {
      registerChannel(s.source, channel);
    }
  }
  s.listeners.get(channel)!.add(cb);
}

function removeListener(channel: string, cb: Listener) {
  const s = getSingleton();
  const set = s.listeners.get(channel);
  if (set) {
    set.delete(cb);
    if (set.size === 0) {
      s.listeners.delete(channel);
    }
  }
}

// ── Public hook ──────────────────────────────────────────────────────────────

/**
 * Subscribe to a specific event bus channel. The callback fires whenever
 * the server pushes an event on that channel.
 *
 * The hook manages the shared EventSource lifecycle — the connection is
 * opened when the first hook mounts and closed when the last unmounts.
 */
export function useEventBus(channel: string, callback: (data: unknown) => void): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  const stableCallback = useCallback((data: unknown) => {
    cbRef.current(data);
  }, []);

  useEffect(() => {
    const s = getSingleton();
    s.refCount++;
    addListener(channel, stableCallback);

    // Connect if this is the first subscriber
    if (s.refCount === 1) {
      connect();
    }

    return () => {
      removeListener(channel, stableCallback);
      s.refCount--;
      if (s.refCount <= 0) {
        s.refCount = 0;
        // Disconnect after a brief delay (avoids flicker during HMR / navigation)
        setTimeout(() => {
          if (s.refCount === 0) disconnect();
        }, 2000);
      }
    };
  }, [channel, stableCallback]);
}
