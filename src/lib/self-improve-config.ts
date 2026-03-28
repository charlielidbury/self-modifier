/**
 * Self-Improve Configuration — persistent, user-configurable settings
 * for the self-improvement loop.
 *
 * Stored in .self-improve-config.json at the project root.
 */

import fs from "fs";
import path from "path";

// ── Types ──────────────────────────────────────────────────────────────────

export type SelfImproveConfig = {
  /** Base cooldown between sessions in seconds (default 60) */
  cooldownSeconds: number;
  /** Multiplier applied after a failed session (default 3) */
  failureMultiplier: number;
  /** Multiplier applied after a reverted session (default 5) */
  revertMultiplier: number;
  /** Maximum cooldown in seconds, caps exponential backoff (default 600 = 10 min) */
  maxCooldownSeconds: number;
  /** Number of consecutive failures before reaching max cooldown (default 3) */
  backoffSteps: number;
  /** Maximum agent turns per session (default 50) */
  maxTurns: number;
};

export const DEFAULT_CONFIG: SelfImproveConfig = {
  cooldownSeconds: 60,
  failureMultiplier: 3,
  revertMultiplier: 5,
  maxCooldownSeconds: 600,
  backoffSteps: 3,
  maxTurns: 50,
};

// ── Persistence ────────────────────────────────────────────────────────────

const CONFIG_FILE = path.resolve(process.cwd(), ".self-improve-config.json");

export function readConfig(): SelfImproveConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const data = JSON.parse(raw) as Partial<SelfImproveConfig>;
    // Merge with defaults to handle missing fields
    return { ...DEFAULT_CONFIG, ...data };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: Partial<SelfImproveConfig>): SelfImproveConfig {
  const current = readConfig();
  const merged = { ...current, ...config };
  // Clamp values to sensible ranges
  merged.cooldownSeconds = Math.max(5, Math.min(3600, merged.cooldownSeconds));
  merged.failureMultiplier = Math.max(1, Math.min(20, merged.failureMultiplier));
  merged.revertMultiplier = Math.max(1, Math.min(20, merged.revertMultiplier));
  merged.maxCooldownSeconds = Math.max(merged.cooldownSeconds, Math.min(7200, merged.maxCooldownSeconds));
  merged.backoffSteps = Math.max(1, Math.min(10, merged.backoffSteps));
  merged.maxTurns = Math.max(5, Math.min(200, merged.maxTurns));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

// ── Cooldown calculator ────────────────────────────────────────────────────

export type CooldownState = {
  /** Total cooldown duration in ms */
  durationMs: number;
  /** When the cooldown started (ISO string) */
  startedAt: string;
  /** When the cooldown ends (ISO string) */
  endsAt: string;
  /** Why this cooldown duration was chosen */
  reason: string;
};

/**
 * Compute the cooldown duration for the next pause based on the last
 * session outcome and the streak of consecutive non-successes.
 */
export function computeCooldown(
  outcome: "completed" | "failed" | "reverted",
  consecutiveFailures: number,
): CooldownState {
  const config = readConfig();
  let durationSec: number;
  let reason: string;

  if (outcome === "completed") {
    durationSec = config.cooldownSeconds;
    reason = `Base cooldown (${config.cooldownSeconds}s)`;
  } else if (outcome === "reverted") {
    const multiplier = Math.min(
      config.revertMultiplier * Math.pow(1.5, Math.min(consecutiveFailures, config.backoffSteps)),
      config.maxCooldownSeconds / config.cooldownSeconds,
    );
    durationSec = Math.min(config.cooldownSeconds * multiplier, config.maxCooldownSeconds);
    reason = `Revert backoff: ${config.cooldownSeconds}s × ${multiplier.toFixed(1)} (${consecutiveFailures} consecutive failure${consecutiveFailures !== 1 ? "s" : ""})`;
  } else {
    // failed
    const multiplier = Math.min(
      config.failureMultiplier * Math.pow(1.5, Math.min(consecutiveFailures, config.backoffSteps)),
      config.maxCooldownSeconds / config.cooldownSeconds,
    );
    durationSec = Math.min(config.cooldownSeconds * multiplier, config.maxCooldownSeconds);
    reason = `Failure backoff: ${config.cooldownSeconds}s × ${multiplier.toFixed(1)} (${consecutiveFailures} consecutive failure${consecutiveFailures !== 1 ? "s" : ""})`;
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + durationSec * 1000);

  return {
    durationMs: durationSec * 1000,
    startedAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    reason,
  };
}
