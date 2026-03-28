"use client";

import dynamic from "next/dynamic";
import { DeferredIsland } from "./deferred-islands";

// Dynamically import heavy components — these won't be in the initial JS bundle
const SelfImproveToggle = dynamic(
  () =>
    import("./self-improve-toggle").then((m) => ({ default: m.SelfImproveToggle })),
  { ssr: false }
);

const CommandPalette = dynamic(
  () =>
    import("./command-palette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false }
);

/**
 * Wraps the heavy layout-level client components in deferred islands.
 * They load only after the browser is idle, keeping initial paint fast.
 *
 * ~4,600 lines of JS moved off the critical path.
 */
export function DeferredLayoutShells() {
  return (
    <DeferredIsland timeoutMs={3000}>
      <SelfImproveToggle />
      <CommandPalette />
    </DeferredIsland>
  );
}
