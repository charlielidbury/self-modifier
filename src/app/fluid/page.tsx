"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Trash2, Droplets, Wind } from "lucide-react";

// ─── Fluid Solver (Jos Stam "Stable Fluids" on a staggered grid) ────────────

const IX = (x: number, y: number, N: number) => x + y * (N + 2);

function addSource(N: number, x: Float32Array, s: Float32Array, dt: number) {
  const size = (N + 2) * (N + 2);
  for (let i = 0; i < size; i++) x[i] += dt * s[i];
}

function setBounds(N: number, b: number, x: Float32Array) {
  for (let i = 1; i <= N; i++) {
    x[IX(0, i, N)] = b === 1 ? -x[IX(1, i, N)] : x[IX(1, i, N)];
    x[IX(N + 1, i, N)] = b === 1 ? -x[IX(N, i, N)] : x[IX(N, i, N)];
    x[IX(i, 0, N)] = b === 2 ? -x[IX(i, 1, N)] : x[IX(i, 1, N)];
    x[IX(i, N + 1, N)] = b === 2 ? -x[IX(i, N, N)] : x[IX(i, N, N)];
  }
  x[IX(0, 0, N)] = 0.5 * (x[IX(1, 0, N)] + x[IX(0, 1, N)]);
  x[IX(0, N + 1, N)] = 0.5 * (x[IX(1, N + 1, N)] + x[IX(0, N, N)]);
  x[IX(N + 1, 0, N)] = 0.5 * (x[IX(N, 0, N)] + x[IX(N + 1, 1, N)]);
  x[IX(N + 1, N + 1, N)] = 0.5 * (x[IX(N, N + 1, N)] + x[IX(N + 1, N, N)]);
}

function linearSolve(N: number, b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
  const cRecip = 1.0 / c;
  for (let k = 0; k < 4; k++) {
    for (let j = 1; j <= N; j++) {
      for (let i = 1; i <= N; i++) {
        x[IX(i, j, N)] =
          (x0[IX(i, j, N)] +
            a *
              (x[IX(i + 1, j, N)] +
                x[IX(i - 1, j, N)] +
                x[IX(i, j + 1, N)] +
                x[IX(i, j - 1, N)])) *
          cRecip;
      }
    }
    setBounds(N, b, x);
  }
}

function diffuse(N: number, b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number) {
  const a = dt * diff * N * N;
  linearSolve(N, b, x, x0, a, 1 + 4 * a);
}

function advect(N: number, b: number, d: Float32Array, d0: Float32Array, u: Float32Array, v: Float32Array, dt: number) {
  const dt0 = dt * N;
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      let x = i - dt0 * u[IX(i, j, N)];
      let y = j - dt0 * v[IX(i, j, N)];
      if (x < 0.5) x = 0.5;
      if (x > N + 0.5) x = N + 0.5;
      const i0 = Math.floor(x);
      const i1 = i0 + 1;
      if (y < 0.5) y = 0.5;
      if (y > N + 0.5) y = N + 0.5;
      const j0 = Math.floor(y);
      const j1 = j0 + 1;
      const s1 = x - i0;
      const s0 = 1 - s1;
      const t1 = y - j0;
      const t0 = 1 - t1;
      d[IX(i, j, N)] =
        s0 * (t0 * d0[IX(i0, j0, N)] + t1 * d0[IX(i0, j1, N)]) +
        s1 * (t0 * d0[IX(i1, j0, N)] + t1 * d0[IX(i1, j1, N)]);
    }
  }
  setBounds(N, b, d);
}

function project(N: number, u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array) {
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      div[IX(i, j, N)] =
        (-0.5 *
          (u[IX(i + 1, j, N)] -
            u[IX(i - 1, j, N)] +
            v[IX(i, j + 1, N)] -
            v[IX(i, j - 1, N)])) /
        N;
      p[IX(i, j, N)] = 0;
    }
  }
  setBounds(N, 0, div);
  setBounds(N, 0, p);
  linearSolve(N, 0, p, div, 1, 4);
  for (let j = 1; j <= N; j++) {
    for (let i = 1; i <= N; i++) {
      u[IX(i, j, N)] -= 0.5 * N * (p[IX(i + 1, j, N)] - p[IX(i - 1, j, N)]);
      v[IX(i, j, N)] -= 0.5 * N * (p[IX(i, j + 1, N)] - p[IX(i, j - 1, N)]);
    }
  }
  setBounds(N, 1, u);
  setBounds(N, 2, v);
}

// ─── Fluid State Class ──────────────────────────────────────────────────────

class FluidState {
  N: number;
  size: number;
  dt: number;
  diffusion: number;
  viscosity: number;
  u: Float32Array;
  v: Float32Array;
  uPrev: Float32Array;
  vPrev: Float32Array;
  density: Float32Array; // red channel
  densityPrev: Float32Array;
  densityG: Float32Array; // green channel
  densityGPrev: Float32Array;
  densityB: Float32Array; // blue channel
  densityBPrev: Float32Array;

  constructor(N: number, diffusion: number, viscosity: number, dt: number) {
    this.N = N;
    this.size = (N + 2) * (N + 2);
    this.dt = dt;
    this.diffusion = diffusion;
    this.viscosity = viscosity;
    this.u = new Float32Array(this.size);
    this.v = new Float32Array(this.size);
    this.uPrev = new Float32Array(this.size);
    this.vPrev = new Float32Array(this.size);
    this.density = new Float32Array(this.size);
    this.densityPrev = new Float32Array(this.size);
    this.densityG = new Float32Array(this.size);
    this.densityGPrev = new Float32Array(this.size);
    this.densityB = new Float32Array(this.size);
    this.densityBPrev = new Float32Array(this.size);
  }

  addDensity(x: number, y: number, r: number, g: number, b: number) {
    const idx = IX(x, y, this.N);
    this.density[idx] += r;
    this.densityG[idx] += g;
    this.densityB[idx] += b;
  }

  addVelocity(x: number, y: number, amountX: number, amountY: number) {
    const idx = IX(x, y, this.N);
    this.u[idx] += amountX;
    this.v[idx] += amountY;
  }

  step() {
    const N = this.N;
    const dt = this.dt;
    const visc = this.viscosity;
    const diff = this.diffusion;

    // Velocity step
    addSource(N, this.u, this.uPrev, dt);
    addSource(N, this.v, this.vPrev, dt);
    [this.uPrev, this.u] = [this.u, this.uPrev];
    diffuse(N, 1, this.u, this.uPrev, visc, dt);
    [this.vPrev, this.v] = [this.v, this.vPrev];
    diffuse(N, 2, this.v, this.vPrev, visc, dt);
    project(N, this.u, this.v, this.uPrev, this.vPrev);
    [this.uPrev, this.u] = [this.u, this.uPrev];
    [this.vPrev, this.v] = [this.v, this.vPrev];
    advect(N, 1, this.u, this.uPrev, this.uPrev, this.vPrev, dt);
    advect(N, 2, this.v, this.vPrev, this.uPrev, this.vPrev, dt);
    project(N, this.u, this.v, this.uPrev, this.vPrev);

    // Density step (3 channels)
    for (const [dens, densPrev] of [
      [this.density, this.densityPrev],
      [this.densityG, this.densityGPrev],
      [this.densityB, this.densityBPrev],
    ] as [Float32Array, Float32Array][]) {
      addSource(N, dens, densPrev, dt);
      [densPrev, dens].reverse(); // swap references conceptually
    }
    // We need to actually swap for diffuse/advect
    {
      [this.densityPrev, this.density] = [this.density, this.densityPrev];
      diffuse(N, 0, this.density, this.densityPrev, diff, dt);
      [this.densityPrev, this.density] = [this.density, this.densityPrev];
      advect(N, 0, this.density, this.densityPrev, this.u, this.v, dt);
    }
    {
      [this.densityGPrev, this.densityG] = [this.densityG, this.densityGPrev];
      diffuse(N, 0, this.densityG, this.densityGPrev, diff, dt);
      [this.densityGPrev, this.densityG] = [this.densityG, this.densityGPrev];
      advect(N, 0, this.densityG, this.densityGPrev, this.u, this.v, dt);
    }
    {
      [this.densityBPrev, this.densityB] = [this.densityB, this.densityBPrev];
      diffuse(N, 0, this.densityB, this.densityBPrev, diff, dt);
      [this.densityBPrev, this.densityB] = [this.densityB, this.densityBPrev];
      advect(N, 0, this.densityB, this.densityBPrev, this.u, this.v, dt);
    }

    // Clear prev arrays
    this.uPrev.fill(0);
    this.vPrev.fill(0);
    this.densityPrev.fill(0);
    this.densityGPrev.fill(0);
    this.densityBPrev.fill(0);
  }

  clear() {
    this.u.fill(0);
    this.v.fill(0);
    this.uPrev.fill(0);
    this.vPrev.fill(0);
    this.density.fill(0);
    this.densityPrev.fill(0);
    this.densityG.fill(0);
    this.densityGPrev.fill(0);
    this.densityB.fill(0);
    this.densityBPrev.fill(0);
  }
}

// ─── Color cycling ──────────────────────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// ─── Display modes ──────────────────────────────────────────────────────────

type DisplayMode = "dye" | "velocity" | "pressure";

const DISPLAY_MODES: { id: DisplayMode; label: string }[] = [
  { id: "dye", label: "Dye" },
  { id: "velocity", label: "Velocity" },
  { id: "pressure", label: "Pressure" },
];

// ─── Presets ────────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  viscosity: number;
  diffusion: number;
}

const PRESETS: Preset[] = [
  { name: "Water", viscosity: 0.0000001, diffusion: 0.0000001 },
  { name: "Honey", viscosity: 0.00005, diffusion: 0.0000001 },
  { name: "Smoke", viscosity: 0.0000001, diffusion: 0.00002 },
  { name: "Ink", viscosity: 0.000001, diffusion: 0.000005 },
];

// ─── Grid Size ──────────────────────────────────────────────────────────────
const GRID_SIZE = 128;

// ─── Component ──────────────────────────────────────────────────────────────

export default function FluidPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidRef = useRef<FluidState | null>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0, px: 0, py: 0, down: false });
  const hueRef = useRef(0);
  const [running, setRunning] = useState(true);
  const runningRef = useRef(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("dye");
  const displayModeRef = useRef<DisplayMode>("dye");
  const [activePreset, setActivePreset] = useState(0);

  // Keep refs in sync
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { displayModeRef.current = displayMode; }, [displayMode]);

  const applyPreset = useCallback((idx: number) => {
    const preset = PRESETS[idx];
    if (fluidRef.current) {
      fluidRef.current.viscosity = preset.viscosity;
      fluidRef.current.diffusion = preset.diffusion;
    }
    setActivePreset(idx);
  }, []);

  const clearFluid = useCallback(() => {
    fluidRef.current?.clear();
  }, []);

  // Initialize fluid and render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const N = GRID_SIZE;
    const fluid = new FluidState(N, PRESETS[0].diffusion, PRESETS[0].viscosity, 0.1);
    fluidRef.current = fluid;

    // Resize canvas to fill container
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const size = Math.min(rect.width - 32, rect.height - 32, 800);
      canvas.width = size;
      canvas.height = size;
    };
    resizeCanvas();
    const resizeObs = new ResizeObserver(resizeCanvas);
    resizeObs.observe(canvas.parentElement!);

    const imageData = ctx.createImageData(N, N);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = N;
    tempCanvas.height = N;
    const tempCtx = tempCanvas.getContext("2d")!;

    function render() {
      if (runningRef.current) {
        // Inject from mouse movement
        if (mouseRef.current.down) {
          const canvasW = canvas!.width;
          const scale = N / canvasW;
          const mx = Math.floor(mouseRef.current.x * scale);
          const my = Math.floor(mouseRef.current.y * scale);
          const dx = (mouseRef.current.x - mouseRef.current.px) * 5;
          const dy = (mouseRef.current.y - mouseRef.current.py) * 5;

          // Add velocity
          const radius = 3;
          for (let di = -radius; di <= radius; di++) {
            for (let dj = -radius; dj <= radius; dj++) {
              const gi = mx + di;
              const gj = my + dj;
              if (gi > 0 && gi <= N && gj > 0 && gj <= N) {
                const dist = Math.sqrt(di * di + dj * dj);
                const falloff = Math.max(0, 1 - dist / (radius + 1));
                fluid.addVelocity(gi, gj, dx * falloff, dy * falloff);
                // Add colorful dye
                const [r, g, b] = hslToRgb(hueRef.current % 360, 1, 0.5);
                fluid.addDensity(gi, gj, r * falloff * 0.5, g * falloff * 0.5, b * falloff * 0.5);
              }
            }
          }
          hueRef.current += 0.7;
        }

        fluid.step();
      }

      // Render to image data
      const mode = displayModeRef.current;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const idx = (i + j * N) * 4;
          const fi = IX(i + 1, j + 1, N);

          if (mode === "dye") {
            imageData.data[idx] = Math.min(255, fluid.density[fi]);
            imageData.data[idx + 1] = Math.min(255, fluid.densityG[fi]);
            imageData.data[idx + 2] = Math.min(255, fluid.densityB[fi]);
            imageData.data[idx + 3] = 255;
          } else if (mode === "velocity") {
            const speed = Math.sqrt(fluid.u[fi] * fluid.u[fi] + fluid.v[fi] * fluid.v[fi]);
            const angle = (Math.atan2(fluid.v[fi], fluid.u[fi]) * 180 / Math.PI + 360) % 360;
            const [r, g, b] = hslToRgb(angle, 1, Math.min(0.6, speed * 0.15));
            imageData.data[idx] = r;
            imageData.data[idx + 1] = g;
            imageData.data[idx + 2] = b;
            imageData.data[idx + 3] = 255;
          } else {
            // Pressure-like: divergence of velocity
            const div = Math.abs(
              fluid.u[IX(i + 2, j + 1, N)] - fluid.u[IX(i, j + 1, N)] +
              fluid.v[IX(i + 1, j + 2, N)] - fluid.v[IX(i + 1, j, N)]
            );
            const intensity = Math.min(255, div * 5000);
            imageData.data[idx] = intensity * 0.3;
            imageData.data[idx + 1] = intensity * 0.6;
            imageData.data[idx + 2] = intensity;
            imageData.data[idx + 3] = 255;
          }
        }
      }

      // Draw the NxN image data to temp canvas, then scale up
      tempCtx.putImageData(imageData, 0, 0);
      ctx!.imageSmoothingEnabled = true;
      ctx!.imageSmoothingQuality = "high";
      ctx!.drawImage(tempCanvas, 0, 0, canvas!.width, canvas!.height);

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObs.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mouse handlers
  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    mouseRef.current = { x: pos.x, y: pos.y, px: pos.x, py: pos.y, down: true };
  }, [getCanvasPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    mouseRef.current.px = mouseRef.current.x;
    mouseRef.current.py = mouseRef.current.y;
    mouseRef.current.x = pos.x;
    mouseRef.current.y = pos.y;
  }, [getCanvasPos]);

  const handleMouseUp = useCallback(() => {
    mouseRef.current.down = false;
  }, []);

  // Touch support
  const getTouchPos = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getTouchPos(e);
    mouseRef.current = { x: pos.x, y: pos.y, px: pos.x, py: pos.y, down: true };
  }, [getTouchPos]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const pos = getTouchPos(e);
    mouseRef.current.px = mouseRef.current.x;
    mouseRef.current.py = mouseRef.current.y;
    mouseRef.current.x = pos.x;
    mouseRef.current.y = pos.y;
  }, [getTouchPos]);

  const handleTouchEnd = useCallback(() => {
    mouseRef.current.down = false;
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRunning((r) => !r)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-accent/60 transition-colors"
            title={running ? "Pause" : "Play"}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={clearFluid}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-background hover:bg-accent/60 transition-colors"
            title="Clear"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Display mode */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">View:</span>
          {DISPLAY_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setDisplayMode(mode.id)}
              className={[
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                displayMode === mode.id
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                  : "border border-border bg-background hover:bg-accent/60 text-muted-foreground",
              ].join(" ")}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        {/* Presets */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Fluid:</span>
          {PRESETS.map((preset, idx) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(idx)}
              className={[
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                activePreset === idx
                  ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                  : "border border-border bg-background hover:bg-accent/60 text-muted-foreground",
              ].join(" ")}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Droplets size={14} className="text-red-400" />
          <span className="hidden sm:inline">Click & drag to inject fluid</span>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center bg-black/95 dark:bg-black min-h-0 p-4">
        <canvas
          ref={canvasRef}
          className="rounded-lg cursor-crosshair shadow-2xl shadow-red-500/10"
          style={{ imageRendering: "auto", maxWidth: "100%", maxHeight: "100%" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>

      {/* Info bar */}
      <div className="flex-none flex items-center justify-between px-4 py-2 border-t border-border bg-background/80 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Wind size={12} />
            Grid: {GRID_SIZE}×{GRID_SIZE}
          </span>
          <span>
            Viscosity: {PRESETS[activePreset].viscosity.toExponential(1)}
          </span>
          <span>
            Diffusion: {PRESETS[activePreset].diffusion.toExponential(1)}
          </span>
        </div>
        <span className="hidden sm:inline text-muted-foreground/50">
          Navier-Stokes · Stable Fluids (Jos Stam)
        </span>
      </div>
    </div>
  );
}
