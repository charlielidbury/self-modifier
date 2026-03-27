"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Trash2,
  MousePointer,
  Waves as WavesIcon,
  Droplets,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────

const DAMPING = 0.997; // Energy dissipation per step (< 1 = damping)
const WAVE_SPEED = 0.48; // Propagation speed (c²); keep < 0.5 for stability
const RESOLUTION = 2; // Pixels per simulation cell (lower = finer, heavier)
const EMITTER_FREQ = 0.15; // Oscillation frequency for persistent emitters
const EMITTER_AMP = 6; // Amplitude of emitter pulses
const CLICK_AMP = 12; // Amplitude of a single click pulse
const CLICK_RADIUS = 4; // Radius (in cells) for initial click disturbance

// ─── Color Palettes ─────────────────────────────────────────────────────────

interface Palette {
  name: string;
  /** Map a wave height ∈ [-1,1] to an [r,g,b] triple (0–255). */
  map: (t: number) => [number, number, number];
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

const PALETTES: Palette[] = [
  {
    name: "Ocean",
    map(t: number) {
      // Deep blue → cyan → white → coral → deep red
      const s = t * 0.5 + 0.5; // [0,1]
      if (s < 0.25) return lerp3([8, 20, 60], [10, 80, 160], s / 0.25);
      if (s < 0.5) return lerp3([10, 80, 160], [180, 220, 240], (s - 0.25) / 0.25);
      if (s < 0.75) return lerp3([180, 220, 240], [255, 140, 80], (s - 0.5) / 0.25);
      return lerp3([255, 140, 80], [160, 20, 20], (s - 0.75) / 0.25);
    },
  },
  {
    name: "Neon",
    map(t: number) {
      const s = t * 0.5 + 0.5;
      if (s < 0.33) return lerp3([10, 0, 40], [80, 0, 200], s / 0.33);
      if (s < 0.66) return lerp3([80, 0, 200], [0, 255, 180], (s - 0.33) / 0.33);
      return lerp3([0, 255, 180], [255, 255, 60], (s - 0.66) / 0.34);
    },
  },
  {
    name: "Thermal",
    map(t: number) {
      const s = t * 0.5 + 0.5;
      if (s < 0.25) return lerp3([0, 0, 0], [30, 0, 100], s / 0.25);
      if (s < 0.5) return lerp3([30, 0, 100], [200, 30, 30], (s - 0.25) / 0.25);
      if (s < 0.75) return lerp3([200, 30, 30], [255, 180, 0], (s - 0.5) / 0.25);
      return lerp3([255, 180, 0], [255, 255, 220], (s - 0.75) / 0.25);
    },
  },
  {
    name: "Monochrome",
    map(t: number) {
      const v = Math.round((t * 0.5 + 0.5) * 255);
      return [v, v, v];
    },
  },
];

// ─── Emitter ────────────────────────────────────────────────────────────────

interface Emitter {
  cx: number; // cell x
  cy: number; // cell y
  phase: number; // starting phase offset
}

// ─── Presets ────────────────────────────────────────────────────────────────

interface WavePreset {
  name: string;
  icon: string;
  make: (cols: number, rows: number) => Emitter[];
}

const PRESETS: WavePreset[] = [
  {
    name: "Single Source",
    icon: "◉",
    make: (cols, rows) => [{ cx: Math.floor(cols / 2), cy: Math.floor(rows / 2), phase: 0 }],
  },
  {
    name: "Double Slit",
    icon: "‖",
    make: (cols, rows) => {
      const cx = Math.floor(cols / 2);
      const cy = Math.floor(rows / 2);
      const gap = Math.floor(rows * 0.15);
      return [
        { cx, cy: cy - gap, phase: 0 },
        { cx, cy: cy + gap, phase: 0 },
      ];
    },
  },
  {
    name: "Triple Source",
    icon: "△",
    make: (cols, rows) => {
      const cx = Math.floor(cols / 2);
      const cy = Math.floor(rows / 2);
      const r = Math.floor(Math.min(cols, rows) * 0.2);
      return [
        { cx: cx, cy: cy - r, phase: 0 },
        { cx: cx - Math.floor(r * 0.87), cy: cy + Math.floor(r * 0.5), phase: 0 },
        { cx: cx + Math.floor(r * 0.87), cy: cy + Math.floor(r * 0.5), phase: 0 },
      ];
    },
  },
  {
    name: "Quad Array",
    icon: "◇",
    make: (cols, rows) => {
      const cx = Math.floor(cols / 2);
      const cy = Math.floor(rows / 2);
      const dx = Math.floor(cols * 0.18);
      const dy = Math.floor(rows * 0.18);
      return [
        { cx: cx - dx, cy: cy - dy, phase: 0 },
        { cx: cx + dx, cy: cy - dy, phase: Math.PI * 0.5 },
        { cx: cx - dx, cy: cy + dy, phase: Math.PI },
        { cx: cx + dx, cy: cy + dy, phase: Math.PI * 1.5 },
      ];
    },
  },
  {
    name: "Ring (8)",
    icon: "⊙",
    make: (cols, rows) => {
      const cx = Math.floor(cols / 2);
      const cy = Math.floor(rows / 2);
      const r = Math.floor(Math.min(cols, rows) * 0.25);
      const emitters: Emitter[] = [];
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        emitters.push({
          cx: cx + Math.floor(Math.cos(angle) * r),
          cy: cy + Math.floor(Math.sin(angle) * r),
          phase: i * (Math.PI / 4),
        });
      }
      return emitters;
    },
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function WavesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);

  // Simulation state stored in refs for performance
  const colsRef = useRef(0);
  const rowsRef = useRef(0);
  const currRef = useRef<Float32Array>(new Float32Array(0));
  const prevRef = useRef<Float32Array>(new Float32Array(0));
  const emittersRef = useRef<Emitter[]>([]);
  const tickRef = useRef(0);
  const runningRef = useRef(true);
  const paletteIdxRef = useRef(0);

  const [running, setRunning] = useState(true);
  const [emitterCount, setEmitterCount] = useState(0);
  const [paletteName, setPaletteName] = useState(PALETTES[0].name);
  const [showPresets, setShowPresets] = useState(false);

  // Precompute the palette lookup table (256 entries) for the current palette.
  // This avoids calling the map function per pixel every frame.
  const lutRef = useRef<Uint8ClampedArray>(new Uint8ClampedArray(256 * 3));

  const rebuildLUT = useCallback((idx: number) => {
    const pal = PALETTES[idx];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = (i / 255) * 2 - 1; // map [0,255] → [-1,1]
      const [r, g, b] = pal.map(t);
      lut[i * 3] = Math.round(r);
      lut[i * 3 + 1] = Math.round(g);
      lut[i * 3 + 2] = Math.round(b);
    }
    lutRef.current = lut;
  }, []);

  // Initialize the simulation grid
  const initGrid = useCallback(
    (width: number, height: number) => {
      const cols = Math.ceil(width / RESOLUTION);
      const rows = Math.ceil(height / RESOLUTION);
      colsRef.current = cols;
      rowsRef.current = rows;
      currRef.current = new Float32Array(cols * rows);
      prevRef.current = new Float32Array(cols * rows);
      tickRef.current = 0;
    },
    []
  );

  // Resize canvas to fill container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    initGrid(w, h);
  }, [initGrid]);

  // Step the wave equation
  const step = useCallback(() => {
    const cols = colsRef.current;
    const rows = rowsRef.current;
    const curr = currRef.current;
    const prev = prevRef.current;
    const next = new Float32Array(cols * rows);
    const c2 = WAVE_SPEED;

    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        const laplacian =
          curr[i - 1] + curr[i + 1] + curr[i - cols] + curr[i + cols] - 4 * curr[i];
        next[i] = (2 * curr[i] - prev[i] + c2 * laplacian) * DAMPING;
      }
    }

    // Apply emitters
    const t = tickRef.current;
    for (const em of emittersRef.current) {
      if (em.cx >= 0 && em.cx < cols && em.cy >= 0 && em.cy < rows) {
        next[em.cy * cols + em.cx] = Math.sin(t * EMITTER_FREQ + em.phase) * EMITTER_AMP;
      }
    }

    prevRef.current = curr;
    currRef.current = next;
    tickRef.current = t + 1;
  }, []);

  // Render the simulation to canvas
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cols = colsRef.current;
    const rows = rowsRef.current;
    const curr = currRef.current;
    const lut = lutRef.current;

    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let py = 0; py < h; py++) {
      const sy = Math.min(Math.floor(py / RESOLUTION), rows - 1);
      for (let px = 0; px < w; px++) {
        const sx = Math.min(Math.floor(px / RESOLUTION), cols - 1);
        const val = curr[sy * cols + sx];
        // Clamp to [-1, 1] and map to [0, 255] for LUT lookup
        const clamped = Math.max(-1, Math.min(1, val * 0.1));
        const lutIdx = Math.round((clamped * 0.5 + 0.5) * 255);
        const li = lutIdx * 3;
        const pi = (py * w + px) * 4;
        data[pi] = lut[li];
        data[pi + 1] = lut[li + 1];
        data[pi + 2] = lut[li + 2];
        data[pi + 3] = 255;
      }
    }

    // Draw emitter markers into the pixel data
    for (const em of emittersRef.current) {
      const ex = em.cx * RESOLUTION;
      const ey = em.cy * RESOLUTION;
      const r = 4;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const px = ex + dx;
          const py2 = ey + dy;
          if (px < 0 || px >= w || py2 < 0 || py2 >= h) continue;
          const pi = (py2 * w + px) * 4;
          // White ring with slight glow
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > r - 1.5) {
            data[pi] = 255;
            data[pi + 1] = 255;
            data[pi + 2] = 255;
            data[pi + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Main animation loop
  useEffect(() => {
    resizeCanvas();
    rebuildLUT(0);
    window.addEventListener("resize", resizeCanvas);

    const loop = () => {
      if (runningRef.current) {
        step();
      }
      renderFrame();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [resizeCanvas, rebuildLUT, step, renderFrame]);

  // Click handler: add emitter or single pulse
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const cx = Math.floor(px / RESOLUTION);
      const cy = Math.floor(py / RESOLUTION);
      const cols = colsRef.current;
      const rows = rowsRef.current;

      if (e.shiftKey) {
        // Shift+click: place persistent emitter
        emittersRef.current = [
          ...emittersRef.current,
          { cx, cy, phase: Math.random() * Math.PI * 2 },
        ];
        setEmitterCount(emittersRef.current.length);
      } else {
        // Normal click: single radial pulse
        const curr = currRef.current;
        for (let dy = -CLICK_RADIUS; dy <= CLICK_RADIUS; dy++) {
          for (let dx = -CLICK_RADIUS; dx <= CLICK_RADIUS; dx++) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > CLICK_RADIUS) continue;
            const tx = cx + dx;
            const ty = cy + dy;
            if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) continue;
            const falloff = 1 - dist / CLICK_RADIUS;
            curr[ty * cols + tx] += CLICK_AMP * falloff;
          }
        }
      }
    },
    []
  );

  const handleClear = useCallback(() => {
    const cols = colsRef.current;
    const rows = colsRef.current;
    currRef.current = new Float32Array(cols * rowsRef.current);
    prevRef.current = new Float32Array(cols * rowsRef.current);
    emittersRef.current = [];
    tickRef.current = 0;
    setEmitterCount(0);
  }, []);

  const handleToggleRunning = useCallback(() => {
    setRunning((r) => {
      runningRef.current = !r;
      return !r;
    });
  }, []);

  const cyclePalette = useCallback(() => {
    const next = (paletteIdxRef.current + 1) % PALETTES.length;
    paletteIdxRef.current = next;
    rebuildLUT(next);
    setPaletteName(PALETTES[next].name);
  }, [rebuildLUT]);

  const loadPreset = useCallback(
    (preset: WavePreset) => {
      const cols = colsRef.current;
      const rows = rowsRef.current;
      // Clear
      currRef.current = new Float32Array(cols * rows);
      prevRef.current = new Float32Array(cols * rows);
      tickRef.current = 0;
      // Load emitters
      emittersRef.current = preset.make(cols, rows);
      setEmitterCount(emittersRef.current.length);
      setShowPresets(false);
      if (!runningRef.current) {
        setRunning(true);
        runningRef.current = true;
      }
    },
    []
  );

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleToggleRunning();
      } else if (e.key === "c" || e.key === "C") {
        handleClear();
      } else if (e.key === "p" || e.key === "P") {
        cyclePalette();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleToggleRunning, handleClear, cyclePalette]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onClick={handleCanvasClick}
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
          <button
            onClick={cyclePalette}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            title="Cycle palette (P)"
          >
            <Droplets size={13} />
            {paletteName}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowPresets((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900/70 dark:bg-neutral-100/10 backdrop-blur-md text-white text-xs font-medium hover:bg-neutral-800/80 dark:hover:bg-neutral-100/20 transition-colors"
            >
              <WavesIcon size={13} />
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
            <span className="text-white/50">emitters</span>
            <span className="font-bold tabular-nums">{emitterCount}</span>
          </div>
        </div>
      </div>

      {/* Help overlay — shown when simulation is idle */}
      {emitterCount === 0 && tickRef.current < 10 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center space-y-3 page-transition">
            <div className="flex items-center justify-center gap-2 text-white/60">
              <MousePointer size={20} />
              <span className="text-sm font-medium">Click to create wave pulses</span>
            </div>
            <p className="text-xs text-white/40">
              Shift+click to place persistent emitters · Waves interfere naturally
            </p>
            <p className="text-xs text-white/30">
              <kbd className="rounded border border-white/20 px-1.5 py-0.5 font-mono text-[10px]">Space</kbd> pause
              {" · "}
              <kbd className="rounded border border-white/20 px-1.5 py-0.5 font-mono text-[10px]">C</kbd> clear
              {" · "}
              <kbd className="rounded border border-white/20 px-1.5 py-0.5 font-mono text-[10px]">P</kbd> palette
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
