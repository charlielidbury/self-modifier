import fs from "fs";
import path from "path";

export type MemoryEntry = {
  id: string;
  timestamp: string; // ISO 8601
  commitHash: string;
  summary: string;
  outcome: "completed" | "failed" | "reverted";
  /** Optional lesson extracted from the summary or failure reason */
  lesson: string;
};

const MEMORY_FILE = path.resolve(process.cwd(), ".self-improve-memory.json");
const MAX_MEMORIES = 50;

/** Read all memory entries from disk. */
export function readMemories(): MemoryEntry[] {
  try {
    const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as MemoryEntry[];
    return [];
  } catch {
    return [];
  }
}

/** Write memory entries to disk. */
function writeMemories(entries: MemoryEntry[]): void {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

/** Append a new memory entry after a session completes. */
export function addMemory(entry: Omit<MemoryEntry, "id">): MemoryEntry {
  const memories = readMemories();
  const newEntry: MemoryEntry = {
    id: crypto.randomUUID(),
    ...entry,
  };
  memories.unshift(newEntry); // newest first
  if (memories.length > MAX_MEMORIES) {
    memories.length = MAX_MEMORIES;
  }
  writeMemories(memories);
  return newEntry;
}

/** Delete a memory entry by ID. */
export function deleteMemory(id: string): boolean {
  const memories = readMemories();
  const idx = memories.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  memories.splice(idx, 1);
  writeMemories(memories);
  return true;
}

/** Clear all memories. */
export function clearMemories(): void {
  writeMemories([]);
}

/**
 * Build a context block to inject into the agent's prompt.
 * Summarises recent session history so the agent knows what's been tried.
 */
export function buildMemoryContext(): string {
  const memories = readMemories();
  if (memories.length === 0) return "";

  const lines: string[] = [
    "",
    "---",
    "",
    "## 🧠 Evolutionary Memory — Past Session History",
    "",
    "Below is a record of recent self-improvement sessions. Use this to:",
    "- AVOID repeating work that has already been done",
    "- AVOID approaches that were reverted due to build failures",
    "- Build on patterns that have worked well",
    "- Find gaps and unexplored areas to improve",
    "",
  ];

  // Show the last 20 entries (most recent first)
  const recent = memories.slice(0, 20);

  for (const m of recent) {
    const icon =
      m.outcome === "completed"
        ? "✅"
        : m.outcome === "reverted"
          ? "⏪"
          : "❌";
    const dateStr = new Date(m.timestamp).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(
      `- ${icon} **[${m.commitHash}]** (${dateStr}) ${m.summary}`,
    );
    if (m.lesson && m.lesson !== m.summary) {
      lines.push(`  _Lesson: ${m.lesson}_`);
    }
  }

  if (memories.length > 20) {
    lines.push(
      `\n_(${memories.length - 20} older entries omitted)_`,
    );
  }

  lines.push("");
  return lines.join("\n");
}
