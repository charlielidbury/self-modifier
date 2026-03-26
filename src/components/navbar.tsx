"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Swords, Cuboid, Infinity } from "lucide-react";

const tabs = [
  { href: "/", label: "Chat", Icon: MessageSquare },
  { href: "/chess", label: "Chess", Icon: Swords },
  { href: "/minecraft", label: "Minecraft", Icon: Cuboid },
  { href: "/fractals", label: "Fractals", Icon: Infinity },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="h-12 flex-none border-b border-border bg-background flex items-center px-4 gap-1">
      <span className="font-semibold text-sm mr-4 text-foreground/70 select-none">
        Self-Modifier
      </span>
      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
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
        );
      })}
    </nav>
  );
}
