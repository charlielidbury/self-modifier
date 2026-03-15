// In-memory pub/sub for broadcasting stream events to all SSE subscribers
// of a given session. Shared across route handlers within the same Node.js process.

type Listener = (eventJson: string) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(sessionId: string, listener: Listener): () => void {
  if (!listeners.has(sessionId)) {
    listeners.set(sessionId, new Set());
  }
  listeners.get(sessionId)!.add(listener);
  return () => {
    const set = listeners.get(sessionId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) listeners.delete(sessionId);
    }
  };
}

export function broadcast(sessionId: string, eventJson: string): void {
  listeners.get(sessionId)?.forEach((cb) => cb(eventJson));
}
