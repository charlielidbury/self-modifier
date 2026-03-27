/**
 * Commit Feedback — Human-in-the-loop signal for genome evolution.
 *
 * Tracks which genome produced each commit, and stores user ratings
 * (thumbs up/down) that feed back into genome fitness scores.
 * This closes the loop: genomes don't just survive by not breaking builds,
 * they survive by producing changes humans actually appreciate.
 */

import fs from "fs";
import path from "path";

export type FeedbackRating = "up" | "down" | null;

export type CommitFeedbackEntry = {
  genomeId: string;
  rating: FeedbackRating;
  ratedAt: string | null; // ISO timestamp of when user rated, null if unrated
};

export type FeedbackStore = Record<string, CommitFeedbackEntry>;

const FEEDBACK_FILE = path.resolve(process.cwd(), ".commit-feedback.json");

// ── Fitness deltas for user feedback ─────────────────────────────────────────
// These are intentionally significant — user preference is the strongest signal.
const FEEDBACK_FITNESS = {
  up: 2.0, // strong positive signal: user liked this
  down: -1.5, // strong negative signal: user disliked this
} as const;

// ── Persistence ──────────────────────────────────────────────────────────────

function readStore(): FeedbackStore {
  try {
    const raw = fs.readFileSync(FEEDBACK_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as FeedbackStore;
    }
  } catch {
    // File doesn't exist or malformed
  }
  return {};
}

function writeStore(store: FeedbackStore): void {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Record that a commit was produced by a specific genome.
 * Called when a self-improve session completes successfully.
 */
export function recordCommitGenome(
  commitHash: string,
  genomeId: string,
): void {
  const store = readStore();
  // Don't overwrite if there's already an entry with a rating
  if (store[commitHash]?.rating) return;
  store[commitHash] = {
    genomeId,
    rating: null,
    ratedAt: null,
  };
  writeStore(store);
}

/**
 * Set user feedback for a commit. Returns the fitness delta that was applied
 * to the genome (so the caller can apply it).
 */
export function setFeedback(
  commitHash: string,
  rating: FeedbackRating,
): { genomeId: string | null; fitnessDelta: number } {
  const store = readStore();
  const entry = store[commitHash];
  if (!entry) {
    return { genomeId: null, fitnessDelta: 0 };
  }

  const oldRating = entry.rating;

  // Calculate the net fitness delta: undo old rating, apply new one
  let delta = 0;
  if (oldRating === "up") delta -= FEEDBACK_FITNESS.up;
  if (oldRating === "down") delta -= FEEDBACK_FITNESS.down;
  if (rating === "up") delta += FEEDBACK_FITNESS.up;
  if (rating === "down") delta += FEEDBACK_FITNESS.down;

  entry.rating = rating;
  entry.ratedAt = rating ? new Date().toISOString() : null;
  writeStore(store);

  return { genomeId: entry.genomeId, fitnessDelta: delta };
}

/**
 * Get feedback for a specific commit.
 */
export function getFeedback(
  commitHash: string,
): CommitFeedbackEntry | null {
  const store = readStore();
  return store[commitHash] ?? null;
}

/**
 * Get all feedback entries (for the UI to display ratings on commits).
 */
export function getAllFeedback(): FeedbackStore {
  return readStore();
}
