import { execSync } from "child_process";
import { NextRequest } from "next/server";

export type DiffFile = {
  path: string;
  additions: number;
  deletions: number;
  /** Raw unified-diff patch for this file (truncated if huge). */
  patch: string;
};

export type CommitDiff = {
  hash: string;
  message: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
};

/** Maximum characters of patch output we'll return per file to keep payloads sane. */
const MAX_PATCH_CHARS = 4000;
/** Maximum total files we'll include full patches for. */
const MAX_FILES_WITH_PATCH = 12;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;

  // Validate hash format to prevent injection
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) {
    return Response.json({ error: "Invalid hash" }, { status: 400 });
  }

  try {
    // Get commit message
    const message = execSync(`git log -1 --format="%s" ${hash}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
    }).trim();

    // Get --numstat for file-level additions/deletions
    const numstatRaw = execSync(
      `git diff-tree --no-commit-id --numstat -r ${hash}`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();

    const fileStats: { path: string; additions: number; deletions: number }[] =
      numstatRaw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [add, del, ...pathParts] = line.split("\t");
          return {
            path: pathParts.join("\t"), // handle paths with tabs (rare but possible)
            additions: add === "-" ? 0 : parseInt(add, 10),
            deletions: del === "-" ? 0 : parseInt(del, 10),
          };
        });

    // Get the actual diff patches per file
    const diffRaw = execSync(
      `git diff-tree --no-commit-id -p -r ${hash}`,
      { encoding: "utf-8", cwd: process.cwd(), maxBuffer: 1024 * 1024 * 2 }
    );

    // Split the diff output into per-file sections
    const fileDiffs = new Map<string, string>();
    const diffSections = diffRaw.split(/^diff --git /m).filter(Boolean);
    for (const section of diffSections) {
      // Extract filename from "a/path b/path" header
      const headerMatch = section.match(/^a\/(.+?) b\/(.+)/m);
      if (headerMatch) {
        const filePath = headerMatch[2];
        let patch = section;
        if (patch.length > MAX_PATCH_CHARS) {
          patch = patch.slice(0, MAX_PATCH_CHARS) + "\n... (truncated)";
        }
        fileDiffs.set(filePath, patch);
      }
    }

    let totalAdditions = 0;
    let totalDeletions = 0;

    const files: DiffFile[] = fileStats.map((stat, i) => {
      totalAdditions += stat.additions;
      totalDeletions += stat.deletions;

      return {
        path: stat.path,
        additions: stat.additions,
        deletions: stat.deletions,
        patch:
          i < MAX_FILES_WITH_PATCH
            ? (fileDiffs.get(stat.path) ?? "")
            : "(patch omitted — too many files)",
      };
    });

    const result: CommitDiff = {
      hash,
      message,
      files,
      totalAdditions,
      totalDeletions,
    };

    return Response.json(result);
  } catch {
    return Response.json({ error: "Commit not found" }, { status: 404 });
  }
}
