"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    // Briefly enable colour transitions on all elements so the theme switch
    // animates smoothly instead of snapping. The class is removed once the
    // transition completes (250 ms) to avoid interfering with other animations.
    const el = document.documentElement;
    el.classList.add("theme-transitioning");
    setTimeout(() => el.classList.remove("theme-transitioning"), 300);

    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore
    }
    if (next === "dark") {
      el.classList.add("dark");
    } else {
      el.classList.remove("dark");
    }
  }

  // Alt+T keyboard shortcut to toggle theme
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key === "t") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // toggle reads `theme` from closure — re-register when theme changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Render a placeholder with same dimensions to avoid layout shift
  if (!mounted) {
    return <div className="w-8 h-8" />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
        >
          {/* Two icons stacked; each rotates + fades when the theme switches */}
          <span className="relative w-[15px] h-[15px]">
            <span
              className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                theme === "dark"
                  ? "opacity-100 rotate-0"
                  : "opacity-0 rotate-90 pointer-events-none"
              }`}
            >
              <Sun size={15} />
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                theme === "light"
                  ? "opacity-100 rotate-0"
                  : "opacity-0 -rotate-90 pointer-events-none"
              }`}
            >
              <Moon size={15} />
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="text-xs">
          {theme === "dark" ? "Light mode" : "Dark mode"}{" "}
          <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            Alt+T
          </kbd>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
