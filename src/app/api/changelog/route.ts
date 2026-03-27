import { execSync } from "child_process";

export type GitCommit = {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
  additions?: number;
  deletions?: number;
};

export async function GET() {
  try {
    const raw = execSync(
      `git log --format="%H%x00%h%x00%s%x00%aI%x00%an" -100`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();

    if (!raw) return Response.json({ commits: [] });

    const commits: GitCommit[] = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\x00");
        return {
          hash: parts[0] ?? "",
          shortHash: parts[1] ?? "",
          message: parts[2] ?? "",
          date: parts[3] ?? "",
          author: parts[4] ?? "",
        };
      });

    // Fetch per-commit line-change stats
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
      if (currentHash) {
        lineStatsMap.set(currentHash, { additions: currentAdd, deletions: currentDel });
      }

      for (const commit of commits) {
        const stats = lineStatsMap.get(commit.hash);
        if (stats) {
          commit.additions = stats.additions;
          commit.deletions = stats.deletions;
        }
      }
    } catch {
      // Line stats are best-effort
    }

    return Response.json({ commits });
  } catch {
    return Response.json({ commits: [] });
  }
}
