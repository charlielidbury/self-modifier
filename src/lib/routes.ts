/**
 * Unified Route Registry — single source of truth for all page metadata.
 *
 * Every page in the app is defined once here. The navbar, mobile drawer,
 * command palette, and any future consumer derive their data from this
 * registry instead of maintaining parallel lookup tables.
 */

import {
  Home,
  MessageSquare,
  Swords,
  Cuboid,
  Infinity,
  TrendingUp,
  Dna,
  Music,
  Orbit,
  Waves,
  Atom,
  Fan,
  Sparkles,
  Mountain,
  FlaskConical,
  Brain,
  BarChart3,
  Droplets,
  Compass,
  Bird,
  FlaskRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Core types ───────────────────────────────────────────────────────────────

export interface RouteEntry {
  /** URL path, e.g. "/chess" */
  path: string;
  /** Human-readable label */
  label: string;
  /** Lucide icon component */
  Icon: LucideIcon;
  /** Hue value for ambient canvas tinting (0-360) */
  hue: number;
  /** Tailwind accent classes for the active navbar pill */
  accent: { pill: string; text: string };
  /** Hex colour for the animated brand dot */
  dotColor: string;
  /** Browser tab title */
  title: string;
  /** Category for mobile drawer / home page grouping */
  category: RouteCategory;
  /** Tailwind text colour class for the icon */
  iconColor: string;
  /** Tailwind bg colour class for icon container */
  iconBg: string;
  /** Extra search keywords for the command palette */
  keywords?: string[];
  /** Alt+N shortcut index (0-9). Omit if no shortcut. */
  altIndex?: number;
}

export type RouteCategory =
  | "featured"
  | "physics"
  | "simulations"
  | "3d-visuals"
  | "interactive"
  | "meta";

export const CATEGORY_LABELS: Record<RouteCategory, string> = {
  featured: "Featured",
  physics: "Physics",
  simulations: "Simulations",
  "3d-visuals": "3D & Visuals",
  interactive: "Interactive Tools",
  meta: "Meta",
};

// ── The Registry ─────────────────────────────────────────────────────────────

export const ROUTES: readonly RouteEntry[] = [
  {
    path: "/",
    label: "Home",
    Icon: Home,
    hue: 217,
    accent: { pill: "bg-blue-500/15 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-300" },
    dotColor: "#3b82f6",
    title: "Self-Modifier",
    category: "featured",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10 dark:bg-blue-500/15",
  },
  {
    path: "/chat",
    label: "Chat",
    Icon: MessageSquare,
    hue: 217,
    accent: { pill: "bg-blue-500/15 dark:bg-blue-500/20", text: "text-blue-700 dark:text-blue-300" },
    dotColor: "#3b82f6",
    title: "Chat — Self-Modifier",
    category: "featured",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10 dark:bg-blue-500/15",
    altIndex: 0,
  },
  {
    path: "/ochre",
    label: "Ochre",
    Icon: FlaskRound,
    hue: 38,
    accent: { pill: "bg-amber-500/15 dark:bg-amber-400/20", text: "text-amber-700 dark:text-amber-300" },
    dotColor: "#f59e0b",
    title: "Ochre — Self-Modifier",
    category: "featured",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-600/10 dark:bg-amber-600/15",
  },
  {
    path: "/chess",
    label: "Chess",
    Icon: Swords,
    hue: 38,
    accent: { pill: "bg-amber-500/15 dark:bg-amber-400/20", text: "text-amber-700 dark:text-amber-300" },
    dotColor: "#f59e0b",
    title: "Chess — Self-Modifier",
    category: "interactive",
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10 dark:bg-amber-500/15",
    altIndex: 1,
  },
  {
    path: "/minecraft",
    label: "Minecraft",
    Icon: Cuboid,
    hue: 142,
    accent: { pill: "bg-green-500/15 dark:bg-green-500/20", text: "text-green-700 dark:text-green-300" },
    dotColor: "#22c55e",
    title: "Minecraft — Self-Modifier",
    category: "3d-visuals",
    iconColor: "text-green-500",
    iconBg: "bg-green-500/10 dark:bg-green-500/15",
    altIndex: 2,
  },
  {
    path: "/fractals",
    label: "Fractals",
    Icon: Infinity,
    hue: 258,
    accent: { pill: "bg-violet-500/15 dark:bg-violet-500/20", text: "text-violet-700 dark:text-violet-300" },
    dotColor: "#8b5cf6",
    title: "Fractals — Self-Modifier",
    category: "3d-visuals",
    iconColor: "text-violet-500",
    iconBg: "bg-violet-500/10 dark:bg-violet-500/15",
    altIndex: 3,
  },
  {
    path: "/evolution",
    label: "Evolution",
    Icon: TrendingUp,
    hue: 350,
    accent: { pill: "bg-rose-500/15 dark:bg-rose-500/20", text: "text-rose-700 dark:text-rose-300" },
    dotColor: "#f43f5e",
    title: "Evolution — Self-Modifier",
    category: "meta",
    iconColor: "text-rose-500",
    iconBg: "bg-rose-500/10 dark:bg-rose-500/15",
    altIndex: 4,
  },
  {
    path: "/life",
    label: "Game of Life",
    Icon: Dna,
    hue: 173,
    accent: { pill: "bg-teal-500/15 dark:bg-teal-500/20", text: "text-teal-700 dark:text-teal-300" },
    dotColor: "#14b8a6",
    title: "Life — Self-Modifier",
    category: "simulations",
    iconColor: "text-teal-500",
    iconBg: "bg-teal-500/10 dark:bg-teal-500/15",
    altIndex: 5,
    keywords: ["conway", "cellular automata"],
  },
  {
    path: "/synth",
    label: "Synthesizer",
    Icon: Music,
    hue: 330,
    accent: { pill: "bg-pink-500/15 dark:bg-pink-500/20", text: "text-pink-700 dark:text-pink-300" },
    dotColor: "#ec4899",
    title: "Synth — Self-Modifier",
    category: "interactive",
    iconColor: "text-pink-500",
    iconBg: "bg-pink-500/10 dark:bg-pink-500/15",
    altIndex: 6,
    keywords: ["music", "audio", "sound"],
  },
  {
    path: "/gravity",
    label: "Gravity",
    Icon: Orbit,
    hue: 24,
    accent: { pill: "bg-orange-500/15 dark:bg-orange-500/20", text: "text-orange-700 dark:text-orange-300" },
    dotColor: "#f97316",
    title: "Gravity — Self-Modifier",
    category: "physics",
    iconColor: "text-orange-500",
    iconBg: "bg-orange-500/10 dark:bg-orange-500/15",
    altIndex: 7,
    keywords: ["n-body", "orbital"],
  },
  {
    path: "/waves",
    label: "Waves",
    Icon: Waves,
    hue: 195,
    accent: { pill: "bg-cyan-500/15 dark:bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300" },
    dotColor: "#06b6d4",
    title: "Waves — Self-Modifier",
    category: "physics",
    iconColor: "text-cyan-500",
    iconBg: "bg-cyan-500/10 dark:bg-cyan-500/15",
    altIndex: 8,
  },
  {
    path: "/particles",
    label: "Particle Life",
    Icon: Atom,
    hue: 82,
    accent: { pill: "bg-lime-500/15 dark:bg-lime-500/20", text: "text-lime-700 dark:text-lime-300" },
    dotColor: "#84cc16",
    title: "Particles — Self-Modifier",
    category: "simulations",
    iconColor: "text-lime-500",
    iconBg: "bg-lime-500/10 dark:bg-lime-500/15",
    altIndex: 9,
  },
  {
    path: "/pendulum",
    label: "Pendulum",
    Icon: Fan,
    hue: 270,
    accent: { pill: "bg-indigo-500/15 dark:bg-indigo-500/20", text: "text-indigo-700 dark:text-indigo-300" },
    dotColor: "#6366f1",
    title: "Pendulum — Self-Modifier",
    category: "physics",
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-500/10 dark:bg-indigo-500/15",
    keywords: ["double pendulum", "chaos"],
  },
  {
    path: "/attractor",
    label: "Attractors",
    Icon: Sparkles,
    hue: 300,
    accent: { pill: "bg-fuchsia-500/15 dark:bg-fuchsia-500/20", text: "text-fuchsia-700 dark:text-fuchsia-300" },
    dotColor: "#d946ef",
    title: "Attractor — Self-Modifier",
    category: "physics",
    iconColor: "text-fuchsia-500",
    iconBg: "bg-fuchsia-500/10 dark:bg-fuchsia-500/15",
    keywords: ["lorenz", "strange attractor"],
  },
  {
    path: "/terrain",
    label: "Terrain",
    Icon: Mountain,
    hue: 142,
    accent: { pill: "bg-emerald-500/15 dark:bg-emerald-500/20", text: "text-emerald-700 dark:text-emerald-300" },
    dotColor: "#10b981",
    title: "Terrain — Self-Modifier",
    category: "3d-visuals",
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    keywords: ["heightmap", "perlin noise"],
  },
  {
    path: "/reaction",
    label: "Reaction Diffusion",
    Icon: FlaskConical,
    hue: 190,
    accent: { pill: "bg-cyan-500/15 dark:bg-cyan-500/20", text: "text-cyan-700 dark:text-cyan-300" },
    dotColor: "#06b6d4",
    title: "Reaction — Self-Modifier",
    category: "simulations",
    iconColor: "text-cyan-500",
    iconBg: "bg-cyan-500/10 dark:bg-cyan-500/15",
    keywords: ["turing pattern", "gray-scott"],
  },
  {
    path: "/neural",
    label: "Neural Network",
    Icon: Brain,
    hue: 45,
    accent: { pill: "bg-yellow-500/15 dark:bg-yellow-500/20", text: "text-yellow-700 dark:text-yellow-300" },
    dotColor: "#eab308",
    title: "Neural Net — Self-Modifier",
    category: "interactive",
    iconColor: "text-yellow-500",
    iconBg: "bg-yellow-500/10 dark:bg-yellow-500/15",
    keywords: ["perceptron", "deep learning"],
  },
  {
    path: "/sorting",
    label: "Sorting",
    Icon: BarChart3,
    hue: 210,
    accent: { pill: "bg-sky-500/15 dark:bg-sky-500/20", text: "text-sky-700 dark:text-sky-300" },
    dotColor: "#0ea5e9",
    title: "Sorting — Self-Modifier",
    category: "interactive",
    iconColor: "text-sky-500",
    iconBg: "bg-sky-500/10 dark:bg-sky-500/15",
    keywords: ["bubble sort", "quicksort", "algorithm"],
  },
  {
    path: "/fluid",
    label: "Fluid",
    Icon: Droplets,
    hue: 0,
    accent: { pill: "bg-red-500/15 dark:bg-red-500/20", text: "text-red-700 dark:text-red-300" },
    dotColor: "#ef4444",
    title: "Fluid — Self-Modifier",
    category: "physics",
    iconColor: "text-red-500",
    iconBg: "bg-red-500/10 dark:bg-red-500/15",
    keywords: ["navier-stokes", "simulation"],
  },
  {
    path: "/constellation",
    label: "Constellation",
    Icon: Compass,
    hue: 230,
    accent: { pill: "bg-sky-500/15 dark:bg-sky-500/20", text: "text-sky-700 dark:text-sky-300" },
    dotColor: "#38bdf8",
    title: "Constellation — Self-Modifier",
    category: "meta",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10 dark:bg-sky-500/15",
    keywords: ["graph", "map", "codebase"],
  },
  {
    path: "/boids",
    label: "Boids",
    Icon: Bird,
    hue: 55,
    accent: { pill: "bg-yellow-500/15 dark:bg-yellow-500/20", text: "text-yellow-700 dark:text-yellow-300" },
    dotColor: "#eab308",
    title: "Boids — Self-Modifier",
    category: "simulations",
    iconColor: "text-yellow-500",
    iconBg: "bg-yellow-500/10 dark:bg-yellow-500/15",
    keywords: ["flocking", "swarm", "reynolds"],
  },
] as const;

// ── Derived lookups (computed once at module load) ───────────────────────────

/** O(1) lookup by path */
export const routeByPath: ReadonlyMap<string, RouteEntry> = new Map(
  ROUTES.map((r) => [r.path, r])
);

/** Hue lookup used by the ambient canvas */
export const PAGE_HUES: Record<string, number> = Object.fromEntries(
  ROUTES.map((r) => [r.path, r.hue])
);

/** Info lookup used by the navbar breadcrumb */
export const PAGE_INFO: Record<string, { label: string; Icon: LucideIcon }> = Object.fromEntries(
  ROUTES.map((r) => [r.path, { label: r.label, Icon: r.Icon }])
);

/** Accent classes used by the navbar pill */
export const PAGE_ACCENTS: Record<string, { pill: string; text: string }> = Object.fromEntries(
  ROUTES.map((r) => [r.path, r.accent])
);

/** Dot colour used by the navbar brand animation */
export const PAGE_DOT_COLORS: Record<string, string> = Object.fromEntries(
  ROUTES.map((r) => [r.path, r.dotColor])
);

/** Browser tab titles */
export const PAGE_TITLES: Record<string, string> = Object.fromEntries(
  ROUTES.map((r) => [r.path, r.title])
);

/** Alt+N shortcut targets, ordered by index 0-9 */
export const ALT_NAV_ROUTES: string[] = ROUTES
  .filter((r) => r.altIndex !== undefined)
  .sort((a, b) => a.altIndex! - b.altIndex!)
  .map((r) => r.path);

/** Routes grouped by category, preserving declaration order */
export function routesByCategory(): { title: string; items: RouteEntry[] }[] {
  const order: RouteCategory[] = ["featured", "physics", "simulations", "3d-visuals", "interactive", "meta"];
  const groups = new Map<RouteCategory, RouteEntry[]>();
  for (const cat of order) groups.set(cat, []);
  for (const r of ROUTES) {
    if (r.path === "/") continue; // Home is handled separately
    groups.get(r.category)!.push(r);
  }
  return order
    .filter((cat) => groups.get(cat)!.length > 0)
    .map((cat) => ({ title: CATEGORY_LABELS[cat], items: groups.get(cat)! }));
}
