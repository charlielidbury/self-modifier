"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Swords, Cuboid, Infinity } from "lucide-react";
import { useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const tabs = [
  { href: "/", label: "Chat", Icon: MessageSquare, shortcut: "Alt+1" },
  { href: "/chess", label: "Chess", Icon: Swords, shortcut: "Alt+2" },
  { href: "/minecraft", label: "Minecraft", Icon: Cuboid, shortcut: "Alt+3" },
  { href: "/fractals", label: "Fractals", Icon: Infinity, shortcut: "Alt+4" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

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

  return (
    <TooltipProvider delayDuration={600}>
      <nav className="h-12 flex-none border-b border-border bg-background flex items-center px-4 gap-1">
        <span className="font-semibold text-sm mr-4 text-foreground/70 select-none">
          Self-Modifier
        </span>
        {tabs.map(({ href, label, Icon, shortcut }) => {
          const active = pathname === href;
          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>
                <Link
                  href={href}
                  className={[
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
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
      </nav>
    </TooltipProvider>
  );
}
