import { subscribe } from "@/lib/broadcast";

export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribe(sessionId, (eventJson) => {
        try {
          controller.enqueue(encoder.encode(`data: ${eventJson}\n\n`));
        } catch {
          // Stream already closed — unsubscribe will clean up.
        }
      });

      // Send a comment heartbeat every 15 s to keep the connection alive.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
