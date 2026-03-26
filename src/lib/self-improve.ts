import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";

export type ImprovementEntry = {
  id: string;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  status: "running" | "completed" | "failed";
};

// ── Module-level global state ─────────────────────────────────────────────────
// Lives for the lifetime of the Node.js process (across all requests in dev/prod).
export const selfImproveState = {
  enabled: false,
  running: false,
  entries: [] as ImprovementEntry[],
};

// ── Improvement prompt ────────────────────────────────────────────────────────
const PROMPT = `\
You are an autonomous improvement agent for a Next.js web application called "Self-Modifier".
Explore the codebase and make ONE meaningful, focused improvement of your own choosing.

The app currently has four pages reachable from the top navbar:
  • Chat    — AI chat interface with a session sidebar (sessions-sidebar.tsx)
  • Chess   — Chess game with an AI engine
  • Minecraft — Three.js 3D scene
  • Fractals — WebGL fractal explorer (Mandelbrot, Julia set animation, Burning Ship)

There is also a floating "Self-Improve" toggle in the bottom-right corner that you are
running inside right now.

Possible improvement ideas (pick one, or invent your own):
  - Visual polish: better colours, spacing, typography, micro-animations
  - UX enhancements: keyboard shortcuts, smoother transitions, responsive fixes
  - New small self-contained features (e.g. a tooltip, a counter, a small UI widget)
  - Bug fixes or robustness improvements
  - Code quality / readability

Hard rules:
  - Make it COMPLETE and actually working — no TODOs, no half-finished code
  - Do NOT modify: src/app/api/chat/route.ts, next.config.ts, tsconfig.json, package.json
  - Do NOT run npm install or change dependencies
  - Keep it focused — one clear improvement per session
  - Verify your change is correct by reviewing what you wrote before finishing

When you have finished making and verifying your change, output exactly this as your
very last line (nothing after it):
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
        // Fall back to first meaningful line of the result
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
let loopStarted = false;

export function startImprovementLoop() {
  if (loopStarted) return;
  loopStarted = true;

  // Fire-and-forget — intentionally not awaited
  void (async () => {
    while (true) {
      // Wait until enabled and not already running
      if (!selfImproveState.enabled || selfImproveState.running) {
        loopStarted = false;
        return;
      }

      const entry: ImprovementEntry = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        status: "running",
      };

      selfImproveState.running = true;
      selfImproveState.entries.unshift(entry);
      if (selfImproveState.entries.length > 30) {
        selfImproveState.entries.length = 30;
      }

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

      // Small breathing room between sessions
      if (selfImproveState.enabled) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })();
}
