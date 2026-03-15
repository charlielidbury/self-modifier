import { runAgent } from "@/lib/agent";

// Telegram chat ID → Claude session ID.
// Module-level so it survives across requests (same pattern as agent.ts sessions map).
const chatSessions = new Map<number, string>();

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const api = (method: string) =>
  `https://api.telegram.org/bot${TOKEN()}/${method}`;

async function sendMessage(chatId: number, text: string) {
  const MAX = 4096;
  for (let i = 0; i < text.length; i += MAX) {
    await fetch(api("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(i, i + MAX) }),
    });
  }
}

async function sendTyping(chatId: number) {
  await fetch(api("sendChatAction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

async function processMessage(chatId: number, text: string) {
  await sendTyping(chatId);
  const sessionId = chatSessions.get(chatId);
  let responseText = "";
  let newSessionId: string | undefined;

  try {
    for await (const event of runAgent(text, sessionId)) {
      if (event.type === "text") {
        responseText += event.content;
      } else if (event.type === "session" || event.type === "done") {
        newSessionId = event.sessionId;
      }
    }
    if (newSessionId) chatSessions.set(chatId, newSessionId);
    await sendMessage(chatId, responseText || "✓ Done");
  } catch (err) {
    await sendMessage(
      chatId,
      `⚠️ Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// Long-poll Telegram for new messages, process them, return the new offset.
// The client calls this in a loop — no public URL needed.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!TOKEN()) {
    return Response.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Ask Telegram to hold the connection for up to 25 s waiting for updates.
  let data: { ok: boolean; result: TelegramUpdate[] };
  try {
    const res = await fetch(
      `${api("getUpdates")}?offset=${offset}&timeout=25`,
      { signal: AbortSignal.timeout(30_000) }
    );
    data = await res.json();
  } catch {
    // Network hiccup — tell the client to retry with the same offset.
    return Response.json({ offset });
  }

  if (!data.ok || !data.result.length) {
    return Response.json({ offset });
  }

  let newOffset = offset;
  for (const update of data.result) {
    newOffset = update.update_id + 1;
    const message = update.message;
    if (!message?.text) continue;

    const chatId = message.chat.id;
    const text = message.text;

    if (text === "/start") {
      chatSessions.delete(chatId);
      await sendMessage(chatId, "👋 Session reset! How can I help you?");
    } else {
      await processMessage(chatId, text);
    }
  }

  return Response.json({ offset: newOffset });
}

type TelegramUpdate = {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
};
