import { execSync } from "child_process";

export type GitCommit = {
  hash: string;
  shortHash: string;
  message: string;
  body?: string; // full commit body (everything after the subject line)
  date: string; // ISO 8601
  author: string;
  additions?: number;
  deletions?: number;
};

export async function GET() {
  try {
    // %H = full hash, %h = short hash, %s = subject, %aI = author date ISO, %an = author name, %b = body
    // Use %x00 as field delimiter within a record and %x1e (record separator) between commits
    // so that multi-line commit bodies don't break parsing.
    const raw = execSync(
      `git log --format="%x1e%H%x00%h%x00%s%x00%aI%x00%an%x00%b" -100`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();

    if (!raw) return Response.json({ commits: [] });

    const commits: GitCommit[] = raw
      .split("\x1e")
      .filter(Boolean)
      .map((record) => {
        const parts = record.trim().split("\x00");
        return {
          hash: parts[0] ?? "",
          shortHash: parts[1] ?? "",
          message: parts[2] ?? "",
          date: parts[3] ?? "",
          author: parts[4] ?? "",
          body: (parts[5] ?? "").trim() || undefined,
        };
      });

    // Fetch per-commit line-change stats via a single `git log --numstat` call.
    // Output format (one commit block per entry):
    //   COMMIT:<full-hash>
    //   <adds>\t<dels>\t<filepath>
    //   ...
    //   (blank line between commits)
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
            // Tab-separated: additions \t deletions \t filepath
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

    return Response.json({ commits });
  } catch {
    return Response.json({ commits: [] });
  }
}
