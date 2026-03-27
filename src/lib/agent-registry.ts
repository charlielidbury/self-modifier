/**
 * Generic Agent Registry
 *
 * Gives any background agent restart-survival via a single gitignored file
 * (`.agent-state.json`). Agents register themselves at module load time with
 * a name, default persisted state, and a start function. On server startup
 * `resumeAllAgents()` re-starts every agent the file says is enabled.
 *
 * Usage for a new agent:
 *
 *   import { registerAgent, isAgentEnabled, setAgentEnabled, getAgentState, setAgentState } from "./agent-registry";
 *
 *   registerAgent({
 *     name: "my-agent",
 *     defaultState: { someOption: 42 },
 *     start: () => myAgentLoop(),
 *   });
 */

import fs from "fs";
import path from "path";

// ── Types ───────────────────────────────────────────────────────────────────

export type AgentDefinition<S = Record<string, unknown>> = {
  name: string;
  defaultState: S;
  /** Called to start the agent. Only invoked when `enabled` is true. */
  start: () => void;
};

type PersistedAgentEntry = {
  enabled: boolean;
  state: Record<string, unknown>;
};

type PersistedFile = Record<string, PersistedAgentEntry>;

// ── File I/O ────────────────────────────────────────────────────────────────

const STATE_FILE_PATH = path.join(process.cwd(), ".agent-state.json");

function readFile(): PersistedFile {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeFile(data: PersistedFile): void {
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(data, null, 2) + "\n");
  } catch (err) {
    console.error("[agent-registry] Failed to write state file:", err);
  }
}

// ── Registration map (survives HMR via globalThis) ──────────────────────────

const g = globalThis as typeof globalThis & {
  __agentRegistry?: Map<string, AgentDefinition>;
};
if (!g.__agentRegistry) {
  g.__agentRegistry = new Map();
}
const registry: Map<string, AgentDefinition> = g.__agentRegistry;

// ── Public API ──────────────────────────────────────────────────────────────

/** Register an agent. Call at module top-level so it's ready before resumeAllAgents(). */
export function registerAgent<S extends Record<string, unknown>>(
  def: AgentDefinition<S>
): void {
  registry.set(def.name, def as AgentDefinition);
}

/** Check whether an agent is enabled (reads from file). */
export function isAgentEnabled(name: string): boolean {
  return readFile()[name]?.enabled ?? false;
}

/** Enable or disable an agent (writes to file). Does NOT start/stop it. */
export function setAgentEnabled(name: string, enabled: boolean): void {
  const data = readFile();
  if (!data[name]) {
    const def = registry.get(name);
    data[name] = { enabled, state: def?.defaultState ?? {} };
  } else {
    data[name].enabled = enabled;
  }
  writeFile(data);
}

/** Read an agent's persisted state. */
export function getAgentState<S = Record<string, unknown>>(name: string): S {
  const entry = readFile()[name];
  if (entry) return entry.state as S;
  const def = registry.get(name);
  return (def?.defaultState ?? {}) as S;
}

/** Write an agent's persisted state (merges with existing). */
export function setAgentState<S extends Record<string, unknown>>(
  name: string,
  state: S
): void {
  const data = readFile();
  if (!data[name]) {
    data[name] = { enabled: false, state };
  } else {
    data[name].state = state;
  }
  writeFile(data);
}

/**
 * Resume all registered agents whose file state says `enabled: true`.
 * Called once from instrumentation.ts on server startup.
 */
export function resumeAllAgents(): void {
  const data = readFile();
  for (const [name, def] of registry) {
    if (data[name]?.enabled) {
      console.log(`[agent-registry] Resuming agent: ${name}`);
      try {
        def.start();
      } catch (err) {
        console.error(`[agent-registry] Failed to start agent ${name}:`, err);
      }
    }
  }
}
