import { execSync } from "child_process";

/**
 * Maps file paths to the page routes they belong to.
 * A commit touching "src/app/chess/page.tsx" maps to "/chess", etc.
 */
function filePathToRoute(filePath: string): string | null {
  // Direct page file match: src/app/<route>/page.tsx
  const pageMatch = filePath.match(/^src\/app\/([^/]+)\/page\.tsx$/);
  if (pageMatch) return `/${pageMatch[1]}`;

  // Root page
  if (filePath === "src/app/page.tsx") return "/";

  // Component files that map to specific pages
  const componentMappings: Record<string, string> = {
    "src/components/chat-": "/chat",
    "src/components/sessions-sidebar": "/chat",
    "src/components/assistant-ui/": "/chat",
  };
  for (const [prefix, route] of Object.entries(componentMappings)) {
    if (filePath.startsWith(prefix)) return route;
  }

  // API routes that map to pages
  const apiMatch = filePath.match(/^src\/app\/api\/([^/]+)\//);
  if (apiMatch) {
    const apiName = apiMatch[1];
    // Map API route names to page routes where relevant
    const apiMappings: Record<string, string> = {
      chat: "/chat",
      sessions: "/chat",
    };
    if (apiMappings[apiName]) return apiMappings[apiName];
  }

  return null;
}

export type RecentlyModifiedRoute = {
  route: string;
  lastModified: string; // ISO 8601
  commitMessage: string;
  shortHash: string;
};

export async function GET() {
  try {
    // Get commits from the last 7 days with their changed files
    const raw = execSync(
      `git log --since="7 days ago" --format="COMMIT:%h%x00%s%x00%aI" --name-only -200`,
      { encoding: "utf-8", cwd: process.cwd() }
    ).trim();

    if (!raw) return Response.json({ routes: [] });

    const routeMap = new Map<string, RecentlyModifiedRoute>();
    let currentCommit: { shortHash: string; message: string; date: string } | null = null;

    for (const line of raw.split("\n")) {
      if (line.startsWith("COMMIT:")) {
        const parts = line.slice(7).split("\x00");
        currentCommit = {
          shortHash: parts[0] ?? "",
          message: parts[1] ?? "",
          date: parts[2] ?? "",
        };
      } else if (line.trim() && currentCommit) {
        const route = filePathToRoute(line.trim());
        if (route && !routeMap.has(route)) {
          routeMap.set(route, {
            route,
            lastModified: currentCommit.date,
            commitMessage: currentCommit.message,
            shortHash: currentCommit.shortHash,
          });
        }
      }
    }

    const routes = Array.from(routeMap.values());
    return Response.json({ routes });
  } catch {
    return Response.json({ routes: [] });
  }
}
