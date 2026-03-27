import { selfImproveState } from "@/lib/self-improve";

export const dynamic = "force-dynamic";

/**
 * GET /api/self-improve/activity?since=<id>
 *
 * Returns activity events from the self-improve agent since the given event ID.
 * If `since` is omitted, returns the last 50 events.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");

  const activity = selfImproveState.activity;

  let events;
  if (sinceParam !== null) {
    const sinceId = parseInt(sinceParam, 10);
    // Find events with id > sinceId
    const startIdx = activity.findIndex((e) => e.id > sinceId);
    events = startIdx === -1 ? [] : activity.slice(startIdx);
  } else {
    // Return last 50 events
    events = activity.slice(-50);
  }

  return Response.json({
    events,
    running: selfImproveState.running,
  });
}
