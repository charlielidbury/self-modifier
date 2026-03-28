import { listSessions } from "@/lib/session-recorder";
import { selfImproveState } from "@/lib/self-improve";

/**
 * GET /api/self-improve/eta
 *
 * Returns estimated session duration based on historical data,
 * plus the current running session's start time (if any).
 */
export async function GET() {
  const sessions = listSessions();

  // Only use completed sessions for ETA (not failed/reverted which may be much shorter)
  const completed = sessions.filter((s) => s.status === "completed");

  // Calculate average, median, p75 durations
  const durations = completed
    .map((s) => s.durationMs)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);

  const avgMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  const medianMs =
    durations.length > 0
      ? durations.length % 2 === 0
        ? Math.round(
            (durations[durations.length / 2 - 1] +
              durations[durations.length / 2]) /
              2,
          )
        : durations[Math.floor(durations.length / 2)]
      : 0;

  // Use the more recent sessions (last 5) for a "recent average" which better
  // reflects current prompt complexity
  const recentCompleted = completed.slice(0, 5);
  const recentDurations = recentCompleted
    .map((s) => s.durationMs)
    .filter((d) => d > 0);
  const recentAvgMs =
    recentDurations.length > 0
      ? Math.round(
          recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length,
        )
      : 0;

  // Best estimate: prefer recent average if we have at least 2 recent sessions,
  // otherwise fall back to overall median, then average
  const estimateMs =
    recentDurations.length >= 2
      ? recentAvgMs
      : medianMs > 0
        ? medianMs
        : avgMs > 0
          ? avgMs
          : 5 * 60 * 1000; // Default 5 min fallback

  // Current running session info
  const runningEntry = selfImproveState.entries.find(
    (e) => e.status === "running",
  );

  return Response.json({
    estimateMs,
    avgMs,
    medianMs,
    recentAvgMs,
    sessionCount: completed.length,
    runningStartedAt: runningEntry?.startedAt ?? null,
  });
}
