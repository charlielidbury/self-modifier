"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  Trash2,
  Shuffle,
  ChevronDown,
} from "lucide-react";

// ─── Patterns ────────────────────────────────────────────────────────────────

type Pattern = { name: string; cells: [number, number][] };

const PATTERNS: Pattern[] = [
  {
    name: "Glider",
    cells: [
      [0, -1],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ],
  },
  {
    name: "Lightweight Spaceship",
    cells: [
      [0, 0],
      [3, 0],
      [4, 1],
      [0, 2],
      [4, 2],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
    ],
  },
  {
    name: "Pulsar",
    cells: (() => {
      const pts: [number, number][] = [];
      const offsets = [
        [2, 1],
        [3, 1],
        [4, 1],
        [1, 2],
        [1, 3],
        [1, 4],
        [2, 6],
        [3, 6],
        [4, 6],
        [6, 2],
        [6, 3],
        [6, 4],
      ];
      for (const [x, y] of offsets) {
        pts.push([x, y], [-x, y], [x, -y], [-x, -y]);
      }
      return pts;
    })(),
  },
  {
    name: "Gosper Glider Gun",
    cells: [
      [0, 4],
      [0, 5],
      [1, 4],
      [1, 5],
      [10, 4],
      [10, 5],
      [10, 6],
      [11, 3],
      [11, 7],
      [12, 2],
      [12, 8],
      [13, 2],
      [13, 8],
      [14, 5],
      [15, 3],
      [15, 7],
      [16, 4],
      [16, 5],
      [16, 6],
      [17, 5],
      [20, 2],
      [20, 3],
      [20, 4],
      [21, 2],
      [21, 3],
      [21, 4],
      [22, 1],
      [22, 5],
      [24, 0],
      [24, 1],
      [24, 5],
      [24, 6],
      [34, 2],
      [34, 3],
      [35, 2],
      [35, 3],
    ],
  },
  {
    name: "R-pentomino",
    cells: [
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 1],
      [1, 2],
    ],
  },
  {
    name: "Diehard",
    cells: [
      [0, 1],
      [1, 1],
      [1, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [6, 2],
    ],
  },
  {
    name: "Acorn",
    cells: [
      [0, 2],
      [1, 0],
      [1, 2],
      [3, 1],
      [4, 2],
      [5, 2],
      [6, 2],
    ],
  },
];

// ─── Grid helpers ────────────────────────────────────────────────────────────

type Grid = Set<string>;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function parseKey(k: string): [number, number] {
  const [x, y] = k.split(",").map(Number);
  return [x, y];
}

function step(grid: Grid): Grid {
  const neighborCounts = new Map<string, number>();
  for (const k of grid) {
    const [cx, cy] = parseKey(k);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nk = key(cx + dx, cy + dy);
        neighborCounts.set(nk, (neighborCounts.get(nk) ?? 0) + 1);
      }
    }
  }
  const next: Grid = new Set();
  for (const [k, count] of neighborCounts) {
    if (count === 3 || (count === 2 && grid.has(k))) {
      next.add(k);
    }
  }
  return next;
}

function randomGrid(width: number, height: number, density = 0.2): Grid {
  const grid: Grid = new Set();
  const hw = Math.floor(width / 2);
  const hh = Math.floor(height / 2);
  for (let y = -hh; y < hh; y++) {
    for (let x = -hw; x < hw; x++) {
      if (Math.random() < density) grid.add(key(x, y));
    }
  }
  return grid;
}

function placePattern(
  pattern: Pattern,
  cx: number,
  cy: number,
  grid: Grid
): Grid {
  const next = new Set(grid);
  for (const [dx, dy] of pattern.cells) {
    next.add(key(cx + dx, cy + dy));
  }
  return next;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function getCellColor(age: number, isDark: boolean): string {
  // Age-based color: newer cells are brighter, older cells glow deeper
  const t = Math.min(age / 30, 1);
  if (isDark) {
    // Cyan → Teal gradient in dark mode
    const r = Math.round(20 + t * 10);
    const g = Math.round(230 - t * 60);
    const b = Math.round(220 - t * 30);
    return `rgb(${r},${g},${b})`;
  } else {
    // Teal → Dark teal in light mode
    const r = Math.round(10 + t * 20);
    const g = Math.round(180 - t * 50);
    const b = Math.round(170 - t * 30);
    return `rgb(${r},${g},${b})`;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

const CELL_SIZE = 12;
const SPEEDS = [
  { label: "Slow", ms: 300 },
  { label: "Normal", ms: 120 },
  { label: "Fast", ms: 50 },
  { label: "Blazing", ms: 16 },
];

export default function LifePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const gridRef = useRef<Grid>(new Set());
  const agesRef = useRef<Map<string, number>>(new Map());
  const [generation, setGeneration] = useState(0);
  const [population, setPopulation] = useState(0);
  const [running, setRunning] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [showPatterns, setShowPatterns] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);

  // Camera (pan)
  const cameraRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef<{
    type: "pan" | "draw" | "erase";
    lastX: number;
    lastY: number;
  } | null>(null);

  const isDarkRef = useRef(false);

  // Detect dark mode
  useEffect(() => {
    const check = () => {
      isDarkRef.current =
        document.documentElement.classList.contains("dark");
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  // ── Rendering ────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cam = cameraRef.current;
    const isDark = isDarkRef.current;

    // Clear
    ctx.fillStyle = isDark ? "#0c0c0c" : "#fafafa";
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    const offsetX = (w / 2 + cam.x * CELL_SIZE) % CELL_SIZE;
    const offsetY = (h / 2 + cam.y * CELL_SIZE) % CELL_SIZE;

    ctx.strokeStyle = isDark
      ? "rgba(255,255,255,0.04)"
      : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = offsetX; x < w; x += CELL_SIZE) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = offsetY; y < h; y += CELL_SIZE) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Cells
    const grid = gridRef.current;
    const ages = agesRef.current;
    const halfW = w / 2;
    const halfH = h / 2;

    for (const k of grid) {
      const [cx, cy] = parseKey(k);
      const px = halfW + (cx + cam.x) * CELL_SIZE;
      const py = halfH + (cy + cam.y) * CELL_SIZE;

      // Skip if off-screen
      if (
        px + CELL_SIZE < 0 ||
        px > w ||
        py + CELL_SIZE < 0 ||
        py > h
      )
        continue;

      const age = ages.get(k) ?? 0;
      ctx.fillStyle = getCellColor(age, isDark);

      // Slightly rounded cells with a 1px gap
      const gap = 0.5;
      const radius = 2;
      const sx = px + gap;
      const sy = py + gap;
      const sw = CELL_SIZE - gap * 2;
      const sh = CELL_SIZE - gap * 2;

      ctx.beginPath();
      ctx.moveTo(sx + radius, sy);
      ctx.lineTo(sx + sw - radius, sy);
      ctx.quadraticCurveTo(sx + sw, sy, sx + sw, sy + radius);
      ctx.lineTo(sx + sw, sy + sh - radius);
      ctx.quadraticCurveTo(sx + sw, sy + sh, sx + sw - radius, sy + sh);
      ctx.lineTo(sx + radius, sy + sh);
      ctx.quadraticCurveTo(sx, sy + sh, sx, sy + sh - radius);
      ctx.lineTo(sx, sy + radius);
      ctx.quadraticCurveTo(sx, sy, sx + radius, sy);
      ctx.closePath();
      ctx.fill();

      // Subtle glow for young cells
      if (age < 3) {
        ctx.shadowColor = isDark
          ? "rgba(20,230,220,0.3)"
          : "rgba(10,180,170,0.2)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }
    }
  }, []);

  // ── Canvas sizing ────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      // For rendering, use CSS dimensions
      canvas.width = rect.width;
      canvas.height = rect.height;
      render();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  // ── Simulation loop ──────────────────────────────────────────────────────

  const runningRef = useRef(running);
  runningRef.current = running;
  const speedRef = useRef(SPEEDS[speedIdx].ms);
  speedRef.current = SPEEDS[speedIdx].ms;

  useEffect(() => {
    if (!running) return;

    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const prev = gridRef.current;
      const next = step(prev);
      // Update ages
      const newAges = new Map<string, number>();
      for (const k of next) {
        newAges.set(k, (agesRef.current.get(k) ?? -1) + 1);
      }
      agesRef.current = newAges;
      gridRef.current = next;
      setGeneration((g) => g + 1);
      setPopulation(next.size);
      render();
      if (runningRef.current) {
        timeout = setTimeout(tick, speedRef.current);
      }
    };
    timeout = setTimeout(tick, speedRef.current);
    return () => clearTimeout(timeout);
  }, [running, render]);

  // ── Mouse interaction ────────────────────────────────────────────────────

  const screenToGrid = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const gx = Math.floor(
        (px - rect.width / 2) / CELL_SIZE - cam.x
      );
      const gy = Math.floor(
        (py - rect.height / 2) / CELL_SIZE - cam.y
      );
      return [gx, gy];
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click or right-click → pan
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        draggingRef.current = { type: "pan", lastX: e.clientX, lastY: e.clientY };
        return;
      }

      // If a pattern is selected, place it
      if (selectedPattern) {
        const [gx, gy] = screenToGrid(e.clientX, e.clientY);
        gridRef.current = placePattern(
          selectedPattern,
          gx,
          gy,
          gridRef.current
        );
        setPopulation(gridRef.current.size);
        render();
        return;
      }

      // Left-click → draw or erase
      if (e.button === 0) {
        // If shift is held, pan instead
        if (e.shiftKey) {
          draggingRef.current = { type: "pan", lastX: e.clientX, lastY: e.clientY };
          return;
        }
        const [gx, gy] = screenToGrid(e.clientX, e.clientY);
        const k = key(gx, gy);
        const isAlive = gridRef.current.has(k);
        if (isAlive) {
          gridRef.current.delete(k);
          agesRef.current.delete(k);
          draggingRef.current = { type: "erase", lastX: e.clientX, lastY: e.clientY };
        } else {
          gridRef.current.add(k);
          agesRef.current.set(k, 0);
          draggingRef.current = { type: "draw", lastX: e.clientX, lastY: e.clientY };
        }
        setPopulation(gridRef.current.size);
        render();
      }
    },
    [screenToGrid, selectedPattern, render]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;

      if (drag.type === "pan") {
        const dx = (e.clientX - drag.lastX) / CELL_SIZE;
        const dy = (e.clientY - drag.lastY) / CELL_SIZE;
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        render();
        return;
      }

      const [gx, gy] = screenToGrid(e.clientX, e.clientY);
      const k = key(gx, gy);
      if (drag.type === "draw" && !gridRef.current.has(k)) {
        gridRef.current.add(k);
        agesRef.current.set(k, 0);
        setPopulation(gridRef.current.size);
        render();
      } else if (drag.type === "erase" && gridRef.current.has(k)) {
        gridRef.current.delete(k);
        agesRef.current.delete(k);
        setPopulation(gridRef.current.size);
        render();
      }
    },
    [screenToGrid, render]
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === " " || e.key === "p") {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === "s" || e.key === ".") {
        e.preventDefault();
        // Step once
        const next = step(gridRef.current);
        const newAges = new Map<string, number>();
        for (const k of next) {
          newAges.set(k, (agesRef.current.get(k) ?? -1) + 1);
        }
        agesRef.current = newAges;
        gridRef.current = next;
        setGeneration((g) => g + 1);
        setPopulation(next.size);
        render();
      } else if (e.key === "c") {
        // Clear
        gridRef.current = new Set();
        agesRef.current = new Map();
        cameraRef.current = { x: 0, y: 0 };
        setGeneration(0);
        setPopulation(0);
        setRunning(false);
        render();
      } else if (e.key === "r") {
        // Random
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = Math.ceil(canvas.width / CELL_SIZE);
        const h = Math.ceil(canvas.height / CELL_SIZE);
        const grid = randomGrid(w, h, 0.15);
        gridRef.current = grid;
        agesRef.current = new Map();
        cameraRef.current = { x: 0, y: 0 };
        setGeneration(0);
        setPopulation(grid.size);
        render();
      } else if (e.key === "Escape") {
        setSelectedPattern(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [render]);

  // ── Context menu prevention on canvas ────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Scroll to zoom (not implemented, keeping it simple) ─────────────────

  // ── Init with a nice pattern ─────────────────────────────────────────────

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    // Start with a R-pentomino — a classic that explodes beautifully
    const pattern = PATTERNS.find((p) => p.name === "R-pentomino")!;
    gridRef.current = placePattern(pattern, 0, 0, new Set());
    agesRef.current = new Map();
    setPopulation(gridRef.current.size);
    render();
  }, [render]);

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Toolbar */}
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm z-10 flex-wrap">
        {/* Play / Pause */}
        <button
          onClick={() => setRunning((r) => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-teal-500/15 text-teal-700 dark:text-teal-300 hover:bg-teal-500/25 transition-colors"
          title={running ? "Pause (Space)" : "Play (Space)"}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          <span className="hidden sm:inline">
            {running ? "Pause" : "Play"}
          </span>
        </button>

        {/* Step */}
        <button
          onClick={() => {
            const next = step(gridRef.current);
            const newAges = new Map<string, number>();
            for (const k of next) {
              newAges.set(k, (agesRef.current.get(k) ?? -1) + 1);
            }
            agesRef.current = newAges;
            gridRef.current = next;
            setGeneration((g) => g + 1);
            setPopulation(next.size);
            render();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          title="Step (S or .)"
        >
          <SkipForward size={14} />
          <span className="hidden sm:inline">Step</span>
        </button>

        {/* Speed */}
        <div className="flex items-center gap-1 border-l border-border/60 pl-2 ml-1">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Speed:
          </span>
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setSpeedIdx(i)}
              className={[
                "px-2 py-1 rounded text-xs transition-colors",
                i === speedIdx
                  ? "bg-teal-500/20 text-teal-700 dark:text-teal-300 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="border-l border-border/60 h-5 ml-1" />

        {/* Patterns dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPatterns((p) => !p)}
            className={[
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              selectedPattern
                ? "bg-teal-500/20 text-teal-700 dark:text-teal-300"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
            ].join(" ")}
          >
            Patterns
            <ChevronDown
              size={12}
              className={`transition-transform ${showPatterns ? "rotate-180" : ""}`}
            />
          </button>
          {showPatterns && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowPatterns(false)}
              />
              <div className="absolute top-full left-0 mt-1 w-52 rounded-lg border border-border bg-popover shadow-xl z-30 py-1 overflow-hidden">
                <button
                  onClick={() => {
                    setSelectedPattern(null);
                    setShowPatterns(false);
                  }}
                  className={[
                    "w-full text-left px-3 py-2 text-sm transition-colors",
                    !selectedPattern
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/80 hover:bg-accent/50",
                  ].join(" ")}
                >
                  Freehand Draw
                </button>
                {PATTERNS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      setSelectedPattern(p);
                      setShowPatterns(false);
                    }}
                    className={[
                      "w-full text-left px-3 py-2 text-sm transition-colors",
                      selectedPattern?.name === p.name
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/80 hover:bg-accent/50",
                    ].join(" ")}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Random */}
        <button
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const w = Math.ceil(canvas.width / CELL_SIZE);
            const h = Math.ceil(canvas.height / CELL_SIZE);
            const grid = randomGrid(w, h, 0.15);
            gridRef.current = grid;
            agesRef.current = new Map();
            cameraRef.current = { x: 0, y: 0 };
            setGeneration(0);
            setPopulation(grid.size);
            setRunning(false);
            render();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          title="Random (R)"
        >
          <Shuffle size={14} />
          <span className="hidden sm:inline">Random</span>
        </button>

        {/* Clear */}
        <button
          onClick={() => {
            gridRef.current = new Set();
            agesRef.current = new Map();
            cameraRef.current = { x: 0, y: 0 };
            setGeneration(0);
            setPopulation(0);
            setRunning(false);
            render();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          title="Clear (C)"
        >
          <Trash2 size={14} />
          <span className="hidden sm:inline">Clear</span>
        </button>

        {/* Stats (pushed right) */}
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
          <span>
            Gen{" "}
            <span className="font-mono text-foreground font-medium">
              {generation.toLocaleString()}
            </span>
          </span>
          <span>
            Pop{" "}
            <span className="font-mono text-foreground font-medium">
              {population.toLocaleString()}
            </span>
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{ cursor: selectedPattern ? "crosshair" : "default" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />

        {/* Selected pattern indicator */}
        {selectedPattern && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-popover/90 border border-border shadow-lg text-sm backdrop-blur-sm">
            <span className="text-muted-foreground">Placing:</span>
            <span className="font-medium text-teal-700 dark:text-teal-300">
              {selectedPattern.name}
            </span>
            <button
              onClick={() => setSelectedPattern(null)}
              className="text-muted-foreground hover:text-foreground text-xs ml-1"
            >
              (Esc to cancel)
            </button>
          </div>
        )}

        {/* Hint overlay when empty */}
        {population === 0 && generation === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-2 text-muted-foreground/50">
              <p className="text-lg font-medium">Click to draw cells</p>
              <p className="text-sm">
                or press <kbd className="font-mono px-1 py-0.5 rounded border border-border/40 bg-muted/30 text-xs">R</kbd> for random,{" "}
                <kbd className="font-mono px-1 py-0.5 rounded border border-border/40 bg-muted/30 text-xs">Space</kbd> to play
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
