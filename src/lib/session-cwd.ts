/**
 * Persists a mapping of sessionId → cwd so we can filter sessions by
 * working directory. Stored alongside the renames file in the Claude
 * project directory.
 */
import { promises as fs } from "fs";
import path from "path";
import os from "os";

function getMetadataPath(): string {
  const cwd = process.cwd();
  const projectDirName = cwd.replace(/\//g, "-");
  const projectDir = path.join(
    os.homedir(),
    ".claude",
    "projects",
    projectDirName
  );
  return path.join(projectDir, "session-cwds.json");
}

let cache: Record<string, string> | null = null;

async function load(): Promise<Record<string, string>> {
  if (cache) return cache;
  try {
    const content = await fs.readFile(getMetadataPath(), "utf-8");
    cache = JSON.parse(content) as Record<string, string>;
    return cache;
  } catch {
    cache = {};
    return cache;
  }
}

/** Record the cwd for a session. */
export async function setSessionCwd(
  sessionId: string,
  cwd: string
): Promise<void> {
  const map = await load();
  map[sessionId] = cwd;
  cache = map;
  await fs.writeFile(getMetadataPath(), JSON.stringify(map, null, 2));
}

/** Get the cwd for a session, or undefined if not set (defaults to project root). */
export async function getSessionCwd(
  sessionId: string
): Promise<string | undefined> {
  const map = await load();
  return map[sessionId];
}

/** Get the full mapping of sessionId → cwd. */
export async function getAllSessionCwds(): Promise<Record<string, string>> {
  return load();
}
