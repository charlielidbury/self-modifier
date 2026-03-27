import {
  readMemories,
  deleteMemory,
  clearMemories,
} from "@/lib/self-improve-memory";

/** GET /api/self-improve/memory — list all memory entries */
export async function GET() {
  return Response.json({ memories: readMemories() });
}

/** DELETE /api/self-improve/memory — delete one entry or clear all */
export async function DELETE(req: Request) {
  const body = (await req.json()) as { id?: string; clearAll?: boolean };

  if (body.clearAll) {
    clearMemories();
    return Response.json({ memories: [] });
  }

  if (typeof body.id === "string") {
    const deleted = deleteMemory(body.id);
    if (!deleted) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ memories: readMemories() });
  }

  return Response.json({ error: "Provide id or clearAll" }, { status: 400 });
}
