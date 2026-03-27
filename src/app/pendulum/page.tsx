"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Trash2,
  Plus,
  Minus,
  RotateCcw,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendulumState {
  θ1: number;
  θ2: number;
  ω1: number;
  ω2: number;
  l1: number;
  l2: number;
  m1: number;
  m2: number;
  color: string;
  trail: { x: number; y: number }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const G_ACCEL = 9.81;
const DT = 0.01;
const STEPS_PER_FRAME = 4; // sub-steps per animation frame for accuracy
const TRAIL_LENGTH = 800;
const SCALE = 100; // pixels per unit length

const PENDULUM_COLORS = [
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

// ─── Physics: Lagrangian double pendulum ────────────────────────────────────
// Equations of motion derived from the Lagrangian of a double pendulum system.
// Uses 4th-order Runge-Kutta integration for numerical stability.

interface Derivatives {
  dθ1: number;
  dθ2: number;
  dω1: number;
  dω2: number;
}

function computeDerivatives(
  θ1: number,
  θ2: number,
  ω1: number,
  ω2: number,
  l1: number,
  l2: number,
  m1: number,
  m2: number,
  g: number
): Derivatives {
  const Δθ = θ1 - θ2;
  const sinΔ = Math.sin(Δθ);
  const cosΔ = Math.cos(Δθ);

  const denom1 = (2 * m1 + m2 - m2 * Math.cos(2 * Δθ)) * l1;
  const denom2 = (2 * m1 + m2 - m2 * Math.cos(2 * Δθ)) * l2;

  const dω1 =
    (-g * (2 * m1 + m2) * Math.sin(θ1) -
      m2 * g * Math.sin(θ1 - 2 * θ2) -
      2 * sinΔ * m2 * (ω2 * ω2 * l2 + ω1 * ω1 * l1 * cosΔ)) /
    denom1;

  const dω2 =
    (2 *
      sinΔ *
      (ω1 * ω1 * l1 * (m1 + m2) +
        g * (m1 + m2) * Math.cos(θ1) +
        ω2 * ω2 * l2 * m2 * cosΔ)) /
    denom2;

  return { dθ1: ω1, dθ2: ω2, dω1, dω2 };
}

function rk4Step(state: PendulumState, dt: number, g: number): PendulumState {
  const { θ1, θ2, ω1, ω2, l1, l2, m1, m2 } = state;

  const k1 = computeDerivatives(θ1, θ2, ω1, ω2, l1, l2, m1, m2, g);

  const k2 = computeDerivatives(
    θ1 + (k1.dθ1 * dt) / 2,
    θ2 + (k1.dθ2 * dt) / 2,
    ω1 + (k1.dω1 * dt) / 2,
    ω2 + (k1.dω2 * dt) / 2,
    l1, l2, m1, m2, g
  );

  const k3 = computeDerivatives(
    θ1 + (k2.dθ1 * dt) / 2,
    θ2 + (k2.dθ2 * dt) / 2,
    ω1 + (k2.dω1 * dt) / 2,
    ω2 + (k2.dω2 * dt) / 2,
    l1, l2, m1, m2, g
  );

  const k4 = computeDerivatives(
    θ1 + k3.dθ1 * dt,
    θ2 + k3.dθ2 * dt,
    ω1 + k3.dω1 * dt,
    ω2 + k3.dω2 * dt,
    l1, l2, m1, m2, g
  );

  return {
    ...state,
    θ1: θ1 + (dt / 6) * (k1.dθ1 + 2 * k2.dθ1 + 2 * k3.dθ1 + k4.dθ1),
    θ2: θ2 + (dt / 6) * (k1.dθ2 + 2 * k2.dθ2 + 2 * k3.dθ2 + k4.dθ2),
    ω1: ω1 + (dt / 6) * (k1.dω1 + 2 * k2.dω1 + 2 * k3.dω1 + k4.dω1),
    ω2: ω2 + (dt / 6) * (k1.dω2 + 2 * k2.dω2 + 2 * k3.dω2 + k4.dω2),
  };
}

// ─── Pendulum position helpers ──────────────────────────────────────────────

function getPositions(
  p: PendulumState,
  pivotX: number,
  pivotY: number,
  scale: number
) {
  const x1 = pivotX + p.l1 * scale * Math.sin(p.θ1);
  const y1 = pivotY + p.l1 * scale * Math.cos(p.θ1);
  const x2 = x1 + p.l2 * scale * Math.sin(p.θ2);
  const y2 = y1 + p.l2 * scale * Math.cos(p.θ2);
  return { x1, y1, x2, y2 };
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ─── Presets ────────────────────────────────────────────────────────────────

function makeChaosButterly(): PendulumState[] {
  // Several pendulums with TINY angle differences to show chaos
  const base = Math.PI * 0.75;
  return Array.from({ length: 6 }, (_, i) => ({
    θ1: base + i * 0.001,
    θ2: base,
    ω1: 0,
    ω2: 0,
    l1: 1.0,
    l2: 1.0,
    m1: 1.0,
    m2: 1.0,
    color: PENDULUM_COLORS[i % PENDULUM_COLORS.length],
    trail: [],
  }));
}

function makeSingleHigh(): PendulumState[] {
  return [
    {
      θ1: Math.PI * 0.99,
      θ2: Math.PI * 0.99,
      ω1: 0,
      ω2: 0,
      l1: 1.0,
      l2: 1.0,
      m1: 1.0,
      m2: 1.0,
      color: PENDULUM_COLORS[0],
      trail: [],
    },
  ];
}

function makeAsymmetric(): PendulumState[] {
  return [
    {
      θ1: Math.PI / 2,
      θ2: Math.PI,
      ω1: 0,
      ω2: 0,
      l1: 1.5,
      l2: 0.8,
      m1: 2.0,
      m2: 1.0,
      color: "#3b82f6",
      trail: [],
    },
    {
      θ1: Math.PI / 2,
      θ2: Math.PI,
      ω1: 0,
      ω2: 0,
      l1: 0.8,
      l2: 1.5,
      m1: 1.0,
      m2: 2.0,
      color: "#f97316",
      trail: [],
    },
  ];
}

function makeSymmetricDuo(): PendulumState[] {
  return [
    {
      θ1: Math.PI / 3,
      θ2: -Math.PI / 3,
      ω1: 0,
      ω2: 0,
      l1: 1.0,
      l2: 1.0,
      m1: 1.0,
      m2: 1.0,
      color: "#a855f7",
      trail: [],
    },
    {
      θ1: -Math.PI / 3,
      θ2: Math.PI / 3,
      ω1: 0,
      ω2: 0,
      l1: 1.0,
      l2: 1.0,
      m1: 1.0,
      m2: 1.0,
      color: "#14b8a6",
      trail: [],
    },
  ];
}

function makeSpinner(): PendulumState[] {
  return [
    {
      θ1: 0.1,
      θ2: Math.PI,
      ω1: 8,
      ω2: -4,
      l1: 1.0,
      l2: 1.0,
      m1: 1.0,
      m2: 1.0,
      color: "#ec4899",
      trail: [],
    },
  ];
}

interface Preset {
  name: string;
  icon: string;
  make: () => PendulumState[];
}

const PRESETS: Preset[] = [
  { name: "Butterfly Effect", icon: "🦋", make: makeChaosButterly },
  { name: "High Energy", icon: "⚡", make: makeSingleHigh },
  { name: "Asymmetric Pair", icon: "⚖", make: makeAsymmetric },
  { name: "Mirror Duo", icon: "🪞", make: makeSymmetricDuo },
  { name: "Spinner", icon: "🌀", make: makeSpinner },
];

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderScene(
  ctx: CanvasRenderingContext2D,
  pendulums: PendulumState[],
  w: number,
  h: number,
  pivotX: number,
  pivotY: number,
  scale: number,
  isDark: boolean,
  showTrails: boolean,
  trailOpacity: number,
) {
  // Clear
  ctx.fillStyle = isDark ? "#0a0a0a" : "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Draw a subtle grid
  ctx.save();
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = pivotX % gridSize; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = pivotY % gridSize; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // Draw pivot point
  ctx.fillStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2);
  ctx.fill();

  // Draw trails
  if (showTrails) {
    for (const p of pendulums) {
      if (p.trail.length < 2) continue;
      const [r, g, b] = hexToRgb(p.color);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * trailOpacity;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke();
      }
    }
  }

  // Draw pendulum arms and bobs
  for (const p of pendulums) {
    const { x1, y1, x2, y2 } = getPositions(p, pivotX, pivotY, scale);
    const [r, g, b] = hexToRgb(p.color);

    // Arms
    ctx.strokeStyle = isDark
      ? `rgba(255, 255, 255, 0.25)`
      : `rgba(0, 0, 0, 0.2)`;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Bob 1 (joint) - glow
    const glow1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, 20);
    glow1.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.15)`);
    glow1.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = glow1;
    ctx.beginPath();
    ctx.arc(x1, y1, 20, 0, Math.PI * 2);
    ctx.fill();

    // Bob 1 core
    const bobRadius1 = 4 + p.m1 * 2;
    const grad1 = ctx.createRadialGradient(
      x1 - bobRadius1 * 0.3,
      y1 - bobRadius1 * 0.3,
      0,
      x1,
      y1,
      bobRadius1
    );
    grad1.addColorStop(0, `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, 0.9)`);
    grad1.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.7)`);
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.arc(x1, y1, bobRadius1, 0, Math.PI * 2);
    ctx.fill();

    // Bob 2 (tip) - glow
    const glow2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, 30);
    glow2.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`);
    glow2.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.arc(x2, y2, 30, 0, Math.PI * 2);
    ctx.fill();

    // Bob 2 core
    const bobRadius2 = 5 + p.m2 * 2.5;
    const grad2 = ctx.createRadialGradient(
      x2 - bobRadius2 * 0.3,
      y2 - bobRadius2 * 0.3,
      0,
      x2,
      y2,
      bobRadius2
    );
    grad2.addColorStop(0, `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, 1)`);
    grad2.addColorStop(1, p.color);
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(x2, y2, bobRadius2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PendulumPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendulumRef = useRef<PendulumState[]>([]);
  const [pendulumCount, setPendulumCount] = useState(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  const [showTrails, setShowTrails] = useState(true);
  const showTrailsRef = useRef(true);
  const [trailOpacity, setTrailOpacity] = useState(0.6);
  const trailOpacityRef = useRef(0.6);
  const [gravity, setGravity] = useState(G_ACCEL);
  const gravityRef = useRef(G_ACCEL);
  const [showPresets, setShowPresets] = useState(false);
  const [timeScale, setTimeScale] = useState(1.0);
  const timeScaleRef = useRef(1.0);
  const animFrameRef = useRef<number>(0);

  const isDark = useCallback(() => {
    return document.documentElement.classList.contains("dark");
  }, []);

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

  // Load default preset
  useEffect(() => {
    pendulumRef.current = makeChaosButterly();
    setPendulumCount(pendulumRef.current.length);
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
      const pivotX = w / 2;
      const pivotY = h * 0.35;

      if (runningRef.current) {
        const scaledDt = DT * timeScaleRef.current;
        for (let step = 0; step < STEPS_PER_FRAME; step++) {
          pendulumRef.current = pendulumRef.current.map((p) => {
            const updated = rk4Step(p, scaledDt, gravityRef.current);
            const { x2, y2 } = getPositions(
              updated,
              pivotX,
              pivotY,
              SCALE
            );
            return {
              ...updated,
              trail: [...p.trail, { x: x2, y: y2 }].slice(-TRAIL_LENGTH),
            };
          });
        }
        setPendulumCount(pendulumRef.current.length);
      }

      renderScene(
        ctx,
        pendulumRef.current,
        w,
        h,
        pivotX,
        pivotY,
        SCALE,
        isDark(),
        showTrailsRef.current,
        trailOpacityRef.current,
      );
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas, isDark]);

  const handleToggleRunning = useCallback(() => {
    setRunning((r) => {
      runningRef.current = !r;
      return !r;
    });
  }, []);

  const handleClear = useCallback(() => {
    pendulumRef.current = [];
    setPendulumCount(0);
  }, []);

  const handleReset = useCallback(() => {
    pendulumRef.current = makeChaosButterly();
    setPendulumCount(pendulumRef.current.length);
  }, []);

  const loadPreset = useCallback((preset: Preset) => {
    pendulumRef.current = preset.make();
    setPendulumCount(pendulumRef.current.length);
    setShowPresets(false);
    if (!runningRef.current) {
      setRunning(true);
      runningRef.current = true;
    }
  }, []);

  const handleToggleTrails = useCallback(() => {
    setShowTrails((t) => {
      showTrailsRef.current = !t;
      return !t;
    });
  }, []);

  const handleGravityChange = useCallback((val: number) => {
    setGravity(val);
    gravityRef.current = val;
  }, []);

  const handleTimeScaleChange = useCallback((val: number) => {
    setTimeScale(val);
    timeScaleRef.current = val;
  }, []);

  const handleTrailOpacityChange = useCallback((val: number) => {
    setTrailOpacity(val);
    trailOpacityRef.current = val;
  }, []);

  const addPendulum = useCallback(() => {
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const newP: PendulumState = {
      θ1: angle,
      θ2: angle + (Math.random() - 0.5) * 0.3,
      ω1: 0,
      ω2: 0,
      l1: 0.8 + Math.random() * 0.4,
      l2: 0.8 + Math.random() * 0.4,
      m1: 0.8 + Math.random() * 0.4,
      m2: 0.8 + Math.random() * 0.4,
      color: PENDULUM_COLORS[pendulumRef.current.length % PENDULUM_COLORS.length],
      trail: [],
    };
    pendulumRef.current = [...pendulumRef.current, newP];
    setPendulumCount(pendulumRef.current.length);
  }, []);

  const removePendulum = useCallback(() => {
    if (pendulumRef.current.length > 0) {
      pendulumRef.current = pendulumRef.current.slice(0, -1);
      setPendulumCount(pendulumRef.current.length);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        handleToggleRunning();
      } else if (e.key === "c" || e.key === "C") {
        handleClear();
      } else if (e.key === "r" || e.key === "R") {
        handleReset();
      } else if (e.key === "t" && !e.altKey) {
        handleToggleTrails();
      } else if (e.key === "=" || e.key === "+") {
        addPendulum();
      } else if (e.key === "-" || e.key === "_") {
        removePendulum();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleToggleRunning, handleClear, handleReset, handleToggleTrails, addPendulum, removePendulum]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
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
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title="Reset (R)"
          >
            <RotateCcw size={13} />
            Reset
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
              🦋 Presets
            </button>
            {showPresets && (
              <div className="absolute top-full left-0 mt-1 w-48 rounded-lg bg-neutral-900/90 dark:bg-neutral-800/90 backdrop-blur-md border border-white/10 overflow-hidden shadow-xl">
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

        {/* Add/remove pendulums */}
        <div className="flex items-center gap-2">
          <button
            onClick={addPendulum}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title="Add pendulum (+)"
          >
            <Plus size={13} />
            Add
          </button>
          <button
            onClick={removePendulum}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors disabled:opacity-40"
            title="Remove pendulum (-)"
            disabled={pendulumCount === 0}
          >
            <Minus size={13} />
            Remove
          </button>
          <button
            onClick={handleToggleTrails}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg backdrop-blur-md text-xs font-medium transition-colors",
              showTrails
                ? "bg-indigo-600/80 text-white hover:bg-indigo-500/80"
                : "bg-neutral-900/70 dark:bg-neutral-100/10 text-white hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20",
            ].join(" ")}
            title="Toggle trails (T)"
          >
            Trails {showTrails ? "On" : "Off"}
          </button>
        </div>

        {/* Sliders */}
        <div className="flex flex-col gap-1.5 px-3 py-2 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md max-w-[220px]">
          <label className="flex items-center justify-between text-[10px] text-white/70 font-medium">
            <span>Gravity</span>
            <span className="tabular-nums">{gravity.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="30"
            step="0.1"
            value={gravity}
            onChange={(e) => handleGravityChange(parseFloat(e.target.value))}
            className="w-full h-1 accent-indigo-500 cursor-pointer"
          />
          <label className="flex items-center justify-between text-[10px] text-white/70 font-medium mt-1">
            <span>Speed</span>
            <span className="tabular-nums">{timeScale.toFixed(1)}×</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={timeScale}
            onChange={(e) => handleTimeScaleChange(parseFloat(e.target.value))}
            className="w-full h-1 accent-indigo-500 cursor-pointer"
          />
          {showTrails && (
            <>
              <label className="flex items-center justify-between text-[10px] text-white/70 font-medium mt-1">
                <span>Trail opacity</span>
                <span className="tabular-nums">{Math.round(trailOpacity * 100)}%</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={trailOpacity}
                onChange={(e) => handleTrailOpacityChange(parseFloat(e.target.value))}
                className="w-full h-1 accent-indigo-500 cursor-pointer"
              />
            </>
          )}
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-4 right-4 z-10 text-right">
        <div className="px-3 py-2 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-mono">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-white/50">pendulums</span>
            <span className="font-bold tabular-nums">{pendulumCount}</span>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {pendulumCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center space-y-3 page-transition">
            <div className="flex items-center justify-center gap-2 text-foreground/40">
              <span className="text-2xl">🦋</span>
              <span className="text-sm font-medium">No pendulums</span>
            </div>
            <p className="text-xs text-foreground/25">
              Press <kbd className="rounded border border-foreground/10 px-1.5 py-0.5 font-mono text-[10px]">+</kbd> to add
              {" · "}
              <kbd className="rounded border border-foreground/10 px-1.5 py-0.5 font-mono text-[10px]">R</kbd> to reset
            </p>
            <p className="text-xs text-foreground/20">
              Or choose a preset from the menu above
            </p>
          </div>
        </div>
      )}

      {/* Info blurb bottom-left */}
      <div className="absolute bottom-4 left-4 z-10 max-w-xs">
        <div className="px-3 py-2 rounded-lg bg-neutral-900/60 dark:bg-neutral-100/5 backdrop-blur-md text-white/40 text-[10px] leading-relaxed">
          <strong className="text-white/60">Double Pendulum</strong> — A chaotic
          system where tiny differences in initial conditions lead to wildly
          different trajectories. Try the Butterfly Effect preset to see chaos
          emerge from near-identical starting angles.
        </div>
      </div>

      {/* Keyboard hints bottom-right */}
      <div className="absolute bottom-4 right-4 z-10">
        <div className="px-3 py-2 rounded-lg bg-neutral-900/60 dark:bg-neutral-100/5 backdrop-blur-md text-white/30 text-[10px] font-mono space-y-0.5">
          <div><kbd className="text-white/50">Space</kbd> pause</div>
          <div><kbd className="text-white/50">R</kbd> reset</div>
          <div><kbd className="text-white/50">C</kbd> clear</div>
          <div><kbd className="text-white/50">T</kbd> trails</div>
          <div><kbd className="text-white/50">+/-</kbd> add/remove</div>
        </div>
      </div>
    </div>
  );
}
