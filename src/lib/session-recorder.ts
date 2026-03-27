/**
 * Session Flight Recorder — persists full activity traces of each
 * self-improve session to disk so they survive server restarts.
 *
 * Each session is stored as a JSON file in .self-improve-sessions/
 * containing the full activity event stream plus metadata.
 */

import fs from "fs";
import path from "path";
import type { ActivityEvent, ImprovementEntry } from "./self-improve";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SessionRecord = {
  /** Session ID (matches ImprovementEntry.id) */
  id: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "failed" | "reverted";
  summary: string;
  /** Genome info at time of session */
  genome: {
    id: string;
    generation: number;
    focus: string;
    ambition: number;
    creativity: number;
    thoroughness: number;
  } | null;
  /** Duration in milliseconds */
  durationMs: number;
  /** Total activity events in this session */
  eventCount: number;
  /** Total tool calls made */
  toolCallCount: number;
  /** Unique tools used */
  toolsUsed: string[];
};

export type SessionDetail = SessionRecord & {
  /** Full activity event stream */
  events: ActivityEvent[];
};

// ── Storage ────────────────────────────────────────────────────────────────────

const SESSIONS_DIR = path.resolve(process.cwd(), ".self-improve-sessions");
const MAX_SESSIONS = 100; // Keep the last 100 sessions on disk

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * Save a completed session's full activity trace to disk.
 */
export function saveSession(
  entry: ImprovementEntry,
  events: ActivityEvent[],
  genome: SessionRecord["genome"],
): SessionRecord {
  ensureDir();

  const startTime = new Date(entry.startedAt).getTime();
  const endTime = entry.completedAt
    ? new Date(entry.completedAt).getTime()
    : Date.now();

  const toolCalls = events.filter((e) => e.kind === "tool_call");
  const toolsUsed = [...new Set(toolCalls.map((e) => e.tool).filter(Boolean))] as string[];

  const record: SessionRecord = {
    id: entry.id,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt ?? new Date().toISOString(),
    status: entry.status as "completed" | "failed" | "reverted",
    summary: entry.summary ?? "(no summary)",
    genome,
    durationMs: endTime - startTime,
    eventCount: events.length,
    toolCallCount: toolCalls.length,
    toolsUsed,
  };

  const detail: SessionDetail = {
    ...record,
    events: events.map((e) => ({ ...e })), // defensive copy
  };

  const filePath = path.join(SESSIONS_DIR, `${entry.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(detail, null, 2), "utf-8");

  // Prune old sessions if over limit
  pruneOldSessions();

  return record;
}

/**
 * List all saved sessions (metadata only, no events).
 * Returns newest first.
 */
export function listSessions(): SessionRecord[] {
  ensureDir();

  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // newest first by UUID + timestamp

  const sessions: SessionRecord[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as SessionDetail;
      // Return metadata without events
      const { events: _events, ...metadata } = data;
      sessions.push(metadata);
    } catch {
      // Skip corrupt files
    }
  }

  // Sort by startedAt descending (most recent first)
  sessions.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return sessions;
}

/**
 * Load a specific session's full detail (including events).
 */
export function loadSession(id: string): SessionDetail | null {
  ensureDir();

  const filePath = path.join(SESSIONS_DIR, `${id}.json`);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SessionDetail;
  } catch {
    return null;
  }
}

/**
 * Remove oldest sessions if we exceed MAX_SESSIONS.
 */
function pruneOldSessions(): void {
  const sessions = listSessions();
  if (sessions.length <= MAX_SESSIONS) return;

  const toRemove = sessions.slice(MAX_SESSIONS);
  for (const session of toRemove) {
    const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
}

/**
 * Get aggregate stats across all recorded sessions.
 */
export function getSessionStats(): {
  totalSessions: number;
  completedCount: number;
  failedCount: number;
  revertedCount: number;
  avgDurationMs: number;
  avgToolCalls: number;
  totalEvents: number;
  mostUsedTools: { tool: string; count: number }[];
} {
  const sessions = listSessions();

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      completedCount: 0,
      failedCount: 0,
      revertedCount: 0,
      avgDurationMs: 0,
      avgToolCalls: 0,
      totalEvents: 0,
      mostUsedTools: [],
    };
  }

  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const failedCount = sessions.filter((s) => s.status === "failed").length;
  const revertedCount = sessions.filter((s) => s.status === "reverted").length;
  const avgDurationMs =
    sessions.reduce((sum, s) => sum + s.durationMs, 0) / sessions.length;
  const avgToolCalls =
    sessions.reduce((sum, s) => sum + s.toolCallCount, 0) / sessions.length;
  const totalEvents = sessions.reduce((sum, s) => sum + s.eventCount, 0);

  // Count tool usage across all sessions
  const toolCounts: Record<string, number> = {};
  for (const s of sessions) {
    for (const tool of s.toolsUsed) {
      toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
    }
  }
  const mostUsedTools = Object.entries(toolCounts)
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalSessions: sessions.length,
    completedCount,
    failedCount,
    revertedCount,
    avgDurationMs: Math.round(avgDurationMs),
    avgToolCalls: Math.round(avgToolCalls * 10) / 10,
    totalEvents,
    mostUsedTools,
  };
}
