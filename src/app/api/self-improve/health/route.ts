import { NextResponse } from "next/server";
import { selfImproveState } from "@/lib/self-improve";

export const dynamic = "force-dynamic";

export function GET() {
  const health = selfImproveState.buildHealth;
  return NextResponse.json({
    health: health ?? null,
  });
}
