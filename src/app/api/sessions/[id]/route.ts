import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

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
