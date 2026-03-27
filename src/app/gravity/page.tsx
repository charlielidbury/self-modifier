"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Trash2,
  MousePointer,
  Orbit,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  color: string;
  trail: { x: number; y: number }[];
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const G = 800; // gravitational constant (tuned for visual appeal)
const TRAIL_LENGTH = 120;
const SOFTENING = 12; // prevents singularities when bodies get very close
const DT = 0.016; // timestep
const MERGE_ENABLED = true;
const MIN_MASS = 40;
const MAX_MASS = 600;

const BODY_COLORS = [
  "#f97316", // orange
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // yellow
  "#ef4444", // red
  "#22c55e", // green
  "#06b6d4", // cyan
  "#f43e5e", // rose
];

// ─── Presets ────────────────────────────────────────────────────────────────

function makeBinaryStars(cx: number, cy: number): Body[] {
  const sep = 100;
  const speed = 2.2;
  return [
    createBody(cx - sep, cy, 0, -speed, 300, "#f97316"),
    createBody(cx + sep, cy, 0, speed, 300, "#3b82f6"),
  ];
}

function makeSolarSystem(cx: number, cy: number): Body[] {
  const sun = createBody(cx, cy, 0, 0, 600, "#eab308");
  const planets: Body[] = [];
  const orbits = [
    { r: 120, mass: 40, color: "#a855f7" },
    { r: 180, mass: 55, color: "#3b82f6" },
    { r: 260, mass: 70, color: "#14b8a6" },
    { r: 350, mass: 50, color: "#ec4899" },
  ];
  for (const o of orbits) {
    const angle = Math.random() * Math.PI * 2;
    const x = cx + Math.cos(angle) * o.r;
    const y = cy + Math.sin(angle) * o.r;
    // Circular orbit velocity: v = sqrt(G * M / r)
    const v = Math.sqrt((G * sun.mass) / o.r);
    const vx = -Math.sin(angle) * v;
    const vy = Math.cos(angle) * v;
    planets.push(createBody(x, y, vx, vy, o.mass, o.color));
  }
  return [sun, ...planets];
}

function makeFigureEight(cx: number, cy: number): Body[] {
  // Approximate figure-8 three-body choreography (Chenciner & Montgomery)
  const m = 200;
  const scale = 120;
  const vScale = 3.2;
  return [
    createBody(cx - scale, cy, 0.347111 * vScale, 0.532728 * vScale, m, "#f97316"),
    createBody(cx + scale, cy, 0.347111 * vScale, 0.532728 * vScale, m, "#3b82f6"),
    createBody(cx, cy, -0.694222 * vScale, -1.065456 * vScale, m, "#a855f7"),
  ];
}

function makeRandomCluster(cx: number, cy: number, count: number): Body[] {
  const bodies: Body[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 200;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const mass = MIN_MASS + Math.random() * 120;
    // Give each body a slight tangential velocity for interesting dynamics
    const speed = 1 + Math.random() * 2;
    const vx = -Math.sin(angle) * speed;
    const vy = Math.cos(angle) * speed;
    bodies.push(
      createBody(x, y, vx, vy, mass, BODY_COLORS[i % BODY_COLORS.length])
    );
  }
  return bodies;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createBody(
  x: number,
  y: number,
  vx: number,
  vy: number,
  mass: number,
  color: string
): Body {
  return {
    x,
    y,
    vx,
    vy,
    mass,
    radius: massToRadius(mass),
    color,
    trail: [],
  };
}

function massToRadius(mass: number): number {
  return 3 + Math.sqrt(mass) * 0.4;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ─── Physics ────────────────────────────────────────────────────────────────

function simulate(bodies: Body[]): Body[] {
  const n = bodies.length;
  if (n === 0) return bodies;

  // Compute accelerations
  const ax = new Float64Array(n);
  const ay = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const distSq = dx * dx + dy * dy + SOFTENING * SOFTENING;
      const dist = Math.sqrt(distSq);
      const force = G / (distSq * dist);

      const fxj = dx * force;
      const fyj = dy * force;

      ax[i] += fxj * bodies[j].mass;
      ay[i] += fyj * bodies[j].mass;
      ax[j] -= fxj * bodies[i].mass;
      ay[j] -= fyj * bodies[i].mass;
    }
  }

  // Update velocities and positions
  let updated = bodies.map((b, i) => ({
    ...b,
    vx: b.vx + ax[i] * DT,
    vy: b.vy + ay[i] * DT,
    x: b.x + (b.vx + ax[i] * DT) * DT,
    y: b.y + (b.vy + ay[i] * DT) * DT,
    trail: [...b.trail, { x: b.x, y: b.y }].slice(-TRAIL_LENGTH),
  }));

  // Merge colliding bodies
  if (MERGE_ENABLED) {
    const alive = new Array(updated.length).fill(true);
    for (let i = 0; i < updated.length; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < updated.length; j++) {
        if (!alive[j]) continue;
        const dx = updated[j].x - updated[i].x;
        const dy = updated[j].y - updated[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < updated[i].radius + updated[j].radius) {
          // Merge j into i (conservation of momentum)
          const totalMass = updated[i].mass + updated[j].mass;
          updated[i] = {
            ...updated[i],
            vx:
              (updated[i].vx * updated[i].mass +
                updated[j].vx * updated[j].mass) /
              totalMass,
            vy:
              (updated[i].vy * updated[i].mass +
                updated[j].vy * updated[j].mass) /
              totalMass,
            x:
              (updated[i].x * updated[i].mass +
                updated[j].x * updated[j].mass) /
              totalMass,
            y:
              (updated[i].y * updated[i].mass +
                updated[j].y * updated[j].mass) /
              totalMass,
            mass: totalMass,
            radius: massToRadius(totalMass),
            // Keep the more massive body's color & trail
            color:
              updated[i].mass >= updated[j].mass
                ? updated[i].color
                : updated[j].color,
          };
          alive[j] = false;
        }
      }
    }
    updated = updated.filter((_, i) => alive[i]);
  }

  return updated;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function render(
  ctx: CanvasRenderingContext2D,
  bodies: Body[],
  w: number,
  h: number,
  drag: DragState | null,
  isDark: boolean
) {
  // Clear with slight transparency for afterimage effect
  ctx.fillStyle = isDark ? "rgba(10, 10, 10, 0.15)" : "rgba(255, 255, 255, 0.15)";
  ctx.fillRect(0, 0, w, h);

  // Draw trails
  for (const body of bodies) {
    if (body.trail.length < 2) continue;
    const [r, g, b] = hexToRgb(body.color);
    ctx.lineWidth = Math.max(1, body.radius * 0.35);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < body.trail.length; i++) {
      const alpha = (i / body.trail.length) * 0.5;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(body.trail[i - 1].x, body.trail[i - 1].y);
      ctx.lineTo(body.trail[i].x, body.trail[i].y);
      ctx.stroke();
    }
  }

  // Draw bodies
  for (const body of bodies) {
    const [r, g, b] = hexToRgb(body.color);

    // Outer glow
    const gradient = ctx.createRadialGradient(
      body.x,
      body.y,
      0,
      body.x,
      body.y,
      body.radius * 4
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.1)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.radius * 4, 0, Math.PI * 2);
    ctx.fill();

    // Core body
    const coreGrad = ctx.createRadialGradient(
      body.x - body.radius * 0.3,
      body.y - body.radius * 0.3,
      0,
      body.x,
      body.y,
      body.radius
    );
    coreGrad.addColorStop(0, `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, 1)`);
    coreGrad.addColorStop(1, body.color);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw drag velocity arrow
  if (drag) {
    const dx = drag.currentX - drag.startX;
    const dy = drag.currentY - drag.startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 5) {
      ctx.strokeStyle = isDark
        ? "rgba(255, 255, 255, 0.5)"
        : "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(drag.startX, drag.startY);
      ctx.lineTo(drag.currentX, drag.currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead
      const angle = Math.atan2(dy, dx);
      const headLen = 10;
      ctx.fillStyle = isDark
        ? "rgba(255, 255, 255, 0.5)"
        : "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.moveTo(drag.currentX, drag.currentY);
      ctx.lineTo(
        drag.currentX - headLen * Math.cos(angle - 0.4),
        drag.currentY - headLen * Math.sin(angle - 0.4)
      );
      ctx.lineTo(
        drag.currentX - headLen * Math.cos(angle + 0.4),
        drag.currentY - headLen * Math.sin(angle + 0.4)
      );
      ctx.closePath();
      ctx.fill();

      // Preview body at spawn point
      ctx.strokeStyle = isDark
        ? "rgba(255, 255, 255, 0.3)"
        : "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(drag.startX, drag.startY, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ─── Presets UI ─────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  icon: string;
  make: (cx: number, cy: number) => Body[];
}

const PRESETS: Preset[] = [
  { name: "Binary Stars", icon: "◎", make: makeBinaryStars },
  { name: "Solar System", icon: "☀", make: makeSolarSystem },
  { name: "Figure-8", icon: "∞", make: makeFigureEight },
  {
    name: "Cluster (8)",
    icon: "✦",
    make: (cx, cy) => makeRandomCluster(cx, cy, 8),
  },
  {
    name: "Cluster (16)",
    icon: "❋",
    make: (cx, cy) => makeRandomCluster(cx, cy, 16),
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function GravityPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodiesRef = useRef<Body[]>([]);
  const [bodyCount, setBodyCount] = useState(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  const dragRef = useRef<DragState | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const animFrameRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDark = useCallback(() => {
    return document.documentElement.classList.contains("dark");
  }, []);

  // Resize canvas to fill container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // Animation loop
  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      if (runningRef.current) {
        bodiesRef.current = simulate(bodiesRef.current);
        setBodyCount(bodiesRef.current.length);
      }

      render(ctx, bodiesRef.current, w, h, dragRef.current, isDark());
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas, isDark]);

  // Mouse handlers for spawning bodies
  const getCanvasPos = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const pos = getCanvasPos(e);
      dragRef.current = {
        startX: pos.x,
        startY: pos.y,
        currentX: pos.x,
        currentY: pos.y,
      };
    },
    [getCanvasPos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current) return;
      const pos = getCanvasPos(e);
      dragRef.current = { ...dragRef.current, currentX: pos.x, currentY: pos.y };
    },
    [getCanvasPos]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!dragRef.current) return;
      const drag = dragRef.current;
      dragRef.current = null;

      const dx = drag.currentX - drag.startX;
      const dy = drag.currentY - drag.startY;
      // Velocity is proportional to drag distance, scaled down
      const velScale = 0.08;
      const vx = dx * velScale;
      const vy = dy * velScale;

      const mass = MIN_MASS + Math.random() * (MAX_MASS - MIN_MASS) * 0.5;
      const colorIdx = bodiesRef.current.length % BODY_COLORS.length;
      const body = createBody(
        drag.startX,
        drag.startY,
        vx,
        vy,
        mass,
        BODY_COLORS[colorIdx]
      );
      bodiesRef.current = [...bodiesRef.current, body];
      setBodyCount(bodiesRef.current.length);
    },
    []
  );

  const handleClear = useCallback(() => {
    bodiesRef.current = [];
    setBodyCount(0);
    // Full clear of the canvas to remove trails
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        ctx.fillStyle = isDark() ? "#0a0a0a" : "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
    }
  }, [isDark]);

  const handleToggleRunning = useCallback(() => {
    setRunning((r) => {
      runningRef.current = !r;
      return !r;
    });
  }, []);

  const loadPreset = useCallback(
    (preset: Preset) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      // Clear canvas
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = isDark() ? "#0a0a0a" : "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }

      bodiesRef.current = preset.make(w / 2, h / 2);
      setBodyCount(bodiesRef.current.length);
      setShowPresets(false);
      if (!runningRef.current) {
        setRunning(true);
        runningRef.current = true;
      }
    },
    [isDark]
  );

  // Keyboard shortcut: Space to pause/resume
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleToggleRunning();
      } else if (e.key === "c" || e.key === "C") {
        handleClear();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleToggleRunning, handleClear]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          dragRef.current = null;
        }}
      />

      {/* Controls overlay */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title={running ? "Pause (Space)" : "Play (Space)"}
          >
            {running ? <Pause size={13} /> : <Play size={13} />}
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title="Clear all (C)"
          >
            <Trash2 size={13} />
            Clear
          </button>
          <div className="relative">
            <button
              onClick={() => setShowPresets((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            >
              <Orbit size={13} />
              Presets
            </button>
            {showPresets && (
              <div className="absolute top-full left-0 mt-1 w-44 rounded-lg bg-neutral-900/90 dark:bg-neutral-800/90 backdrop-blur-md border border-white/10 overflow-hidden shadow-xl">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => loadPreset(preset)}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <span className="text-sm">{preset.icon}</span>
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-4 right-4 z-10 text-right">
        <div className="px-3 py-2 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-mono">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-white/50">bodies</span>
            <span className="font-bold tabular-nums">{bodyCount}</span>
          </div>
        </div>
      </div>

      {/* Help overlay — shown when no bodies exist */}
      {bodyCount === 0 && !dragRef.current && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center space-y-3 page-transition">
            <div className="flex items-center justify-center gap-2 text-foreground/40">
              <MousePointer size={20} />
              <span className="text-sm font-medium">Click & drag to spawn bodies</span>
            </div>
            <p className="text-xs text-foreground/25">
              Drag direction sets initial velocity · Bodies merge on collision
            </p>
            <p className="text-xs text-foreground/20">
              <kbd className="rounded border border-foreground/10 px-1.5 py-0.5 font-mono text-[10px]">Space</kbd> pause
              {" · "}
              <kbd className="rounded border border-foreground/10 px-1.5 py-0.5 font-mono text-[10px]">C</kbd> clear
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
