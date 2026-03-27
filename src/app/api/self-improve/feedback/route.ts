import { NextRequest, NextResponse } from "next/server";
import {
  getAllFeedback,
  setFeedback,
  type FeedbackRating,
} from "@/lib/commit-feedback";
import { applyFeedbackFitness } from "@/lib/strategy-genes";

/**
 * GET /api/self-improve/feedback
 * Returns all commit feedback entries so the UI can show ratings.
 */
export async function GET() {
  const feedback = getAllFeedback();
  return NextResponse.json(feedback);
}

/**
 * POST /api/self-improve/feedback
 * Body: { commitHash: string, rating: "up" | "down" | null }
 * Sets user feedback for a commit and adjusts genome fitness.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { commitHash, rating } = body as {
      commitHash: string;
      rating: FeedbackRating;
    };

    if (!commitHash || typeof commitHash !== "string") {
      return NextResponse.json(
        { error: "commitHash is required" },
        { status: 400 },
      );
    }

    if (rating !== "up" && rating !== "down" && rating !== null) {
      return NextResponse.json(
        { error: "rating must be 'up', 'down', or null" },
        { status: 400 },
      );
    }

    const { genomeId, fitnessDelta } = setFeedback(commitHash, rating);

    // Apply the fitness delta to the genome in the gene pool
    if (genomeId && fitnessDelta !== 0) {
      applyFeedbackFitness(genomeId, fitnessDelta);
    }

    return NextResponse.json({
      ok: true,
      genomeId,
      fitnessDelta,
      rating,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
