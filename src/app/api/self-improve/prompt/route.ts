import fs from "fs";
import path from "path";

const PROMPT_FILE = path.resolve(process.cwd(), ".self-improve-prompt.md");
const DEFAULT_PROMPT = "You are a self-improving AI agent. Make one focused improvement to this codebase, commit it, and report what you did.";

function readPrompt(): string {
  try {
    return fs.readFileSync(PROMPT_FILE, "utf-8");
  } catch {
    return DEFAULT_PROMPT;
  }
}

function writePrompt(content: string): void {
  fs.writeFileSync(PROMPT_FILE, content, "utf-8");
}

export async function GET() {
  return Response.json({ prompt: readPrompt() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { prompt?: string };

  if (typeof body.prompt !== "string") {
    return Response.json({ error: "Missing prompt field" }, { status: 400 });
  }

  writePrompt(body.prompt);
  return Response.json({ prompt: readPrompt() });
}
