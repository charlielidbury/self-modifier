/**
 * Codebase Map — generates a concise structural snapshot of the codebase
 * for injection into the self-improve agent's prompt.
 *
 * This gives the agent immediate situational awareness: what files exist,
 * how they're organized, which are largest/most complex, and what's been
 * changing recently. Eliminates wasted turns exploring from scratch.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ── Types ────────────────────────────────────────────────────────────────────

type RecentChange = {
  file: string;
  commits: number;
  lastCommitDate: string;
};

type CodebaseSnapshot = {
  generatedAt: string;
  stats: {
    totalFiles: number;
    totalBytes: number;
    totalLines: number;
    pageCount: number;
    apiRouteCount: number;
    componentCount: number;
    hookCount: number;
    libCount: number;
  };
  directoryTree: string;
  largestFiles: { path: string; bytes: number; lines: number }[];
  recentlyChanged: RecentChange[];
  todoComments: { file: string; line: number; text: string }[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const CWD = path.resolve(process.cwd());

function exec(cmd: string): string {
  try {
    return execSync(cmd, { cwd: CWD, encoding: "utf-8", timeout: 15_000 }).trim();
  } catch {
    return "";
  }
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function getAllSourceFiles(): string[] {
  const output = exec(
    `find src -type f \\( -name "*.ts" -o -name "*.tsx" \\) 2>/dev/null`
  );
  return output ? output.split("\n").filter(Boolean) : [];
}

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(path.join(CWD, filePath), "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(path.join(CWD, filePath)).size;
  } catch {
    return 0;
  }
}

// ── Directory tree builder ───────────────────────────────────────────────────

function buildDirectoryTree(rootDir: string, prefix: string = "", depth: number = 0): string {
  if (depth > 3) return ""; // Don't go too deep

  const fullPath = path.join(CWD, rootDir);
  const entries = safeReadDir(fullPath).sort();
  const dirs: string[] = [];
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const entryPath = path.join(fullPath, entry);
    try {
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) dirs.push(entry);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(entry);
    } catch {
      continue;
    }
  }

  const lines: string[] = [];

  for (let i = 0; i < dirs.length; i++) {
    const isLast = i === dirs.length - 1 && files.length === 0;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    lines.push(`${prefix}${connector}${dirs[i]}/`);
    const subtree = buildDirectoryTree(
      path.join(rootDir, dirs[i]),
      prefix + childPrefix,
      depth + 1
    );
    if (subtree) lines.push(subtree);
  }

  // Show individual files only at leaf level or if few
  if (files.length <= 8) {
    for (let i = 0; i < files.length; i++) {
      const isLast = i === files.length - 1;
      const connector = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${connector}${files[i]}`);
    }
  } else {
    lines.push(`${prefix}└── (${files.length} files)`);
  }

  return lines.join("\n");
}

// ── Recently changed files ───────────────────────────────────────────────────

function getRecentlyChanged(limit: number = 10): RecentChange[] {
  // Get files changed in last 20 commits with commit counts
  const output = exec(
    `git log --pretty=format: --name-only -20 2>/dev/null | sort | uniq -c | sort -rn | head -${limit}`
  );
  if (!output) return [];

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match) return null;
      const commits = parseInt(match[1], 10);
      const file = match[2];
      if (!file.startsWith("src/")) return null;

      // Get last commit date for this file
      const dateOutput = exec(
        `git log -1 --pretty=format:"%ar" -- "${file}" 2>/dev/null`
      );

      return { file, commits, lastCommitDate: dateOutput || "unknown" };
    })
    .filter((x): x is RecentChange => x !== null);
}

// ── TODO/FIXME scanner ───────────────────────────────────────────────────────

function findTodoComments(limit: number = 10): { file: string; line: number; text: string }[] {
  // Match actual TODO/FIXME/HACK/XXX comments (preceded by // or *), excluding this file
  const output = exec(
    `grep -rn "//.*\\(TODO\\|FIXME\\|HACK\\|XXX\\)\\|\\*.*\\(TODO\\|FIXME\\|HACK\\|XXX\\)" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "codebase-map\\.ts" | head -${limit}`
  );
  if (!output) return [];

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) return null;
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        text: match[3].trim().slice(0, 100),
      };
    })
    .filter((x): x is { file: string; line: number; text: string } => x !== null);
}

// ── Main generator ───────────────────────────────────────────────────────────

function generateSnapshot(): CodebaseSnapshot {
  const allFiles = getAllSourceFiles();

  // Categorize files
  const pages = allFiles.filter((f) => f.includes("/app/") && f.endsWith("page.tsx"));
  const apiRoutes = allFiles.filter((f) => f.includes("/api/") && f.endsWith("route.ts"));
  const components = allFiles.filter((f) => f.includes("/components/"));
  const hooks = allFiles.filter((f) => f.includes("/hooks/"));
  const lib = allFiles.filter((f) => f.includes("/lib/"));

  // File sizes
  const fileSizes = allFiles.map((f) => ({
    path: f,
    bytes: fileSize(f),
    lines: countLines(f),
  }));

  const totalBytes = fileSizes.reduce((sum, f) => sum + f.bytes, 0);
  const totalLines = fileSizes.reduce((sum, f) => sum + f.lines, 0);

  // Top 10 largest files
  const largestFiles = [...fileSizes]
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalFiles: allFiles.length,
      totalBytes,
      totalLines,
      pageCount: pages.length,
      apiRouteCount: apiRoutes.length,
      componentCount: components.length,
      hookCount: hooks.length,
      libCount: lib.length,
    },
    directoryTree: buildDirectoryTree("src"),
    largestFiles,
    recentlyChanged: getRecentlyChanged(10),
    todoComments: findTodoComments(10),
  };
}

// ── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build a concise codebase map for injection into the agent prompt.
 * Designed to be information-dense but short — every line earns its place.
 */
export function buildCodebaseMap(): string {
  const snap = generateSnapshot();
  const s = snap.stats;

  const lines: string[] = [
    "",
    "---",
    "",
    "## 🗺️ Codebase Map — Current Structure",
    "",
    `**${s.totalFiles}** source files | **${s.totalLines.toLocaleString()}** lines | **${(s.totalBytes / 1024).toFixed(0)} KB**`,
    `${s.pageCount} pages | ${s.apiRouteCount} API routes | ${s.componentCount} components | ${s.hookCount} hooks | ${s.libCount} lib modules`,
    "",
    "### Directory Layout",
    "```",
    "src/",
    snap.directoryTree,
    "```",
    "",
  ];

  // Largest files
  if (snap.largestFiles.length > 0) {
    lines.push("### Largest Files (by line count)");
    for (const f of snap.largestFiles) {
      lines.push(`- \`${f.path}\` — ${f.lines} lines (${(f.bytes / 1024).toFixed(1)} KB)`);
    }
    lines.push("");
  }

  // Recently changed
  if (snap.recentlyChanged.length > 0) {
    lines.push("### Hot Files (most changed in last 20 commits)");
    for (const r of snap.recentlyChanged) {
      lines.push(`- \`${r.file}\` — ${r.commits} commits (${r.lastCommitDate})`);
    }
    lines.push("");
  }

  // TODOs
  if (snap.todoComments.length > 0) {
    lines.push("### Open TODOs/FIXMEs");
    for (const t of snap.todoComments) {
      lines.push(`- \`${t.file}:${t.line}\` — ${t.text}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
