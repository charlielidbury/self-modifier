import { runAgent } from "@/lib/agent";
import { broadcast } from "@/lib/broadcast";
import { setSessionCwd } from "@/lib/session-cwd";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { message, sessionId, images, cwd } = (await req.json()) as {
    message: string;
    sessionId?: string;
    images?: string[];
    cwd?: string;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let resolvedSessionId: string | null = null;

      try {
        for await (const event of runAgent(message, sessionId, images, cwd)) {
          if (event.type === "session") {
            resolvedSessionId = event.sessionId;
            // Record the cwd for this session so we can filter by it later.
            if (cwd) {
              setSessionCwd(resolvedSessionId, cwd).catch(() => {});
            }
            // Now we know the session — broadcast that a new user turn started.
            broadcast(
              resolvedSessionId,
              JSON.stringify({ type: "user_message", content: message })
            );
          }

          // Forward event to all other SSE subscribers for this session.
          if (resolvedSessionId) {
            broadcast(resolvedSessionId, JSON.stringify(event));
          }

          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const errEvent = JSON.stringify({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        if (resolvedSessionId) broadcast(resolvedSessionId, errEvent);
        controller.enqueue(encoder.encode(errEvent + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
