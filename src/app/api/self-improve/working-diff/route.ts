import { execSync } from "child_process";

export type WorkingDiffFile = {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch: string;
};

export type WorkingDiffResponse = {
  files: WorkingDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  isEmpty: boolean;
};

export async function GET() {
  try {
    const cwd = process.cwd();

    // Get the unified diff of all uncommitted changes (staged + unstaged)
    const diff = execSync("git diff HEAD 2>/dev/null || git diff 2>/dev/null", {
      encoding: "utf-8",
      cwd,
      timeout: 10_000,
      maxBuffer: 1024 * 1024, // 1MB
    }).trim();

    if (!diff) {
      return Response.json({
        files: [],
        totalAdditions: 0,
        totalDeletions: 0,
        isEmpty: true,
      } satisfies WorkingDiffResponse);
    }

    // Parse the diff into per-file entries
    const files: WorkingDiffFile[] = [];
    // Split on "diff --git" boundaries
    const fileDiffs = diff.split(/^diff --git /m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const lines = fileDiff.split("\n");

      // Extract file path from "a/path b/path"
      const headerMatch = lines[0]?.match(/a\/(.+?)\s+b\/(.+)/);
      const filePath = headerMatch?.[2] ?? headerMatch?.[1] ?? "unknown";

      // Determine status
      let status: WorkingDiffFile["status"] = "modified";
      if (fileDiff.includes("new file mode")) status = "added";
      else if (fileDiff.includes("deleted file mode")) status = "deleted";
      else if (fileDiff.includes("rename from")) status = "renamed";

      // Count additions and deletions
      let additions = 0;
      let deletions = 0;
      const patchLines: string[] = [];
      let inHunk = false;

      for (const line of lines) {
        if (line.startsWith("@@")) {
          inHunk = true;
          patchLines.push(line);
        } else if (inHunk) {
          patchLines.push(line);
          if (line.startsWith("+") && !line.startsWith("+++")) additions++;
          else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
        }
      }

      files.push({
        path: filePath,
        status,
        additions,
        deletions,
        patch: patchLines.join("\n"),
      });
    }

    const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
    const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

    return Response.json({
      files,
      totalAdditions,
      totalDeletions,
      isEmpty: false,
    } satisfies WorkingDiffResponse);
  } catch {
    return Response.json({
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      isEmpty: true,
    } satisfies WorkingDiffResponse);
  }
}
