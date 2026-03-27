"use client";

import { usePathname } from "next/navigation";
import {
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";

// ── Tab order used to determine slide direction ─────────────────────────────
const TAB_ORDER = [
  "/",
  "/chess",
  "/minecraft",
  "/fractals",
  "/evolution",
  "/life",
  "/synth",
  "/gravity",
  "/waves",
];

function tabIndex(path: string): number {
  const idx = TAB_ORDER.indexOf(path);
  return idx === -1 ? 0 : idx;
}

// ── Transition duration (ms) — keep in sync with the CSS keyframe durations ─
const DURATION = 280;

/**
 * PageTransition
 *
 * Wraps the page content and provides a directional crossfade when the route
 * changes. The outgoing page slides + fades out in one direction while the
 * incoming page slides + fades in from the opposite side. Direction is
 * determined by each page's position in the tab bar (left-to-right = slide
 * left, right-to-left = slide right).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Stores the "frozen" snapshot of the previous page while it animates out.
  const [outgoing, setOutgoing] = useState<{
    node: ReactNode;
    direction: "left" | "right";
    key: string;
  } | null>(null);

  // Direction the *incoming* page enters from (opposite of outgoing).
  const [enterDirection, setEnterDirection] = useState<
    "left" | "right" | null
  >(null);

  const prevPathRef = useRef(pathname);
  const prevChildrenRef = useRef<ReactNode>(children);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // When the route changes, snapshot the old children and determine direction.
  useEffect(() => {
    const prev = prevPathRef.current;
    if (prev === pathname) {
      // Same route — just update the ref for next time.
      prevChildrenRef.current = children;
      return;
    }

    // Determine slide direction.
    const direction: "left" | "right" =
      tabIndex(pathname) > tabIndex(prev) ? "left" : "right";

    // Freeze the outgoing children (previous page).
    setOutgoing({ node: prevChildrenRef.current, direction, key: prev });
    setEnterDirection(direction === "left" ? "right" : "left");

    // After the animation completes, remove the outgoing snapshot.
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setOutgoing(null);
      setEnterDirection(null);
    }, DURATION);

    prevPathRef.current = pathname;
    prevChildrenRef.current = children;
  }, [pathname, children]);

  // Clean up on unmount.
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  // Derive animation class names.
  const outClass = outgoing
    ? outgoing.direction === "left"
      ? "page-exit-left"
      : "page-exit-right"
    : "";

  const inClass = enterDirection
    ? enterDirection === "left"
      ? "page-enter-from-left"
      : "page-enter-from-right"
    : // No animation on first render; fall back to the simple fade.
      "page-enter-fade";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* ── Outgoing page (frozen snapshot) ─────────────────────────────── */}
      {outgoing && (
        <div
          key={`out-${outgoing.key}`}
          className={`absolute inset-0 z-[2] ${outClass}`}
          aria-hidden
          style={{ pointerEvents: "none" }}
        >
          {outgoing.node}
        </div>
      )}

      {/* ── Incoming page (current children) ────────────────────────────── */}
      <div key={pathname} className={`relative z-[1] h-full ${inClass}`}>
        {children}
      </div>
    </div>
  );
}
