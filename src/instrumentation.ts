export async function register() {
  // Only run in the Node.js runtime (not the Edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRpcServer } = await import("./lib/rpc/server");
    startRpcServer();

    const { startTelegramPolling } = await import("./lib/telegram-poller");
    startTelegramPolling();

    const { startGitWatcher } = await import("./lib/event-bus");
    startGitWatcher();

    // Import all agent modules so they register themselves with the registry.
    // Add new agent imports here as they're created.
    await import("./lib/self-improve");

    // Resume every agent whose file state says enabled: true.
    // Small delay lets the server finish booting before agents start working.
    const { resumeAllAgents } = await import("./lib/agent-registry");
    setTimeout(() => {
      resumeAllAgents();
    }, 3_000);
  }
}
