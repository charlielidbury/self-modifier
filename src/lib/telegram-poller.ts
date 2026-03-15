import { runAgent } from "./agent";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function apiUrl(method: string) {
  return `https://api.telegram.org/bot${TOKEN}/${method}`;
}

async function sendMessage(chatId: number, text: string) {
  const MAX = 4096;
  for (let i = 0; i < text.length; i += MAX) {
    await fetch(apiUrl("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(i, i + MAX),
        parse_mode: "Markdown",
      }),
    });
  }
}

async function sendTyping(chatId: number) {
  await fetch(apiUrl("sendChatAction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// Map from Telegram chat ID → Claude session ID.
const chatSessions = new Map<number, string>();

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

export function startTelegramPolling() {
  if (!TOKEN) {
    console.log("[Telegram] TELEGRAM_BOT_TOKEN not set — polling disabled.");
    return;
  }

  // Remove any existing webhook so getUpdates works.
  fetch(apiUrl("deleteWebhook")).catch(() => {});

  console.log("[Telegram] Starting long-poll loop…");

  let offset = 0;

  async function poll() {
    while (true) {
      try {
        const res = await fetch(
          `${apiUrl("getUpdates")}?offset=${offset}&timeout=25&allowed_updates=["message"]`
        );

        if (!res.ok) {
          console.error("[Telegram] getUpdates error:", res.status, await res.text());
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        const data = (await res.json()) as {
          ok: boolean;
          result: Array<{
            update_id: number;
            message?: { chat: { id: number }; text?: string };
          }>;
        };

        for (const update of data.result) {
          offset = update.update_id + 1;
          const message = update.message;
          if (!message?.text) continue;

          const chatId = message.chat.id;
          const text = message.text;

          if (text === "/start") {
            chatSessions.delete(chatId);
            sendMessage(chatId, "👋 Session reset! How can I help you?");
            continue;
          }

          // Process each message concurrently — don't await so the poll loop
          // can immediately ack and fetch the next update.
          processMessage(chatId, text);
        }
      } catch (err) {
        console.error("[Telegram] Poll error:", err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  poll();
}
