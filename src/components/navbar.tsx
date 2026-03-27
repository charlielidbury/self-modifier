"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Swords, Cuboid, Infinity, TrendingUp, Dna, Music, Orbit, Waves, Atom, Fan, Sparkles, Mountain, FlaskConical } from "lucide-react";
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

// Hue values for each page's accent colour (used to tint the ambient canvas).
const PAGE_HUES: Record<string, number> = {
  "/":          217, // blue
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
};

const tabs = [
  { href: "/", label: "Chat", Icon: MessageSquare, shortcut: "Alt+1" },
  { href: "/chess", label: "Chess", Icon: Swords, shortcut: "Alt+2" },
  { href: "/minecraft", label: "Minecraft", Icon: Cuboid, shortcut: "Alt+3" },
  { href: "/fractals", label: "Fractals", Icon: Infinity, shortcut: "Alt+4" },
  { href: "/evolution", label: "Evolution", Icon: TrendingUp, shortcut: "Alt+5" },
  { href: "/life", label: "Life", Icon: Dna, shortcut: "Alt+6" },
  { href: "/synth", label: "Synth", Icon: Music, shortcut: "Alt+7" },
  { href: "/gravity", label: "Gravity", Icon: Orbit, shortcut: "Alt+8" },
  { href: "/waves", label: "Waves", Icon: Waves, shortcut: "Alt+9" },
  { href: "/particles", label: "Particles", Icon: Atom, shortcut: "Alt+0" },
  { href: "/pendulum", label: "Pendulum", Icon: Fan, shortcut: "" },
  { href: "/attractor", label: "Attractor", Icon: Sparkles, shortcut: "" },
  { href: "/terrain", label: "Terrain", Icon: Mountain, shortcut: "" },
  { href: "/reaction", label: "Reaction", Icon: FlaskConical, shortcut: "" },
];

// Per-page accent colours for the sliding pill background and active tab text.
// Using literal Tailwind class strings so the compiler includes them in the build.
const PAGE_ACCENTS: Record<string, { pill: string; text: string }> = {
  "/":          { pill: "bg-blue-500/15 dark:bg-blue-500/20",   text: "text-blue-700 dark:text-blue-300" },
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
};

// Actual color values used for the animated brand accent dot (inline style so
// the value can be transitioned smoothly without Tailwind purging dynamic classes).
const PAGE_DOT_COLORS: Record<string, string> = {
  "/":          "#3b82f6", // blue-500
  "/chess":     "#f59e0b", // amber-500
  "/minecraft": "#22c55e", // green-500
  "/fractals":  "#8b5cf6", // violet-500
  "/evolution": "#f43f5e", // rose-500
  "/life":      "#14b8a6", // teal-500
  "/synth":     "#ec4899", // pink-500
  "/gravity":   "#f97316", // orange-500
  "/waves":     "#06b6d4", // cyan-500
  "/particles": "#84cc16", // lime-500
  "/pendulum":  "#6366f1", // indigo-500
  "/attractor": "#d946ef", // fuchsia-500
  "/terrain":   "#10b981", // emerald-500
  "/reaction":  "#06b6d4", // cyan-500
};

// Subtle ambient glow applied to the sliding pill so the active tab feels alive.
// Kept low-opacity so it looks tasteful in both light and dark mode.
const PAGE_PILL_GLOWS: Record<string, string> = {
  "/":          "0 0 14px 3px rgba(59,130,246,0.22)",
  "/chess":     "0 0 14px 3px rgba(245,158,11,0.22)",
  "/minecraft": "0 0 14px 3px rgba(34,197,94,0.22)",
  "/fractals":  "0 0 14px 3px rgba(139,92,246,0.22)",
  "/evolution": "0 0 14px 3px rgba(244,63,94,0.22)",
  "/life":      "0 0 14px 3px rgba(20,184,166,0.22)",
  "/synth":     "0 0 14px 3px rgba(236,72,153,0.22)",
  "/gravity":   "0 0 14px 3px rgba(249,115,22,0.22)",
  "/waves":     "0 0 14px 3px rgba(6,182,212,0.22)",
  "/particles": "0 0 14px 3px rgba(132,204,22,0.22)",
  "/pendulum":  "0 0 14px 3px rgba(99,102,241,0.22)",
  "/attractor": "0 0 14px 3px rgba(217,70,239,0.22)",
  "/terrain":   "0 0 14px 3px rgba(16,185,129,0.22)",
  "/reaction":  "0 0 14px 3px rgba(6,182,212,0.22)",
};

// Browser tab titles per page.
const PAGE_TITLES: Record<string, string> = {
  "/":          "Chat — Self-Modifier",
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

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // Track whether pill has been positioned at least once so we can suppress
  // the transition on the very first render (avoids slide-in from 0).
  const initializedRef = useRef(false);

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey) return;
      const index = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].indexOf(e.key);
      if (index === -1) return;
      e.preventDefault();
      router.push(tabs[index].href);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // Use useLayoutEffect so the pill is positioned before the browser paints,
  // preventing any flash of an un-highlighted tab on first load.
  useLayoutEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.href === pathname);
    const el = tabRefs.current[activeIndex];
    const container = containerRef.current;
    if (!el || !container) {
      setPill(null);
      return;
    }
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    setPill({ left: eRect.left - cRect.left, width: eRect.width });
    initializedRef.current = true;
  }, [pathname]);

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

        {/* Tab container — position:relative so the sliding pill is anchored here */}
        <div ref={containerRef} className="relative flex items-center gap-1">
          {/* Animated sliding pill background */}
          {pill && (
            <div
              className={[
                "absolute inset-y-1 rounded-md pointer-events-none",
                PAGE_ACCENTS[pathname]?.pill ?? "bg-accent",
              ].join(" ")}
              style={{
                left: pill.left,
                width: pill.width,
                boxShadow: PAGE_PILL_GLOWS[pathname] ?? undefined,
                // Only animate position after initial placement to avoid slide-in from 0.
                // Always animate background-color and box-shadow so page-specific accent transitions smoothly.
                transition: initializedRef.current
                  ? "left 200ms cubic-bezier(0.4,0,0.2,1), width 200ms cubic-bezier(0.4,0,0.2,1), background-color 200ms ease, box-shadow 300ms ease"
                  : "background-color 200ms ease, box-shadow 300ms ease",
              }}
            />
          )}

          {tabs.map(({ href, label, Icon, shortcut }, i) => {
            const active = pathname === href;
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <Link
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    href={href}
                    className={[
                      "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      active
                        ? PAGE_ACCENTS[href]?.text ?? "text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                    ].join(" ")}
                  >
                    <Icon size={15} />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <span className="text-xs">
                    {label}
                    {shortcut && (
                      <>
                        {" "}
                        <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {shortcut}
                        </kbd>
                      </>
                    )}
                  </span>
                </TooltipContent>
              </Tooltip>
            );
          })}
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
