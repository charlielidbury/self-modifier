import { query } from "@anthropic-ai/claude-agent-sdk";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  registerAgent,
  isAgentEnabled,
  setAgentEnabled,
  getAgentState,
  setAgentState,
} from "./agent-registry";
import { emit } from "./event-bus";
import { addMemory, buildMemoryContext } from "./self-improve-memory";
import {
  selectGenome,
  recordOutcome,
  buildStrategyDirective,
  type Genome,
  type DiffStats,
} from "./strategy-genes";
import { recordCommitGenome } from "./commit-feedback";
import { popNextItem, completeItem, skipItem, type QueueItem } from "./improvement-queue";
import { saveSession } from "./session-recorder";
import { registerAgentSession, clearAgentSession } from "./agent-session-tracker";

export type ImprovementEntry = {
  id: string;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  status: "running" | "completed" | "failed" | "reverted";
};

export type BuildHealthStatus = {
  lastCheck: string; // ISO timestamp
  passed: boolean;
  errors: string; // tsc output on failure, empty on success
  commitHash: string; // the commit that was checked
  reverted: boolean; // whether the commit was auto-reverted
};

export type ActivityEvent = {
  id: number;
  ts: number; // Date.now()
  kind: "thinking" | "tool_call" | "tool_result" | "text" | "error";
  content: string;
  /** For tool_call events, the tool name */
  tool?: string;
};

const MAX_ACTIVITY = 200;

// ── Persisted state type (stored in .agent-state.json via registry) ─────────

type SelfImprovePersistedState = {
  suggestion: string;
};

// ── In-memory state (transient, survives HMR via globalThis) ────────────────

type SelfImproveGlobal = {
  running: boolean;
  entries: ImprovementEntry[];
  loopAlive: boolean;
  activity: ActivityEvent[];
  activitySeq: number;
  buildHealth: BuildHealthStatus | null;
};

const g = globalThis as typeof globalThis & {
  __selfImprove?: SelfImproveGlobal;
};
// Initialise or patch — an old globalThis shape from a previous code version
// may exist but lack fields we now expect (e.g. after HMR during refactors).
if (!g.__selfImprove) {
  g.__selfImprove = {
    running: false,
    entries: [],
    loopAlive: false,
    activity: [],
    activitySeq: 0,
    buildHealth: null,
  };
} else {
  // Patch in any missing fields so stale HMR state doesn't cause crashes
  g.__selfImprove.running ??= false;
  g.__selfImprove.entries ??= [];
  g.__selfImprove.loopAlive ??= false;
  g.__selfImprove.activity ??= [];
  g.__selfImprove.activitySeq ??= 0;
  g.__selfImprove.buildHealth ??= null;
}

const inMemory: SelfImproveGlobal = g.__selfImprove;

// ── Public accessors ────────────────────────────────────────────────────────
// Unified view merging file-based (via registry) and in-memory state.

export const selfImproveState = {
  get enabled(): boolean {
    return isAgentEnabled("self-improve");
  },
  set enabled(value: boolean) {
    setAgentEnabled("self-improve", value);
    emitStatus();
  },

  get suggestion(): string {
    return getAgentState<SelfImprovePersistedState>("self-improve").suggestion;
  },
  set suggestion(value: string) {
    const current = getAgentState<SelfImprovePersistedState>("self-improve");
    setAgentState("self-improve", { ...current, suggestion: value });
  },

  get running(): boolean {
    return inMemory.running;
  },
  set running(value: boolean) {
    inMemory.running = value;
    emitStatus();
  },

  get entries(): ImprovementEntry[] {
    return inMemory.entries;
  },
  set entries(value: ImprovementEntry[]) {
    inMemory.entries = value;
  },

  get loopAlive(): boolean {
    return inMemory.loopAlive;
  },
  set loopAlive(value: boolean) {
    inMemory.loopAlive = value;
  },

  get activity(): ActivityEvent[] {
    return inMemory.activity;
  },
  set activity(value: ActivityEvent[]) {
    inMemory.activity = value;
  },

  get activitySeq(): number {
    return inMemory.activitySeq;
  },
  set activitySeq(value: number) {
    inMemory.activitySeq = value;
  },

  get buildHealth(): BuildHealthStatus | null {
    return inMemory.buildHealth;
  },
  set buildHealth(value: BuildHealthStatus | null) {
    inMemory.buildHealth = value;
  },
};

/** Emit the current self-improve status to all SSE subscribers. */
function emitStatus() {
  emit({
    channel: "self-improve:status",
    data: {
      enabled: selfImproveState.enabled,
      running: selfImproveState.running,
      entries: selfImproveState.entries,
      suggestion: selfImproveState.suggestion,
    },
  });
}

/** Push an activity event to the ring buffer and broadcast via SSE. */
function pushActivity(
  kind: ActivityEvent["kind"],
  content: string,
  tool?: string,
) {
  const evt: ActivityEvent = {
    id: selfImproveState.activitySeq++,
    ts: Date.now(),
    kind,
    content: content.slice(0, 2000),
    tool,
  };
  selfImproveState.activity.push(evt);
  if (selfImproveState.activity.length > MAX_ACTIVITY) {
    selfImproveState.activity.splice(
      0,
      selfImproveState.activity.length - MAX_ACTIVITY,
    );
  }

  // Push new activity events to all connected browsers
  emit({
    channel: "self-improve:activity",
    data: {
      events: [evt],
      running: selfImproveState.running,
    },
  });
}

// ── Improvement prompt (read from .self-improve-prompt.md, editable via UI) ──
const PROMPT_FILE = path.resolve(process.cwd(), ".self-improve-prompt.md");
const FALLBACK_PROMPT =
  "You are a self-improving AI agent. Make one focused improvement to this codebase, commit it, and report what you did.";

function getPrompt(): string {
  try {
    const content = fs.readFileSync(PROMPT_FILE, "utf-8").trim();
    return content || FALLBACK_PROMPT;
  } catch {
    return FALLBACK_PROMPT;
  }
}

// ── Core runner ───────────────────────────────────────────────────────────────
async function runOnce(): Promise<{ summary: string; genome: Genome; queueItem: QueueItem | null; sessionId: string | null }> {
  const cwd = path.resolve(process.cwd());
  let summary = "(no summary)";
  let capturedSessionId: string | null = null;

  // Clear activity buffer for the new run
  selfImproveState.activity = [];

  // Select a genome through tournament selection
  const genome = selectGenome();
  const strategyDirective = buildStrategyDirective(genome);

  // Check the queue first, then fall back to the one-shot suggestion
  const queueItem = popNextItem();
  let userSuggestion = "";
  if (queueItem) {
    userSuggestion = queueItem.text;
    pushActivity("text", `📋 Working on queued item: "${queueItem.text}"`);
  } else {
    // Consume the user's suggestion (if any) for this session
    userSuggestion = selfImproveState.suggestion.trim();
    selfImproveState.suggestion = ""; // clear so it's single-use (writes to file)
  }

  const basePrompt = getPrompt();
  const memoryContext = buildMemoryContext();
  let effectivePrompt = basePrompt + strategyDirective + memoryContext;
  if (userSuggestion) {
    effectivePrompt += `\n\n---\n\n🎯 USER SUGGESTION FOR THIS SESSION:\nThe user has specifically requested the following improvement. Prioritise this above your own ideas:\n\n"${userSuggestion}"\n\nMake sure the improvement directly addresses this suggestion.`;
  }

  pushActivity(
    "text",
    userSuggestion
      ? `Starting self-improvement session with suggestion: "${userSuggestion}"`
      : `Starting self-improvement session...`,
  );
  pushActivity(
    "text",
    `🧬 Genome selected: Gen ${genome.generation} | Focus: ${genome.focus} | Ambition: ${genome.ambition} | Creativity: ${genome.creativity} | Thoroughness: ${genome.thoroughness}`,
  );

  for await (const msg of query({
    prompt: effectivePrompt,
    options: {
      model: "claude-opus-4-6",
      cwd,
      allowedTools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      maxTurns: 50,
    },
  })) {
    // Capture session ID from the system message so we can stamp commits
    if (msg.type === "system") {
      const sysMsg = msg as { type: "system"; session_id: string };
      capturedSessionId = sysMsg.session_id;
      registerAgentSession({ sessionId: capturedSessionId, cwd });
      pushActivity("text", `🔗 Agent session: ${capturedSessionId.slice(0, 12)}…`);
    }

    // Capture streaming events into the activity log
    if (msg.type === "stream_event") {
      const event = (
        msg as {
          type: "stream_event";
          event: {
            type: string;
            delta?: { type: string; text?: string; thinking?: string };
          };
        }
      ).event;
      if (event.type === "content_block_delta" && event.delta) {
        if (event.delta.type === "text_delta" && event.delta.text) {
          pushActivity("text", event.delta.text);
        } else if (
          event.delta.type === "thinking_delta" &&
          event.delta.thinking
        ) {
          pushActivity("thinking", event.delta.thinking);
        }
      }
    } else if (msg.type === "assistant") {
      const assistantMsg = msg as {
        type: "assistant";
        message?: {
          content?: Array<{ type: string; name?: string; input?: unknown }>;
        };
      };
      if (assistantMsg.message?.content) {
        for (const block of assistantMsg.message.content) {
          if (block.type === "tool_use" && block.name) {
            const inputStr =
              typeof block.input === "string"
                ? block.input
                : JSON.stringify(block.input ?? {});
            pushActivity("tool_call", inputStr, block.name);
          }
        }
      }
    } else if (msg.type === "user") {
      const userMsg = msg as {
        type: "user";
        message?: { content?: unknown };
      };
      if (
        userMsg.message &&
        typeof userMsg.message.content !== "string" &&
        Array.isArray(userMsg.message.content)
      ) {
        for (const block of userMsg.message.content) {
          if (typeof block === "object" && block !== null && "type" in block) {
            const b = block as {
              type: string;
              content?: string | unknown[];
            };
            if (b.type === "tool_result") {
              const resultStr =
                typeof b.content === "string"
                  ? b.content
                  : JSON.stringify(b.content ?? "");
              pushActivity("tool_result", resultStr);
            }
          }
        }
      }
    }

    if ("result" in msg && msg.result) {
      const match = msg.result.match(/DONE\s*(?:\[[^\]]*\])?:\s*(.+)/);
      if (match) {
        summary = match[1].trim();
      } else {
        const firstLine = msg.result
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.length > 10);
        if (firstLine) summary = firstLine.slice(0, 200);
      }
    }
  }

  pushActivity("text", `Session complete: ${summary}`);
  clearAgentSession();
  return { summary, genome, queueItem, sessionId: capturedSessionId };
}

// ── Build verification ────────────────────────────────────────────────────────
// After each improvement, run a typecheck. If it introduces NEW errors, auto-revert.
// Uses a differential approach: captures baseline error count before the agent runs,
// then compares after. This tolerates pre-existing errors gracefully.

/** Run tsc and return the error output and count of error lines. */
function runTypecheck(): { errorCount: number; output: string } {
  const cwd = path.resolve(process.cwd());
  try {
    execSync("npx tsc --noEmit 2>&1", {
      cwd,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { errorCount: 0, output: "" };
  } catch (err) {
    const output = err instanceof Error && "stdout" in err
      ? String((err as { stdout: unknown }).stdout)
      : err instanceof Error ? err.message : String(err);
    // Count lines matching the TS error pattern: "file(line,col): error TSxxxx:"
    const errorLines = output.split("\n").filter(line => /:\s*error\s+TS\d+/.test(line));
    return { errorCount: errorLines.length, output: output.slice(0, 3000) };
  }
}

/** Baseline error count captured before each agent run. */
let baselineErrorCount = -1;

function captureBaseline(): void {
  const cwd = path.resolve(process.cwd());
  pushActivity("text", "📊 Capturing pre-run typecheck baseline...");
  try {
    const result = runTypecheck();
    baselineErrorCount = result.errorCount;
    pushActivity("text", `📊 Baseline: ${baselineErrorCount} pre-existing error(s)`);
  } catch {
    baselineErrorCount = -1; // couldn't establish baseline — skip verification
    pushActivity("text", "📊 Could not establish baseline — build verification will be skipped");
  }
}

async function verifyBuild(): Promise<{ passed: boolean; errors: string; commitHash: string }> {
  const cwd = path.resolve(process.cwd());

  // Get the current HEAD commit hash
  let commitHash = "unknown";
  try {
    commitHash = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
  } catch {
    // ignore
  }

  // If we couldn't establish a baseline, skip verification (pass by default)
  if (baselineErrorCount < 0) {
    pushActivity("text", `⏭️ Skipping build verification (no baseline) for ${commitHash}`);
    return { passed: true, errors: "", commitHash };
  }

  pushActivity("text", `🔍 Running build verification on commit ${commitHash}...`);

  const result = runTypecheck();

  if (result.errorCount <= baselineErrorCount) {
    // No new errors introduced (may even have fixed some!)
    const delta = baselineErrorCount - result.errorCount;
    const msg = delta > 0
      ? `✅ Build OK for ${commitHash} — fixed ${delta} error(s)! (${result.errorCount} remaining)`
      : `✅ Build OK for ${commitHash} (${result.errorCount} pre-existing error(s), no new ones)`;
    pushActivity("text", msg);
    return { passed: true, errors: "", commitHash };
  }

  // New errors introduced
  const newErrors = result.errorCount - baselineErrorCount;
  pushActivity(
    "error",
    `❌ Build verification FAILED for ${commitHash}: ${newErrors} new error(s) introduced (was ${baselineErrorCount}, now ${result.errorCount})\n${result.output}`,
  );

  return { passed: false, errors: result.output, commitHash };
}

async function rollbackCommit(commitHash: string): Promise<boolean> {
  const cwd = path.resolve(process.cwd());

  pushActivity("text", `⏪ Auto-reverting broken commit ${commitHash}...`);

  try {
    execSync("git revert HEAD --no-edit", {
      cwd,
      encoding: "utf-8",
      timeout: 30_000,
    });
    pushActivity("text", `✅ Successfully reverted commit ${commitHash}`);
    return true;
  } catch (revertErr) {
    // If revert fails (e.g., conflicts), try a hard reset as last resort
    pushActivity("error", `⚠️ Revert failed, attempting reset...`);
    try {
      execSync("git reset --hard HEAD~1", {
        cwd,
        encoding: "utf-8",
        timeout: 10_000,
      });
      pushActivity("text", `✅ Reset to pre-commit state (dropped ${commitHash})`);
      return true;
    } catch {
      pushActivity("error", `❌ Could not rollback commit ${commitHash} — manual intervention needed`);
      return false;
    }
  }
}

// ── Code mass measurement ─────────────────────────────────────────────────────

/** Measure total source code size in bytes (all .ts/.tsx files under src/). */
function measureCodeMass(): number {
  const cwd = path.resolve(process.cwd());
  try {
    // Use find + stat to sum bytes of all TypeScript source files
    const output = execSync(
      `find src -type f \\( -name "*.ts" -o -name "*.tsx" \\) -exec wc -c {} + 2>/dev/null | tail -1`,
      { cwd, encoding: "utf-8", timeout: 15_000 },
    );
    const match = output.trim().match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

/** Pre-run code mass captured before each session */
let preRunCodeMass = 0;

// ── Diff stats gathering ──────────────────────────────────────────────────────

function gatherDiffStats(): DiffStats | null {
  const cwd = path.resolve(process.cwd());
  try {
    const stat = execSync("git diff --stat HEAD~1 HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 10_000,
    });
    // Last line looks like: " 3 files changed, 45 insertions(+), 12 deletions(-)"
    const summary = stat.trim().split("\n").pop() ?? "";
    const filesMatch = summary.match(/(\d+)\s+files?\s+changed/);
    const insMatch = summary.match(/(\d+)\s+insertions?/);
    const delMatch = summary.match(/(\d+)\s+deletions?/);
    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
      insertions: insMatch ? parseInt(insMatch[1], 10) : 0,
      deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  } catch {
    return null;
  }
}

// ── Background loop ───────────────────────────────────────────────────────────
export function startImprovementLoop() {
  // Already looping — nothing to do (flag lives on globalThis, survives HMR).
  if (selfImproveState.loopAlive) return;
  selfImproveState.loopAlive = true;

  void (async () => {
    try {
      // Loop runs as long as the file says enabled.
      while (selfImproveState.enabled) {
        const entry: ImprovementEntry = {
          id: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
          status: "running",
        };

        selfImproveState.running = true;
        selfImproveState.entries.unshift(entry);
        if (selfImproveState.entries.length > 30)
          selfImproveState.entries.length = 30;

        let activeGenomeId: string | null = null;
        let activeGenome: Genome | null = null;
        let activeQueueItem: QueueItem | null = null;
        try {
          // Capture typecheck baseline BEFORE the agent runs so we can detect new errors
          captureBaseline();
          // Capture code mass baseline for anti-bloat fitness tracking
          preRunCodeMass = measureCodeMass();
          if (preRunCodeMass > 0) {
            pushActivity("text", `📏 Code mass baseline: ${(preRunCodeMass / 1024).toFixed(1)} KB`);
          }
          const result = await runOnce();
          entry.summary = result.summary;
          activeGenomeId = result.genome.id;
          activeGenome = result.genome;
          activeQueueItem = result.queueItem;
          entry.status = "completed";

          // ── Build verification gate ──
          // After the agent commits, verify the build is still healthy.
          const health = await verifyBuild();
          selfImproveState.buildHealth = {
            lastCheck: new Date().toISOString(),
            passed: health.passed,
            errors: health.errors,
            commitHash: health.commitHash,
            reverted: false,
          };

          if (!health.passed) {
            // Build is broken — roll back the commit
            const reverted = await rollbackCommit(health.commitHash);
            selfImproveState.buildHealth.reverted = reverted;
            entry.status = "reverted";
            entry.summary = `[REVERTED] ${entry.summary ?? "(no summary)"} — build check failed`;
          }

          // ── Update queue item status ──
          if (activeQueueItem) {
            if (entry.status === "completed") {
              completeItem(activeQueueItem.id, health.commitHash);
              pushActivity("text", `📋 Queue item completed: "${activeQueueItem.text}"`);
            } else {
              skipItem(activeQueueItem.id);
              pushActivity("text", `📋 Queue item skipped (reverted): "${activeQueueItem.text}"`);
            }
          }
        } catch (err) {
          entry.status = "failed";
          entry.summary =
            err instanceof Error ? err.message.slice(0, 150) : String(err);
          // Mark queue item as skipped on failure
          if (activeQueueItem) {
            skipItem(activeQueueItem.id);
            pushActivity("text", `📋 Queue item skipped (failed): "${activeQueueItem.text}"`);
          }
        } finally {
          entry.completedAt = new Date().toISOString();
          selfImproveState.running = false;

          // ── Record genome fitness ──
          const outcome = entry.status === "completed"
            ? "completed" as const
            : entry.status === "reverted"
              ? "reverted" as const
              : "failed" as const;

          if (activeGenomeId) {
            try {
              // Gather diff stats for richer fitness scoring
              let diffStats: DiffStats | null = null;
              if (outcome === "completed") {
                diffStats = gatherDiffStats();
                // Enrich with code mass delta
                if (diffStats && preRunCodeMass > 0) {
                  const postRunCodeMass = measureCodeMass();
                  if (postRunCodeMass > 0) {
                    diffStats.codeMassDelta = postRunCodeMass - preRunCodeMass;
                    diffStats.codeMassTotal = postRunCodeMass;
                  }
                }
                if (diffStats) {
                  const massInfo = diffStats.codeMassDelta !== undefined
                    ? `, mass ${diffStats.codeMassDelta >= 0 ? "+" : ""}${(diffStats.codeMassDelta / 1024).toFixed(1)} KB → ${((diffStats.codeMassTotal ?? 0) / 1024).toFixed(1)} KB total`
                    : "";
                  pushActivity(
                    "text",
                    `📊 Diff stats: ${diffStats.filesChanged} file(s), +${diffStats.insertions}/-${diffStats.deletions} lines${massInfo}`,
                  );
                }
              }
              recordOutcome(activeGenomeId, outcome, diffStats ?? undefined);
              const massNote = diffStats?.codeMassDelta !== undefined
                ? `, mass ${diffStats.codeMassDelta >= 0 ? "+" : ""}${(diffStats.codeMassDelta / 1024).toFixed(1)} KB`
                : "";
              pushActivity("text", `🧬 Genome fitness updated (${outcome}${diffStats ? `, scope bonus applied` : ""}${massNote})`);
            } catch (gErr) {
              pushActivity("text", `⚠️ Could not update genome: ${gErr instanceof Error ? gErr.message : String(gErr)}`);
            }
          }

          // ── Record memory for evolutionary learning ──
          try {
            let commitHash = "unknown";
            try {
              commitHash = execSync("git rev-parse --short HEAD", {
                cwd: path.resolve(process.cwd()),
                encoding: "utf-8",
              }).trim();
            } catch { /* ignore */ }

            // Extract a lesson from the outcome
            let lesson = entry.summary ?? "";
            if (outcome === "reverted") {
              lesson = `Approach caused build failure and was reverted. Avoid similar changes without verifying types.`;
            } else if (outcome === "failed") {
              lesson = `Session failed: ${lesson}. Consider a different approach.`;
            }

            addMemory({
              timestamp: new Date().toISOString(),
              commitHash,
              summary: entry.summary ?? "(no summary)",
              outcome,
              lesson,
            });

            // ── Record commit → genome mapping for user feedback ──
            if (activeGenomeId && outcome === "completed" && commitHash !== "unknown") {
              try {
                recordCommitGenome(commitHash, activeGenomeId);
              } catch { /* non-critical */ }
            }

            pushActivity("text", `🧠 Memory recorded (${outcome})`);
          } catch (memErr) {
            // Non-critical — don't break the loop
            pushActivity("text", `⚠️ Could not record memory: ${memErr instanceof Error ? memErr.message : String(memErr)}`);
          }

          // ── Save session flight recording ──
          try {
            const genomeInfo = activeGenome
              ? {
                  id: activeGenome.id,
                  generation: activeGenome.generation,
                  focus: activeGenome.focus,
                  ambition: activeGenome.ambition,
                  creativity: activeGenome.creativity,
                  thoroughness: activeGenome.thoroughness,
                }
              : null;
            saveSession(entry, [...selfImproveState.activity], genomeInfo);
            pushActivity("text", `📼 Session recording saved (${selfImproveState.activity.length} events)`);
          } catch (recErr) {
            pushActivity("text", `⚠️ Could not save session recording: ${recErr instanceof Error ? recErr.message : String(recErr)}`);
          }
        }

        // Brief pause between sessions so we don't hammer the API.
        if (selfImproveState.enabled) {
          await new Promise((r) => setTimeout(r, 3_000));
        }
      }
    } finally {
      selfImproveState.loopAlive = false;
    }
  })();
}

// ── Register with the agent registry ────────────────────────────────────────
registerAgent({
  name: "self-improve",
  defaultState: { suggestion: "" } satisfies SelfImprovePersistedState,
  start: () => startImprovementLoop(),
});
