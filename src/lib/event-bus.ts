/**
 * Global server-side event bus for push-based communication.
 *
 * Server code emits typed events here; the SSE endpoint (/api/events)
 * subscribes and forwards them to all connected browsers. This replaces
 * all client-side polling with a single multiplexed SSE stream.
 *
 * Survives HMR via globalThis.
 */

export type EventBusEvent =
  | { channel: "self-improve:status"; data: { enabled: boolean; running: boolean; entries: unknown[]; suggestion: string } }
  | { channel: "self-improve:activity"; data: { events: unknown[]; running: boolean } }
  | { channel: "self-improve:commits" }
  | { channel: "sessions:status"; data: Record<string, string> }
  | { channel: "recently-modified" }
  | { channel: "telegram:update" };

type Listener = (event: EventBusEvent) => void;

type EventBusGlobal = {
  listeners: Set<Listener>;
  /** Last git HEAD hash, used to detect new commits */
  lastGitHead: string | null;
  /** Server-side git watcher interval */
  gitWatcherAlive: boolean;
};

const g = globalThis as typeof globalThis & { __eventBus?: EventBusGlobal };

if (!g.__eventBus) {
  g.__eventBus = {
    listeners: new Set(),
    lastGitHead: null,
    gitWatcherAlive: false,
  };
} else {
  // Patch missing fields for HMR safety
  g.__eventBus.listeners ??= new Set();
  g.__eventBus.lastGitHead ??= null;
  g.__eventBus.gitWatcherAlive ??= false;
}

const state = g.__eventBus;

/** Subscribe to all events. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

/** Emit an event to all subscribers (SSE connections). */
export function emit(event: EventBusEvent): void {
  for (const listener of state.listeners) {
    try {
      listener(event);
    } catch {
      // Don't let one bad listener kill others
    }
  }
}

/** Number of active SSE connections. */
export function subscriberCount(): number {
  return state.listeners.size;
}

// ── Server-side git watcher ──────────────────────────────────────────────────
// Polls git HEAD every 5s on the server side. When it changes, emits
// commits + recently-modified events so all connected browsers update instantly.
// This is far more efficient than N browsers each polling independently.

import { execSync } from "child_process";

function getGitHead(): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      cwd: process.cwd(),
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

export function startGitWatcher(): void {
  if (state.gitWatcherAlive) return;
  state.gitWatcherAlive = true;

  // Initialize with current HEAD
  state.lastGitHead = getGitHead();

  const check = () => {
    if (!state.gitWatcherAlive) return;

    const head = getGitHead();
    if (head && head !== state.lastGitHead) {
      state.lastGitHead = head;
      // New commit detected — push to all browsers
      emit({ channel: "self-improve:commits" });
      emit({ channel: "recently-modified" });
    }

    // Only keep watching if there are subscribers
    if (state.listeners.size > 0) {
      setTimeout(check, 5000);
    } else {
      // No subscribers — sleep longer, check again later
      setTimeout(check, 15000);
    }
  };

  setTimeout(check, 5000);
}

export function stopGitWatcher(): void {
  state.gitWatcherAlive = false;
}
