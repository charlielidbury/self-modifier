/**
 * Shared RPC interface between server and client.
 *
 * Import the type on the client side — the server implements it as an RpcTarget.
 * Cap'n Web supports bidirectional RPC: callback parameters (like `onEvent`)
 * become stubs the server can call back to the client over the same WebSocket.
 */

import type {
  StreamEvent,
  SessionInfo,
  ChatMessage,
  GitCommit,
  CommitDiff,
  WorkingDiffResponse,
  HotspotsResponse,
  RecentlyModifiedRoute,
} from "../types";
import type { ImprovementEntry, BuildHealthStatus, ActivityEvent } from "../self-improve";
import type { CooldownState } from "../self-improve-config";

// ── Response types ──────────────────────────────────────────────────────────

export type SelfImproveStatus = {
  enabled: boolean;
  running: boolean;
  entries: ImprovementEntry[];
  suggestion: string;
  cooldown: CooldownState | null;
};

export type CodebaseInfo = {
  shortHash: string;
  fullHash: string;
  commitCount: number;
  message: string;
  timestamp: string;
  loc: number;
  fileCount: number;
  generation: number;
  filesChanged: number;
};

export type EtaResponse = {
  estimateMs: number;
  avgMs: number;
  medianMs: number;
  recentAvgMs: number;
  sessionCount: number;
  runningStartedAt: string | null;
};

export type TelegramStatus = {
  configured: boolean;
  polling?: boolean;
  bot?: unknown;
  message?: string;
};

export type FeedbackResult = {
  ok: boolean;
  genomeId: string | null;
  fitnessDelta: number;
  rating: "up" | "down" | null;
};

// ── Main RPC interface ──────────────────────────────────────────────────────

export interface SelfModifierBackend {
  // ── Chat ──
  chat(
    message: string,
    sessionId: string | null,
    images: string[] | null,
    cwd: string | null,
    onEvent: (event: StreamEvent) => void,
  ): Promise<{ sessionId: string }>;

  // ── Sessions ──
  getSessions(cwd?: string): Promise<SessionInfo[]>;
  getSessionMessages(id: string): Promise<ChatMessage[]>;
  deleteSession(id: string): Promise<void>;
  renameSession(id: string, name: string): Promise<void>;
  getSessionStatuses(sessionIds: string[]): Promise<Record<string, string>>;

  // ── Self-Improve Core ──
  getSelfImproveStatus(): Promise<SelfImproveStatus>;
  setSelfImproveEnabled(enabled: boolean): Promise<SelfImproveStatus>;
  setSelfImproveSuggestion(suggestion: string): Promise<SelfImproveStatus>;
  getActivity(since?: number): Promise<{ events: ActivityEvent[]; running: boolean }>;

  // ── Git & Commits ──
  getCommits(): Promise<{ commits: GitCommit[] }>;
  getCommitDiff(hash: string): Promise<CommitDiff>;
  getWorkingDiff(): Promise<WorkingDiffResponse>;
  getHotspots(): Promise<HotspotsResponse>;
  getRecentlyModified(): Promise<{ routes: RecentlyModifiedRoute[] }>;
  getCodebaseId(): Promise<CodebaseInfo>;

  // ── Build & Config ──
  getBuildHealth(): Promise<{ health: BuildHealthStatus | null }>;
  getCooldown(): Promise<{ cooldown: CooldownState | null; consecutiveFailures: number }>;
  resetCooldown(): Promise<{ skipped: boolean; cooldown: CooldownState | null }>;
  getConfig(): Promise<Record<string, unknown>>;
  setConfig(config: Record<string, unknown>): Promise<Record<string, unknown>>;
  getPrompt(): Promise<string>;
  setPrompt(prompt: string): Promise<string>;

  // ── Genetics ──
  getGenome(): Promise<unknown>;
  resetGenome(): Promise<unknown>;
  getLineage(): Promise<unknown>;

  // ── Feedback ──
  getFeedback(): Promise<Record<string, unknown>>;
  submitFeedback(hash: string, rating: "up" | "down" | null): Promise<FeedbackResult>;

  // ── Queue ──
  getQueue(): Promise<{ items: unknown[] }>;
  queueAction(action: string, payload: Record<string, unknown>): Promise<{ items: unknown[] }>;

  // ── Self-Improve Sessions ──
  getSelfImproveSessions(withStats?: boolean): Promise<unknown>;
  getSelfImproveSession(id: string): Promise<unknown>;
  getEta(): Promise<EtaResponse>;

  // ── Memory ──
  getMemories(): Promise<{ memories: unknown[] }>;
  deleteMemory(id?: string, clearAll?: boolean): Promise<{ memories: unknown[] }>;

  // ── Telegram ──
  getTelegramStatus(): Promise<TelegramStatus>;

  // ── Push Subscriptions (server calls back to client) ──
  subscribe(onEvent: (channel: string, data: unknown) => void): Promise<void>;

  // ── Session-specific streaming (multi-tab sync) ──
  subscribeSession(sessionId: string, onEvent: (event: StreamEvent) => void): Promise<void>;
}
