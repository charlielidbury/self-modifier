"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Trash2,
  RotateCcw,
  MousePointer,
} from "lucide-react";

// ─── Attractor Definitions ──────────────────────────────────────────────────

interface AttractorDef {
  name: string;
  /** Step the system forward by dt; mutate [x,y,z] in-place */
  step: (p: Float64Array, dt: number) => void;
  /** Default camera distance */
  camDist: number;
  /** Scale factor to normalize attractor into viewable range */
  scale: number;
  /** Default dt per substep */
  dt: number;
  /** Good initial point */
  seed: [number, number, number];
  /** Color hue range [start, end] in degrees */
  hueRange: [number, number];
}

const ATTRACTORS: AttractorDef[] = [
  {
    name: "Lorenz",
    step(p, dt) {
      const sigma = 10, rho = 28, beta = 8 / 3;
      const dx = sigma * (p[1] - p[0]);
      const dy = p[0] * (rho - p[2]) - p[1];
      const dz = p[0] * p[1] - beta * p[2];
      p[0] += dx * dt;
      p[1] += dy * dt;
      p[2] += dz * dt;
    },
    camDist: 60,
    scale: 1,
    dt: 0.005,
    seed: [0.1, 0, 0],
    hueRange: [200, 340],
  },
  {
    name: "Rössler",
    step(p, dt) {
      const a = 0.2, b = 0.2, c = 5.7;
      const dx = -p[1] - p[2];
      const dy = p[0] + a * p[1];
      const dz = b + p[2] * (p[0] - c);
      p[0] += dx * dt;
      p[1] += dy * dt;
      p[2] += dz * dt;
    },
    camDist: 35,
    scale: 1.2,
    dt: 0.008,
    seed: [1, 1, 1],
    hueRange: [80, 220],
  },
  {
    name: "Aizawa",
    step(p, dt) {
      const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
      const dx = (p[2] - b) * p[0] - d * p[1];
      const dy = d * p[0] + (p[2] - b) * p[1];
      const dz =
        c +
        a * p[2] -
        (p[2] * p[2] * p[2]) / 3 -
        (p[0] * p[0] + p[1] * p[1]) * (1 + e * p[2]) +
        f * p[2] * p[0] * p[0] * p[0];
      p[0] += dx * dt;
      p[1] += dy * dt;
      p[2] += dz * dt;
    },
    camDist: 6,
    scale: 1,
    dt: 0.003,
    seed: [0.1, 0, 0],
    hueRange: [260, 400],
  },
  {
    name: "Thomas",
    step(p, dt) {
      const b = 0.208186;
      const dx = Math.sin(p[1]) - b * p[0];
      const dy = Math.sin(p[2]) - b * p[1];
      const dz = Math.sin(p[0]) - b * p[2];
      p[0] += dx * dt;
      p[1] += dy * dt;
      p[2] += dz * dt;
    },
    camDist: 8,
    scale: 1,
    dt: 0.03,
    seed: [1.1, 1.1, 1.1],
    hueRange: [150, 290],
  },
  {
    name: "Halvorsen",
    step(p, dt) {
      const a = 1.89;
      const dx = -a * p[0] - 4 * p[1] - 4 * p[2] - p[1] * p[1];
      const dy = -a * p[1] - 4 * p[2] - 4 * p[0] - p[2] * p[2];
      const dz = -a * p[2] - 4 * p[0] - 4 * p[1] - p[0] * p[0];
      p[0] += dx * dt;
      p[1] += dy * dt;
      p[2] += dz * dt;
    },
    camDist: 25,
    scale: 0.8,
    dt: 0.004,
    seed: [-1.48, -1.51, 2.04],
    hueRange: [20, 160],
  },
];

// ─── Particle System ────────────────────────────────────────────────────────

const NUM_PARTICLES = 4000;
const TRAIL_LENGTH = 60;
const SUBSTEPS = 4;

// ─── Component ──────────────────────────────────────────────────────────────

export default function AttractorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const runningRef = useRef(true);
  const [running, setRunning] = useState(true);
  const [attractorIdx, setAttractorIdx] = useState(0);
  const attractorIdxRef = useRef(0);

  // Camera state
  const cameraRef = useRef({ theta: 0.3, phi: 0.8, dist: ATTRACTORS[0].camDist, autoRotate: true });
  const dragRef = useRef<{ startX: number; startY: number; startTheta: number; startPhi: number } | null>(null);

  // Particle state: each particle has a trail of 3D positions
  const particlesRef = useRef<Float64Array[]>([]);
  const trailHeadRef = useRef<number[]>([]);
  const trailLenRef = useRef<number[]>([]);
  const particleHuesRef = useRef<number[]>([]);

  const initParticles = useCallback((attIdx: number) => {
    const att = ATTRACTORS[attIdx];
    const particles: Float64Array[] = [];
    const heads: number[] = [];
    const lens: number[] = [];
    const hues: number[] = [];

    for (let i = 0; i < NUM_PARTICLES; i++) {
      const trail = new Float64Array(TRAIL_LENGTH * 3);
      // Seed with small random offset from the attractor's seed point
      const x = att.seed[0] + (Math.random() - 0.5) * 0.5;
      const y = att.seed[1] + (Math.random() - 0.5) * 0.5;
      const z = att.seed[2] + (Math.random() - 0.5) * 0.5;
      trail[0] = x;
      trail[1] = y;
      trail[2] = z;
      particles.push(trail);
      heads.push(0);
      lens.push(1);
      hues.push(att.hueRange[0] + Math.random() * (att.hueRange[1] - att.hueRange[0]));
    }

    particlesRef.current = particles;
    trailHeadRef.current = heads;
    trailLenRef.current = lens;
    particleHuesRef.current = hues;
  }, []);

  const resetAttractor = useCallback((idx: number) => {
    attractorIdxRef.current = idx;
    setAttractorIdx(idx);
    cameraRef.current.dist = ATTRACTORS[idx].camDist;
    initParticles(idx);
  }, [initParticles]);

  // Project 3D → 2D
  const project = useCallback(
    (x: number, y: number, z: number, w: number, h: number): [number, number, number] => {
      const cam = cameraRef.current;
      const cosT = Math.cos(cam.theta);
      const sinT = Math.sin(cam.theta);
      const cosP = Math.cos(cam.phi);
      const sinP = Math.sin(cam.phi);

      // Rotate around Y axis (theta) then X axis (phi)
      const x1 = x * cosT - z * sinT;
      const z1 = x * sinT + z * cosT;
      const y1 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      // Perspective projection
      const perspective = cam.dist / (cam.dist + z2);
      const sx = w / 2 + x1 * perspective * (w / cam.dist) * 8;
      const sy = h / 2 - y1 * perspective * (h / cam.dist) * 8;

      return [sx, sy, perspective];
    },
    []
  );

  // Main render + physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
    };
    resize();
    window.addEventListener("resize", resize);

    initParticles(0);

    const loop = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const att = ATTRACTORS[attractorIdxRef.current];
      const particles = particlesRef.current;
      const heads = trailHeadRef.current;
      const lens = trailLenRef.current;
      const hues = particleHuesRef.current;

      // Auto-rotate camera
      if (cameraRef.current.autoRotate && runningRef.current) {
        cameraRef.current.theta += 0.002;
      }

      // Step physics
      if (runningRef.current) {
        const tempP = new Float64Array(3);
        for (let i = 0; i < NUM_PARTICLES; i++) {
          const trail = particles[i];
          const headIdx = heads[i] * 3;
          tempP[0] = trail[headIdx];
          tempP[1] = trail[headIdx + 1];
          tempP[2] = trail[headIdx + 2];

          for (let s = 0; s < SUBSTEPS; s++) {
            att.step(tempP, att.dt);
          }

          // Check for divergence and reset particle if needed
          if (
            !isFinite(tempP[0]) ||
            !isFinite(tempP[1]) ||
            !isFinite(tempP[2]) ||
            Math.abs(tempP[0]) > 1000 ||
            Math.abs(tempP[1]) > 1000 ||
            Math.abs(tempP[2]) > 1000
          ) {
            tempP[0] = att.seed[0] + (Math.random() - 0.5) * 0.5;
            tempP[1] = att.seed[1] + (Math.random() - 0.5) * 0.5;
            tempP[2] = att.seed[2] + (Math.random() - 0.5) * 0.5;
            heads[i] = 0;
            lens[i] = 1;
            trail[0] = tempP[0];
            trail[1] = tempP[1];
            trail[2] = tempP[2];
          } else {
            const newHead = (heads[i] + 1) % TRAIL_LENGTH;
            const newIdx = newHead * 3;
            trail[newIdx] = tempP[0];
            trail[newIdx + 1] = tempP[1];
            trail[newIdx + 2] = tempP[2];
            heads[i] = newHead;
            if (lens[i] < TRAIL_LENGTH) lens[i]++;
          }
        }
      }

      // Clear with fade for trail effect
      const isDark =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");
      ctx.fillStyle = isDark ? "rgba(10, 10, 10, 0.15)" : "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(0, 0, w, h);

      // Render particle trails
      const scale = att.scale;
      for (let i = 0; i < NUM_PARTICLES; i++) {
        const trail = particles[i];
        const head = heads[i];
        const len = lens[i];
        const hue = hues[i] % 360;

        if (len < 2) continue;

        ctx.beginPath();
        let started = false;

        for (let j = 0; j < len; j++) {
          const idx = ((head - j + TRAIL_LENGTH) % TRAIL_LENGTH) * 3;
          const [sx, sy] = project(
            trail[idx] * scale,
            trail[idx + 1] * scale,
            trail[idx + 2] * scale,
            w,
            h
          );

          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }

        const alpha = 0.4;
        ctx.strokeStyle = `hsla(${hue}, 85%, 60%, ${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Draw bright head
        const headIdx = head * 3;
        const [hx, hy] = project(
          trail[headIdx] * scale,
          trail[headIdx + 1] * scale,
          trail[headIdx + 2] * scale,
          w,
          h
        );
        ctx.beginPath();
        ctx.arc(hx, hy, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 90%, 75%, 0.8)`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [initParticles, project]);

  // Mouse drag for camera rotation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTheta: cameraRef.current.theta,
      startPhi: cameraRef.current.phi,
    };
    cameraRef.current.autoRotate = false;
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      cameraRef.current.theta = dragRef.current.startTheta + dx * 0.005;
      cameraRef.current.phi = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, dragRef.current.startPhi + dy * 0.005)
      );
    };
    const handleMouseUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Scroll to zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraRef.current.dist = Math.max(
        5,
        Math.min(200, cameraRef.current.dist + e.deltaY * 0.05)
      );
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setRunning((r) => {
          runningRef.current = !r;
          return !r;
        });
      } else if (e.key === "r" || e.key === "R") {
        cameraRef.current.autoRotate = true;
        resetAttractor(attractorIdxRef.current);
      } else if (e.key === "n" || e.key === "N") {
        const next = (attractorIdxRef.current + 1) % ATTRACTORS.length;
        resetAttractor(next);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [resetAttractor]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      />

      {/* Controls overlay */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setRunning((r) => {
                runningRef.current = !r;
                return !r;
              });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title={running ? "Pause (Space)" : "Play (Space)"}
          >
            {running ? <Pause size={13} /> : <Play size={13} />}
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => {
              cameraRef.current.autoRotate = true;
              resetAttractor(attractorIdxRef.current);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title="Reset (R)"
          >
            <Trash2 size={13} />
            Reset
          </button>
          <button
            onClick={() => {
              const next = (attractorIdxRef.current + 1) % ATTRACTORS.length;
              resetAttractor(next);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title="Next attractor (N)"
          >
            <RotateCcw size={13} />
            {ATTRACTORS[attractorIdx].name}
          </button>
        </div>

        {/* Attractor picker */}
        <div className="flex items-center gap-1">
          {ATTRACTORS.map((att, i) => (
            <button
              key={att.name}
              onClick={() => resetAttractor(i)}
              className={[
                "px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                i === attractorIdx
                  ? "bg-white/20 text-white backdrop-blur-md"
                  : "bg-neutral-900/40 text-white/50 hover:text-white/80 hover:bg-neutral-900/60 backdrop-blur-md",
              ].join(" ")}
            >
              {att.name}
            </button>
          ))}
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-4 right-4 z-10 text-right">
        <div className="px-3 py-2 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-mono">
          <div className="flex items-center gap-2 justify-end">
            <span className="text-white/50">particles</span>
            <span className="font-bold tabular-nums">{NUM_PARTICLES.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 justify-end mt-0.5">
            <span className="text-white/50">trail</span>
            <span className="font-bold tabular-nums">{TRAIL_LENGTH}</span>
          </div>
        </div>
      </div>

      {/* Help overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="text-center space-y-2 opacity-60 hover:opacity-100 transition-opacity">
          <div className="flex items-center justify-center gap-2 text-white/50">
            <MousePointer size={14} />
            <span className="text-xs font-medium">Drag to rotate · Scroll to zoom</span>
          </div>
          <p className="text-[10px] text-white/30">
            <kbd className="rounded border border-white/20 px-1 py-0.5 font-mono text-[9px]">Space</kbd> pause
            {" · "}
            <kbd className="rounded border border-white/20 px-1 py-0.5 font-mono text-[9px]">N</kbd> next
            {" · "}
            <kbd className="rounded border border-white/20 px-1 py-0.5 font-mono text-[9px]">R</kbd> reset
          </p>
        </div>
      </div>
    </div>
  );
}
