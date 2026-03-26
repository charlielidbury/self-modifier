import { promises as fs } from "fs";
import path from "path";
import os from "os";

function getRenamesPath(): string {
  const cwd = process.cwd();
  const projectDirName = cwd.replace(/\//g, "-");
  const projectDir = path.join(
    os.homedir(),
    ".claude",
    "projects",
    projectDirName
  );
  return path.join(projectDir, "self-modifier-renames.json");
}

async function loadRenames(): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(getRenamesPath(), "utf-8");
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return {};
  }
}

async function saveRenames(renames: Record<string, string>): Promise<void> {
  const p = getRenamesPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(renames, null, 2), "utf-8");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name =
    body && typeof body === "object" && "name" in body
      ? (body as { name: unknown }).name
      : undefined;

  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Invalid name" }, { status: 400 });
  }

  const renames = await loadRenames();
  renames[id] = name.trim();
  await saveRenames(renames);

  return Response.json({ ok: true });
}
