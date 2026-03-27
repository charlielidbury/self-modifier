"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Paintbrush,
  Pipette,
  Sliders,
} from "lucide-react";

// ─── Gray-Scott Reaction-Diffusion Model ─────────────────────────────────────
// Two chemicals U and V interact:
//   dU/dt = Du * ∇²U - U*V² + F*(1-U)
//   dV/dt = Dv * ∇²V + U*V² - (F+k)*V
// Different (F, k) parameters produce wildly different Turing patterns.

const RESOLUTION = 2; // pixels per simulation cell
const Du = 0.2097; // diffusion rate of U
const Dv = 0.105; // diffusion rate of V
const STEPS_PER_FRAME = 8; // simulation steps per animation frame

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  description: string;
  F: number;
  k: number;
}

const PRESETS: Preset[] = [
  { name: "Mitosis", description: "Cells that divide endlessly", F: 0.0367, k: 0.0649 },
  { name: "Coral", description: "Branching coral-like growth", F: 0.0545, k: 0.062 },
  { name: "Spots", description: "Stable round solitons", F: 0.035, k: 0.065 },
  { name: "Stripes", description: "Labyrinthine stripe patterns", F: 0.04, k: 0.06 },
  { name: "Waves", description: "Pulsing spiral waves", F: 0.014, k: 0.045 },
  { name: "Worms", description: "Wriggling worm-like structures", F: 0.078, k: 0.061 },
  { name: "Bubbles", description: "Negative space bubbles", F: 0.012, k: 0.05 },
  { name: "Maze", description: "Chaotic maze-like network", F: 0.029, k: 0.057 },
];

// ─── Color Palettes ──────────────────────────────────────────────────────────

interface Palette {
  name: string;
  map: (u: number, v: number) => [number, number, number];
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

const PALETTES: Palette[] = [
  {
    name: "Chemical",
    map(_u, v) {
      const t = clamp01(v);
      if (t < 0.15) return lerp3([5, 5, 15], [10, 30, 80], t / 0.15);
      if (t < 0.4) return lerp3([10, 30, 80], [20, 120, 180], (t - 0.15) / 0.25);
      if (t < 0.65) return lerp3([20, 120, 180], [180, 220, 100], (t - 0.4) / 0.25);
      if (t < 0.85) return lerp3([180, 220, 100], [255, 200, 50], (t - 0.65) / 0.2);
      return lerp3([255, 200, 50], [255, 255, 220], (t - 0.85) / 0.15);
    },
  },
  {
    name: "Thermal",
    map(_u, v) {
      const t = clamp01(v);
      if (t < 0.2) return lerp3([10, 5, 20], [60, 10, 90], t / 0.2);
      if (t < 0.45) return lerp3([60, 10, 90], [200, 30, 60], (t - 0.2) / 0.25);
      if (t < 0.7) return lerp3([200, 30, 60], [255, 150, 20], (t - 0.45) / 0.25);
      return lerp3([255, 150, 20], [255, 255, 200], (t - 0.7) / 0.3);
    },
  },
  {
    name: "Ocean",
    map(_u, v) {
      const t = clamp01(v);
      if (t < 0.3) return lerp3([2, 10, 30], [10, 60, 120], t / 0.3);
      if (t < 0.6) return lerp3([10, 60, 120], [40, 170, 200], (t - 0.3) / 0.3);
      if (t < 0.85) return lerp3([40, 170, 200], [180, 240, 230], (t - 0.6) / 0.25);
      return lerp3([180, 240, 230], [240, 255, 255], (t - 0.85) / 0.15);
    },
  },
  {
    name: "Neon",
    map(_u, v) {
      const t = clamp01(v);
      if (t < 0.25) return lerp3([0, 0, 0], [20, 0, 60], t / 0.25);
      if (t < 0.5) return lerp3([20, 0, 60], [180, 0, 255], (t - 0.25) / 0.25);
      if (t < 0.75) return lerp3([180, 0, 255], [0, 255, 200], (t - 0.5) / 0.25);
      return lerp3([0, 255, 200], [255, 255, 255], (t - 0.75) / 0.25);
    },
  },
  {
    name: "Ember",
    map(_u, v) {
      const t = clamp01(v);
      if (t < 0.3) return lerp3([5, 2, 0], [60, 10, 0], t / 0.3);
      if (t < 0.55) return lerp3([60, 10, 0], [200, 60, 10], (t - 0.3) / 0.25);
      if (t < 0.8) return lerp3([200, 60, 10], [255, 180, 30], (t - 0.55) / 0.25);
      return lerp3([255, 180, 30], [255, 255, 180], (t - 0.8) / 0.2);
    },
  },
];

// ─── Simulation ──────────────────────────────────────────────────────────────

function createGrid(w: number, h: number) {
  const u = new Float32Array(w * h).fill(1);
  const v = new Float32Array(w * h).fill(0);
  return { u, v, w, h };
}

function seedCenter(
  grid: { u: Float32Array; v: Float32Array; w: number; h: number },
  cx: number,
  cy: number,
  radius: number
) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || x >= grid.w || y < 0 || y >= grid.h) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        const idx = y * grid.w + x;
        grid.u[idx] = 0.5 + Math.random() * 0.1;
        grid.v[idx] = 0.25 + Math.random() * 0.1;
      }
    }
  }
}

function seedRandom(grid: { u: Float32Array; v: Float32Array; w: number; h: number }) {
  const numSeeds = 8 + Math.floor(Math.random() * 8);
  for (let i = 0; i < numSeeds; i++) {
    const cx = Math.floor(Math.random() * grid.w);
    const cy = Math.floor(Math.random() * grid.h);
    const r = 3 + Math.floor(Math.random() * 6);
    seedCenter(grid, cx, cy, r);
  }
}

function step(
  grid: { u: Float32Array; v: Float32Array; w: number; h: number },
  F: number,
  k: number
) {
  const { u, v, w, h } = grid;
  const nextU = new Float32Array(w * h);
  const nextV = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const ym = y === 0 ? h - 1 : y - 1;
    const yp = y === h - 1 ? 0 : y + 1;
    for (let x = 0; x < w; x++) {
      const xm = x === 0 ? w - 1 : x - 1;
      const xp = x === w - 1 ? 0 : x + 1;
      const idx = y * w + x;

      const uVal = u[idx];
      const vVal = v[idx];

      // 5-point Laplacian with wraparound boundary
      const lapU =
        u[ym * w + x] + u[yp * w + x] + u[y * w + xm] + u[y * w + xp] - 4 * uVal;
      const lapV =
        v[ym * w + x] + v[yp * w + x] + v[y * w + xm] + v[y * w + xp] - 4 * vVal;

      const uvv = uVal * vVal * vVal;

      nextU[idx] = uVal + Du * lapU - uvv + F * (1 - uVal);
      nextV[idx] = vVal + Dv * lapV + uvv - (F + k) * vVal;
    }
  }

  grid.u = nextU;
  grid.v = nextV;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReactionDiffusionPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<{ u: Float32Array; v: Float32Array; w: number; h: number } | null>(null);
  const rafRef = useRef<number>(0);
  const [running, setRunning] = useState(true);
  const [presetIdx, setPresetIdx] = useState(0);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [feedRate, setFeedRate] = useState(PRESETS[0].F);
  const [killRate, setKillRate] = useState(PRESETS[0].k);
  const [brushSize, setBrushSize] = useState(8);
  const [tool, setTool] = useState<"paint" | "erase">("paint");
  const [generation, setGeneration] = useState(0);
  const runningRef = useRef(true);
  const feedRef = useRef(feedRate);
  const killRef = useRef(killRate);
  const paletteRef = useRef(paletteIdx);
  const brushRef = useRef(brushSize);
  const toolRef = useRef(tool);
  const genRef = useRef(0);

  feedRef.current = feedRate;
  killRef.current = killRate;
  paletteRef.current = paletteIdx;
  brushRef.current = brushSize;
  toolRef.current = tool;

  const initGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    canvas.width = width;
    canvas.height = height;

    const gw = Math.floor(width / RESOLUTION);
    const gh = Math.floor(height / RESOLUTION);
    const grid = createGrid(gw, gh);
    seedRandom(grid);
    gridRef.current = grid;
    genRef.current = 0;
    setGeneration(0);
  }, []);

  // Initialize
  useEffect(() => {
    initGrid();

    const handleResize = () => {
      initGrid();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initGrid]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameCount = 0;

    function animate() {
      const grid = gridRef.current;
      if (!grid || !ctx || !canvas) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (runningRef.current) {
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
          step(grid, feedRef.current, killRef.current);
        }
        genRef.current += STEPS_PER_FRAME;

        // Update generation counter every 16 frames to avoid re-render spam
        frameCount++;
        if (frameCount % 16 === 0) {
          setGeneration(genRef.current);
        }
      }

      // Render
      const palette = PALETTES[paletteRef.current];
      const imgData = ctx.createImageData(canvas.width, canvas.height);
      const data = imgData.data;

      for (let sy = 0; sy < grid.h; sy++) {
        for (let sx = 0; sx < grid.w; sx++) {
          const idx = sy * grid.w + sx;
          const [r, g, b] = palette.map(grid.u[idx], grid.v[idx]);

          // Fill the RESOLUTION×RESOLUTION block
          for (let py = 0; py < RESOLUTION; py++) {
            for (let px = 0; px < RESOLUTION; px++) {
              const cx = sx * RESOLUTION + px;
              const cy = sy * RESOLUTION + py;
              if (cx >= canvas.width || cy >= canvas.height) continue;
              const pi = (cy * canvas.width + cx) * 4;
              data[pi] = r;
              data[pi + 1] = g;
              data[pi + 2] = b;
              data[pi + 3] = 255;
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Mouse interaction
  const paintAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid) return;

    const rect = canvas.getBoundingClientRect();
    const mx = Math.floor((clientX - rect.left) / RESOLUTION);
    const my = Math.floor((clientY - rect.top) / RESOLUTION);
    const r = brushRef.current;
    const isPaint = toolRef.current === "paint";

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const gx = mx + dx;
        const gy = my + dy;
        if (gx < 0 || gx >= grid.w || gy < 0 || gy >= grid.h) continue;
        const idx = gy * grid.w + gx;
        if (isPaint) {
          grid.u[idx] = 0.5 + Math.random() * 0.02;
          grid.v[idx] = 0.25 + Math.random() * 0.02;
        } else {
          grid.u[idx] = 1;
          grid.v[idx] = 0;
        }
      }
    }
  }, []);

  const isDrawing = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDrawing.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      paintAt(e.clientX, e.clientY);
    },
    [paintAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing.current) return;
      paintAt(e.clientX, e.clientY);
    },
    [paintAt]
  );

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
  }, []);

  const toggleRunning = useCallback(() => {
    setRunning((prev) => {
      runningRef.current = !prev;
      return !prev;
    });
  }, []);

  const reset = useCallback(() => {
    initGrid();
  }, [initGrid]);

  const selectPreset = useCallback((idx: number) => {
    setPresetIdx(idx);
    const p = PRESETS[idx];
    setFeedRate(p.F);
    setKillRate(p.k);
    feedRef.current = p.F;
    killRef.current = p.k;
    initGrid();
  }, [initGrid]);

  return (
    <div className="h-full flex flex-col bg-black relative overflow-hidden">
      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: tool === "paint" ? "crosshair" : "cell" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        {/* Overlay HUD — top left */}
        <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-lg px-3 py-2 border border-white/10">
            <span className="text-white/50 text-xs font-mono">
              {PRESETS[presetIdx].name}
            </span>
            <span className="text-white/30 text-xs">|</span>
            <span className="text-white/40 text-xs font-mono">
              F={feedRate.toFixed(4)} k={killRate.toFixed(4)}
            </span>
            <span className="text-white/30 text-xs">|</span>
            <span className="text-white/40 text-xs font-mono">
              gen {generation.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Toolbar — top right */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          <button
            onClick={toggleRunning}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-colors"
            title={running ? "Pause" : "Play"}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={reset}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/80 transition-colors"
            title="Reset"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => setTool(tool === "paint" ? "erase" : "paint")}
            className={`flex items-center justify-center w-8 h-8 rounded-lg backdrop-blur-md border transition-colors ${
              tool === "paint"
                ? "bg-cyan-500/30 border-cyan-400/30 text-cyan-300"
                : "bg-red-500/30 border-red-400/30 text-red-300"
            }`}
            title={tool === "paint" ? "Paint (click to switch to erase)" : "Erase (click to switch to paint)"}
          >
            {tool === "paint" ? <Paintbrush size={14} /> : <Pipette size={14} />}
          </button>
          <button
            onClick={() => setShowControls(!showControls)}
            className={`flex items-center justify-center w-8 h-8 rounded-lg backdrop-blur-md border transition-colors ${
              showControls
                ? "bg-white/20 border-white/20 text-white"
                : "bg-black/60 border-white/10 text-white/70 hover:text-white hover:bg-black/80"
            }`}
            title="Toggle controls"
          >
            <Sliders size={14} />
          </button>
        </div>

        {/* Control Panel */}
        {showControls && (
          <div className="absolute top-14 right-3 w-72 bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 p-4 z-10 reaction-panel-in">
            {/* Presets */}
            <div className="mb-4">
              <h3 className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-2">
                Presets
              </h3>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.name}
                    onClick={() => selectPreset(i)}
                    className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      i === presetIdx
                        ? "bg-cyan-500/20 border border-cyan-400/30 text-cyan-300"
                        : "bg-white/5 border border-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                    }`}
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{p.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Parameters */}
            <div className="mb-4">
              <h3 className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-2">
                Parameters
              </h3>
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-white/50">Feed rate (F)</span>
                    <span className="text-white/70 font-mono">{feedRate.toFixed(4)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={0.1}
                    step={0.0001}
                    value={feedRate}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setFeedRate(v);
                      feedRef.current = v;
                    }}
                    className="w-full h-1 appearance-none rounded-full bg-white/10 accent-cyan-400 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-white/50">Kill rate (k)</span>
                    <span className="text-white/70 font-mono">{killRate.toFixed(4)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.03}
                    max={0.07}
                    step={0.0001}
                    value={killRate}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setKillRate(v);
                      killRef.current = v;
                    }}
                    className="w-full h-1 appearance-none rounded-full bg-white/10 accent-cyan-400 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-white/50">Brush size</span>
                    <span className="text-white/70 font-mono">{brushSize}</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={30}
                    step={1}
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-full h-1 appearance-none rounded-full bg-white/10 accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Palettes */}
            <div>
              <h3 className="text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-2">
                Color Palette
              </h3>
              <div className="flex gap-1.5">
                {PALETTES.map((p, i) => (
                  <button
                    key={p.name}
                    onClick={() => setPaletteIdx(i)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                      i === paletteIdx
                        ? "bg-cyan-500/20 border border-cyan-400/30 text-cyan-300"
                        : "bg-white/5 border border-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom hint */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-md rounded-full px-4 py-1.5 border border-white/5">
            <span className="text-white/30 text-xs">
              Click and drag to seed chemical reactions
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
