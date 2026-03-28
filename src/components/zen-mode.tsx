"use client";

import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

const ZEN_STORAGE_KEY = "zen-mode";

/** Read zen state from localStorage (defaults to false). */
function loadZenState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ZEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Apply or remove the `zen` class on <html> so CSS transitions take effect. */
function applyZenClass(enabled: boolean) {
  const el = document.documentElement;
  if (enabled) {
    el.classList.add("zen");
  } else {
    el.classList.remove("zen");
  }
}

/**
 * ZenModeController
 *
 * Manages zen/focus mode — a distraction-free state that hides all UI chrome
 * (navbar, ambient canvas, ambient border, self-improve toggle) so the page
 * content fills the entire viewport.
 *
 * - Toggle: Ctrl+. (or via command palette)
 * - Persists preference in localStorage
 * - Renders a hover-activated exit bar at the top screen edge in zen mode
 * - Dispatches a custom "zen-mode-change" event so other components can react
 */
export function ZenModeController() {
  const [zen, setZen] = useState(false);
  const [hoverVisible, setHoverVisible] = useState(false);
  const [hoverTimeout, setHoverTimeoutState] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Initialise from localStorage on mount
  useEffect(() => {
    const saved = loadZenState();
    setZen(saved);
    applyZenClass(saved);
  }, []);

  const toggle = useCallback(() => {
    setZen((prev) => {
      const next = !prev;
      applyZenClass(next);
      try {
        localStorage.setItem(ZEN_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      // Dispatch event so command palette etc. can update labels
      window.dispatchEvent(
        new CustomEvent("zen-mode-change", { detail: { enabled: next } })
      );
      return next;
    });
  }, []);

  // Listen for Ctrl+. globally
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === ".") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  // Also listen for programmatic toggle events (from command palette)
  useEffect(() => {
    function handleToggle() {
      toggle();
    }
    window.addEventListener("zen-mode-toggle", handleToggle);
    return () => window.removeEventListener("zen-mode-toggle", handleToggle);
  }, [toggle]);

  // Handle mouse entering the top edge trigger zone
  const handleMouseEnterZone = useCallback(() => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    setHoverVisible(true);
  }, [hoverTimeout]);

  const handleMouseLeaveZone = useCallback(() => {
    const t = setTimeout(() => setHoverVisible(false), 600);
    setHoverTimeoutState(t);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [hoverTimeout]);

  if (!zen) return null;

  return (
    <>
      {/* Invisible trigger zone at the very top of the screen */}
      <div
        className="fixed top-0 left-0 right-0 h-2 z-[10000]"
        onMouseEnter={handleMouseEnterZone}
        onMouseLeave={handleMouseLeaveZone}
        aria-hidden="true"
      />

      {/* Hoverable exit bar */}
      <div
        className={[
          "fixed top-0 left-0 right-0 z-[10000] flex items-center justify-center",
          "transition-all duration-300 ease-out",
          hoverVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-full pointer-events-none",
        ].join(" ")}
        onMouseEnter={handleMouseEnterZone}
        onMouseLeave={handleMouseLeaveZone}
      >
        <button
          onClick={toggle}
          className={[
            "mt-2 flex items-center gap-2 px-4 py-1.5 rounded-full",
            "bg-popover/90 backdrop-blur-md border border-border shadow-lg",
            "text-xs text-muted-foreground hover:text-foreground",
            "transition-colors duration-150",
            "zen-exit-bar-in",
          ].join(" ")}
          title="Exit Zen Mode (Ctrl+.)"
        >
          <Minimize2 size={12} />
          <span>Exit Zen Mode</span>
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
            Ctrl+.
          </kbd>
        </button>
      </div>
    </>
  );
}

/**
 * Hook for other components to check zen mode state reactively.
 * Listens to the custom event and re-renders when it changes.
 */
export function useZenMode(): boolean {
  const [zen, setZen] = useState(false);

  useEffect(() => {
    // Read initial state
    setZen(document.documentElement.classList.contains("zen"));

    function handleChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      setZen(detail.enabled);
    }
    window.addEventListener("zen-mode-change", handleChange);
    return () => window.removeEventListener("zen-mode-change", handleChange);
  }, []);

  return zen;
}
