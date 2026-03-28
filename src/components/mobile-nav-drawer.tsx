"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Menu, X, ChevronRight } from "lucide-react";
import { routesByCategory } from "@/lib/routes";

// Pre-compute sections once at module level
const SECTIONS = routesByCategory();

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close drawer when route changes
  useEffect(() => {
    if (open) {
      setClosing(true);
      const t = setTimeout(() => {
        setOpen(false);
        setClosing(false);
      }, 200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const closeDrawer = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      triggerRef.current?.focus();
    }, 200);
  }, []);

  const openDrawer = useCallback(() => {
    setOpen(true);
    setClosing(false);
    // Focus the first link after animation starts
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        firstLinkRef.current?.focus();
      });
    });
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, closeDrawer]);

  // Trap focus inside drawer when open
  useEffect(() => {
    if (!open || closing) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = drawer!.querySelectorAll<HTMLElement>(
        'a[href], button, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleTab);
    return () => window.removeEventListener("keydown", handleTab);
  }, [open, closing]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Track which link is the first (for focus management)
  let isFirstLink = true;

  return (
    <>
      {/* Hamburger button — only visible on small screens */}
      <button
        ref={triggerRef}
        onClick={openDrawer}
        className="sm:hidden flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
      >
        <Menu size={18} />
      </button>

      {/* Drawer overlay + panel */}
      {open && (
        <div
          className="fixed inset-0 z-[300] sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          id="mobile-nav-drawer"
        >
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] ${
              closing ? "mobile-nav-backdrop-out" : "mobile-nav-backdrop-in"
            }`}
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div
            ref={drawerRef}
            className={`absolute top-0 left-0 bottom-0 w-[min(320px,85vw)] bg-background border-r border-border shadow-2xl flex flex-col ${
              closing ? "mobile-nav-panel-out" : "mobile-nav-panel-in"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
                onClick={closeDrawer}
              >
                <Home size={15} />
                Self-Modifier
              </Link>
              <button
                onClick={closeDrawer}
                className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable nav */}
            <nav className="flex-1 overflow-y-auto py-2 overscroll-contain" aria-label="Page navigation">
              {SECTIONS.map((section, sectionIdx) => (
                <div key={section.title} className={sectionIdx > 0 ? "mt-3" : ""}>
                  <div className="px-4 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {section.title}
                    </span>
                  </div>
                  {section.items.map((item) => {
                    const isActive = pathname === item.path;
                    const linkRef = isFirstLink ? firstLinkRef : undefined;
                    if (isFirstLink) isFirstLink = false;

                    return (
                      <Link
                        key={item.path}
                        ref={linkRef}
                        href={item.path}
                        onClick={closeDrawer}
                        className={[
                          "flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-foreground/80 hover:bg-accent/50 active:bg-accent/70",
                        ].join(" ")}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-md flex-shrink-0 ${
                            isActive ? item.iconBg : "bg-muted/50"
                          }`}
                        >
                          <item.Icon
                            size={16}
                            className={isActive ? item.iconColor : "text-muted-foreground"}
                          />
                        </div>
                        <span className="flex-1 truncate">{item.label}</span>
                        {isActive && (
                          <ChevronRight size={14} className="text-muted-foreground/50 flex-shrink-0" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground/50 text-center">
                Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">⌘K</kbd> for command palette
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
