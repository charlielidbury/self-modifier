"use client";

import Link from "next/link";
import {
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
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

interface CardInfo {
  href: string;
  label: string;
  description: string;
  Icon: LucideIcon;
  color: string;       // Tailwind text color for icon
  bgColor: string;     // Tailwind bg for icon container
  borderColor: string; // Tailwind border accent on hover
  glowColor: string;   // CSS color for subtle glow
  category: string;
}

const cards: CardInfo[] = [
  {
    href: "/chat",
    label: "Chat",
    description: "Converse with an AI that can read and modify its own source code in real time.",
    Icon: MessageSquare,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 dark:bg-blue-500/15",
    borderColor: "hover:border-blue-500/40",
    glowColor: "rgba(59,130,246,0.15)",
    category: "AI",
  },
  {
    href: "/chess",
    label: "Chess",
    description: "Play against a minimax engine with move hints and Lichess analysis export.",
    Icon: Swords,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10 dark:bg-amber-500/15",
    borderColor: "hover:border-amber-500/40",
    glowColor: "rgba(245,158,11,0.15)",
    category: "Games",
  },
  {
    href: "/minecraft",
    label: "Minecraft",
    description: "Explore a Three.js voxel scene with orbit controls and real-time lighting.",
    Icon: Cuboid,
    color: "text-green-500",
    bgColor: "bg-green-500/10 dark:bg-green-500/15",
    borderColor: "hover:border-green-500/40",
    glowColor: "rgba(34,197,94,0.15)",
    category: "3D",
  },
  {
    href: "/fractals",
    label: "Fractals",
    description: "Dive into Mandelbrot, Julia, Burning Ship and Newton fractals rendered on the GPU.",
    Icon: Infinity,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10 dark:bg-violet-500/15",
    borderColor: "hover:border-violet-500/40",
    glowColor: "rgba(139,92,246,0.15)",
    category: "Graphics",
  },
  {
    href: "/evolution",
    label: "Evolution",
    description: "A living timeline of every self-improvement commit — explore diffs, stats, and activity.",
    Icon: TrendingUp,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10 dark:bg-rose-500/15",
    borderColor: "hover:border-rose-500/40",
    glowColor: "rgba(244,63,94,0.15)",
    category: "Simulation",
  },
  {
    href: "/life",
    label: "Game of Life",
    description: "Conway's cellular automaton — draw patterns, load presets, and watch emergence.",
    Icon: Dna,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10 dark:bg-teal-500/15",
    borderColor: "hover:border-teal-500/40",
    glowColor: "rgba(20,184,166,0.15)",
    category: "Simulation",
  },
  {
    href: "/synth",
    label: "Synthesizer",
    description: "A Web Audio API synth with oscillators, filters, and a playable keyboard.",
    Icon: Music,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10 dark:bg-pink-500/15",
    borderColor: "hover:border-pink-500/40",
    glowColor: "rgba(236,72,153,0.15)",
    category: "Audio",
  },
  {
    href: "/gravity",
    label: "Gravity",
    description: "N-body gravitational simulation — spawn stars and watch orbital mechanics unfold.",
    Icon: Orbit,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10 dark:bg-orange-500/15",
    borderColor: "hover:border-orange-500/40",
    glowColor: "rgba(249,115,22,0.15)",
    category: "Physics",
  },
  {
    href: "/waves",
    label: "Waves",
    description: "2D wave equation solver with interactive emitters and interference patterns.",
    Icon: Waves,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10 dark:bg-cyan-500/15",
    borderColor: "hover:border-cyan-500/40",
    glowColor: "rgba(6,182,212,0.15)",
    category: "Physics",
  },
  {
    href: "/particles",
    label: "Particle Life",
    description: "Six species of particles with tunable attraction rules create emergent chemistry.",
    Icon: Atom,
    color: "text-lime-500",
    bgColor: "bg-lime-500/10 dark:bg-lime-500/15",
    borderColor: "hover:border-lime-500/40",
    glowColor: "rgba(132,204,22,0.15)",
    category: "Simulation",
  },
  {
    href: "/pendulum",
    label: "Double Pendulum",
    description: "Chaotic motion visualised with trails — tiny changes lead to wildly different paths.",
    Icon: Fan,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10 dark:bg-indigo-500/15",
    borderColor: "hover:border-indigo-500/40",
    glowColor: "rgba(99,102,241,0.15)",
    category: "Physics",
  },
  {
    href: "/attractor",
    label: "Strange Attractors",
    description: "Lorenz, Rössler, Aizawa, Thomas & Halvorsen rendered as flowing 3D particle trails.",
    Icon: Sparkles,
    color: "text-fuchsia-500",
    bgColor: "bg-fuchsia-500/10 dark:bg-fuchsia-500/15",
    borderColor: "hover:border-fuchsia-500/40",
    glowColor: "rgba(217,70,239,0.15)",
    category: "Physics",
  },
  {
    href: "/terrain",
    label: "Terrain",
    description: "Procedural 3D landscapes generated with Perlin noise and biome-based colouring.",
    Icon: Mountain,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10 dark:bg-emerald-500/15",
    borderColor: "hover:border-emerald-500/40",
    glowColor: "rgba(16,185,129,0.15)",
    category: "3D",
  },
  {
    href: "/reaction",
    label: "Reaction Diffusion",
    description: "Gray-Scott model producing Turing patterns — mitosis, coral, spots and more.",
    Icon: FlaskConical,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10 dark:bg-cyan-500/15",
    borderColor: "hover:border-cyan-400/40",
    glowColor: "rgba(6,182,212,0.15)",
    category: "Simulation",
  },
  {
    href: "/neural",
    label: "Neural Network",
    description: "Build, train, and visualise neural networks learning to classify — pure backpropagation in real time.",
    Icon: Brain,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10 dark:bg-yellow-500/15",
    borderColor: "hover:border-yellow-500/40",
    glowColor: "rgba(234,179,8,0.15)",
    category: "AI",
  },
  {
    href: "/sorting",
    label: "Sorting Visualizer",
    description: "Watch eight classic sorting algorithms race through arrays in real-time with colour-coded bars and sound.",
    Icon: BarChart3,
    color: "text-sky-500",
    bgColor: "bg-sky-500/10 dark:bg-sky-500/15",
    borderColor: "hover:border-sky-500/40",
    glowColor: "rgba(14,165,233,0.15)",
    category: "Algorithms",
  },
];

export default function Home() {
  const gridRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Track mouse position across the card grid to create a spotlight border glow.
  // Each card has a ::before pseudo-element whose radial-gradient origin is set
  // via CSS custom properties --mx and --my (mouse position relative to the card).
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const grid = gridRef.current;
      if (!grid) return;
      const cards = grid.querySelectorAll<HTMLElement>("[data-spotlight]");
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        card.style.setProperty("--my", `${e.clientY - rect.top}px`);
      });
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll<HTMLElement>("[data-spotlight]");
    cards.forEach((card) => {
      card.style.removeProperty("--mx");
      card.style.removeProperty("--my");
    });
  }, []);

  // Staggered entrance animation via IntersectionObserver
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll<HTMLElement>("[data-spotlight]");
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("home-card-visible");
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    cards.forEach((card) => {
      observerRef.current!.observe(card);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  const gridCards = cards.filter(c => c.href !== "/chat");

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="mb-12 sm:mb-16 home-hero-in">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
            Self-Modifier
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            An AI-powered playground of interactive simulations, games, and creative tools — all built and continuously refined by the AI itself.
          </p>
        </div>

        {/* Featured: Chat */}
        <Link
          href="/chat"
          className="group relative block mb-10 rounded-2xl border border-border bg-gradient-to-br from-blue-500/[0.06] via-transparent to-violet-500/[0.06] dark:from-blue-500/[0.08] dark:to-violet-500/[0.08] p-6 sm:p-8 transition-all duration-300 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/[0.06] home-featured-in"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/15">
                  <MessageSquare className="text-blue-500" size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Chat with the AI</h2>
                  <span className="text-xs font-medium text-blue-500/70 dark:text-blue-400/70 uppercase tracking-wider">Featured</span>
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed max-w-xl">
                Start a conversation with an AI that has full access to this application&apos;s source code.
                Ask it to build new features, fix bugs, or explain how anything works — and watch it modify itself in real time.
              </p>
            </div>
            <ArrowRight
              size={20}
              className="mt-2 text-muted-foreground/40 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300 flex-shrink-0"
            />
          </div>
        </Link>

        {/* Grid with mouse-tracking spotlight */}
        <div
          ref={gridRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {gridCards.map((card, i) => (
            <Link
              key={card.href}
              href={card.href}
              data-spotlight
              className={[
                "home-card group relative flex flex-col rounded-xl border border-border bg-card/50 p-5 transition-all duration-300",
                card.borderColor,
                "hover:shadow-lg hover:-translate-y-0.5",
              ].join(" ")}
              style={{
                // @ts-expect-error -- CSS custom properties for spotlight + glow
                "--card-glow": card.glowColor,
                "--spotlight-color": card.glowColor,
                "--stagger": `${i * 50}ms`,
              }}
            >
              {/* Spotlight border glow overlay */}
              <div
                className="home-card-spotlight pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300"
                style={{
                  background: `radial-gradient(320px circle at var(--mx, 50%) var(--my, 50%), var(--spotlight-color, transparent), transparent 60%)`,
                }}
                aria-hidden="true"
              />
              <div className="relative z-10 flex items-center gap-3 mb-3">
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${card.bgColor}`}>
                  <card.Icon className={card.color} size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">{card.label}</h3>
                  <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider font-medium">
                    {card.category}
                  </span>
                </div>
              </div>
              <p className="relative z-10 text-sm text-muted-foreground leading-relaxed flex-1">
                {card.description}
              </p>
              <div className="relative z-10 mt-4 flex items-center gap-1 text-xs font-medium text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                <span>Open</span>
                <ArrowRight
                  size={12}
                  className="group-hover:translate-x-0.5 transition-transform duration-200"
                />
              </div>
            </Link>
          ))}
        </div>

        {/* Footer hint */}
        <div className="mt-12 text-center home-footer-in">
          <p className="text-xs text-muted-foreground/50">
            Press{" "}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
              ⌘K
            </kbd>{" "}
            to jump anywhere
          </p>
        </div>
      </div>
    </div>
  );
}
