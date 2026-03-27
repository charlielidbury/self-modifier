import { listSessions, getSessionStats } from "@/lib/session-recorder";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeStats = url.searchParams.get("stats") === "true";

  const sessions = listSessions();

  if (includeStats) {
    const stats = getSessionStats();
    return Response.json({ sessions, stats });
  }

  return Response.json({ sessions });
}
