import { NextRequest, NextResponse } from "next/server";
import { getSessionStatus } from "@/lib/agent";

// POST /api/sessions/status
// Body: { sessionIds: string[] }
// Returns: { [sessionId]: "running" | "paused" | "unloaded" }
export async function POST(req: NextRequest) {
  const { sessionIds } = (await req.json()) as { sessionIds: string[] };
  const result: Record<string, string> = {};
  for (const id of sessionIds) {
    result[id] = getSessionStatus(id);
  }
  return NextResponse.json(result);
}
