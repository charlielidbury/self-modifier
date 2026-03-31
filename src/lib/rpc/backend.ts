/**
 * RPC backend implementation.
 *
 * Each WebSocket connection gets its own instance. Methods delegate to
 * existing business logic in src/lib/.
 */

import { RpcTarget } from "capnweb";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

import { runAgent, getSessionStatus } from "../agent";
import { broadcast, subscribe } from "../broadcast";
import { setSessionCwd, getAllSessionCwds } from "../session-cwd";
import { selfImproveState, startImprovementLoop, skipCooldown, type ActivityEvent, type BuildHealthStatus } from "../self-improve";
import { readConfig, writeConfig, type CooldownState } from "../self-improve-config";
import { getAllFeedback, setFeedback, type FeedbackRating } from "../commit-feedback";
import { applyFeedbackFitness, getGenePool, resetGenePool, getFullLineage } from "../strategy-genes";
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  completeItem,
  skipItem,
  requeueItem,
  clearCompleted,
} from "../improvement-queue";
import { listSessions as listRecordedSessions, loadSession, getSessionStats } from "../session-recorder";
import { readMemories, deleteMemory as delMemory, clearMemories } from "../self-improve-memory";
import { subscribe as subscribeEventBus, type EventBusEvent } from "../event-bus";
import { invalidateCache } from "../api-cache";

import type { StreamEvent, SessionInfo, ChatMessage, GitCommit, CommitDiff, WorkingDiffResponse, HotspotsResponse, RecentlyModifiedRoute } from "../types";
import type { SelfModifierBackend, SelfImproveStatus, CodebaseInfo, EtaResponse, TelegramStatus, FeedbackResult } from "./interface";

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: process.cwd(), encoding: "utf-8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}

function getProjectDir(): string {
  const cwd = process.cwd();
  const projectDirName = cwd.replace(/\//g, "-");
  return path.join(os.homedir(), ".claude", "projects", projectDirName);
}

async function loadRenames(): Promise<Record<string, string>> {
  const renamesPath = path.join(getProjectDir(), "self-modifier-renames.json");
  try {
    const content = await fs.promises.readFile(renamesPath, "utf-8");
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}

async function saveRenames(renames: Record<string, string>): Promise<void> {
  const renamesPath = path.join(getProjectDir(), "self-modifier-renames.json");
  await fs.promises.mkdir(path.dirname(renamesPath), { recursive: true });
  await fs.promises.writeFile(renamesPath, JSON.stringify(renames, null, 2), "utf-8");
}

function getSelfImproveStatusData(): SelfImproveStatus {
  return {
    enabled: selfImproveState.enabled,
    running: selfImproveState.running,
    entries: selfImproveState.entries,
    suggestion: selfImproveState.suggestion,
    cooldown: selfImproveState.cooldown,
  };
}

// ── Prompt file helpers ─────────────────────────────────────────────────────

const PROMPT_FILE = path.resolve(process.cwd(), ".self-improve-prompt.md");
const DEFAULT_PROMPT = "You are a self-improving AI agent. Make one focused improvement to this codebase, commit it, and report what you did.";

function readPromptFile(): string {
  try {
    return fs.readFileSync(PROMPT_FILE, "utf-8");
  } catch {
    return DEFAULT_PROMPT;
  }
}

function writePromptFile(content: string): void {
  fs.writeFileSync(PROMPT_FILE, content, "utf-8");
}

// ── Git helpers ─────────────────────────────────────────────────────────────

function parseTrailers(body: string): { agentSessionId?: string; agentCwd?: string; cleanBody?: string } {
  const sessionMatch = body.match(/^Agent-Session-Id:\s*(.+)$/m);
  const cwdMatch = body.match(/^Agent-Cwd:\s*(.+)$/m);
  let cleanBody = body
    .replace(/^Agent-Session-Id:\s*.+$/m, "")
    .replace(/^Agent-Cwd:\s*.+$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    agentSessionId: sessionMatch?.[1]?.trim(),
    agentCwd: cwdMatch?.[1]?.trim(),
    cleanBody: cleanBody || undefined,
  };
}

function computeCommits(): { commits: GitCommit[] } {
  try {
    const raw = execSync(
      `git log --format="%x1e%H%x00%h%x00%s%x00%aI%x00%an%x00%b" -100`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();
    if (!raw) return { commits: [] };

    const commits: GitCommit[] = raw.split("\x1e").filter(Boolean).map((record) => {
      const parts = record.trim().split("\x00");
      const rawBody = (parts[5] ?? "").trim();
      const trailers = rawBody ? parseTrailers(rawBody) : {};
      return {
        hash: parts[0] ?? "",
        shortHash: parts[1] ?? "",
        message: parts[2] ?? "",
        date: parts[3] ?? "",
        author: parts[4] ?? "",
        body: trailers.cleanBody || (rawBody || undefined),
        agentSessionId: trailers.agentSessionId,
        agentCwd: trailers.agentCwd,
      };
    });

    // Line-change stats
    try {
      const numstatRaw = execSync(
        `git log -100 --format="COMMIT:%H" --numstat`,
        { encoding: "utf-8", cwd: process.cwd() }
      ).trim();
      const lineStatsMap = new Map<string, { additions: number; deletions: number }>();
      let currentHash: string | null = null;
      let currentAdd = 0;
      let currentDel = 0;
      for (const line of numstatRaw.split("\n")) {
        if (line.startsWith("COMMIT:")) {
          if (currentHash) lineStatsMap.set(currentHash, { additions: currentAdd, deletions: currentDel });
          currentHash = line.slice(7).trim();
          currentAdd = 0;
          currentDel = 0;
        } else {
          const trimmed = line.trim();
          if (trimmed && /^\d/.test(trimmed)) {
            const p = trimmed.split("\t");
            currentAdd += parseInt(p[0] ?? "0", 10) || 0;
            currentDel += parseInt(p[1] ?? "0", 10) || 0;
          }
        }
      }
      if (currentHash) lineStatsMap.set(currentHash, { additions: currentAdd, deletions: currentDel });
      for (const commit of commits) {
        const stats = lineStatsMap.get(commit.hash);
        if (stats) {
          commit.additions = stats.additions;
          commit.deletions = stats.deletions;
        }
      }
    } catch { /* best-effort */ }

    return { commits };
  } catch {
    return { commits: [] };
  }
}

function computeCommitDiff(hash: string) {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error("Invalid hash");

  const message = execSync(`git log -1 --format="%s" ${hash}`, { encoding: "utf-8", cwd: process.cwd() }).trim();
  const numstatRaw = execSync(`git diff-tree --no-commit-id --numstat -r ${hash}`, { encoding: "utf-8", cwd: process.cwd() }).trim();
  const fileStats = numstatRaw.split("\n").filter(Boolean).map((line) => {
    const [add, del, ...pathParts] = line.split("\t");
    return { path: pathParts.join("\t"), additions: add === "-" ? 0 : parseInt(add!, 10), deletions: del === "-" ? 0 : parseInt(del!, 10) };
  });
  const diffRaw = execSync(`git diff-tree --no-commit-id -p -r ${hash}`, { encoding: "utf-8", cwd: process.cwd(), maxBuffer: 1024 * 1024 * 2 });
  const fileDiffs = new Map<string, string>();
  const diffSections = diffRaw.split(/^diff --git /m).filter(Boolean);
  for (const section of diffSections) {
    const headerMatch = section.match(/^a\/(.+?) b\/(.+)/m);
    if (headerMatch) {
      let patch = section;
      if (patch.length > 4000) patch = patch.slice(0, 4000) + "\n... (truncated)";
      fileDiffs.set(headerMatch[2]!, patch);
    }
  }

  let totalAdditions = 0;
  let totalDeletions = 0;
  const files = fileStats.map((stat, i) => {
    totalAdditions += stat.additions;
    totalDeletions += stat.deletions;
    return {
      path: stat.path,
      additions: stat.additions,
      deletions: stat.deletions,
      patch: i < 12 ? (fileDiffs.get(stat.path) ?? "") : "(patch omitted — too many files)",
    };
  });

  return { hash, message, files, totalAdditions, totalDeletions };
}

function computeWorkingDiff() {
  const cwd = process.cwd();
  const diff = execSync("git diff HEAD 2>/dev/null || git diff 2>/dev/null", {
    encoding: "utf-8", cwd, timeout: 10_000, maxBuffer: 1024 * 1024,
  }).trim();

  if (!diff) return { files: [], totalAdditions: 0, totalDeletions: 0, isEmpty: true };

  const files: { path: string; status: string; additions: number; deletions: number; patch: string }[] = [];
  const fileDiffs = diff.split(/^diff --git /m).filter(Boolean);

  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split("\n");
    const headerMatch = lines[0]?.match(/a\/(.+?)\s+b\/(.+)/);
    const filePath = headerMatch?.[2] ?? headerMatch?.[1] ?? "unknown";
    let status = "modified";
    if (fileDiff.includes("new file mode")) status = "added";
    else if (fileDiff.includes("deleted file mode")) status = "deleted";
    else if (fileDiff.includes("rename from")) status = "renamed";

    let additions = 0, deletions = 0;
    const patchLines: string[] = [];
    let inHunk = false;
    for (const line of lines) {
      if (line.startsWith("@@")) { inHunk = true; patchLines.push(line); }
      else if (inHunk) {
        patchLines.push(line);
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
    }
    files.push({ path: filePath, status, additions, deletions, patch: patchLines.join("\n") });
  }

  return {
    files,
    totalAdditions: files.reduce((s, f) => s + f.additions, 0),
    totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
    isEmpty: false,
  };
}

function computeHotspots() {
  try {
    const raw = execSync(`git log -100 --format="COMMIT:%H:%aI" --numstat`, { encoding: "utf-8", cwd: process.cwd(), timeout: 15_000 }).trim();
    if (!raw) return { files: [], totalFiles: 0, totalChanges: 0 };

    const fileMap = new Map<string, { additions: number; deletions: number; commitHashes: Set<string>; lastDate: string }>();
    let currentHash: string | null = null;
    let currentDate = "";

    for (const line of raw.split("\n")) {
      if (line.startsWith("COMMIT:")) {
        const parts = line.slice(7).split(":");
        currentHash = parts[0]!;
        currentDate = parts.slice(1).join(":");
      } else {
        const trimmed = line.trim();
        if (!trimmed || !currentHash) continue;
        const tabParts = trimmed.split("\t");
        if (tabParts.length < 3) continue;
        if (tabParts[0] === "-" && tabParts[1] === "-") continue;
        const adds = parseInt(tabParts[0]!, 10) || 0;
        const dels = parseInt(tabParts[1]!, 10) || 0;
        const filePath = tabParts.slice(2).join("\t");

        const existing = fileMap.get(filePath);
        if (existing) {
          existing.additions += adds;
          existing.deletions += dels;
          existing.commitHashes.add(currentHash);
          if (currentDate > existing.lastDate) existing.lastDate = currentDate;
        } else {
          fileMap.set(filePath, { additions: adds, deletions: dels, commitHashes: new Set([currentHash]), lastDate: currentDate });
        }
      }
    }

    const allFiles: { path: string; changes: number; additions: number; deletions: number; commitCount: number; lastModified: string }[] = [];
    let totalChanges = 0;
    for (const [p, stats] of fileMap) {
      const changes = stats.additions + stats.deletions;
      totalChanges += changes;
      allFiles.push({ path: p, changes, additions: stats.additions, deletions: stats.deletions, commitCount: stats.commitHashes.size, lastModified: stats.lastDate });
    }
    allFiles.sort((a, b) => b.changes - a.changes);
    return { files: allFiles.slice(0, 20), totalFiles: allFiles.length, totalChanges };
  } catch {
    return { files: [], totalFiles: 0, totalChanges: 0 };
  }
}

function filePathToRoute(filePath: string): string | null {
  const pageMatch = filePath.match(/^src\/app\/([^/]+)\/page\.tsx$/);
  if (pageMatch) return `/${pageMatch[1]}`;
  if (filePath === "src/app/page.tsx") return "/";
  const componentMappings: Record<string, string> = {
    "src/components/chat-": "/chat",
    "src/components/sessions-sidebar": "/chat",
    "src/components/assistant-ui/": "/chat",
  };
  for (const [prefix, route] of Object.entries(componentMappings)) {
    if (filePath.startsWith(prefix)) return route;
  }
  const apiMatch = filePath.match(/^src\/app\/api\/([^/]+)\//);
  if (apiMatch) {
    const apiMappings: Record<string, string> = { chat: "/chat", sessions: "/chat" };
    if (apiMappings[apiMatch[1]!]) return apiMappings[apiMatch[1]!]!;
  }
  return null;
}

function computeRecentlyModified(): { routes: { route: string; lastModified: string; commitMessage: string; shortHash: string }[] } {
  try {
    const raw = execSync(
      `git log --since="7 days ago" --format="COMMIT:%h%x00%s%x00%aI" --name-only -200`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();
    if (!raw) return { routes: [] };

    const routeMap = new Map<string, { route: string; lastModified: string; commitMessage: string; shortHash: string }>();
    let currentCommit: { shortHash: string; message: string; date: string } | null = null;

    for (const line of raw.split("\n")) {
      if (line.startsWith("COMMIT:")) {
        const parts = line.slice(7).split("\x00");
        currentCommit = { shortHash: parts[0] ?? "", message: parts[1] ?? "", date: parts[2] ?? "" };
      } else if (line.trim() && currentCommit) {
        const route = filePathToRoute(line.trim());
        if (route && !routeMap.has(route)) {
          routeMap.set(route, { route, lastModified: currentCommit.date, commitMessage: currentCommit.message, shortHash: currentCommit.shortHash });
        }
      }
    }
    return { routes: Array.from(routeMap.values()) };
  } catch {
    return { routes: [] };
  }
}

// ── Backend Implementation ──────────────────────────────────────────────────

export class SelfModifierBackendImpl extends RpcTarget implements SelfModifierBackend {

  // ── Chat ──

  async chat(
    message: string,
    sessionId: string | null,
    images: string[] | null,
    cwd: string | null,
    onEvent: (event: StreamEvent) => void,
  ): Promise<{ sessionId: string }> {
    let resolvedSessionId = "";
    try {
      for await (const event of runAgent(message, sessionId ?? undefined, images ?? undefined, cwd ?? undefined)) {
        if (event.type === "session") {
          resolvedSessionId = event.sessionId;
          if (cwd) setSessionCwd(resolvedSessionId, cwd).catch(() => {});
          broadcast(resolvedSessionId, JSON.stringify({ type: "user_message", content: message }));
        }
        if (resolvedSessionId) {
          broadcast(resolvedSessionId, JSON.stringify(event));
        }
        onEvent(event);
      }
    } catch (err) {
      const errEvent: StreamEvent = { type: "error", message: err instanceof Error ? err.message : String(err) };
      if (resolvedSessionId) broadcast(resolvedSessionId, JSON.stringify(errEvent));
      onEvent(errEvent);
    }
    return { sessionId: resolvedSessionId };
  }

  // ── Sessions ──

  async getSessions(cwd?: string): Promise<SessionInfo[]> {
    const [sessions, renames, sessionCwds] = await Promise.all([
      listSessions({ dir: process.cwd(), limit: 50 }),
      loadRenames(),
      getAllSessionCwds(),
    ]);
    let result: SessionInfo[] = sessions.map((s) => ({
      sessionId: s.sessionId,
      summary: renames[s.sessionId] ?? s.summary,
      lastModified: s.lastModified,
      createdAt: s.createdAt,
    }));
    if (cwd) {
      result = result.filter((s) => sessionCwds[s.sessionId] === cwd);
    } else {
      result = result.filter((s) => !sessionCwds[s.sessionId]);
    }
    return result;
  }

  async getSessionMessages(id: string): Promise<ChatMessage[]> {
    try {
      const messages = await getSessionMessages(id, { dir: process.cwd() });
      return messages as unknown as ChatMessage[];
    } catch {
      return [];
    }
  }

  async deleteSession(id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid session id");
    const projectDir = getProjectDir();
    const jsonlPath = path.join(projectDir, `${id}.jsonl`);
    try { await fs.promises.unlink(jsonlPath); } catch { /* may not exist */ }
    const sessionDir = path.join(projectDir, id);
    try {
      const stat = await fs.promises.stat(sessionDir);
      if (stat.isDirectory()) await fs.promises.rm(sessionDir, { recursive: true, force: true });
    } catch { /* may not exist */ }
  }

  async renameSession(id: string, name: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid session id");
    const renames = await loadRenames();
    renames[id] = name.trim();
    await saveRenames(renames);
  }

  async getSessionStatuses(sessionIds: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const id of sessionIds) {
      result[id] = getSessionStatus(id);
    }
    return result;
  }

  // ── Self-Improve Core ──

  async getSelfImproveStatus(): Promise<SelfImproveStatus> {
    return getSelfImproveStatusData();
  }

  async setSelfImproveEnabled(enabled: boolean): Promise<SelfImproveStatus> {
    selfImproveState.enabled = enabled;
    if (enabled) startImprovementLoop();
    return getSelfImproveStatusData();
  }

  async setSelfImproveSuggestion(suggestion: string): Promise<SelfImproveStatus> {
    selfImproveState.suggestion = suggestion;
    return getSelfImproveStatusData();
  }

  async getActivity(since?: number): Promise<{ events: ActivityEvent[]; running: boolean }> {
    const activity = selfImproveState.activity;
    let events;
    if (since !== undefined && since !== null) {
      const startIdx = activity.findIndex((e) => e.id > since);
      events = startIdx === -1 ? [] : activity.slice(startIdx);
    } else {
      events = activity.slice(-50);
    }
    return { events, running: selfImproveState.running };
  }

  // ── Git & Commits ──

  async getCommits(): Promise<{ commits: GitCommit[] }> {
    return computeCommits();
  }

  async getCommitDiff(hash: string): Promise<CommitDiff> {
    return computeCommitDiff(hash) as CommitDiff;
  }

  async getWorkingDiff(): Promise<WorkingDiffResponse> {
    return computeWorkingDiff() as WorkingDiffResponse;
  }

  async getHotspots(): Promise<HotspotsResponse> {
    return computeHotspots() as HotspotsResponse;
  }

  async getRecentlyModified(): Promise<{ routes: RecentlyModifiedRoute[] }> {
    return computeRecentlyModified() as { routes: RecentlyModifiedRoute[] };
  }

  async getCodebaseId(): Promise<CodebaseInfo> {
    const shortHash = run("git rev-parse --short HEAD");
    const fullHash = run("git rev-parse HEAD");
    const commitCount = parseInt(run("git rev-list --count HEAD") || "0", 10);
    const message = run("git log -1 --format=%s");
    const timestamp = run("git log -1 --format=%ci");
    const filesChanged = parseInt(run("git diff --stat HEAD~1 --numstat | wc -l") || "0", 10);
    const loc = parseInt(run("git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.css' | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'") || "0", 10);
    const fileCount = parseInt(run("git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.css' | wc -l") || "0", 10);
    const generation = parseInt(run("git log --oneline --all | grep -c 'improve:' || echo 0") || "0", 10);
    return { shortHash, fullHash, commitCount, message, timestamp, loc, fileCount, generation, filesChanged };
  }

  // ── Build & Config ──

  async getBuildHealth(): Promise<{ health: BuildHealthStatus | null }> {
    return { health: selfImproveState.buildHealth };
  }

  async getCooldown(): Promise<{ cooldown: CooldownState | null; consecutiveFailures: number }> {
    return { cooldown: selfImproveState.cooldown, consecutiveFailures: selfImproveState.consecutiveFailures };
  }

  async resetCooldown(): Promise<{ skipped: boolean; cooldown: CooldownState | null }> {
    const skipped = skipCooldown();
    return { skipped, cooldown: selfImproveState.cooldown };
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return readConfig() as Record<string, unknown>;
  }

  async setConfig(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    return writeConfig(config as Parameters<typeof writeConfig>[0]) as Record<string, unknown>;
  }

  async getPrompt(): Promise<string> {
    return readPromptFile();
  }

  async setPrompt(prompt: string): Promise<string> {
    writePromptFile(prompt);
    return readPromptFile();
  }

  // ── Genetics ──

  async getGenome(): Promise<unknown> {
    return getGenePool();
  }

  async resetGenome(): Promise<unknown> {
    invalidateCache("self-improve:genome", "self-improve:lineage");
    return resetGenePool();
  }

  async getLineage(): Promise<unknown> {
    const { nodes, maxGeneration, livingIds } = getFullLineage();
    return {
      nodes: nodes.map((n) => ({
        id: n.id, generation: n.generation, focus: n.focus, ambition: n.ambition,
        creativity: n.creativity, thoroughness: n.thoroughness, fitness: n.fitness,
        timesUsed: n.timesUsed, parentId: n.parentId, createdAt: n.createdAt,
        alive: n.alive, culledAtGeneration: n.culledAtGeneration,
        causeOfDeath: n.causeOfDeath, childIds: n.childIds,
      })),
      maxGeneration,
      livingIds: Array.from(livingIds),
    };
  }

  // ── Feedback ──

  async getFeedback(): Promise<Record<string, unknown>> {
    return getAllFeedback() as Record<string, unknown>;
  }

  async submitFeedback(hash: string, rating: "up" | "down" | null): Promise<FeedbackResult> {
    const { genomeId, fitnessDelta } = setFeedback(hash, rating as FeedbackRating);
    if (genomeId && fitnessDelta !== 0) {
      applyFeedbackFitness(genomeId, fitnessDelta);
    }
    return { ok: true, genomeId: genomeId ?? null, fitnessDelta, rating };
  }

  // ── Queue ──

  async getQueue(): Promise<{ items: unknown[] }> {
    return { items: getQueue() };
  }

  async queueAction(action: string, payload: Record<string, unknown>): Promise<{ items: unknown[] }> {
    switch (action) {
      case "add": {
        const text = payload.text as string;
        if (!text?.trim()) throw new Error("text is required");
        addToQueue(text);
        return { items: getQueue() };
      }
      case "remove": {
        if (!payload.id) throw new Error("id is required");
        removeFromQueue(payload.id as string);
        return { items: getQueue() };
      }
      case "reorder": {
        if (!payload.id || payload.newIndex === undefined) throw new Error("id and newIndex are required");
        const items = reorderQueue(payload.id as string, payload.newIndex as number);
        return { items };
      }
      case "complete": {
        if (!payload.id) throw new Error("id is required");
        completeItem(payload.id as string, payload.commitHash as string | undefined);
        return { items: getQueue() };
      }
      case "skip": {
        if (!payload.id) throw new Error("id is required");
        skipItem(payload.id as string);
        return { items: getQueue() };
      }
      case "requeue": {
        if (!payload.id) throw new Error("id is required");
        requeueItem(payload.id as string);
        return { items: getQueue() };
      }
      case "clear-completed": {
        clearCompleted();
        return { items: getQueue() };
      }
      default:
        throw new Error("unknown action");
    }
  }

  // ── Self-Improve Sessions ──

  async getSelfImproveSessions(withStats?: boolean): Promise<unknown> {
    const sessions = listRecordedSessions();
    if (withStats) {
      const stats = getSessionStats();
      return { sessions, stats };
    }
    return { sessions };
  }

  async getSelfImproveSession(id: string): Promise<unknown> {
    const session = loadSession(id);
    if (!session) throw new Error("Session not found");
    return session;
  }

  async getEta(): Promise<EtaResponse> {
    const sessions = listRecordedSessions();
    const completed = sessions.filter((s) => s.status === "completed");
    const durations = completed.map((s) => s.durationMs).filter((d) => d > 0).sort((a, b) => a - b);
    const avgMs = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const medianMs = durations.length > 0
      ? durations.length % 2 === 0
        ? Math.round((durations[durations.length / 2 - 1]! + durations[durations.length / 2]!) / 2)
        : durations[Math.floor(durations.length / 2)]!
      : 0;
    const recentCompleted = completed.slice(0, 5);
    const recentDurations = recentCompleted.map((s) => s.durationMs).filter((d) => d > 0);
    const recentAvgMs = recentDurations.length > 0 ? Math.round(recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length) : 0;
    const estimateMs = recentDurations.length >= 2 ? recentAvgMs : medianMs > 0 ? medianMs : avgMs > 0 ? avgMs : 5 * 60 * 1000;
    const runningEntry = selfImproveState.entries.find((e) => e.status === "running");
    return { estimateMs, avgMs, medianMs, recentAvgMs, sessionCount: completed.length, runningStartedAt: runningEntry?.startedAt ?? null };
  }

  // ── Memory ──

  async getMemories(): Promise<{ memories: unknown[] }> {
    return { memories: readMemories() };
  }

  async deleteMemory(id?: string, clearAll?: boolean): Promise<{ memories: unknown[] }> {
    if (clearAll) {
      clearMemories();
      return { memories: [] };
    }
    if (typeof id === "string") {
      const deleted = delMemory(id);
      if (!deleted) throw new Error("Not found");
      return { memories: readMemories() };
    }
    throw new Error("Provide id or clearAll");
  }

  // ── Telegram ──

  async getTelegramStatus(): Promise<TelegramStatus> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return { configured: false, message: "Set TELEGRAM_BOT_TOKEN in .env.local, then restart the dev server." };
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    return { configured: true, polling: true, bot: data.result ?? data };
  }

  // ── Push Subscriptions ──

  async subscribe(onEvent: (channel: string, data: unknown) => void): Promise<void> {
    // Subscribe to the event bus and forward events to the client via RPC callback.
    // The unsubscribe happens automatically when the WebSocket closes (Cap'n Web
    // invalidates stubs, and the listener reference gets GC'd).
    subscribeEventBus((event: EventBusEvent) => {
      try {
        const data = "data" in event ? event.data : {};
        onEvent(event.channel, data);
      } catch {
        // Client disconnected — callback stub is broken. Event bus will
        // keep calling us but that's fine, the cost is negligible and
        // the listener will be GC'd when this backend instance is.
      }
    });
  }

  // ── Session-specific streaming (multi-tab sync) ──

  async subscribeSession(sessionId: string, onEvent: (event: StreamEvent) => void): Promise<void> {
    subscribe(sessionId, (eventJson: string) => {
      try {
        const event = JSON.parse(eventJson) as StreamEvent;
        onEvent(event);
      } catch {
        // Client disconnected or bad JSON — ignore
      }
    });
  }
}
