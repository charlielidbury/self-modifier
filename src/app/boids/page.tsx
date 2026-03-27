"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Boid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}

interface Attractor {
  x: number;
  y: number;
  strength: number; // positive = attract, negative = repel
  life: number;     // frames remaining
}

// ── Constants ──────────────────────────────────────────────────────────────────

const BOID_COUNT = 600;
const BOID_SIZE = 4;
const MAX_SPEED = 3.5;
const MIN_SPEED = 1.2;
const TRAIL_ALPHA = 0.08;

// ── Spatial hashing for O(n) neighbor lookups ──────────────────────────────────

class SpatialGrid {
  private cellSize: number;
  private cells: Map<number, number[]> = new Map();
  private width: number = 0;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear(canvasWidth: number) {
    this.cells.clear();
    this.width = Math.ceil(canvasWidth / this.cellSize) + 1;
  }

  insert(index: number, x: number, y: number) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const key = cy * this.width + cx;
    const cell = this.cells.get(key);
    if (cell) {
      cell.push(index);
    } else {
      this.cells.set(key, [index]);
    }
  }

  getNeighborIndices(x: number, y: number): number[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = (cy + dy) * this.width + (cx + dx);
        const cell = this.cells.get(key);
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            result.push(cell[i]);
          }
        }
      }
    }
    return result;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BoidsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const boidsRef = useRef<Boid[]>([]);
  const attractorsRef = useRef<Attractor[]>([]);
  const gridRef = useRef(new SpatialGrid(60));
  const rafRef = useRef(0);
  const pausedRef = useRef(false);
  const trailRef = useRef(true);

  // Tunable parameters
  const [separation, setSeparation] = useState(1.8);
  const [alignment, setAlignment] = useState(1.0);
  const [cohesion, setCohesion] = useState(0.8);
  const [perceptionRadius, setPerceptionRadius] = useState(55);
  const [count, setCount] = useState(BOID_COUNT);
  const [paused, setPaused] = useState(false);
  const [trails, setTrails] = useState(true);
  const [showPanel, setShowPanel] = useState(true);

  // Refs for animation loop access
  const separationRef = useRef(separation);
  const alignmentRef = useRef(alignment);
  const cohesionRef = useRef(cohesion);
  const radiusRef = useRef(perceptionRadius);
  separationRef.current = separation;
  alignmentRef.current = alignment;
  cohesionRef.current = cohesion;
  radiusRef.current = perceptionRadius;

  // Initialize boids
  const initBoids = useCallback((n: number, w: number, h: number) => {
    const boids: Boid[] = [];
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
      boids.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        hue: (i / n) * 360,
      });
    }
    boidsRef.current = boids;
  }, []);

  // Main simulation step
  const step = useCallback((w: number, h: number) => {
    const boids = boidsRef.current;
    const attractors = attractorsRef.current;
    const grid = gridRef.current;
    const sep = separationRef.current;
    const ali = alignmentRef.current;
    const coh = cohesionRef.current;
    const radius = radiusRef.current;
    const radiusSq = radius * radius;
    const separationDist = radius * 0.4;
    const separationDistSq = separationDist * separationDist;

    // Rebuild spatial grid
    grid.clear(w);
    for (let i = 0; i < boids.length; i++) {
      grid.insert(i, boids[i].x, boids[i].y);
    }

    // Compute forces for each boid
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const neighbors = grid.getNeighborIndices(b.x, b.y);

      let sepX = 0, sepY = 0;
      let aliVX = 0, aliVY = 0;
      let cohX = 0, cohY = 0;
      let nCount = 0;
      let sCount = 0;

      for (let j = 0; j < neighbors.length; j++) {
        const ni = neighbors[j];
        if (ni === i) continue;
        const other = boids[ni];
        const dx = other.x - b.x;
        const dy = other.y - b.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < radiusSq && distSq > 0) {
          nCount++;
          aliVX += other.vx;
          aliVY += other.vy;
          cohX += other.x;
          cohY += other.y;

          if (distSq < separationDistSq) {
            const dist = Math.sqrt(distSq);
            sepX -= (dx / dist) * (separationDist - dist) / separationDist;
            sepY -= (dy / dist) * (separationDist - dist) / separationDist;
            sCount++;
          }
        }
      }

      let ax = 0, ay = 0;

      if (nCount > 0) {
        // Alignment: steer towards average heading
        aliVX /= nCount;
        aliVY /= nCount;
        const aliMag = Math.sqrt(aliVX * aliVX + aliVY * aliVY);
        if (aliMag > 0) {
          ax += (aliVX / aliMag * MAX_SPEED - b.vx) * ali * 0.05;
          ay += (aliVY / aliMag * MAX_SPEED - b.vy) * ali * 0.05;
        }

        // Cohesion: steer towards average position
        cohX /= nCount;
        cohY /= nCount;
        const cdx = cohX - b.x;
        const cdy = cohY - b.y;
        const cohMag = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cohMag > 0) {
          ax += (cdx / cohMag * MAX_SPEED - b.vx) * coh * 0.03;
          ay += (cdy / cohMag * MAX_SPEED - b.vy) * coh * 0.03;
        }
      }

      if (sCount > 0) {
        // Separation: steer away from close neighbors
        const sMag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (sMag > 0) {
          ax += (sepX / sMag * MAX_SPEED - b.vx) * sep * 0.08;
          ay += (sepY / sMag * MAX_SPEED - b.vy) * sep * 0.08;
        }
      }

      // Attractor forces
      for (let a = 0; a < attractors.length; a++) {
        const att = attractors[a];
        const adx = att.x - b.x;
        const ady = att.y - b.y;
        const adist = Math.sqrt(adx * adx + ady * ady);
        if (adist > 1 && adist < 300) {
          const force = (att.strength * 150) / (adist * adist);
          ax += (adx / adist) * force;
          ay += (ady / adist) * force;
        }
      }

      // Apply forces
      b.vx += ax;
      b.vy += ay;

      // Clamp speed
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > MAX_SPEED) {
        b.vx = (b.vx / speed) * MAX_SPEED;
        b.vy = (b.vy / speed) * MAX_SPEED;
      } else if (speed < MIN_SPEED) {
        b.vx = (b.vx / speed) * MIN_SPEED;
        b.vy = (b.vy / speed) * MIN_SPEED;
      }

      // Update position with wrapping
      b.x = (b.x + b.vx + w) % w;
      b.y = (b.y + b.vy + h) % h;

      // Slowly rotate hue based on velocity angle for beautiful color flow
      const targetHue = ((Math.atan2(b.vy, b.vx) / Math.PI + 1) * 180);
      b.hue = b.hue + (targetHue - b.hue) * 0.02;
      if (b.hue < 0) b.hue += 360;
      if (b.hue >= 360) b.hue -= 360;
    }

    // Decay attractors
    for (let a = attractors.length - 1; a >= 0; a--) {
      attractors[a].life--;
      if (attractors[a].life <= 0) {
        attractors.splice(a, 1);
      }
    }
  }, []);

  // Render
  const render = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const boids = boidsRef.current;
    const attractors = attractorsRef.current;

    // Trail effect
    if (trailRef.current) {
      ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
    }

    // Draw attractors
    for (let a = 0; a < attractors.length; a++) {
      const att = attractors[a];
      const alpha = Math.min(1, att.life / 30);
      const r = 8 + (1 - att.life / 180) * 20;
      ctx.beginPath();
      ctx.arc(att.x, att.y, r, 0, Math.PI * 2);
      if (att.strength > 0) {
        ctx.fillStyle = `rgba(100, 255, 180, ${alpha * 0.15})`;
        ctx.strokeStyle = `rgba(100, 255, 180, ${alpha * 0.6})`;
      } else {
        ctx.fillStyle = `rgba(255, 100, 100, ${alpha * 0.15})`;
        ctx.strokeStyle = `rgba(255, 100, 100, ${alpha * 0.6})`;
      }
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw boids as directional triangles
    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      const angle = Math.atan2(b.vy, b.vx);
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const speedRatio = (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
      const saturation = 70 + speedRatio * 30;
      const lightness = 55 + speedRatio * 15;

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);

      const s = BOID_SIZE + speedRatio * 2;

      ctx.beginPath();
      ctx.moveTo(s * 1.5, 0);
      ctx.lineTo(-s, s * 0.7);
      ctx.lineTo(-s * 0.5, 0);
      ctx.lineTo(-s, -s * 0.7);
      ctx.closePath();

      ctx.fillStyle = `hsla(${b.hue}, ${saturation}%, ${lightness}%, 0.9)`;
      ctx.fill();

      ctx.restore();
    }
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w: rect.width, h: rect.height };
    };

    let { w, h } = resize();

    // Initialize
    initBoids(count, w, h);

    // Clear canvas to black
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const onResize = () => {
      const dims = resize();
      w = dims.w;
      h = dims.h;
    };
    window.addEventListener("resize", onResize);

    function loop() {
      if (!pausedRef.current) {
        step(w, h);
        render(ctx!, w, h);
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [count, initBoids, step, render]);

  // Sync refs
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { trailRef.current = trails; }, [trails]);

  // Mouse interaction: left = attract, right = repel
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isRepel = e.button === 2 || e.shiftKey;
    attractorsRef.current.push({
      x, y,
      strength: isRepel ? -1.5 : 1.5,
      life: 180,
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    attractorsRef.current.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      strength: -1.5,
      life: 180,
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") {
        e.preventDefault();
        setPaused(p => !p);
      } else if (e.key === "t" || e.key === "T") {
        setTrails(t => !t);
      } else if (e.key === "h" || e.key === "H") {
        setShowPanel(p => !p);
      } else if (e.key === "r" || e.key === "R") {
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          initBoids(count, rect.width, rect.height);
          attractorsRef.current = [];
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [count, initBoids]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      />

      {/* Controls panel */}
      {showPanel && (
        <div
          className="absolute top-4 left-4 z-10 w-64 rounded-xl border border-white/10 bg-black/70 backdrop-blur-xl p-4 text-white text-sm space-y-4"
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          <div>
            <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5" />
                <path d="m9 12 3-3 3 3" />
                <path d="M21 12h-9" />
              </svg>
              Boids Flocking
            </h2>
            <p className="text-white/50 text-xs">
              Emergent flocking from three simple rules
            </p>
          </div>

          {/* Separation */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/70">Separation</span>
              <span className="tabular-nums text-white/50">{separation.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="4"
              step="0.1"
              value={separation}
              onChange={e => setSeparation(parseFloat(e.target.value))}
              className="w-full accent-rose-400 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>

          {/* Alignment */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/70">Alignment</span>
              <span className="tabular-nums text-white/50">{alignment.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="4"
              step="0.1"
              value={alignment}
              onChange={e => setAlignment(parseFloat(e.target.value))}
              className="w-full accent-sky-400 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>

          {/* Cohesion */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/70">Cohesion</span>
              <span className="tabular-nums text-white/50">{cohesion.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="4"
              step="0.1"
              value={cohesion}
              onChange={e => setCohesion(parseFloat(e.target.value))}
              className="w-full accent-emerald-400 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>

          {/* Perception Radius */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/70">Perception</span>
              <span className="tabular-nums text-white/50">{perceptionRadius}px</span>
            </div>
            <input
              type="range"
              min="20"
              max="120"
              step="5"
              value={perceptionRadius}
              onChange={e => setPerceptionRadius(parseInt(e.target.value))}
              className="w-full accent-amber-400 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>

          {/* Count */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/70">Boid Count</span>
              <span className="tabular-nums text-white/50">{count}</span>
            </div>
            <input
              type="range"
              min="50"
              max="2000"
              step="50"
              value={count}
              onChange={e => setCount(parseInt(e.target.value))}
              className="w-full accent-violet-400 h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
            />
          </div>

          {/* Toggle buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setPaused(p => !p)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition text-xs font-medium"
            >
              {paused ? "▶ Play" : "⏸ Pause"}
            </button>
            <button
              onClick={() => setTrails(t => !t)}
              className={`flex-1 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                trails ? "bg-white/20 text-white" : "bg-white/5 text-white/50"
              }`}
            >
              Trails
            </button>
            <button
              onClick={() => {
                const canvas = canvasRef.current;
                if (canvas) {
                  const rect = canvas.getBoundingClientRect();
                  initBoids(count, rect.width, rect.height);
                  attractorsRef.current = [];
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition text-xs font-medium"
            >
              ↻
            </button>
          </div>

          {/* Instructions */}
          <div className="text-[10px] text-white/30 space-y-0.5 pt-1 border-t border-white/5">
            <p><kbd className="text-white/50">Click</kbd> to attract · <kbd className="text-white/50">Right-click</kbd> to repel</p>
            <p><kbd className="text-white/50">Space</kbd> pause · <kbd className="text-white/50">T</kbd> trails · <kbd className="text-white/50">R</kbd> reset · <kbd className="text-white/50">H</kbd> hide</p>
          </div>
        </div>
      )}

      {/* Minimal hint when panel is hidden */}
      {!showPanel && (
        <div className="absolute top-4 left-4 z-10 text-white/30 text-xs">
          Press <kbd className="text-white/50">H</kbd> for controls
        </div>
      )}

      {/* Paused indicator */}
      {paused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20 text-4xl font-bold pointer-events-none select-none">
          PAUSED
        </div>
      )}
    </div>
  );
}
