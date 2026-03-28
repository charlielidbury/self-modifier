/**
 * Tracks the currently-active agent session so that git hooks can stamp
 * commits with the agent's session ID and working directory.
 *
 * Writes to `.current-agent-session.json` in the project root.  The
 * `prepare-commit-msg` hook reads this file and appends trailers.
 */

import fs from "fs";
import path from "path";

const TRACKER_FILE = path.resolve(process.cwd(), ".current-agent-session.json");

export type AgentSessionInfo = {
  sessionId: string;
  cwd: string;
};

/** Register the active agent session (called before an agent run). */
export function registerAgentSession(info: AgentSessionInfo): void {
  try {
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(info, null, 2) + "\n", "utf-8");
  } catch {
    // Non-critical — commit just won't have trailers
  }
}

/** Clear the active agent session (called after an agent run). */
export function clearAgentSession(): void {
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      fs.unlinkSync(TRACKER_FILE);
    }
  } catch {
    // ignore
  }
}

/** Read the current agent session info (used by tests / debug). */
export function readAgentSession(): AgentSessionInfo | null {
  try {
    const raw = fs.readFileSync(TRACKER_FILE, "utf-8");
    return JSON.parse(raw) as AgentSessionInfo;
  } catch {
    return null;
  }
}
