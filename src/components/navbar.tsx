"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home } from "lucide-react";
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
import { CodebaseHeartbeat } from "@/components/codebase-heartbeat";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import {
  PAGE_HUES,
  PAGE_INFO,
  PAGE_ACCENTS,
  PAGE_TITLES,
  ALT_NAV_ROUTES,
} from "@/lib/routes";

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
      <nav data-navbar className="h-12 flex-none border-b border-border bg-background flex items-center px-4 gap-1 relative z-10">

        {/* Live neural pulse — shows self-improve agent heartbeat */}
        <NeuralPulse />

        {/* Mobile hamburger menu — visible only on small screens */}
        <MobileNavDrawer />

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
          <CodebaseHeartbeat />
          <ThemeToggle />
        </div>
      </nav>
      <KeyboardShortcutsModal />
    </TooltipProvider>
  );
}
