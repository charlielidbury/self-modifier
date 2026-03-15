export async function register() {
  // Only run in the Node.js runtime (not the Edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramPolling } = await import("./lib/telegram-poller");
    startTelegramPolling();
  }
}
