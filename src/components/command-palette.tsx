"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sun,
  Moon,
  Keyboard,
  Search,
  Plus,
  Clock,
  RefreshCw,
  Lightbulb,
  Copy,
  ExternalLink,
  Play,
  RotateCcw,
  Download,
  Link,
  Camera,
  Shuffle,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";

// ─── Command definitions ─────────────────────────────────────────────────────

interface Command {
  id: string;
  label: string;
  /** Optional secondary description shown dimmer to the right */
  hint?: string;
  icon: React.ReactNode;
  /** Category for visual grouping */
  group: string;
  /** Run the command. Return value is ignored. */
  action: () => void;
  /** Extra search terms that match but aren't displayed */
  keywords?: string[];
}

/** Alt shortcut hint strings indexed by altIndex */
const ALT_HINTS = ["Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9", "Alt+0"];

function useCommands(): Command[] {
  const router = useRouter();
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Watch for theme changes (MutationObserver on <html> class attribute)
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const toggleTheme = useCallback(() => {
    const el = document.documentElement;
    el.classList.add("theme-transitioning");
    setTimeout(() => el.classList.remove("theme-transitioning"), 300);

    const next = el.classList.contains("dark") ? "light" : "dark";
    if (next === "dark") {
      el.classList.add("dark");
    } else {
      el.classList.remove("dark");
    }
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }, []);

  // Generate navigation commands from the unified route registry
  const navCommands: Command[] = ROUTES.map((route) => ({
    id: `nav-${route.path === "/" ? "home" : route.path.slice(1)}`,
    label: `Go to ${route.label}`,
    hint: route.altIndex !== undefined ? ALT_HINTS[route.altIndex] : undefined,
    icon: React.createElement(route.Icon, { size: 16 }),
    group: "Navigation",
    action: () => router.push(route.path),
    keywords: route.keywords,
  }));

  return [
    // ── Navigation (auto-generated from route registry) ───────────────────────
    ...navCommands,
    // ── Actions ───────────────────────────────────────────────────────────────
    {
      id: "theme-toggle",
      label: isDark ? "Switch to Light Mode" : "Switch to Dark Mode",
      hint: "Alt+T",
      icon: isDark ? <Sun size={16} /> : <Moon size={16} />,
      group: "Actions",
      action: toggleTheme,
      keywords: ["theme", "dark", "light", "mode", "appearance"],
    },
    {
      id: "show-shortcuts",
      label: "Show Keyboard Shortcuts",
      hint: "?",
      icon: <Keyboard size={16} />,
      group: "Actions",
      action: () => {
        // The keyboard shortcuts modal listens for "?" keydown events
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
      },
      keywords: ["help", "keys", "hotkeys", "bindings"],
    },
    ...(pathname === "/chat"
      ? [
          {
            id: "new-session",
            label: "New Chat Session",
            hint: "Alt+N",
            icon: <Plus size={16} />,
            group: "Actions",
            action: () => {
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "n", altKey: true })
              );
            },
            keywords: ["create", "fresh", "conversation"],
          },
        ]
      : []),
    // ── Chess page commands ────────────────────────────────────────────────────
    ...(pathname === "/chess"
      ? [
          {
            id: "chess-new-game",
            label: "New Chess Game",
            hint: "N",
            icon: <Plus size={16} />,
            group: "Chess",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
            },
            keywords: ["start", "reset", "restart"],
          },
          {
            id: "chess-flip",
            label: "Flip Board",
            hint: "F",
            icon: <RefreshCw size={16} />,
            group: "Chess",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
            },
            keywords: ["rotate", "perspective", "mirror", "black", "white"],
          },
          {
            id: "chess-hint",
            label: "Show Move Hint",
            hint: "H",
            icon: <Lightbulb size={16} />,
            group: "Chess",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
            },
            keywords: ["help", "best", "suggestion", "engine"],
          },
          {
            id: "chess-copy-pgn",
            label: "Copy Game as PGN",
            hint: "G",
            icon: <Copy size={16} />,
            group: "Chess",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
            },
            keywords: ["export", "share", "clipboard", "notation"],
          },
          {
            id: "chess-lichess",
            label: "Open in Lichess Analysis",
            hint: "L",
            icon: <ExternalLink size={16} />,
            group: "Chess",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "l" }));
            },
            keywords: ["analyze", "analysis", "external", "engine"],
          },
        ]
      : []),
    // ── Fractals page commands ─────────────────────────────────────────────────
    ...(pathname === "/fractals"
      ? [
          {
            id: "fractals-toggle-animation",
            label: "Toggle Fractal Animation",
            hint: "Space",
            icon: <Play size={16} />,
            group: "Fractals",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
            },
            keywords: ["play", "pause", "animate", "julia", "stop"],
          },
          {
            id: "fractals-reset",
            label: "Reset Fractal View",
            hint: "R",
            icon: <RotateCcw size={16} />,
            group: "Fractals",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
            },
            keywords: ["center", "zoom", "default", "home"],
          },
          {
            id: "fractals-save-png",
            label: "Save Fractal as PNG",
            hint: "D",
            icon: <Download size={16} />,
            group: "Fractals",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
            },
            keywords: ["image", "export", "screenshot", "download", "picture"],
          },
          {
            id: "fractals-share",
            label: "Copy Fractal Share Link",
            hint: "S",
            icon: <Link size={16} />,
            group: "Fractals",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
            },
            keywords: ["url", "clipboard", "share", "link", "permalink"],
          },
          {
            id: "fractals-surprise",
            label: "Surprise Me — Random Preset",
            hint: "X",
            icon: <Shuffle size={16} />,
            group: "Fractals",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
            },
            keywords: ["random", "shuffle", "explore", "jump", "preset", "teleport"],
          },
        ]
      : []),
    // ── Life page commands ──────────────────────────────────────────────────────
    ...(pathname === "/life"
      ? [
          {
            id: "life-toggle",
            label: "Toggle Life Simulation",
            hint: "Space",
            icon: <Play size={16} />,
            group: "Life",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
            },
            keywords: ["play", "pause", "run", "stop"],
          },
          {
            id: "life-step",
            label: "Step One Generation",
            hint: "S",
            icon: <SkipForward size={16} />,
            group: "Life",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
            },
            keywords: ["advance", "next", "tick"],
          },
          {
            id: "life-random",
            label: "Randomize Grid",
            hint: "R",
            icon: <Shuffle size={16} />,
            group: "Life",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
            },
            keywords: ["random", "shuffle", "generate"],
          },
          {
            id: "life-clear",
            label: "Clear All Cells",
            hint: "C",
            icon: <RotateCcw size={16} />,
            group: "Life",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
            },
            keywords: ["reset", "empty", "wipe"],
          },
        ]
      : []),
    // ── Pendulum page commands ─────────────────────────────────────────────────
    ...(pathname === "/pendulum"
      ? [
          {
            id: "pendulum-toggle",
            label: "Toggle Pendulum Simulation",
            hint: "Space",
            icon: <Play size={16} />,
            group: "Pendulum",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
            },
            keywords: ["play", "pause", "run", "stop"],
          },
          {
            id: "pendulum-reset",
            label: "Reset Pendulums",
            hint: "R",
            icon: <RotateCcw size={16} />,
            group: "Pendulum",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
            },
            keywords: ["restart", "default", "butterfly"],
          },
          {
            id: "pendulum-clear",
            label: "Clear All Pendulums",
            hint: "C",
            icon: <RotateCcw size={16} />,
            group: "Pendulum",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
            },
            keywords: ["remove", "empty", "wipe"],
          },
          {
            id: "pendulum-add",
            label: "Add Pendulum",
            hint: "+",
            icon: <Plus size={16} />,
            group: "Pendulum",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "=" }));
            },
            keywords: ["new", "create", "spawn"],
          },
        ]
      : []),
    // ── Attractor page commands ────────────────────────────────────────────────
    ...(pathname === "/attractor"
      ? [
          {
            id: "attractor-toggle",
            label: "Toggle Attractor Simulation",
            hint: "Space",
            icon: <Play size={16} />,
            group: "Attractor",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
            },
            keywords: ["pause", "play", "stop", "start"],
          },
          {
            id: "attractor-next",
            label: "Next Attractor",
            hint: "N",
            icon: <Sparkles size={16} />,
            group: "Attractor",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
            },
            keywords: ["switch", "change", "lorenz", "rossler", "aizawa", "thomas", "halvorsen"],
          },
          {
            id: "attractor-reset",
            label: "Reset Attractor",
            hint: "R",
            icon: <RotateCcw size={16} />,
            group: "Attractor",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
            },
            keywords: ["restart", "clear", "reinitialize"],
          },
        ]
      : []),
    // ── Minecraft page commands ────────────────────────────────────────────────
    ...(pathname === "/minecraft"
      ? [
          {
            id: "minecraft-reset",
            label: "Reset Minecraft View",
            hint: "R",
            icon: <RotateCcw size={16} />,
            group: "Minecraft",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }));
            },
            keywords: ["camera", "orbit", "default", "home"],
          },
          {
            id: "minecraft-screenshot",
            label: "Save Minecraft Screenshot",
            hint: "S",
            icon: <Camera size={16} />,
            group: "Minecraft",
            action: () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
            },
            keywords: ["image", "png", "export", "download", "picture"],
          },
        ]
      : []),
  ];
}

// ─── Fuzzy matching ──────────────────────────────────────────────────────────

/** Simple substring match across label, hint, keywords. Returns true if all
 *  query words appear somewhere in the searchable text. */
function matchesQuery(cmd: Command, query: string): boolean {
  if (!query) return true;
  const haystack = [
    cmd.label,
    cmd.hint ?? "",
    cmd.group,
    ...(cmd.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

// ─── Recently-used persistence ───────────────────────────────────────────────

const RECENT_KEY = "cmd-palette-recent";
const MAX_RECENT = 5;

function loadRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentIds(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load persisted recent-command IDs when the palette first mounts.
  useEffect(() => {
    setRecentIds(loadRecentIds());
  }, []);

  const commands = useCommands();

  const filtered = commands.filter((cmd) => matchesQuery(cmd, query));

  // When there is no active query, prepend a "Recent" pseudo-group whose
  // items are resolved from the persisted ID list (skipping stale IDs).
  const recentCommands: Command[] = !query
    ? recentIds.flatMap((id) => {
        const cmd = commands.find((c) => c.id === id);
        return cmd ? [cmd] : [];
      })
    : [];

  // Build display groups: "Recent" section first (only when no query), then
  // the normal grouped results (deduplicating items already in Recent).
  const recentIdSet = new Set(recentCommands.map((c) => c.id));

  const groups: { name: string; items: Command[] }[] = [];

  if (recentCommands.length > 0) {
    groups.push({ name: "Recent", items: recentCommands });
  }

  for (const cmd of filtered) {
    // Don't show a command twice — omit from regular groups if it's in Recent.
    if (recentIdSet.has(cmd.id)) continue;
    const existing = groups.find((g) => g.name === cmd.group);
    if (existing) {
      existing.items.push(cmd);
    } else {
      groups.push({ name: cmd.group, items: [cmd] });
    }
  }

  // Flat list of commands in display order (for arrow-key navigation)
  const flatItems = groups.flatMap((g) => g.items);

  // Clamp active index when filtered results change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // ── Open / close ────────────────────────────────────────────────────────────
  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActiveIdx(0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  // ── Global Cmd+K / Ctrl+K listener ─────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, openPalette, closePalette]);

  // Auto-focus input when opening
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // ── Run a command ───────────────────────────────────────────────────────────
  const runCommand = useCallback(
    (cmd: Command) => {
      closePalette();

      // Persist this command as most-recently used (deduplicated, capped at MAX_RECENT).
      setRecentIds((prev) => {
        const next = [cmd.id, ...prev.filter((id) => id !== cmd.id)].slice(
          0,
          MAX_RECENT
        );
        saveRecentIds(next);
        return next;
      });

      // Small delay so the palette closes before side-effects (e.g. route change)
      requestAnimationFrame(() => cmd.action());
    },
    [closePalette]
  );

  // ── Keyboard navigation inside the palette ─────────────────────────────────
  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min(prev + 1, flatItems.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = flatItems[activeIdx];
      if (cmd) runCommand(cmd);
      return;
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  if (!open) return null;

  // Track the running item index across groups for the flat activeIdx
  let itemIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px] command-palette-backdrop"
        onClick={closePalette}
        aria-hidden="true"
      />

      {/* Palette container */}
      <div className="fixed inset-0 z-[201] flex items-start justify-center pt-[min(20vh,140px)] px-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-[520px] rounded-xl border border-border bg-popover shadow-2xl command-palette-panel overflow-hidden"
          role="dialog"
          aria-label="Command palette"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type a command…"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="flex-shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[min(50vh,340px)] overflow-y-auto py-2"
            role="listbox"
          >
            {flatItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground italic">
                No commands match &ldquo;{query}&rdquo;
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.name}>
                  <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group.name === "Recent" && (
                        <Clock size={10} className="opacity-70" />
                      )}
                      {group.name}
                    </span>
                    {group.name === "Recent" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecentIds([]);
                          saveRecentIds([]);
                        }}
                        title="Clear recent commands"
                        className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1 py-0.5 rounded hover:bg-accent/50"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {group.items.map((cmd) => {
                    const idx = itemIndex++;
                    const isActive = idx === activeIdx;
                    return (
                      <button
                        key={cmd.id}
                        data-active={isActive}
                        role="option"
                        aria-selected={isActive}
                        className={[
                          "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground/80 hover:bg-accent/50",
                        ].join(" ")}
                        onClick={() => runCommand(cmd)}
                        onMouseEnter={() => setActiveIdx(idx)}
                      >
                        <span
                          className={[
                            "flex-shrink-0",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground",
                          ].join(" ")}
                        >
                          {cmd.icon}
                        </span>
                        <span className="flex-1 truncate">{cmd.label}</span>
                        {cmd.hint && (
                          <kbd className="flex-shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {cmd.hint}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                  ↵
                </kbd>
                select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
              toggle
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
