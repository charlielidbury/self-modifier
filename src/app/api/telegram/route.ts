// Status endpoint — visit /api/telegram to check if the bot is configured.
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return Response.json(
      {
        configured: false,
        message:
          "Set TELEGRAM_BOT_TOKEN in .env.local, then restart the dev server.",
      },
      { status: 503 }
    );
  }

  // Ask Telegram for bot info to confirm the token is valid.
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = await res.json();

  return Response.json({
    configured: true,
    polling: true,
    bot: data.result ?? data,
  });
}
