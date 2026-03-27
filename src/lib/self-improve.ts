import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";

export type ImprovementEntry = {
  id: string;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  status: "running" | "completed" | "failed";
};

type SelfImproveGlobal = {
  enabled: boolean;
  running: boolean;
  entries: ImprovementEntry[];
  loopAlive: boolean; // true while the background loop promise is executing
};

// ── Persistent global state ───────────────────────────────────────────────────
// Stored on `globalThis` so it survives Next.js HMR module re-evaluations.
// When the agent writes a file, Next.js reloads this module — a plain
// `let` variable would reset to its initialiser, orphaning the running loop.
const g = globalThis as typeof globalThis & {
  __selfImprove?: SelfImproveGlobal;
};
if (!g.__selfImprove) {
  g.__selfImprove = {
    enabled: false,
    running: false,
    entries: [],
    loopAlive: false,
  };
}
export const selfImproveState: SelfImproveGlobal = g.__selfImprove;

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

Once your change is verified and working, commit it to git:
  1. Stage only the files you actually modified — list them explicitly, e.g.:
       git add src/components/foo.tsx src/app/bar/page.tsx
  2. Commit with a message which explains what you did and any vision it ties into:
       git commit -m "improve: <description>"
  3. Do NOT push to remote

After the commit succeeds, output exactly this as your very last line (nothing after it):
DONE: <one sentence describing the improvement you made>`;

// ── Core runner ───────────────────────────────────────────────────────────────
async function runOnce(): Promise<string> {
  const cwd = path.resolve(process.cwd());
  let summary = "(no summary)";

  for await (const msg of query({
    prompt: PROMPT,
    options: {
      cwd,
      allowedTools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 50,
    },
  })) {
    if ("result" in msg && msg.result) {
      const match = msg.result.match(/DONE:\s*(.+)/);
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

  return summary;
}

// ── Background loop ───────────────────────────────────────────────────────────
export function startImprovementLoop() {
  // Already looping — nothing to do (flag lives on globalThis, survives HMR).
  if (selfImproveState.loopAlive) return;
  selfImproveState.loopAlive = true;

  void (async () => {
    try {
      // Loop runs as long as the toggle is on.
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
      // Whether the loop exits normally (disabled) or throws, clear the flag
      // so startImprovementLoop() can be called again.
      selfImproveState.loopAlive = false;
    }
  })();
}
