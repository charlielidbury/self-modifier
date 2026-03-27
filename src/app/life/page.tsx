"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  Trash2,
  Shuffle,
  ChevronDown,
  Maximize,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// ─── Patterns ────────────────────────────────────────────────────────────────

type Pattern = {
  name: string;
  cells: [number, number][];
  category?: string;
};

const PATTERNS: Pattern[] = [
  // ── Small classics ──
  {
    name: "Glider",
    category: "Classic",
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
    category: "Classic",
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
    category: "Classic",
    cells: (() => {
      const pts: [number, number][] = [];
      const offsets: [number, number][] = [
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
    name: "R-pentomino",
    category: "Classic",
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
    category: "Classic",
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
    category: "Classic",
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

  // ── Guns ──
  {
    name: "Gosper Glider Gun",
    category: "Guns",
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
    name: "Simkin Glider Gun",
    category: "Guns",
    cells: [
      // Left block pair
      [0, 0], [1, 0], [0, 1], [1, 1],
      [4, 2], [5, 2], [4, 3], [5, 3],
      [7, 0], [8, 0], [7, 1], [8, 1],
      // Core
      [21, 8], [21, 9], [22, 8], [22, 9],
      [20, 10], [19, 11], [19, 12], [20, 13],
      [23, 10], [24, 11], [24, 12], [23, 13],
      [21, 14], [22, 14],
      // Right part
      [28, 12], [29, 12], [28, 13], [29, 13],
      [30, 10], [30, 14],
      [31, 10], [31, 14],
      [32, 11], [32, 13],
      [33, 12],
    ],
  },

  // ── Big Organisms ──
  {
    name: "Copperhead (c/10 ship)",
    category: "Spaceships",
    cells: [
      // Copperhead spaceship - c/10 orthogonal
      [1, 0], [2, 0],
      [0, 1], [3, 1],
      [0, 3], [3, 3],
      [1, 5], [2, 5],
      [1, 6], [2, 6],
      [0, 7], [3, 7],
      [0, 9], [3, 9],
      [1, 10], [2, 10],
      [1, 11], [2, 11],
    ],
  },
  {
    name: "Heavyweight Spaceship",
    category: "Spaceships",
    cells: [
      [0, 1], [0, 3],
      [1, 0],
      [2, 0],
      [3, 0], [3, 3],
      [4, 0],
      [5, 0],
      [6, 0], [6, 1], [6, 2],
    ],
  },

  // ── Large Organisms & Systems ──
  {
    name: "Puffer Train",
    category: "Large Systems",
    cells: (() => {
      // A puffer that leaves behind blinkers - based on the classic B-heptomino puffer
      // This is a puffer 1 variant
      const c: [number, number][] = [
        // LWSS in the middle
        [0, 0], [3, 0],
        [4, 1],
        [0, 2], [4, 2],
        [1, 3], [2, 3], [3, 3], [4, 3],
        // B-heptomino escort top
        [0, -6], [1, -6], [2, -6], [3, -6], [4, -6],
        [0, -7], [4, -7],
        [4, -8],
        [0, -9], [3, -9],
        // B-heptomino escort bottom
        [0, 9], [1, 9], [2, 9], [3, 9], [4, 9],
        [0, 10], [4, 10],
        [4, 11],
        [0, 12], [3, 12],
      ];
      return c;
    })(),
  },
  {
    name: "Lidka (Methuselah)",
    category: "Large Systems",
    cells: [
      // Lidka - a methuselah that stabilizes after 29,000+ generations
      // with a final population of ~1,500
      [0, 0], [1, 0],
      [0, 1],
      [3, 1],
      [4, 2], [5, 2],
      [4, 3],
    ],
  },
  {
    name: "Glider Factory (4 Guns)",
    category: "Large Systems",
    cells: (() => {
      // 4 Gosper Glider Guns arranged to produce streams in 4 directions
      const gun: [number, number][] = [
        [0, 4], [0, 5], [1, 4], [1, 5],
        [10, 4], [10, 5], [10, 6],
        [11, 3], [11, 7],
        [12, 2], [12, 8],
        [13, 2], [13, 8],
        [14, 5],
        [15, 3], [15, 7],
        [16, 4], [16, 5], [16, 6],
        [17, 5],
        [20, 2], [20, 3], [20, 4],
        [21, 2], [21, 3], [21, 4],
        [22, 1], [22, 5],
        [24, 0], [24, 1], [24, 5], [24, 6],
        [34, 2], [34, 3], [35, 2], [35, 3],
      ];

      const all: [number, number][] = [];
      // Gun 1: original orientation, top-left area
      for (const [x, y] of gun) all.push([x - 50, y - 30]);
      // Gun 2: mirrored horizontally, top-right area
      for (const [x, y] of gun) all.push([-x + 50, y - 30]);
      // Gun 3: mirrored vertically, bottom-left area
      for (const [x, y] of gun) all.push([x - 50, -y + 30]);
      // Gun 4: mirrored both, bottom-right area
      for (const [x, y] of gun) all.push([-x + 50, -y + 30]);

      return all;
    })(),
  },
  {
    name: "Infinite Growth",
    category: "Large Systems",
    cells: (() => {
      // 10-cell infinite growth pattern
      const c: [number, number][] = [
        [0, 0], [2, 0], [2, 1],
        [4, 2], [4, 3], [4, 4],
        [6, 3], [6, 4], [6, 5],
        [7, 4],
      ];
      return c;
    })(),
  },
  {
    name: "Garden of Eden Soup",
    category: "Large Systems",
    cells: (() => {
      // Large random-ish soup in a 80x80 region that produces amazing complexity
      const cells: [number, number][] = [];
      // Use a seeded pseudo-random for determinism
      let seed = 42;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return (seed >> 16) / 32768;
      };
      for (let y = -40; y < 40; y++) {
        for (let x = -40; x < 40; x++) {
          if (rand() < 0.37) cells.push([x, y]);
        }
      }
      return cells;
    })(),
  },

  // ── Logic Gates ──
  {
    name: "NOT Gate (Inverter)",
    category: "Logic Gates",
    cells: (() => {
      // A NOT gate using a glider gun as clock and a perpendicular input stream
      // The Gosper gun produces a constant stream. An incoming glider annihilates
      // one output glider, producing logical NOT.
      // Clock gun (Gosper)
      const gun: [number, number][] = [
        [0, 4], [0, 5], [1, 4], [1, 5],
        [10, 4], [10, 5], [10, 6],
        [11, 3], [11, 7],
        [12, 2], [12, 8],
        [13, 2], [13, 8],
        [14, 5],
        [15, 3], [15, 7],
        [16, 4], [16, 5], [16, 6],
        [17, 5],
        [20, 2], [20, 3], [20, 4],
        [21, 2], [21, 3], [21, 4],
        [22, 1], [22, 5],
        [24, 0], [24, 1], [24, 5], [24, 6],
        [34, 2], [34, 3], [35, 2], [35, 3],
      ];
      const all: [number, number][] = [];
      // Signal gun (fires to the right)
      for (const [x, y] of gun) all.push([x, y]);
      // Second gun perpendicular (fires downward) - acts as input signal
      // Offset to create collision at a specific point
      for (const [x, y] of gun) all.push([y + 40, -x + 20]);
      // Eater to consume unwanted debris
      all.push([50, 15], [50, 16], [51, 16], [52, 17], [52, 18], [52, 19], [53, 19]);
      return all;
    })(),
  },
  {
    name: "AND Gate (Dual Guns)",
    category: "Logic Gates",
    cells: (() => {
      // Two glider guns whose streams collide - only when both signals present
      // do gliders pass through via specific collision geometry
      const gun: [number, number][] = [
        [0, 4], [0, 5], [1, 4], [1, 5],
        [10, 4], [10, 5], [10, 6],
        [11, 3], [11, 7],
        [12, 2], [12, 8],
        [13, 2], [13, 8],
        [14, 5],
        [15, 3], [15, 7],
        [16, 4], [16, 5], [16, 6],
        [17, 5],
        [20, 2], [20, 3], [20, 4],
        [21, 2], [21, 3], [21, 4],
        [22, 1], [22, 5],
        [24, 0], [24, 1], [24, 5], [24, 6],
        [34, 2], [34, 3], [35, 2], [35, 3],
      ];
      const all: [number, number][] = [];
      // Gun A - fires right
      for (const [x, y] of gun) all.push([x - 20, y - 25]);
      // Gun B - fires right (offset to create parallel stream)
      for (const [x, y] of gun) all.push([x - 20, y + 25]);
      // Gun C - perpendicular clock signal (fires down)
      for (const [x, y] of gun) all.push([y + 30, -x - 10]);
      return all;
    })(),
  },
  {
    name: "OR Gate (Merge Streams)",
    category: "Logic Gates",
    cells: (() => {
      // Two glider guns at different angles whose outputs merge into one stream
      const gun: [number, number][] = [
        [0, 4], [0, 5], [1, 4], [1, 5],
        [10, 4], [10, 5], [10, 6],
        [11, 3], [11, 7],
        [12, 2], [12, 8],
        [13, 2], [13, 8],
        [14, 5],
        [15, 3], [15, 7],
        [16, 4], [16, 5], [16, 6],
        [17, 5],
        [20, 2], [20, 3], [20, 4],
        [21, 2], [21, 3], [21, 4],
        [22, 1], [22, 5],
        [24, 0], [24, 1], [24, 5], [24, 6],
        [34, 2], [34, 3], [35, 2], [35, 3],
      ];
      const all: [number, number][] = [];
      // Input A - gun firing diagonally
      for (const [x, y] of gun) all.push([x, y - 40]);
      // Input B - gun firing from opposite angle
      for (const [x, y] of gun) all.push([x, y + 40]);
      return all;
    })(),
  },
  {
    name: "Signal Wires (Glider Streams)",
    category: "Logic Gates",
    cells: (() => {
      // Multiple guns creating "wires" of gliders - demonstrates signal propagation
      const gun: [number, number][] = [
        [0, 4], [0, 5], [1, 4], [1, 5],
        [10, 4], [10, 5], [10, 6],
        [11, 3], [11, 7],
        [12, 2], [12, 8],
        [13, 2], [13, 8],
        [14, 5],
        [15, 3], [15, 7],
        [16, 4], [16, 5], [16, 6],
        [17, 5],
        [20, 2], [20, 3], [20, 4],
        [21, 2], [21, 3], [21, 4],
        [22, 1], [22, 5],
        [24, 0], [24, 1], [24, 5], [24, 6],
        [34, 2], [34, 3], [35, 2], [35, 3],
      ];
      const all: [number, number][] = [];
      // 3 parallel "wire" guns, showing signal bus
      for (const [x, y] of gun) all.push([x - 50, y - 30]);
      for (const [x, y] of gun) all.push([x - 50, y]);
      for (const [x, y] of gun) all.push([x - 50, y + 30]);
      // A reflector (using a Gosper gun aimed perpendicular) to show signal routing
      for (const [x, y] of gun) all.push([y + 10, -x + 50]);
      return all;
    })(),
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
  const t = Math.min(age / 30, 1);
  if (isDark) {
    const r = Math.round(20 + t * 10);
    const g = Math.round(230 - t * 60);
    const b = Math.round(220 - t * 30);
    return `rgb(${r},${g},${b})`;
  } else {
    const r = Math.round(10 + t * 20);
    const g = Math.round(180 - t * 50);
    const b = Math.round(170 - t * 30);
    return `rgb(${r},${g},${b})`;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

const BASE_CELL_SIZE = 12;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
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
  const [zoomDisplay, setZoomDisplay] = useState(1);

  // Camera (pan + zoom)
  const cameraRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
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

  // Cell size accounting for zoom
  const getCellSize = useCallback(() => {
    return BASE_CELL_SIZE * zoomRef.current;
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
    const cellSize = getCellSize();

    // Clear
    ctx.fillStyle = isDark ? "#0c0c0c" : "#fafafa";
    ctx.fillRect(0, 0, w, h);

    // Grid lines (only if zoom > 0.3, otherwise too dense)
    if (zoomRef.current > 0.3) {
      const offsetX = (w / 2 + cam.x * cellSize) % cellSize;
      const offsetY = (h / 2 + cam.y * cellSize) % cellSize;

      const alpha = Math.min(1, (zoomRef.current - 0.3) / 0.3);
      ctx.strokeStyle = isDark
        ? `rgba(255,255,255,${0.04 * alpha})`
        : `rgba(0,0,0,${0.06 * alpha})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = offsetX; x < w; x += cellSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = offsetY; y < h; y += cellSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }

    // Cells
    const grid = gridRef.current;
    const ages = agesRef.current;
    const halfW = w / 2;
    const halfH = h / 2;

    // For small zoom, use simple rectangles for performance
    const useSimple = zoomRef.current < 0.5 || grid.size > 10000;
    const gap = useSimple ? 0 : 0.5 * zoomRef.current;
    const radius = useSimple ? 0 : 2 * zoomRef.current;

    for (const k of grid) {
      const [cx, cy] = parseKey(k);
      const px = halfW + (cx + cam.x) * cellSize;
      const py = halfH + (cy + cam.y) * cellSize;

      // Skip if off-screen
      if (
        px + cellSize < 0 ||
        px > w ||
        py + cellSize < 0 ||
        py > h
      )
        continue;

      const age = ages.get(k) ?? 0;
      ctx.fillStyle = getCellColor(age, isDark);

      if (useSimple) {
        ctx.fillRect(px, py, cellSize, cellSize);
      } else {
        const sx = px + gap;
        const sy = py + gap;
        const sw = cellSize - gap * 2;
        const sh = cellSize - gap * 2;

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
      }

      // Subtle glow for young cells (only when zoomed in enough)
      if (age < 3 && zoomRef.current > 0.6) {
        ctx.shadowColor = isDark
          ? "rgba(20,230,220,0.3)"
          : "rgba(10,180,170,0.2)";
        ctx.shadowBlur = 6 * zoomRef.current;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }
    }
  }, [getCellSize]);

  // ── Canvas sizing ────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
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

  // ── Mouse interaction ──────────────────────────────────────────────────

  const screenToGrid = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current;
      const cellSize = getCellSize();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const gx = Math.floor((px - rect.width / 2) / cellSize - cam.x);
      const gy = Math.floor((py - rect.height / 2) / cellSize - cam.y);
      return [gx, gy];
    },
    [getCellSize]
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
        gridRef.current = placePattern(selectedPattern, gx, gy, gridRef.current);
        setPopulation(gridRef.current.size);
        render();
        return;
      }

      // Left-click → draw or erase
      if (e.button === 0) {
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
        const cellSize = getCellSize();
        const dx = (e.clientX - drag.lastX) / cellSize;
        const dy = (e.clientY - drag.lastY) / cellSize;
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
    [screenToGrid, render, getCellSize]
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ── Scroll to zoom ──────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1 - e.deltaY * 0.001;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * zoomFactor));

      // Zoom toward cursor position
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;

      // World position under cursor before zoom
      const oldCellSize = BASE_CELL_SIZE * zoomRef.current;
      const wx = (mx - halfW) / oldCellSize - cameraRef.current.x;
      const wy = (my - halfH) / oldCellSize - cameraRef.current.y;

      zoomRef.current = newZoom;

      // Adjust camera so the same world position stays under cursor
      const newCellSize = BASE_CELL_SIZE * newZoom;
      cameraRef.current.x = (mx - halfW) / newCellSize - wx;
      cameraRef.current.y = (my - halfH) / newCellSize - wy;

      setZoomDisplay(Math.round(newZoom * 100) / 100);
      render();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [render]);

  // ── Fit to content ──────────────────────────────────────────────────────

  const fitToContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const grid = gridRef.current;
    if (grid.size === 0) {
      zoomRef.current = 1;
      cameraRef.current = { x: 0, y: 0 };
      setZoomDisplay(1);
      render();
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k of grid) {
      const [x, y] = parseKey(k);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const gridW = maxX - minX + 1;
    const gridH = maxY - minY + 1;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const padding = 1.2; // 20% padding
    const zoomX = canvas.width / (gridW * BASE_CELL_SIZE * padding);
    const zoomY = canvas.height / (gridH * BASE_CELL_SIZE * padding);
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zoomX, zoomY)));

    zoomRef.current = newZoom;
    cameraRef.current = { x: -centerX, y: -centerY };
    setZoomDisplay(Math.round(newZoom * 100) / 100);
    render();
  }, [render]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
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
        gridRef.current = new Set();
        agesRef.current = new Map();
        cameraRef.current = { x: 0, y: 0 };
        zoomRef.current = 1;
        setZoomDisplay(1);
        setGeneration(0);
        setPopulation(0);
        setRunning(false);
        render();
      } else if (e.key === "r") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const cellSize = getCellSize();
        const w = Math.ceil(canvas.width / cellSize);
        const h = Math.ceil(canvas.height / cellSize);
        const grid = randomGrid(w, h, 0.15);
        gridRef.current = grid;
        agesRef.current = new Map();
        cameraRef.current = { x: 0, y: 0 };
        setGeneration(0);
        setPopulation(grid.size);
        render();
      } else if (e.key === "Escape") {
        setSelectedPattern(null);
      } else if (e.key === "f") {
        fitToContent();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const newZoom = Math.min(MAX_ZOOM, zoomRef.current * 1.2);
        zoomRef.current = newZoom;
        setZoomDisplay(Math.round(newZoom * 100) / 100);
        render();
      } else if (e.key === "-") {
        e.preventDefault();
        const newZoom = Math.max(MIN_ZOOM, zoomRef.current / 1.2);
        zoomRef.current = newZoom;
        setZoomDisplay(Math.round(newZoom * 100) / 100);
        render();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [render, fitToContent, getCellSize]);

  // ── Context menu prevention ────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const pattern = PATTERNS.find((p) => p.name === "R-pentomino")!;
    gridRef.current = placePattern(pattern, 0, 0, new Set());
    agesRef.current = new Map();
    setPopulation(gridRef.current.size);
    render();
  }, [render]);

  // ── Load preset (place + fit) ────────────────────────────────────────

  const loadPreset = useCallback(
    (pattern: Pattern) => {
      gridRef.current = new Set();
      agesRef.current = new Map();
      gridRef.current = placePattern(pattern, 0, 0, new Set());
      setGeneration(0);
      setPopulation(gridRef.current.size);
      setRunning(false);
      // Fit to show the whole pattern
      setTimeout(() => fitToContent(), 30);
    },
    [fitToContent]
  );

  // Group patterns by category
  const categories = PATTERNS.reduce<Record<string, Pattern[]>>((acc, p) => {
    const cat = p.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

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
              <div className="absolute top-full left-0 mt-1 w-64 rounded-lg border border-border bg-popover shadow-xl z-30 py-1 overflow-y-auto max-h-[70vh]">
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
                  ✏️ Freehand Draw
                </button>
                {Object.entries(categories).map(([cat, patterns]) => (
                  <div key={cat}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-t border-border/40 mt-1 pt-2">
                      {cat}
                    </div>
                    {patterns.map((p) => {
                      const isLarge = cat === "Large Systems" || cat === "Logic Gates" || cat === "Guns";
                      return (
                        <div key={p.name}>
                          <div className="flex items-center">
                            <button
                              onClick={() => {
                                if (isLarge) {
                                  loadPreset(p);
                                  setSelectedPattern(null);
                                } else {
                                  setSelectedPattern(p);
                                }
                                setShowPatterns(false);
                              }}
                              className={[
                                "flex-1 text-left px-3 py-1.5 text-sm transition-colors",
                                selectedPattern?.name === p.name
                                  ? "bg-accent text-accent-foreground"
                                  : "text-foreground/80 hover:bg-accent/50",
                              ].join(" ")}
                            >
                              {p.name}
                              <span className="text-xs text-muted-foreground ml-2">
                                ({p.cells.length})
                              </span>
                            </button>
                            {isLarge && (
                              <button
                                onClick={() => {
                                  setSelectedPattern(p);
                                  setShowPatterns(false);
                                }}
                                className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                                title="Use as stamp to place manually"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
            const cellSize = getCellSize();
            const w = Math.ceil(canvas.width / cellSize);
            const h = Math.ceil(canvas.height / cellSize);
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
            zoomRef.current = 1;
            setZoomDisplay(1);
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

        {/* Separator */}
        <div className="border-l border-border/60 h-5 ml-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const newZoom = Math.max(MIN_ZOOM, zoomRef.current / 1.3);
              zoomRef.current = newZoom;
              setZoomDisplay(Math.round(newZoom * 100) / 100);
              render();
            }}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            title="Zoom Out (-)"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums w-12 text-center font-mono">
            {Math.round(zoomDisplay * 100)}%
          </span>
          <button
            onClick={() => {
              const newZoom = Math.min(MAX_ZOOM, zoomRef.current * 1.3);
              zoomRef.current = newZoom;
              setZoomDisplay(Math.round(newZoom * 100) / 100);
              render();
            }}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            title="Zoom In (+)"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={fitToContent}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors ml-0.5"
            title="Fit to Content (F)"
          >
            <Maximize size={14} />
          </button>
        </div>

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
                Scroll to zoom &middot; Shift+drag to pan &middot;{" "}
                <kbd className="font-mono px-1 py-0.5 rounded border border-border/40 bg-muted/30 text-xs">R</kbd> random &middot;{" "}
                <kbd className="font-mono px-1 py-0.5 rounded border border-border/40 bg-muted/30 text-xs">Space</kbd> play &middot;{" "}
                <kbd className="font-mono px-1 py-0.5 rounded border border-border/40 bg-muted/30 text-xs">F</kbd> fit
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
