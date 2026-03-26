import { selfImproveState, startImprovementLoop } from "@/lib/self-improve";

export const maxDuration = 30;

export async function GET() {
  return Response.json({
    enabled: selfImproveState.enabled,
    running: selfImproveState.running,
    entries: selfImproveState.entries,
  });
}

export async function POST(req: Request) {
  const { enabled } = (await req.json()) as { enabled: boolean };

  selfImproveState.enabled = enabled;

  if (enabled) {
    startImprovementLoop();
  }

  return Response.json({
    enabled: selfImproveState.enabled,
    running: selfImproveState.running,
    entries: selfImproveState.entries,
  });
}
