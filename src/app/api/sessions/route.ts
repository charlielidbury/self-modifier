import { listSessions } from "@anthropic-ai/claude-agent-sdk";
import type { SessionInfo } from "@/lib/types";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

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

export async function GET() {
  try {
    const [sessions, renames] = await Promise.all([
      listSessions({ dir: process.cwd(), limit: 50 }),
      loadRenames(),
    ]);
    const result: SessionInfo[] = sessions.map((s) => ({
      sessionId: s.sessionId,
      summary: renames[s.sessionId] ?? s.summary,
      lastModified: s.lastModified,
      createdAt: s.createdAt,
    }));
    return Response.json(result);
  } catch {
    return Response.json([]);
  }
}
