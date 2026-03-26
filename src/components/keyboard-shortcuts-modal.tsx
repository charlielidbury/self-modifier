"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    title: "Chess",
    rows: [
      { keys: ["Ctrl", "Z"], description: "Undo last move" },
      { keys: ["N"], description: "New game" },
      { keys: ["F"], description: "Flip board" },
      { keys: ["H"], description: "Show best move hint" },
      { keys: ["M"], description: "Toggle sound on/off" },
    ],
  },
  {
    title: "Fractals",
    rows: [
      { keys: ["↑", "↓", "←", "→"], description: "Pan view" },
      { keys: ["+"], description: "Zoom in" },
      { keys: ["-"], description: "Zoom out" },
      { keys: ["Space"], description: "Play / pause animation" },
      { keys: ["R"], description: "Reset view" },
      { keys: ["S"], description: "Copy shareable link" },
    ],
  },
  {
    title: "Global",
    rows: [{ keys: ["?"], description: "Show keyboard shortcuts" }],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard size={18} />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {SECTIONS.map((section) => (
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
                      {row.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {row.keys.map((k, j) => (
                        <Kbd key={j}>{k}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Press{" "}
          <Kbd>?</Kbd>{" "}
          or{" "}
          <Kbd>Esc</Kbd>{" "}
          to close
        </p>
      </DialogContent>
    </Dialog>
  );
}
