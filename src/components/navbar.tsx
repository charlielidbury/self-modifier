"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  MessageSquare,
  Swords,
  Cuboid,
  Infinity,
  TrendingUp,
  Dna,
  Music,
  Orbit,
  Waves,
  Atom,
  Fan,
  Sparkles,
  Mountain,
  FlaskConical,
  Brain,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";
import { dispatchAmbientEvent } from "@/components/ambient-canvas";
import { NeuralPulse } from "@/components/neural-pulse";
import type { LucideIcon } from "lucide-react";

// Hue values for each page's accent colour (used to tint the ambient canvas).
const PAGE_HUES: Record<string, number> = {
  "/":          217, // blue
  "/chat":      217, // blue
  "/chess":      38, // amber
  "/minecraft": 142, // green
  "/fractals":  258, // violet
  "/evolution": 350, // rose
  "/life":      173, // teal
  "/synth":     330, // pink
  "/gravity":    24, // warm orange
  "/waves":     195, // cyan
  "/particles":  82, // lime
  "/pendulum":  270, // indigo
  "/attractor": 300, // fuchsia
  "/terrain":   142, // emerald
  "/reaction":  190, // cyan-teal
  "/neural":     45, // yellow
};

// Mapping from route to page label + icon (used for the breadcrumb-style indicator).
const PAGE_INFO: Record<string, { label: string; Icon: LucideIcon }> = {
  "/":          { label: "Home",      Icon: Home },
  "/chat":      { label: "Chat",      Icon: MessageSquare },
  "/chess":     { label: "Chess",     Icon: Swords },
  "/minecraft": { label: "Minecraft", Icon: Cuboid },
  "/fractals":  { label: "Fractals",  Icon: Infinity },
  "/evolution": { label: "Evolution", Icon: TrendingUp },
  "/life":      { label: "Life",      Icon: Dna },
  "/synth":     { label: "Synth",     Icon: Music },
  "/gravity":   { label: "Gravity",   Icon: Orbit },
  "/waves":     { label: "Waves",     Icon: Waves },
  "/particles": { label: "Particles", Icon: Atom },
  "/pendulum":  { label: "Pendulum",  Icon: Fan },
  "/attractor": { label: "Attractor", Icon: Sparkles },
  "/terrain":   { label: "Terrain",   Icon: Mountain },
  "/reaction":  { label: "Reaction",  Icon: FlaskConical },
  "/neural":    { label: "Neural Net", Icon: Brain },
};

// Per-page accent colours for the active page indicator.
const PAGE_ACCENTS: Record<string, { pill: string; text: string }> = {
  "/":          { pill: "bg-blue-500/15 dark:bg-blue-500/20",   text: "text-blue-700 dark:text-blue-300" },
  "/chat":      { pill: "bg-blue-500/15 dark:bg-blue-500/20",   text: "text-blue-700 dark:text-blue-300" },
  "/chess":     { pill: "bg-amber-500/15 dark:bg-amber-400/20", text: "text-amber-700 dark:text-amber-300" },
  "/minecraft": { pill: "bg-green-500/15 dark:bg-green-500/20", text: "text-green-700 dark:text-green-300" },
  "/fractals":  { pill: "bg-violet-500/15 dark:bg-violet-500/20", text: "text-violet-700 dark:text-violet-300" },
  "/evolution": { pill: "bg-rose-500/15 dark:bg-rose-500/20",   text: "text-rose-700 dark:text-rose-300" },
  "/life":      { pill: "bg-teal-500/15 dark:bg-teal-500/20",   text: "text-teal-700 dark:text-teal-300" },
  "/synth":     { pill: "bg-pink-500/15 dark:bg-pink-500/20",   text: "text-pink-700 dark:text-pink-300" },
  "/gravity":   { pill: "bg-orange-500/15 dark:bg-orange-500/20", text: "text-orange-700 dark:text-orange-300" },
  "/waves":     { pill: "bg-cyan-500/15 dark:bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300" },
  "/particles": { pill: "bg-lime-500/15 dark:bg-lime-500/20", text: "text-lime-700 dark:text-lime-300" },
  "/pendulum":  { pill: "bg-indigo-500/15 dark:bg-indigo-500/20", text: "text-indigo-700 dark:text-indigo-300" },
  "/attractor": { pill: "bg-fuchsia-500/15 dark:bg-fuchsia-500/20", text: "text-fuchsia-700 dark:text-fuchsia-300" },
  "/terrain":   { pill: "bg-emerald-500/15 dark:bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300" },
  "/reaction":  { pill: "bg-cyan-500/15 dark:bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300" },
  "/neural":    { pill: "bg-yellow-500/15 dark:bg-yellow-500/20", text: "text-yellow-700 dark:text-yellow-300" },
};

// Actual color values used for the animated brand accent dot.
const PAGE_DOT_COLORS: Record<string, string> = {
  "/":          "#3b82f6",
  "/chat":      "#3b82f6",
  "/chess":     "#f59e0b",
  "/minecraft": "#22c55e",
  "/fractals":  "#8b5cf6",
  "/evolution": "#f43f5e",
  "/life":      "#14b8a6",
  "/synth":     "#ec4899",
  "/gravity":   "#f97316",
  "/waves":     "#06b6d4",
  "/particles": "#84cc16",
  "/pendulum":  "#6366f1",
  "/attractor": "#d946ef",
  "/terrain":   "#10b981",
  "/reaction":  "#06b6d4",
  "/neural":    "#eab308",
};

// Browser tab titles per page.
const PAGE_TITLES: Record<string, string> = {
  "/":          "Self-Modifier",
  "/chat":      "Chat — Self-Modifier",
  "/chess":     "Chess — Self-Modifier",
  "/minecraft": "Minecraft — Self-Modifier",
  "/fractals":  "Fractals — Self-Modifier",
  "/evolution": "Evolution — Self-Modifier",
  "/life":      "Life — Self-Modifier",
  "/synth":     "Synth — Self-Modifier",
  "/gravity":   "Gravity — Self-Modifier",
  "/waves":     "Waves — Self-Modifier",
  "/particles": "Particles — Self-Modifier",
  "/pendulum":  "Pendulum — Self-Modifier",
  "/attractor": "Attractor — Self-Modifier",
  "/terrain":   "Terrain — Self-Modifier",
  "/reaction":  "Reaction — Self-Modifier",
};

// Alt+number quick-nav targets (kept so the global keyboard shortcuts still work).
const ALT_NAV_ROUTES = [
  "/chat",      // Alt+1
  "/chess",     // Alt+2
  "/minecraft", // Alt+3
  "/fractals",  // Alt+4
  "/evolution", // Alt+5
  "/life",      // Alt+6
  "/synth",     // Alt+7
  "/gravity",   // Alt+8
  "/waves",     // Alt+9
  "/particles", // Alt+0
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const initializedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLAnchorElement>(null);
  const pageRef = useRef<HTMLAnchorElement>(null);

  const isHome = pathname === "/";
  const pageInfo = PAGE_INFO[pathname];
  const accent = PAGE_ACCENTS[pathname];

  // Update the browser tab title whenever the active page changes.
  useEffect(() => {
    document.title = PAGE_TITLES[pathname] ?? "Self-Modifier";
  }, [pathname]);

  // Notify the ambient canvas to shift particle hues to match the current page.
  useEffect(() => {
    const hue = PAGE_HUES[pathname];
    if (hue !== undefined) {
      dispatchAmbientEvent({ type: "page-change", hue });
    }
  }, [pathname]);

  // Alt+number keyboard shortcuts for quick navigation.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey) return;
      const index = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].indexOf(e.key);
      if (index === -1) return;
      e.preventDefault();
      router.push(ALT_NAV_ROUTES[index]);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // Sliding pill for active item
  useLayoutEffect(() => {
    const el = isHome ? homeRef.current : pageRef.current;
    const container = containerRef.current;
    if (!el || !container) {
      setPill(null);
      return;
    }
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    setPill({ left: eRect.left - cRect.left, width: eRect.width });
    initializedRef.current = true;
  }, [pathname, isHome]);

  return (
    <TooltipProvider delayDuration={600}>
      <nav className="h-12 flex-none border-b border-border bg-background flex items-center px-4 gap-1 relative z-10">
        <span className="font-semibold text-sm mr-2 sm:mr-4 text-foreground/70 select-none flex items-center gap-1.5">
          <span
            className="size-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: PAGE_DOT_COLORS[pathname] ?? "#737373",
              transition: "background-color 300ms cubic-bezier(0.4,0,0.2,1)",
              boxShadow: `0 0 6px 1px ${PAGE_DOT_COLORS[pathname] ?? "#737373"}55`,
            }}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">Self-Modifier</span>
        </span>

        {/* Live neural pulse — shows self-improve agent heartbeat */}
        <NeuralPulse />

        {/* Breadcrumb-style navigation: Home / Current Page */}
        <div ref={containerRef} className="relative flex items-center gap-1">
          {/* Animated sliding pill background */}
          {pill && (
            <div
              className={[
                "absolute inset-y-1 rounded-md pointer-events-none",
                accent?.pill ?? PAGE_ACCENTS["/"]!.pill,
              ].join(" ")}
              style={{
                left: pill.left,
                width: pill.width,
                transition: initializedRef.current
                  ? "left 200ms cubic-bezier(0.4,0,0.2,1), width 200ms cubic-bezier(0.4,0,0.2,1), background-color 200ms ease"
                  : "background-color 200ms ease",
              }}
            />
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                ref={homeRef}
                href="/"
                className={[
                  "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isHome
                    ? (accent?.text ?? "text-accent-foreground")
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                ].join(" ")}
              >
                <Home size={15} />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="text-xs">Home</span>
            </TooltipContent>
          </Tooltip>

          {/* Show current page as a breadcrumb when not on home */}
          {!isHome && pageInfo && (
            <>
              <span className="text-muted-foreground/30 text-sm select-none">/</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    ref={pageRef}
                    href={pathname}
                    className={[
                      "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      accent?.text ?? "text-accent-foreground",
                    ].join(" ")}
                  >
                    <pageInfo.Icon size={15} />
                    <span className="hidden sm:inline">{pageInfo.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <span className="text-xs">{pageInfo.label}</span>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Command palette trigger */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "k", metaKey: true })
                  );
                }}
                className="hidden sm:flex items-center gap-1.5 h-7 px-2 rounded-md border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors text-xs"
                aria-label="Open command palette"
              >
                <span className="text-muted-foreground/60">Search…</span>
                <kbd className="font-mono text-[10px] font-medium text-muted-foreground/70">⌘K</kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="text-xs">
                Command palette{" "}
                <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ⌘K
                </kbd>
              </span>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "?" })
                  );
                }}
                className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                aria-label="Keyboard shortcuts"
              >
                <kbd className="font-mono text-sm font-semibold leading-none">?</kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="text-xs">
                Keyboard shortcuts{" "}
                <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  ?
                </kbd>
              </span>
            </TooltipContent>
          </Tooltip>
          <ThemeToggle />
        </div>
      </nav>
      <KeyboardShortcutsModal />
    </TooltipProvider>
  );
}
