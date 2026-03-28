import { execSync } from "child_process";
import { cachedJsonResponse } from "@/lib/api-cache";

export type GitCommit = {
  hash: string;
  shortHash: string;
  message: string;
  body?: string; // full commit body (everything after the subject line)
  date: string; // ISO 8601
  author: string;
  additions?: number;
  deletions?: number;
  /** Agent session ID (from Agent-Session-Id trailer) */
  agentSessionId?: string;
  /** Agent working directory (from Agent-Cwd trailer) */
  agentCwd?: string;
};

/** Extract known trailers from a commit body string. */
function parseTrailers(body: string): { agentSessionId?: string; agentCwd?: string; cleanBody?: string } {
  const sessionMatch = body.match(/^Agent-Session-Id:\s*(.+)$/m);
  const cwdMatch = body.match(/^Agent-Cwd:\s*(.+)$/m);

  // Strip trailer lines from the body for cleaner display
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

function computeCommits() {
  try {
    // %H = full hash, %h = short hash, %s = subject, %aI = author date ISO, %an = author name, %b = body
    // Use %x00 as field delimiter within a record and %x1e (record separator) between commits
    // so that multi-line commit bodies don't break parsing.
    const raw = execSync(
      `git log --format="%x1e%H%x00%h%x00%s%x00%aI%x00%an%x00%b" -100`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();

    if (!raw) return { commits: [] };

    const commits: GitCommit[] = raw
      .split("\x1e")
      .filter(Boolean)
      .map((record) => {
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

    // Fetch per-commit line-change stats via a single `git log --numstat` call.
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
          // Save stats for previous commit before starting a new one
          if (currentHash) {
            lineStatsMap.set(currentHash, { additions: currentAdd, deletions: currentDel });
          }
          currentHash = line.slice(7).trim();
          currentAdd = 0;
          currentDel = 0;
        } else {
          const trimmed = line.trim();
          if (trimmed && /^\d/.test(trimmed)) {
            const parts = trimmed.split("\t");
            currentAdd += parseInt(parts[0] ?? "0", 10) || 0;
            currentDel += parseInt(parts[1] ?? "0", 10) || 0;
          }
        }
      }
      // Don't forget the last commit
      if (currentHash) {
        lineStatsMap.set(currentHash, { additions: currentAdd, deletions: currentDel });
      }

      // Merge line stats into the commits array
      for (const commit of commits) {
        const stats = lineStatsMap.get(commit.hash);
        if (stats) {
          commit.additions = stats.additions;
          commit.deletions = stats.deletions;
        }
      }
    } catch {
      // Line stats are best-effort — proceed without them if git fails
    }

    return { commits };
  } catch {
    return { commits: [] };
  }
}

// Cache for 5 seconds — commits don't change unless a new commit lands
export async function GET(req: Request) {
  return cachedJsonResponse("self-improve:commits", 5_000, computeCommits, req);
}
