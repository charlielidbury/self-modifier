"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  rows: ShortcutRow[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Navigation",
    rows: [
      { keys: ["Alt", "1"], description: "Go to Chat" },
      { keys: ["Alt", "2"], description: "Go to Chess" },
      { keys: ["Alt", "3"], description: "Go to Minecraft" },
      { keys: ["Alt", "4"], description: "Go to Fractals" },
    ],
  },
  {
    title: "Chat",
    rows: [
      { keys: ["/"], description: "Focus message composer" },
      { keys: ["Alt", "N"], description: "New session" },
      { keys: ["Alt", "B"], description: "Toggle session sidebar" },
      { keys: ["Alt", "F"], description: "Focus session search" },
      { keys: ["↓"], description: "Focus session list from filter box" },
      { keys: ["↑", "↓"], description: "Navigate between sessions" },
      { keys: ["Enter"], description: "Open highlighted session" },
      { keys: ["Esc"], description: "Return focus to filter box" },
    ],
  },
  {
    title: "Chess",
    rows: [
      { keys: ["Ctrl", "Z"], description: "Undo last move" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Redo last undone move" },
      { keys: ["N"], description: "New game" },
      { keys: ["F"], description: "Flip board" },
      { keys: ["H"], description: "Show best move hint" },
      { keys: ["M"], description: "Toggle sound on/off" },
      { keys: ["C"], description: "Swap player colour — White ↔ Black (vs AI mode)" },
      { keys: ["G"], description: "Copy game as PGN to clipboard" },
      { keys: ["L"], description: "Open current position in Lichess analysis" },
    ],
  },
  {
    title: "Minecraft",
    rows: [
      { keys: ["←", "→"], description: "Orbit left / right" },
      { keys: ["↑", "↓"], description: "Orbit up / down" },
      { keys: ["+"], description: "Zoom in" },
      { keys: ["-"], description: "Zoom out" },
      { keys: ["R"], description: "Reset view" },
      { keys: ["S"], description: "Save screenshot as PNG" },
    ],
  },
  {
    title: "Fractals",
    rows: [
      { keys: ["↑", "↓", "←", "→"], description: "Pan view" },
      { keys: ["+"], description: "Zoom in" },
      { keys: ["-"], description: "Zoom out" },
      { keys: ["Space"], description: "Play / pause animation" },
      { keys: ["M"], description: "Cycle fractal mode (Mandelbrot → Julia → Burning Ship → Newton → Tricorn → Multibrot)" },
      { keys: ["P"], description: "Cycle colour palette" },
      { keys: ["R"], description: "Reset view" },
      { keys: ["S"], description: "Copy shareable link" },
      { keys: ["D"], description: "Save as PNG" },
      { keys: ["F"], description: "Toggle fullscreen" },
      { keys: ["Shift", "Click"], description: "Explore Julia set (Mandelbrot mode)" },
      { keys: ["["], description: "Previous preset location" },
      { keys: ["]"], description: "Next preset location" },
      { keys: ["I"], description: "Increase max iterations (+50)" },
      { keys: ["Shift", "I"], description: "Decrease max iterations (−50)" },
      { keys: ["⌫"], description: "Navigate back in view history" },
      { keys: ["Shift", "⌫"], description: "Navigate forward in view history" },
    ],
  },
  {
    title: "Global",
    rows: [
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Alt", "T"], description: "Toggle dark / light mode" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-sm">
      {children}
    </kbd>
  );
}

/** Renders `text` with ALL occurrences of `query` highlighted. */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let idx = lower.indexOf(lowerQuery);

  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <mark
        key={idx}
        className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded-[2px] px-0"
      >
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    lastIdx = idx + query.length;
    idx = lower.indexOf(lowerQuery, lastIdx);
  }

  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in an input / textarea / contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-focus search when modal opens; clear query when it closes.
  useEffect(() => {
    if (open) {
      // Small delay so the dialog animation finishes before focusing.
      const id = setTimeout(() => searchRef.current?.focus(), 80);
      return () => clearTimeout(id);
    } else {
      setQuery("");
    }
  }, [open]);

  // Filter sections based on query.
  const trimmedQuery = query.trim();
  const filteredSections = trimmedQuery
    ? SECTIONS.flatMap((section) => {
        const matchingRows = section.rows.filter(
          (row) =>
            row.description.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
            row.keys.some((k) =>
              k.toLowerCase().includes(trimmedQuery.toLowerCase())
            )
        );
        if (matchingRows.length === 0) return [];
        return [{ ...section, rows: matchingRows }];
      })
    : SECTIONS;

  const totalResults = filteredSections.reduce(
    (sum, s) => sum + s.rows.length,
    0
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard size={18} />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts…"
            className="w-full rounded-md border border-border bg-muted/40 py-1.5 pl-7 pr-7 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div
          className={cn(
            "space-y-5 overflow-y-auto",
            // Fixed height so the dialog doesn't resize when filtering.
            "max-h-[min(60vh,380px)]",
            "pr-1"
          )}
        >
          {filteredSections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground italic">
              No shortcuts match &ldquo;{trimmedQuery}&rdquo;
            </p>
          ) : (
            filteredSections.map((section) => (
              <div key={section.title}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
                <div className="space-y-1.5">
                  {section.rows.map((row, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                    >
                      <span className="text-sm text-foreground">
                        <HighlightText
                          text={row.description}
                          query={trimmedQuery}
                        />
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                        {row.keys.map((k, j) => {
                          const keyMatches =
                            trimmedQuery &&
                            k
                              .toLowerCase()
                              .includes(trimmedQuery.toLowerCase());
                          return (
                            <kbd
                              key={j}
                              className={cn(
                                "inline-flex items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium shadow-sm transition-colors",
                                keyMatches
                                  ? "border-yellow-400 bg-yellow-100 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-200"
                                  : "border-border bg-muted text-muted-foreground",
                              )}
                            >
                              {k}
                            </kbd>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground pt-2 border-t border-border flex items-center justify-between">
          <span>
            Press{" "}
            <Kbd>?</Kbd>{" "}
            or{" "}
            <Kbd>Esc</Kbd>{" "}
            to close
          </span>
          {trimmedQuery && totalResults > 0 && (
            <span className="tabular-nums">
              {totalResults} result{totalResults !== 1 ? "s" : ""}
            </span>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
