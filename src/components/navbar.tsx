"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Swords, Cuboid, Infinity } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";

const tabs = [
  { href: "/", label: "Chat", Icon: MessageSquare, shortcut: "Alt+1" },
  { href: "/chess", label: "Chess", Icon: Swords, shortcut: "Alt+2" },
  { href: "/minecraft", label: "Minecraft", Icon: Cuboid, shortcut: "Alt+3" },
  { href: "/fractals", label: "Fractals", Icon: Infinity, shortcut: "Alt+4" },
];

// Per-page accent colours for the sliding pill background and active tab text.
// Using literal Tailwind class strings so the compiler includes them in the build.
const PAGE_ACCENTS: Record<string, { pill: string; text: string }> = {
  "/":          { pill: "bg-blue-500/15 dark:bg-blue-500/20",   text: "text-blue-700 dark:text-blue-300" },
  "/chess":     { pill: "bg-amber-500/15 dark:bg-amber-400/20", text: "text-amber-700 dark:text-amber-300" },
  "/minecraft": { pill: "bg-green-500/15 dark:bg-green-500/20", text: "text-green-700 dark:text-green-300" },
  "/fractals":  { pill: "bg-violet-500/15 dark:bg-violet-500/20", text: "text-violet-700 dark:text-violet-300" },
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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey) return;
      const index = ["1", "2", "3", "4"].indexOf(e.key);
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
      <nav className="h-12 flex-none border-b border-border bg-background flex items-center px-4 gap-1">
        <span className="font-semibold text-sm mr-4 text-foreground/70 select-none">
          Self-Modifier
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
                // Only animate position after initial placement to avoid slide-in from 0.
                // Always animate background-color so page-specific accent transitions smoothly.
                transition: initializedRef.current
                  ? "left 200ms cubic-bezier(0.4,0,0.2,1), width 200ms cubic-bezier(0.4,0,0.2,1), background-color 200ms ease"
                  : "background-color 200ms ease",
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
                    {label}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <span className="text-xs">
                    {label}{" "}
                    <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {shortcut}
                    </kbd>
                  </span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
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
