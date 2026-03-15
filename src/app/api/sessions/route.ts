import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionInfo } from "@/lib/types";

export async function GET() {
  try {
    const sessions = await listSessions({ dir: process.cwd(), limit: 50 });
    const result: SessionInfo[] = sessions.map((s) => ({
      sessionId: s.sessionId,
      summary: s.summary,
      lastModified: s.lastModified,
      createdAt: s.createdAt,
    }));
    return Response.json(result);
  } catch {
    return Response.json([]);
  }
}
