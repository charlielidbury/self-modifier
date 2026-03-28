import { execSync } from "child_process";
import { cachedJsonResponse } from "@/lib/api-cache";

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

function computeHotspots(): HotspotsResponse {
  try {
    const cwd = process.cwd();

    // Get per-file stats across recent commits using numstat
    const raw = execSync(
      `git log -100 --format="COMMIT:%H:%aI" --numstat`,
      { encoding: "utf-8", cwd, timeout: 15_000 }
    ).trim();

    if (!raw) {
      return { files: [], totalFiles: 0, totalChanges: 0 };
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
        currentHash = parts[0];
        currentDate = parts.slice(1).join(":");
      } else {
        const trimmed = line.trim();
        if (!trimmed || !currentHash) continue;
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

    return {
      files: allFiles.slice(0, 20),
      totalFiles: allFiles.length,
      totalChanges,
    };
  } catch {
    return { files: [], totalFiles: 0, totalChanges: 0 };
  }
}

// Cache for 10 seconds — hotspot data only changes when new commits land
export async function GET(req: Request) {
  return cachedJsonResponse("self-improve:hotspots", 10_000, computeHotspots, req);
}
