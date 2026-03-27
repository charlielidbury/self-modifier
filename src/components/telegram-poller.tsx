"use client";

// Telegram polling is now handled entirely server-side (src/lib/telegram-poller.ts).
// This component is kept as a no-op to avoid breaking any layouts that render it.
export function TelegramPoller() {
  return null;
}
