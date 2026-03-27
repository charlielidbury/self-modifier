"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquare, Swords, Cuboid, Infinity, TrendingUp, Dna,
  Music, Orbit, Waves, Atom, Fan, Sparkles, Mountain,
  FlaskConical, Brain, BarChart3, Droplets,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RecentlyModifiedRoute } from "@/app/api/recently-modified/route";
import { useEventBus } from "@/hooks/use-event-bus";

/* ─── Star data ──────────────────────────────────────────────────────────── */

interface Star {
  id: string;
  href: string;
  label: string;
  Icon: LucideIcon;
  category: string;
  /** Position as percentage of viewport (0–100) */
  x: number;
  y: number;
  /** CSS colour for the star glow */
  color: string;
  /** Star visual size tier: 1 = small, 2 = medium, 3 = large */
  size: 1 | 2 | 3;
}

const STARS: Star[] = [
  // ── AI constellation (upper-left) ──
  { id: "chat",      href: "/chat",      label: "Chat",              Icon: MessageSquare, category: "AI",         x: 18, y: 22, color: "#3b82f6", size: 3 },
  { id: "neural",    href: "/neural",    label: "Neural Network",    Icon: Brain,         category: "AI",         x: 28, y: 32, color: "#eab308", size: 2 },

  // ── Games (upper-right) ──
  { id: "chess",     href: "/chess",     label: "Chess",             Icon: Swords,        category: "Games",      x: 78, y: 18, color: "#f59e0b", size: 2 },

  // ── Graphics (top-center) ──
  { id: "fractals",  href: "/fractals",  label: "Fractals",          Icon: Infinity,      category: "Graphics",   x: 50, y: 15, color: "#8b5cf6", size: 3 },

  // ── 3D cluster (right) ──
  { id: "minecraft", href: "/minecraft", label: "Minecraft",         Icon: Cuboid,        category: "3D",         x: 82, y: 42, color: "#22c55e", size: 2 },
  { id: "terrain",   href: "/terrain",   label: "Terrain",           Icon: Mountain,      category: "3D",         x: 72, y: 52, color: "#10b981", size: 2 },

  // ── Simulation cluster (center) ──
  { id: "evolution", href: "/evolution",  label: "Evolution",        Icon: TrendingUp,    category: "Simulation", x: 42, y: 48, color: "#f43f5e", size: 2 },
  { id: "life",      href: "/life",       label: "Game of Life",     Icon: Dna,           category: "Simulation", x: 52, y: 42, color: "#14b8a6", size: 2 },
  { id: "particles", href: "/particles",  label: "Particle Life",    Icon: Atom,          category: "Simulation", x: 48, y: 58, color: "#84cc16", size: 1 },
  { id: "reaction",  href: "/reaction",   label: "Reaction Diffusion", Icon: FlaskConical, category: "Simulation", x: 58, y: 54, color: "#06b6d4", size: 1 },

  // ── Physics cluster (lower-left) ──
  { id: "gravity",   href: "/gravity",   label: "Gravity",           Icon: Orbit,         category: "Physics",    x: 15, y: 62, color: "#f97316", size: 2 },
  { id: "waves",     href: "/waves",     label: "Waves",             Icon: Waves,         category: "Physics",    x: 26, y: 72, color: "#06b6d4", size: 1 },
  { id: "pendulum",  href: "/pendulum",  label: "Double Pendulum",   Icon: Fan,           category: "Physics",    x: 22, y: 50, color: "#6366f1", size: 1 },
  { id: "attractor", href: "/attractor", label: "Strange Attractors", Icon: Sparkles,     category: "Physics",    x: 32, y: 62, color: "#d946ef", size: 2 },
  { id: "fluid",     href: "/fluid",     label: "Fluid Simulation",  Icon: Droplets,      category: "Physics",    x: 12, y: 78, color: "#ef4444", size: 1 },

  // ── Audio (lower-right) ──
  { id: "synth",     href: "/synth",     label: "Synthesizer",       Icon: Music,         category: "Audio",      x: 80, y: 72, color: "#ec4899", size: 2 },

  // ── Algorithms (mid-right) ──
  { id: "sorting",   href: "/sorting",   label: "Sorting Visualizer", Icon: BarChart3,    category: "Algorithms", x: 68, y: 35, color: "#0ea5e9", size: 1 },
];

/** Lines connect stars in the same category */
function getConstellationLines(): [string, string][] {
  const byCat = new Map<string, Star[]>();
  for (const s of STARS) {
    const list = byCat.get(s.category) ?? [];
    list.push(s);
    byCat.set(s.category, list);
  }
  const lines: [string, string][] = [];
  for (const group of byCat.values()) {
    // Connect sequentially within category to form constellation shape
    for (let i = 0; i < group.length - 1; i++) {
      lines.push([group[i].id, group[i + 1].id]);
    }
  }
  return lines;
}

/* ─── Background stars (tiny twinkling dots) ─────────────────────────── */

interface BgStar { x: number; y: number; r: number; delay: number; duration: number; }

function generateBgStars(count: number): BgStar[] {
  // Deterministic pseudo-random so SSR and client match
  let seed = 42;
  function rand() { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; }
  const stars: BgStar[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * 100,
      y: rand() * 100,
      r: 0.3 + rand() * 1.2,
      delay: rand() * 6,
      duration: 2 + rand() * 4,
    });
  }
  return stars;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export default function ConstellationPage() {
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [recentMods, setRecentMods] = useState<Map<string, RecentlyModifiedRoute>>(new Map());
  const bgStars = useMemo(() => generateBgStars(180), []);
  const lines = useMemo(() => getConstellationLines(), []);

  // Fetch recently modified routes
  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/recently-modified");
      if (!res.ok) return;
      const data = await res.json();
      const map = new Map<string, RecentlyModifiedRoute>();
      for (const route of data.routes ?? []) map.set(route.route, route);
      setRecentMods(map);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  // Re-fetch when server detects new git activity
  useEventBus("recently-modified", useCallback(() => {
    fetchRecent();
  }, [fetchRecent]));

  const starMap = useMemo(() => {
    const m = new Map<string, Star>();
    for (const s of STARS) m.set(s.id, s);
    return m;
  }, []);

  const handleStarClick = useCallback((href: string) => {
    router.push(href);
  }, [router]);

  // Determine the category of the hovered star (to highlight its constellation)
  const hoveredCategory = hoveredId ? starMap.get(hoveredId)?.category : null;

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #0f172a 0%, #020617 70%, #000 100%)" }}
    >
      {/* Tiny background twinkle stars */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {bgStars.map((s, i) => (
          <circle
            key={i}
            cx={`${s.x}%`}
            cy={`${s.y}%`}
            r={s.r}
            fill="white"
            className="constellation-twinkle"
            style={{
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </svg>

      {/* Constellation lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
        {lines.map(([fromId, toId]) => {
          const from = starMap.get(fromId)!;
          const to = starMap.get(toId)!;
          const isHighlighted = hoveredCategory && from.category === hoveredCategory;
          return (
            <line
              key={`${fromId}-${toId}`}
              x1={`${from.x}%`}
              y1={`${from.y}%`}
              x2={`${to.x}%`}
              y2={`${to.y}%`}
              stroke={isHighlighted ? from.color : "rgba(148,163,184,0.12)"}
              strokeWidth={isHighlighted ? 1.5 : 0.7}
              strokeDasharray={isHighlighted ? "none" : "4 4"}
              style={{ transition: "stroke 0.4s ease, stroke-width 0.4s ease" }}
            />
          );
        })}
      </svg>

      {/* Category labels */}
      {(() => {
        const categories = new Map<string, { x: number; y: number; color: string }>();
        for (const s of STARS) {
          const existing = categories.get(s.category);
          if (!existing) {
            categories.set(s.category, { x: s.x, y: s.y, color: s.color });
          } else {
            const stars = STARS.filter(st => st.category === s.category);
            const avgX = stars.reduce((sum, st) => sum + st.x, 0) / stars.length;
            const avgY = stars.reduce((sum, st) => sum + st.y, 0) / stars.length;
            categories.set(s.category, { x: avgX, y: avgY - 8, color: s.color });
          }
        }
        // Compute proper label positions (centroid - offset above)
        const labels: { cat: string; x: number; y: number; color: string }[] = [];
        for (const [cat] of categories) {
          const stars = STARS.filter(st => st.category === cat);
          const avgX = stars.reduce((sum, st) => sum + st.x, 0) / stars.length;
          const minY = Math.min(...stars.map(st => st.y));
          labels.push({ cat, x: avgX, y: minY - 6, color: stars[0].color });
        }
        return labels.map(({ cat, x, y, color }) => (
          <div
            key={cat}
            className="absolute pointer-events-none"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
              opacity: hoveredCategory === cat ? 0.9 : 0.3,
              transition: "opacity 0.4s ease",
            }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.2em] whitespace-nowrap"
              style={{ color }}
            >
              {cat}
            </span>
          </div>
        ));
      })()}

      {/* Interactive star nodes */}
      {STARS.map((star) => {
        const isHovered = hoveredId === star.id;
        const isInHoveredConstellation = hoveredCategory === star.category;
        const isImproved = recentMods.has(star.href);
        const baseSize = star.size === 3 ? 44 : star.size === 2 ? 36 : 28;
        const displaySize = isHovered ? baseSize + 8 : baseSize;

        return (
          <button
            key={star.id}
            onClick={() => handleStarClick(star.href)}
            onMouseEnter={() => setHoveredId(star.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="absolute group focus:outline-none"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: isHovered ? 50 : 10,
            }}
            aria-label={`Navigate to ${star.label}`}
          >
            {/* Outer glow ring */}
            <div
              className="absolute rounded-full"
              style={{
                width: displaySize + 24,
                height: displaySize + 24,
                top: -(displaySize + 24 - displaySize) / 2,
                left: -(displaySize + 24 - displaySize) / 2,
                background: `radial-gradient(circle, ${star.color}${isHovered ? "30" : "10"} 0%, transparent 70%)`,
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />

            {/* Recently-improved pulsing ring */}
            {isImproved && (
              <div
                className="absolute rounded-full constellation-improved-pulse"
                style={{
                  width: displaySize + 16,
                  height: displaySize + 16,
                  top: -(16) / 2,
                  left: -(16) / 2,
                  border: "1.5px solid #10b981",
                }}
              />
            )}

            {/* Star core */}
            <div
              className="relative rounded-full flex items-center justify-center backdrop-blur-sm"
              style={{
                width: displaySize,
                height: displaySize,
                background: isHovered
                  ? `${star.color}30`
                  : isInHoveredConstellation
                    ? `${star.color}18`
                    : `${star.color}0c`,
                border: `1.5px solid ${star.color}${isHovered ? "80" : isInHoveredConstellation ? "40" : "25"}`,
                boxShadow: isHovered
                  ? `0 0 20px ${star.color}40, 0 0 40px ${star.color}15, inset 0 0 12px ${star.color}15`
                  : isImproved
                    ? `0 0 12px #10b98130, 0 0 24px #10b98110`
                    : `0 0 8px ${star.color}10`,
                transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <star.Icon
                size={star.size === 3 ? 20 : star.size === 2 ? 16 : 13}
                style={{
                  color: isHovered ? star.color : isInHoveredConstellation ? star.color : `${star.color}90`,
                  filter: isHovered ? `drop-shadow(0 0 6px ${star.color})` : "none",
                  transition: "all 0.4s ease",
                }}
              />
            </div>

            {/* Label (always visible but dims when not relevant) */}
            <div
              className="absolute left-1/2 whitespace-nowrap"
              style={{
                top: displaySize / 2 + 8,
                transform: "translateX(-50%)",
                transition: "all 0.3s ease",
              }}
            >
              <span
                className="text-xs font-medium"
                style={{
                  color: isHovered
                    ? star.color
                    : isInHoveredConstellation
                      ? `${star.color}`
                      : "rgba(148,163,184,0.5)",
                  textShadow: isHovered ? `0 0 12px ${star.color}60` : "none",
                  opacity: isHovered ? 1 : isInHoveredConstellation ? 0.8 : 0.5,
                  transition: "all 0.4s ease",
                }}
              >
                {star.label}
              </span>
              {isImproved && (
                <span className="ml-1.5 text-[9px] text-emerald-400 font-medium">
                  ✦ improved
                </span>
              )}
            </div>
          </button>
        );
      })}

      {/* Title overlay */}
      <div className="absolute top-6 left-6 pointer-events-none">
        <h1 className="text-2xl font-bold text-slate-200/80 tracking-tight">
          Constellation Map
        </h1>
        <p className="text-sm text-slate-400/60 mt-1">
          Click any star to navigate — constellations group by category
        </p>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 right-6 pointer-events-none flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 constellation-improved-dot" />
          <span className="text-[10px] text-slate-400/60">Recently improved</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-slate-500/40" />
          <span className="text-[10px] text-slate-400/60">Simulation</span>
        </div>
      </div>
    </div>
  );
}
