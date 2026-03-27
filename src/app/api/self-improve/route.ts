import { selfImproveState, startImprovementLoop } from "@/lib/self-improve";

export const maxDuration = 30;

export async function GET() {
  return Response.json({
    enabled: selfImproveState.enabled,
    running: selfImproveState.running,
    entries: selfImproveState.entries,
    suggestion: selfImproveState.suggestion,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { enabled?: boolean; suggestion?: string };

  // Update suggestion if provided (can be set independently of toggling)
  if (typeof body.suggestion === "string") {
    selfImproveState.suggestion = body.suggestion;
  }

  // Toggle enabled state if provided
  if (typeof body.enabled === "boolean") {
    selfImproveState.enabled = body.enabled;

    if (body.enabled) {
      startImprovementLoop();
    }
  }

  return Response.json({
    enabled: selfImproveState.enabled,
    running: selfImproveState.running,
    entries: selfImproveState.entries,
    suggestion: selfImproveState.suggestion,
  });
}
