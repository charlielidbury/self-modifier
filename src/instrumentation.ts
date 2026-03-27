export async function register() {
  // Only run in the Node.js runtime (not the Edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelegramPolling } = await import("./lib/telegram-poller");
    startTelegramPolling();

    // Auto-resume self-improvement loop if it was enabled before a restart.
    // The file .self-improve-state.json is the source of truth — if it says
    // enabled: true, we start the loop. This means npm install, crashes, or
    // any other restart will seamlessly resume the self-improve agent.
    const { selfImproveState, startImprovementLoop } = await import(
      "./lib/self-improve"
    );
    if (selfImproveState.enabled) {
      console.log(
        "[self-improve] State file says enabled — resuming improvement loop"
      );
      // Small delay to let the server finish booting before the agent
      // starts making file edits and tool calls.
      setTimeout(() => {
        // Re-check in case it was disabled during the delay
        if (selfImproveState.enabled) {
          startImprovementLoop();
        }
      }, 3_000);
    }
  }
}
