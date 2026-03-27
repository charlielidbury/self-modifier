import { execSync } from "child_process";

export type GitCommit = {
  hash: string;
  shortHash: string;
  message: string;
  date: string; // ISO 8601
  author: string;
};

export async function GET() {
  try {
    // %H = full hash, %h = short hash, %s = subject, %aI = author date ISO, %an = author name
    // Use a non-pipe delimiter that won't appear in commit messages
    const SEP = "\x00";
    const raw = execSync(
      `git log --format="%H${SEP}%h${SEP}%s${SEP}%aI${SEP}%an" -30`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();

    if (!raw) return Response.json({ commits: [] });

    const commits: GitCommit[] = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(SEP);
        return {
          hash: parts[0] ?? "",
          shortHash: parts[1] ?? "",
          message: parts[2] ?? "",
          date: parts[3] ?? "",
          author: parts[4] ?? "",
        };
      });

    return Response.json({ commits });
  } catch {
    return Response.json({ commits: [] });
  }
}
