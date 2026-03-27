import { execSync } from "child_process";

export type FileHotspot = {
  path: string;
  changes: number; // additions + deletions
  additions: number;
  deletions: number;
  commitCount: number; // how many commits touched this file
  lastModified: string; // ISO date of most recent commit touching this file
};

export type HotspotsResponse = {
  files: FileHotspot[];
  totalFiles: number;
  totalChanges: number;
};

export async function GET() {
  try {
    const cwd = process.cwd();

    // Get per-file stats across recent commits using numstat
    // Format: COMMIT:<hash>:<ISO-date>\n<adds>\t<dels>\t<filepath>\n...
    const raw = execSync(
      `git log -100 --format="COMMIT:%H:%aI" --numstat`,
      { encoding: "utf-8", cwd, timeout: 15_000 }
    ).trim();

    if (!raw) {
      return Response.json({ files: [], totalFiles: 0, totalChanges: 0 });
    }

    // Aggregate per-file stats
    const fileMap = new Map<
      string,
      { additions: number; deletions: number; commitHashes: Set<string>; lastDate: string }
    >();

    let currentHash: string | null = null;
    let currentDate = "";

    for (const line of raw.split("\n")) {
      if (line.startsWith("COMMIT:")) {
        const parts = line.slice(7).split(":");
        // Hash is first part, date is the rest (ISO dates contain colons)
        currentHash = parts[0];
        currentDate = parts.slice(1).join(":");
      } else {
        const trimmed = line.trim();
        if (!trimmed || !currentHash) continue;
        // numstat format: <adds>\t<dels>\t<filepath>
        const tabParts = trimmed.split("\t");
        if (tabParts.length < 3) continue;
        const adds = parseInt(tabParts[0], 10) || 0;
        const dels = parseInt(tabParts[1], 10) || 0;
        const filePath = tabParts.slice(2).join("\t");

        // Skip binary files (shown as - - in numstat)
        if (tabParts[0] === "-" && tabParts[1] === "-") continue;

        const existing = fileMap.get(filePath);
        if (existing) {
          existing.additions += adds;
          existing.deletions += dels;
          existing.commitHashes.add(currentHash);
          // Track most recent modification
          if (currentDate > existing.lastDate) {
            existing.lastDate = currentDate;
          }
        } else {
          fileMap.set(filePath, {
            additions: adds,
            deletions: dels,
            commitHashes: new Set([currentHash]),
            lastDate: currentDate,
          });
        }
      }
    }

    // Convert to array and sort by total changes (descending)
    const allFiles: FileHotspot[] = [];
    let totalChanges = 0;

    for (const [path, stats] of fileMap) {
      const changes = stats.additions + stats.deletions;
      totalChanges += changes;
      allFiles.push({
        path,
        changes,
        additions: stats.additions,
        deletions: stats.deletions,
        commitCount: stats.commitHashes.size,
        lastModified: stats.lastDate,
      });
    }

    allFiles.sort((a, b) => b.changes - a.changes);

    // Return top 20 files
    const result: HotspotsResponse = {
      files: allFiles.slice(0, 20),
      totalFiles: allFiles.length,
      totalChanges,
    };

    return Response.json(result);
  } catch {
    return Response.json({ files: [], totalFiles: 0, totalChanges: 0 });
  }
}
