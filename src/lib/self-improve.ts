import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import {
  registerAgent,
  isAgentEnabled,
  setAgentEnabled,
  getAgentState,
  setAgentState,
} from "./agent-registry";

export type ImprovementEntry = {
  id: string;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  status: "running" | "completed" | "failed";
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
};

const g = globalThis as typeof globalThis & {
  __selfImprove?: SelfImproveGlobal;
};
if (!g.__selfImprove) {
  g.__selfImprove = {
    running: false,
    entries: [],
    loopAlive: false,
    activity: [],
    activitySeq: 0,
  };
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
};

/** Push an activity event to the ring buffer. */
function pushActivity(
  kind: ActivityEvent["kind"],
  content: string,
  tool?: string
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
      selfImproveState.activity.length - MAX_ACTIVITY
    );
  }
}

// ── Improvement prompt ────────────────────────────────────────────────────────
const PROMPT = `
You are a confident genius who takes leaps into infinity.

This codebase is your pride and joy, and you have great plans. You're not afraid to introduce new,
deep conceptual features totally unrelated to what's already here.

This is your canvas, paint your heart out.

The app currently has four pages reachable from the top navbar as a starting point for this repo,
but it will be unrecognisable soon.

There is also a floating "Self-Improve" toggle in the bottom-right corner that you are
running inside right now.

Possible improvement ideas (pick one, or invent your own):
  - Entire new pages or features
  - Visual polish: better colours, spacing, typography, micro-animations
  - UX enhancements: keyboard shortcuts, smoother transitions, responsive fixes
  - Bug fixes or robustness improvements
  - Code quality / readability

Bonus points to anything that makes the self improve feature itself better.

Hard rules:
  - Make it COMPLETE and actually working — no TODOs, no half-finished code
  - Keep it focused — one clear improvement per session
  - Verify your change is correct by reviewing what you wrote before finishing

Once your change is verified and working you MUST commit before finishing:
  1. Stage only the files you actually modified — list them explicitly, e.g.:
       git add src/components/foo.tsx src/app/bar/page.tsx
  2. Commit with a message which explains what you did and any vision it ties into:
       git commit -m "improve: <description>"
  3. Do NOT push to remote
  4. Run: git rev-parse --short HEAD
     and note the short hash — you need it for the DONE line below.

Your FINAL output line MUST be exactly this format (nothing after it):
DONE [<short-hash>]: <one sentence describing the improvement you made>

Example: DONE [a1b2c3d]: Added smooth page transitions between all routes

If you have not committed, you CANNOT produce a valid DONE line. Go back and commit first.`;

// ── Core runner ───────────────────────────────────────────────────────────────
async function runOnce(): Promise<string> {
  const cwd = path.resolve(process.cwd());
  let summary = "(no summary)";

  // Clear activity buffer for the new run
  selfImproveState.activity = [];

  // Consume the user's suggestion (if any) for this session
  const userSuggestion = selfImproveState.suggestion.trim();
  selfImproveState.suggestion = ""; // clear so it's single-use (writes to file)

  const effectivePrompt = userSuggestion
    ? `${PROMPT}\n\n---\n\n🎯 USER SUGGESTION FOR THIS SESSION:\nThe user has specifically requested the following improvement. Prioritise this above your own ideas:\n\n"${userSuggestion}"\n\nMake sure the improvement directly addresses this suggestion.`
    : PROMPT;

  pushActivity(
    "text",
    userSuggestion
      ? `Starting self-improvement session with suggestion: "${userSuggestion}"`
      : "Starting self-improvement session..."
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
    // Capture streaming events into the activity log
    if (msg.type === "stream_event") {
      const event = (msg as {
        type: "stream_event";
        event: {
          type: string;
          delta?: { type: string; text?: string; thinking?: string };
        };
      }).event;
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
  return summary;
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

        try {
          entry.summary = await runOnce();
          entry.status = "completed";
        } catch (err) {
          entry.status = "failed";
          entry.summary =
            err instanceof Error ? err.message.slice(0, 150) : String(err);
        } finally {
          entry.completedAt = new Date().toISOString();
          selfImproveState.running = false;
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
