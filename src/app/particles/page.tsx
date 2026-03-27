"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Shuffle,
  Trash2,
  Settings2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// ─── Simulation Parameters ───────────────────────────────────────────────────

const NUM_SPECIES = 6;
const PARTICLES_PER_SPECIES = 120;
const TOTAL = NUM_SPECIES * PARTICLES_PER_SPECIES;
const FORCE_RANGE = 80; // max interaction distance in world units
const FRICTION = 0.05; // velocity damping per frame
const DT = 0.02; // time step
const FORCE_SCALE = 5; // overall force multiplier
const MIN_DIST = 4; // minimum distance to avoid singularity

// Each species gets a beautiful saturated color
const SPECIES_COLORS = [
  "#f43f5e", // rose
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#06b6d4", // cyan
];

const SPECIES_COLORS_RGB: [number, number, number][] = [
  [244, 63, 94],
  [59, 130, 246],
  [34, 197, 94],
  [245, 158, 11],
  [168, 85, 247],
  [6, 182, 212],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomMatrix(): number[][] {
  return Array.from({ length: NUM_SPECIES }, () =>
    Array.from({ length: NUM_SPECIES }, () => Math.random() * 2 - 1)
  );
}

/** Curated presets that produce beautiful emergent structures */
const PRESETS: { name: string; matrix: number[][] }[] = [
  {
    name: "Symbiosis",
    matrix: [
      [0.5, 0.3, -0.8, 0.1, -0.3, 0.6],
      [0.3, 0.5, 0.4, -0.7, 0.2, -0.1],
      [-0.8, 0.4, 0.5, 0.3, 0.6, -0.4],
      [0.1, -0.7, 0.3, 0.5, -0.2, 0.8],
      [-0.3, 0.2, 0.6, -0.2, 0.5, 0.3],
      [0.6, -0.1, -0.4, 0.8, 0.3, 0.5],
    ],
  },
  {
    name: "Predator-Prey",
    matrix: [
      [0.1, 0.8, -0.9, 0.0, 0.0, 0.0],
      [-0.9, 0.1, 0.8, 0.0, 0.0, 0.0],
      [0.8, -0.9, 0.1, 0.0, 0.0, 0.0],
      [0.0, 0.0, 0.0, 0.1, 0.8, -0.9],
      [0.0, 0.0, 0.0, -0.9, 0.1, 0.8],
      [0.0, 0.0, 0.0, 0.8, -0.9, 0.1],
    ],
  },
  {
    name: "Clusters",
    matrix: [
      [0.8, -0.5, -0.5, -0.5, -0.5, -0.5],
      [-0.5, 0.8, -0.5, -0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.8, -0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5, 0.8, -0.5, -0.5],
      [-0.5, -0.5, -0.5, -0.5, 0.8, -0.5],
      [-0.5, -0.5, -0.5, -0.5, -0.5, 0.8],
    ],
  },
  {
    name: "Chaos",
    matrix: [
      [-0.1, 0.9, -0.6, 0.7, -0.3, 0.4],
      [0.4, -0.1, 0.9, -0.6, 0.7, -0.3],
      [-0.3, 0.4, -0.1, 0.9, -0.6, 0.7],
      [0.7, -0.3, 0.4, -0.1, 0.9, -0.6],
      [-0.6, 0.7, -0.3, 0.4, -0.1, 0.9],
      [0.9, -0.6, 0.7, -0.3, 0.4, -0.1],
    ],
  },
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function ParticlesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const matrixRef = useRef<number[][]>(randomMatrix());
  const runningRef = useRef(true);
  const animFrameRef = useRef<number>(0);
  const worldSizeRef = useRef(600);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const trailsRef = useRef(true);

  const [running, setRunning] = useState(true);
  const [matrix, setMatrix] = useState<number[][]>(matrixRef.current);
  const [showMatrix, setShowMatrix] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [trails, setTrails] = useState(true);
  const [particleCount, setParticleCount] = useState(TOTAL);

  // Sync refs
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { trailsRef.current = trails; }, [trails]);

  const initParticles = useCallback((worldSize: number) => {
    const ps: Particle[] = [];
    for (let s = 0; s < NUM_SPECIES; s++) {
      for (let i = 0; i < PARTICLES_PER_SPECIES; i++) {
        ps.push({
          x: Math.random() * worldSize,
          y: Math.random() * worldSize,
          vx: 0,
          vy: 0,
          species: s,
        });
      }
    }
    particlesRef.current = ps;
    setParticleCount(ps.length);
  }, []);

  const randomizeMatrix = useCallback(() => {
    const m = randomMatrix();
    matrixRef.current = m;
    setMatrix(m);
  }, []);

  const loadPreset = useCallback((preset: typeof PRESETS[number]) => {
    matrixRef.current = preset.matrix.map(row => [...row]);
    setMatrix(preset.matrix.map(row => [...row]));
  }, []);

  const resetSim = useCallback(() => {
    initParticles(worldSizeRef.current);
    panRef.current = { x: 0, y: 0 };
  }, [initParticles]);

  // Main simulation + rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = canvas!.clientWidth * dpr;
      canvas!.height = canvas!.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // World size is the canvas logical dimension
      worldSizeRef.current = Math.max(canvas!.clientWidth, canvas!.clientHeight);
    }
    resize();
    window.addEventListener("resize", resize);

    if (particlesRef.current.length === 0) {
      initParticles(worldSizeRef.current);
    }

    function tick() {
      animFrameRef.current = requestAnimationFrame(tick);

      const particles = particlesRef.current;
      const mat = matrixRef.current;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      const worldW = worldSizeRef.current;
      const worldH = worldSizeRef.current;
      const z = zoomRef.current;
      const pan = panRef.current;

      // Physics step (only when running)
      if (runningRef.current) {
        for (let i = 0; i < particles.length; i++) {
          let fx = 0, fy = 0;
          const pi = particles[i];

          for (let j = 0; j < particles.length; j++) {
            if (i === j) continue;
            const pj = particles[j];

            // Toroidal distance
            let dx = pj.x - pi.x;
            let dy = pj.y - pi.y;
            if (dx > worldW / 2) dx -= worldW;
            if (dx < -worldW / 2) dx += worldW;
            if (dy > worldH / 2) dy -= worldH;
            if (dy < -worldH / 2) dy += worldH;

            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < MIN_DIST || dist > FORCE_RANGE) continue;

            const attraction = mat[pi.species][pj.species];
            // Force profile: repulsive at very close range, then follows the matrix value
            const t = dist / FORCE_RANGE;
            let force: number;
            if (t < 0.3) {
              // Short-range repulsion blending into attraction
              force = t / 0.3 - 1; // goes from -1 to 0
              force += attraction * (t / 0.3); // blend in attraction
            } else {
              // Attraction/repulsion that fades with distance
              force = attraction * (1 - (t - 0.3) / 0.7);
            }

            force *= FORCE_SCALE;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }

          pi.vx = (pi.vx + fx * DT) * (1 - FRICTION);
          pi.vy = (pi.vy + fy * DT) * (1 - FRICTION);
        }

        // Position update + wrapping
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x = ((p.x + p.vx + worldW) % worldW);
          p.y = ((p.y + p.vy + worldH) % worldH);
        }
      }

      // ─── Render ────────────────────────────────────────────────────
      if (trailsRef.current) {
        ctx.fillStyle = "rgba(10, 10, 10, 0.08)";
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, w, h);
      }

      // Camera transform
      const cx = w / 2 + pan.x;
      const cy = h / 2 + pan.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        // Transform world position to screen position
        const sx = (p.x - worldW / 2) * z + cx;
        const sy = (p.y - worldH / 2) * z + cy;

        // Skip if off-screen (with margin)
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const brightness = Math.min(1, 0.5 + speed * 0.05);
        const radius = (1.8 + speed * 0.08) * z;
        const [r, g, b] = SPECIES_COLORS_RGB[p.species];

        // Glow
        ctx.beginPath();
        ctx.arc(sx, sy, radius * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${brightness * 0.08})`;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${brightness})`;
        ctx.fill();
      }
    }

    tick();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [initParticles]);

  // Mouse drag for panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;
    let lastX = 0, lastY = 0;

    function onDown(e: MouseEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    }
    function onMove(e: MouseEvent) {
      if (!dragging) return;
      panRef.current.x += e.clientX - lastX;
      panRef.current.y += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
    }
    function onUp() { dragging = false; }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(5, zoomRef.current * factor));
      zoomRef.current = newZoom;
      setZoom(newZoom);
    }

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Matrix cell edit handler
  const handleMatrixChange = useCallback((i: number, j: number, val: number) => {
    const m = matrixRef.current.map(row => [...row]);
    m[i][j] = val;
    matrixRef.current = m;
    setMatrix(m);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0a0a0a]">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Top-left HUD */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-white/80 text-xs font-mono space-y-1">
          <div className="text-white/50 uppercase tracking-wider text-[10px] mb-1">Particle Life</div>
          <div>{particleCount} particles · {NUM_SPECIES} species</div>
          <div>Zoom: {zoom.toFixed(1)}x</div>
          <div className="flex items-center gap-1.5">
            Trails
            <button
              onClick={() => setTrails(t => !t)}
              className={`w-7 h-4 rounded-full transition-colors relative ${trails ? "bg-emerald-500" : "bg-white/20"}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${trails ? "left-3.5" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        {/* Species legend */}
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-xs space-y-1">
          {SPECIES_COLORS.map((color, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-white/60 font-mono">Species {i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-2 py-1.5 flex items-center gap-1">
          <button
            onClick={() => setRunning(r => !r)}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title={running ? "Pause" : "Play"}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={randomizeMatrix}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Randomize interactions"
          >
            <Shuffle size={18} />
          </button>
          <button
            onClick={resetSim}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Reset particles"
          >
            <Trash2 size={18} />
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={() => setZoom(z => Math.min(5, z * 1.3))}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.2, z / 1.3))}
            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={18} />
          </button>
          <div className="w-px h-6 bg-white/10" />
          <button
            onClick={() => setShowMatrix(s => !s)}
            className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${showMatrix ? "text-lime-400 bg-lime-400/10" : "text-white/80 hover:text-white hover:bg-white/10"}`}
            title="Toggle interaction matrix"
          >
            <Settings2 size={18} />
          </button>
        </div>

        {/* Preset buttons */}
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-2 py-1.5 flex items-center gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => { loadPreset(preset); resetSim(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Interaction Matrix Panel */}
      {showMatrix && (
        <div className="absolute top-4 right-4 z-10 bg-black/80 backdrop-blur-md rounded-xl p-4 shadow-2xl border border-white/10">
          <div className="text-white/50 uppercase tracking-wider text-[10px] mb-3">Interaction Matrix</div>
          <div className="text-white/40 text-[10px] mb-2">Click & drag cells to adjust attraction (+) / repulsion (−)</div>
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="w-5 h-5" />
                {SPECIES_COLORS.map((c, j) => (
                  <th key={j} className="w-9 h-5 text-center">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={i}>
                  <td className="pr-1">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: SPECIES_COLORS[i] }} />
                  </td>
                  {row.map((val, j) => (
                    <td key={j} className="p-0.5">
                      <MatrixCell value={val} onChange={(v) => handleMatrixChange(i, j, v)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Instructions overlay (fades out) */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white/30 text-xs text-center pointer-events-none animate-fade-out">
        Drag to pan · Scroll to zoom · Shuffle to randomize · Click matrix to tune
      </div>
    </div>
  );
}

// ─── Matrix Cell ─────────────────────────────────────────────────────────────

function MatrixCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const delta = (startY.current - ev.clientY) * 0.01;
      onChange(Math.max(-1, Math.min(1, startVal.current + delta)));
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Color: green for positive (attraction), red for negative (repulsion)
  const intensity = Math.abs(value);
  const r = value < 0 ? Math.round(200 * intensity) : 0;
  const g = value > 0 ? Math.round(200 * intensity) : 0;
  const b = 0;

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-8 h-8 rounded cursor-ns-resize flex items-center justify-center text-[10px] font-mono text-white/80 select-none"
      style={{
        backgroundColor: `rgba(${r},${g},${b},${0.15 + intensity * 0.5})`,
        border: `1px solid rgba(${r || 100},${g || 100},${b || 100},0.3)`,
      }}
      title={`${value.toFixed(2)} — drag up/down to adjust`}
    >
      {value > 0 ? "+" : ""}{value.toFixed(1)}
    </div>
  );
}
