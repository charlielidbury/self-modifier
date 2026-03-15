"use client";

import { useEffect, useRef } from "react";

// Invisible component that drives Telegram long-polling from the browser.
// The browser keeps calling /api/telegram/updates, which blocks against
// Telegram's API waiting for new messages — no public URL required.
export function TelegramPoller() {
  const offsetRef = useRef(0);

  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        try {
          const res = await fetch(
            `/api/telegram/updates?offset=${offsetRef.current}`
          );

          if (res.status === 503) {
            // TELEGRAM_BOT_TOKEN not set — stop polling silently.
            return;
          }

          if (res.ok) {
            const data = (await res.json()) as { offset?: number };
            if (data.offset != null) offsetRef.current = data.offset;
          } else {
            // Unexpected error — back off briefly.
            await sleep(3000);
          }
        } catch {
          // Network error — back off and retry.
          await sleep(3000);
        }
      }
    }

    poll();
    return () => {
      active = false;
    };
  }, []);

  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
