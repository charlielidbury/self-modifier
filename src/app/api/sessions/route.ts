import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionInfo } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { getAllSessionCwds } from "@/lib/session-cwd";

async function loadRenames(): Promise<Record<string, string>> {
  const cwd = process.cwd();
  const projectDirName = cwd.replace(/\//g, "-");
  const projectDir = path.join(
    os.homedir(),
    ".claude",
    "projects",
    projectDirName
  );
  const renamesPath = path.join(projectDir, "self-modifier-renames.json");
  try {
    const content = await fs.readFile(renamesPath, "utf-8");
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const cwdFilter = url.searchParams.get("cwd");

    const [sessions, renames, sessionCwds] = await Promise.all([
      listSessions({ dir: process.cwd(), limit: 50 }),
      loadRenames(),
      getAllSessionCwds(),
    ]);

    let result: SessionInfo[] = sessions.map((s) => ({
      sessionId: s.sessionId,
      summary: renames[s.sessionId] ?? s.summary,
      lastModified: s.lastModified,
      createdAt: s.createdAt,
    }));

    if (cwdFilter) {
      // Only show sessions that were created with this specific cwd.
      result = result.filter((s) => sessionCwds[s.sessionId] === cwdFilter);
    } else {
      // Default view: show sessions that have NO custom cwd (i.e. the main project).
      result = result.filter((s) => !sessionCwds[s.sessionId]);
    }

    return Response.json(result);
  } catch {
    return Response.json([]);
  }
}
