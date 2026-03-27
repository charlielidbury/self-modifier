import { execSync } from "child_process";

export const dynamic = "force-dynamic";

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: process.cwd(), encoding: "utf-8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}

export async function GET() {
  const shortHash = run("git rev-parse --short HEAD");
  const fullHash = run("git rev-parse HEAD");
  const commitCount = parseInt(run("git rev-list --count HEAD") || "0", 10);
  const message = run("git log -1 --format=%s");
  const timestamp = run("git log -1 --format=%ci");
  const filesChanged = parseInt(run("git diff --stat HEAD~1 --numstat | wc -l") || "0", 10);

  // LOC count — fast approximation using git ls-files + wc
  const loc = parseInt(
    run("git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.css' | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'") || "0",
    10,
  );

  // File count
  const fileCount = parseInt(
    run("git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.css' | wc -l") || "0",
    10,
  );

  // Compute a "generation number" — how many self-improve commits exist
  const generation = parseInt(
    run("git log --oneline --all | grep -c 'improve:' || echo 0") || "0",
    10,
  );

  return Response.json({
    shortHash,
    fullHash,
    commitCount,
    message,
    timestamp,
    loc,
    fileCount,
    generation,
    filesChanged,
  });
}
