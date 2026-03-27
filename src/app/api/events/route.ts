import { subscribe, type EventBusEvent, startGitWatcher } from "@/lib/event-bus";

export const dynamic = "force-dynamic";

/**
 * GET /api/events — Server-Sent Events endpoint.
 *
 * Multiplexes all push events into a single SSE stream per browser tab.
 * Replaces all client-side polling with one persistent connection.
 *
 * Event format:
 *   event: <channel>
 *   data: <json>
 */
export async function GET() {
  // Ensure the git watcher is running
  startGitWatcher();

  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    unsub?.();
    unsub = null;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection confirmation
      controller.enqueue(encoder.encode(": connected\n\n"));

      const listener = (event: EventBusEvent) => {
        try {
          const dataPayload = "data" in event ? event.data : {};
          const message = `event: ${event.channel}\ndata: ${JSON.stringify(dataPayload)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          // Stream closed — clean up
          cleanup();
        }
      };

      unsub = subscribe(listener);

      // Heartbeat every 15s to keep connection alive
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, 15_000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
