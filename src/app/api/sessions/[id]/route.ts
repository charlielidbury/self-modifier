import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const messages = await getSessionMessages(id, { dir: process.cwd() });
    return Response.json(messages);
  } catch {
    return Response.json([], { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate: must be a UUID-like string (hex + dashes only)
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Invalid session id" }, { status: 400 });
  }

  // Derive the project directory name from cwd (same logic Claude uses):
  // replace every "/" with "-" so "/Users/foo/bar" → "-Users-foo-bar"
  const cwd = process.cwd();
  const projectDirName = cwd.replace(/\//g, "-");
  const projectDir = path.join(os.homedir(), ".claude", "projects", projectDirName);

  let deleted = false;

  // Delete the JSONL transcript file
  const jsonlPath = path.join(projectDir, `${id}.jsonl`);
  try {
    await fs.unlink(jsonlPath);
    deleted = true;
  } catch {
    // File may not exist
  }

  // Delete the session sub-directory (subagents, etc.) if it exists
  const sessionDir = path.join(projectDir, id);
  try {
    const stat = await fs.stat(sessionDir);
    if (stat.isDirectory()) {
      await fs.rm(sessionDir, { recursive: true, force: true });
      deleted = true;
    }
  } catch {
    // Directory may not exist
  }

  if (!deleted) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
