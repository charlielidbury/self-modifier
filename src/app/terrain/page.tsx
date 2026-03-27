"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  Mountain,
  Droplets,
  Sun,
  Layers,
  Shuffle,
} from "lucide-react";

// ─── Perlin Noise ──────────────────────────────────────────────────────────

// Classic 2D Perlin noise (improved version)
const PERM = new Uint8Array(512);
function seedPermutation(seed: number) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle seeded with a simple LCG
  let s = seed | 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number) {
  return a + t * (b - a);
}
function dot2(g: number[], x: number, y: number) {
  return g[0] * x + g[1] * y;
}

function perlin2(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[xi] + yi] & 7;
  const ab = PERM[PERM[xi] + yi + 1] & 7;
  const ba = PERM[PERM[xi + 1] + yi] & 7;
  const bb = PERM[PERM[xi + 1] + yi + 1] & 7;

  const x1 = lerp(dot2(GRAD2[aa], xf, yf), dot2(GRAD2[ba], xf - 1, yf), u);
  const x2 = lerp(dot2(GRAD2[ab], xf, yf - 1), dot2(GRAD2[bb], xf - 1, yf - 1), u);
  return lerp(x1, x2, v);
}

function fbm(x: number, y: number, octaves: number, persistence: number, lacunarity: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += perlin2(x * frequency, y * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / maxAmp; // normalized to roughly [-1, 1]
}

// ─── 3D Math ────────────────────────────────────────────────────────────────

type Vec3 = [number, number, number];

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-8) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}
function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// ─── Biome Colors ──────────────────────────────────────────────────────────

interface BiomeStop {
  height: number;
  color: [number, number, number];
}

function getBiomeColor(h: number, waterLevel: number): [number, number, number] {
  // Heights are in range [-1, 1], remap relative to water level
  const stops: BiomeStop[] = [
    { height: -1.0, color: [15, 30, 80] },      // deep ocean
    { height: waterLevel - 0.08, color: [25, 60, 130] }, // ocean
    { height: waterLevel - 0.02, color: [40, 90, 160] }, // shallow water
    { height: waterLevel, color: [60, 110, 170] },       // shore water
    { height: waterLevel + 0.02, color: [194, 178, 128] }, // beach
    { height: waterLevel + 0.06, color: [170, 160, 110] }, // dry sand
    { height: waterLevel + 0.15, color: [80, 140, 50] },  // grass
    { height: waterLevel + 0.30, color: [50, 110, 35] },  // forest
    { height: waterLevel + 0.50, color: [35, 80, 28] },   // dark forest
    { height: waterLevel + 0.65, color: [100, 90, 75] },  // rock
    { height: waterLevel + 0.80, color: [140, 130, 120] }, // high rock
    { height: 1.0, color: [240, 240, 250] },              // snow
  ];

  if (h <= stops[0].height) return stops[0].color;
  if (h >= stops[stops.length - 1].height) return stops[stops.length - 1].color;

  for (let i = 1; i < stops.length; i++) {
    if (h <= stops[i].height) {
      const t = (h - stops[i - 1].height) / (stops[i].height - stops[i - 1].height);
      return [
        stops[i - 1].color[0] + (stops[i].color[0] - stops[i - 1].color[0]) * t,
        stops[i - 1].color[1] + (stops[i].color[1] - stops[i - 1].color[1]) * t,
        stops[i - 1].color[2] + (stops[i].color[2] - stops[i - 1].color[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1].color;
}

// ─── Rendering ─────────────────────────────────────────────────────────────

const GRID = 120; // heightmap resolution
const LIGHT_DIR: Vec3 = vec3Normalize([0.4, 0.8, 0.6]);

interface Face {
  verts: Vec3[];        // world-space vertices
  projected: [number, number][];  // screen-space
  depth: number;        // average Z in camera space for sorting
  color: [number, number, number];
  light: number;        // diffuse factor
  isWater: boolean;
}

function projectPoint(
  p: Vec3,
  camDist: number,
  rotY: number,
  rotX: number,
  cx: number,
  cy: number,
  scale: number
): { x: number; y: number; z: number } {
  // Rotate around Y axis
  let x = p[0], y = p[1], z = p[2];
  let cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  let rx = x * cosY + z * sinY;
  let rz = -x * sinY + z * cosY;

  // Rotate around X axis
  let cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  let ry = y * cosX - rz * sinX;
  let rz2 = y * sinX + rz * cosX;

  // Translate by camera distance
  rz2 += camDist;

  // Perspective projection
  const fov = 600;
  const invZ = fov / Math.max(rz2, 0.1);
  return {
    x: cx + rx * invZ * scale,
    y: cy - ry * invZ * scale,
    z: rz2,
  };
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function TerrainPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // Camera state
  const cameraRef = useRef({
    rotY: 0.6,
    rotX: 0.7,
    dist: 3.5,
    autoRotate: true,
  });

  // Drag state
  const dragRef = useRef({
    active: false,
    lastX: 0,
    lastY: 0,
  });

  // Terrain parameters
  const [seed, setSeed] = useState(42);
  const [octaves, setOctaves] = useState(6);
  const [persistence, setPersistence] = useState(0.5);
  const [lacunarity, setLacunarity] = useState(2.0);
  const [waterLevel, setWaterLevel] = useState(-0.1);
  const [heightScale, setHeightScale] = useState(0.45);
  const [noiseScale, setNoiseScale] = useState(3.0);

  // Heightmap cache
  const heightmapRef = useRef<Float32Array>(new Float32Array(0));

  const generateHeightmap = useCallback(() => {
    seedPermutation(seed);
    const hm = new Float32Array((GRID + 1) * (GRID + 1));
    for (let gy = 0; gy <= GRID; gy++) {
      for (let gx = 0; gx <= GRID; gx++) {
        const nx = (gx / GRID) * noiseScale;
        const ny = (gy / GRID) * noiseScale;
        hm[gy * (GRID + 1) + gx] = fbm(nx, ny, octaves, persistence, lacunarity);
      }
    }
    heightmapRef.current = hm;
  }, [seed, octaves, persistence, lacunarity, noiseScale]);

  // Regenerate heightmap when params change
  useEffect(() => {
    generateHeightmap();
  }, [generateHeightmap]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cam = cameraRef.current;
    const hm = heightmapRef.current;
    if (hm.length === 0) return;

    // Auto-rotate
    if (cam.autoRotate) {
      cam.rotY += 0.003;
    }

    // Clear
    const isDark = document.documentElement.classList.contains("dark");
    if (isDark) {
      ctx.fillStyle = "#0a0a0f";
    } else {
      ctx.fillStyle = "#e8edf5";
    }
    ctx.fillRect(0, 0, w, h);

    // Draw atmospheric gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (isDark) {
      grad.addColorStop(0, "rgba(20, 20, 50, 0.8)");
      grad.addColorStop(0.5, "rgba(10, 10, 20, 0.3)");
      grad.addColorStop(1, "rgba(5, 5, 15, 0)");
    } else {
      grad.addColorStop(0, "rgba(135, 180, 230, 0.6)");
      grad.addColorStop(0.5, "rgba(200, 215, 235, 0.3)");
      grad.addColorStop(1, "rgba(232, 237, 245, 0)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) / 600;

    // Build faces from heightmap
    const step = Math.max(1, Math.floor(GRID / 80)); // adaptive LOD
    const faces: Face[] = [];
    const halfGrid = GRID / 2;

    for (let gy = 0; gy < GRID; gy += step) {
      for (let gx = 0; gx < GRID; gx += step) {
        const nextX = Math.min(gx + step, GRID);
        const nextY = Math.min(gy + step, GRID);

        // Get heights at 4 corners
        const h00 = hm[gy * (GRID + 1) + gx];
        const h10 = hm[gy * (GRID + 1) + nextX];
        const h01 = hm[nextY * (GRID + 1) + gx];
        const h11 = hm[nextY * (GRID + 1) + nextX];

        // World positions (centered at origin)
        const x0 = (gx - halfGrid) / GRID * 2;
        const x1 = (nextX - halfGrid) / GRID * 2;
        const z0 = (gy - halfGrid) / GRID * 2;
        const z1 = (nextY - halfGrid) / GRID * 2;

        // Flatten water surface
        const ey00 = h00 < waterLevel ? waterLevel * heightScale : h00 * heightScale;
        const ey10 = h10 < waterLevel ? waterLevel * heightScale : h10 * heightScale;
        const ey01 = h01 < waterLevel ? waterLevel * heightScale : h01 * heightScale;
        const ey11 = h11 < waterLevel ? waterLevel * heightScale : h11 * heightScale;

        const isWater = h00 < waterLevel && h10 < waterLevel && h01 < waterLevel && h11 < waterLevel;

        const v0: Vec3 = [x0, ey00, z0];
        const v1: Vec3 = [x1, ey10, z0];
        const v2: Vec3 = [x1, ey11, z1];
        const v3: Vec3 = [x0, ey01, z1];

        // Compute face normal
        const edge1 = vec3Sub(v1, v0);
        const edge2 = vec3Sub(v3, v0);
        const normal = vec3Normalize(vec3Cross(edge1, edge2));
        let light = Math.max(0.15, vec3Dot(normal, LIGHT_DIR));

        // Color from average height
        const avgH = (h00 + h10 + h01 + h11) / 4;
        const baseColor = getBiomeColor(avgH, waterLevel);

        if (isWater) {
          light = Math.max(0.3, light);
          // Add specular highlight for water
          const specular = Math.pow(Math.max(0, vec3Dot(normal, LIGHT_DIR)), 32) * 0.3;
          light += specular;
        }

        // Project vertices
        const p0 = projectPoint(v0, cam.dist, cam.rotY, cam.rotX, cx, cy, scale);
        const p1 = projectPoint(v1, cam.dist, cam.rotY, cam.rotX, cx, cy, scale);
        const p2 = projectPoint(v2, cam.dist, cam.rotY, cam.rotX, cx, cy, scale);
        const p3 = projectPoint(v3, cam.dist, cam.rotY, cam.rotX, cx, cy, scale);

        const avgDepth = (p0.z + p1.z + p2.z + p3.z) / 4;

        faces.push({
          verts: [v0, v1, v2, v3],
          projected: [[p0.x, p0.y], [p1.x, p1.y], [p2.x, p2.y], [p3.x, p3.y]],
          depth: avgDepth,
          color: baseColor,
          light,
          isWater,
        });
      }
    }

    // Painter's algorithm: sort back-to-front
    faces.sort((a, b) => b.depth - a.depth);

    // Draw faces
    for (const face of faces) {
      const [r, g, b] = face.color;
      const l = face.light;

      let fr = Math.round(r * l);
      let fg = Math.round(g * l);
      let fb = Math.round(b * l);

      // Water transparency effect
      if (face.isWater) {
        const alpha = isDark ? 0.75 : 0.85;
        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${alpha})`;
      } else {
        ctx.fillStyle = `rgb(${fr}, ${fg}, ${fb})`;
      }

      ctx.beginPath();
      ctx.moveTo(face.projected[0][0], face.projected[0][1]);
      ctx.lineTo(face.projected[1][0], face.projected[1][1]);
      ctx.lineTo(face.projected[2][0], face.projected[2][1]);
      ctx.lineTo(face.projected[3][0], face.projected[3][1]);
      ctx.closePath();
      ctx.fill();

      // Subtle wireframe for non-water faces at close zoom
      if (!face.isWater && cam.dist < 4.5) {
        ctx.strokeStyle = isDark
          ? `rgba(255,255,255,0.04)`
          : `rgba(0,0,0,0.04)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // Draw fog overlay near horizon
    const fogGrad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.1, cx, cy, Math.min(w, h) * 0.55);
    fogGrad.addColorStop(0, "rgba(0,0,0,0)");
    if (isDark) {
      fogGrad.addColorStop(1, "rgba(10,10,15,0.4)");
    } else {
      fogGrad.addColorStop(1, "rgba(232,237,245,0.3)");
    }
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 0, w, h);

    animRef.current = requestAnimationFrame(render);
  }, [waterLevel, heightScale]);

  // Setup canvas and animation
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    animRef.current = requestAnimationFrame(render);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animRef.current);
    };
  }, [render]);

  // Mouse interaction for camera
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      cameraRef.current.autoRotate = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      cameraRef.current.rotY += dx * 0.005;
      cameraRef.current.rotX = Math.max(0.1, Math.min(1.5, cameraRef.current.rotX + dy * 0.005));
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    };

    const onMouseUp = () => {
      dragRef.current.active = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraRef.current.dist = Math.max(1.5, Math.min(8, cameraRef.current.dist + e.deltaY * 0.003));
    };

    // Touch support
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
        cameraRef.current.autoRotate = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current.active || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - dragRef.current.lastX;
      const dy = e.touches[0].clientY - dragRef.current.lastY;
      cameraRef.current.rotY += dx * 0.005;
      cameraRef.current.rotX = Math.max(0.1, Math.min(1.5, cameraRef.current.rotX + dy * 0.005));
      dragRef.current.lastX = e.touches[0].clientX;
      dragRef.current.lastY = e.touches[0].clientY;
    };

    const onTouchEnd = () => {
      dragRef.current.active = false;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const randomSeed = () => setSeed(Math.floor(Math.random() * 100000));

  const resetCamera = () => {
    cameraRef.current = {
      rotY: 0.6,
      rotX: 0.7,
      dist: 3.5,
      autoRotate: true,
    };
  };

  return (
    <div className="h-full flex flex-col overflow-hidden select-none">
      {/* Controls */}
      <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm z-10 flex-wrap">
        <span className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5 mr-2">
          <Mountain size={15} className="text-emerald-500" />
          Terrain Generator
        </span>

        {/* Seed */}
        <button
          onClick={randomSeed}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors text-xs"
          title="Random seed"
        >
          <Shuffle size={13} />
          <span className="hidden sm:inline">Seed: {seed}</span>
        </button>

        {/* Octaves */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers size={13} />
          <span className="hidden sm:inline">Octaves</span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={octaves}
            onChange={(e) => setOctaves(Number(e.target.value))}
            className="w-16 sm:w-20 accent-emerald-500"
          />
          <span className="w-4 text-right tabular-nums">{octaves}</span>
        </div>

        {/* Height */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mountain size={13} />
          <span className="hidden sm:inline">Height</span>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={heightScale}
            onChange={(e) => setHeightScale(Number(e.target.value))}
            className="w-16 sm:w-20 accent-emerald-500"
          />
          <span className="w-6 text-right tabular-nums">{heightScale.toFixed(1)}</span>
        </div>

        {/* Water Level */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Droplets size={13} />
          <span className="hidden sm:inline">Water</span>
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.02}
            value={waterLevel}
            onChange={(e) => setWaterLevel(Number(e.target.value))}
            className="w-16 sm:w-20 accent-blue-500"
          />
          <span className="w-8 text-right tabular-nums">{waterLevel.toFixed(2)}</span>
        </div>

        {/* Roughness (Persistence) */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sun size={13} />
          <span className="hidden sm:inline">Detail</span>
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.05}
            value={persistence}
            onChange={(e) => setPersistence(Number(e.target.value))}
            className="w-16 sm:w-20 accent-amber-500"
          />
          <span className="w-6 text-right tabular-nums">{persistence.toFixed(1)}</span>
        </div>

        {/* Reset */}
        <button
          onClick={resetCamera}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors text-xs ml-auto"
          title="Reset camera"
        >
          <RotateCcw size={13} />
          <span className="hidden sm:inline">Reset View</span>
        </button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <span className="text-[11px] text-muted-foreground/50 bg-background/60 backdrop-blur-sm rounded-full px-3 py-1">
          Drag to rotate · Scroll to zoom
        </span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative cursor-grab active:cursor-grabbing">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
