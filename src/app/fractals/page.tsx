"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Infinity,
  Camera,
  Link,
  Check,
  Bookmark,
  BookmarkPlus,
  X,
  Maximize2,
  Minimize2,
  Palette,
  Undo2,
  Redo2,
} from "lucide-react";

// ─── WebGL Shaders ────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform vec2  u_center;
uniform float u_zoom;
uniform float u_maxIter;
uniform float u_cx;
uniform float u_cy;
uniform int   u_mode;       // 0=mandelbrot  1=julia  2=burningship  3=newton
uniform float u_colorShift;
uniform float u_palIdx;     // 0-3 selects colour palette

// IQ cosine palette
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 colour(float t) {
  t = fract(t + u_colorShift);
  float p = u_palIdx;
  if (p < 0.5)
    return pal(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,0.7,0.4), vec3(0.00,0.15,0.20)); // fire
  if (p < 1.5)
    return pal(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.00,0.33,0.67)); // ocean
  if (p < 2.5)
    return pal(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(2.0,1.0,0.0), vec3(0.50,0.20,0.25)); // neon
  if (p < 3.5)
    return pal(t, vec3(0.2,0.5,0.8), vec3(0.3,0.4,0.2), vec3(2.0,1.0,1.0), vec3(0.00,0.25,0.50)); // twilight
  return       pal(t, vec3(0.3,0.6,0.5), vec3(0.3,0.4,0.4), vec3(1.0,1.0,1.0), vec3(0.60,0.00,0.30)); // aurora
}

void main() {
  vec2 uv = (gl_FragCoord.xy - u_res * 0.5) / (min(u_res.x, u_res.y) * u_zoom) + u_center;

  // ── Newton fractal: Newton-Raphson on z^3 - 1 = 0 ─────────────────────────
  // Three roots: (1,0), (-0.5, +√3/2), (-0.5, -√3/2)
  // Colour each basin differently; convergence speed modulates brightness.
  if (u_mode == 3) {
    vec2 z = uv;
    float rootIdx = -1.0;
    float conv = u_maxIter;
    for (int n = 0; n < 1024; n++) {
      if (float(n) >= u_maxIter) break;
      // z^2
      vec2 z2 = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y);
      // z^3 = z^2 * z
      vec2 z3 = vec2(z2.x*z.x - z2.y*z.y, z2.x*z.y + z2.y*z.x);
      // f(z)  = z^3 - 1,  f'(z) = 3z^2
      vec2 fz  = z3 - vec2(1.0, 0.0);
      vec2 dfz = 3.0 * z2;
      float denom = dfz.x*dfz.x + dfz.y*dfz.y;
      if (denom < 1e-10) break;
      // Complex division fz / dfz, then Newton step
      vec2 delta = vec2(fz.x*dfz.x + fz.y*dfz.y, fz.y*dfz.x - fz.x*dfz.y) / denom;
      z -= delta;
      // Proximity to each root
      float d0 = dot(z - vec2( 1.0,  0.0     ), z - vec2( 1.0,  0.0     ));
      float d1 = dot(z - vec2(-0.5,  0.866025), z - vec2(-0.5,  0.866025));
      float d2 = dot(z - vec2(-0.5, -0.866025), z - vec2(-0.5, -0.866025));
      float minD = min(d0, min(d1, d2));
      if (minD < 0.0001) {
        conv = float(n);
        if      (d0 <= d1 && d0 <= d2) rootIdx = 0.0;
        else if (d1 <= d0 && d1 <= d2) rootIdx = 1.0;
        else                            rootIdx = 2.0;
        break;
      }
    }
    if (rootIdx < 0.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    // Root basin sets hue; convergence speed sets brightness
    float bright = pow(1.0 - conv / u_maxIter, 0.4);
    vec3 col = colour(fract(rootIdx / 3.0));
    col *= 0.25 + 0.75 * bright;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    return;
  }

  vec2 z, c;
  if (u_mode == 1) { z = uv; c = vec2(u_cx, u_cy); }
  else             { z = vec2(0.0); c = uv; }

  float escaped = -1.0;
  for (int n = 0; n < 1024; n++) {
    if (float(n) >= u_maxIter) break;
    float zx, zy;
    if (u_mode == 2) {
      // Burning Ship: |Re| and |Im| taken absolute
      zx = abs(z.x); zy = abs(z.y);
    } else if (u_mode == 4) {
      // Tricorn: conjugate squaring — z̄² + c  (negate imaginary part)
      zx = z.x; zy = -z.y;
    } else {
      zx = z.x; zy = z.y;
    }
    z = vec2(zx*zx - zy*zy + c.x, 2.0*zx*zy + c.y);
    if (dot(z,z) > 256.0) { escaped = float(n); break; }
  }

  if (escaped < 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Smooth iteration count (needs |z|>1, which is guaranteed since we used 256 as bailout)
  float smooth = escaped + 1.0 - log2(log2(length(z)));
  float t = smooth / u_maxIter;
  vec3 col = colour(t * 4.0);
  // Slight darkening near the set boundary for depth
  col *= 0.85 + 0.15 * sin(smooth * 0.5);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// ─── GL helpers ───────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
  return s;
}

function buildProgram(gl: WebGLRenderingContext) {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
  return prog;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FRACTAL_MODES = [
  { key: "mandelbrot", label: "Mandelbrot",   glMode: 0, description: "The classic Mandelbrot set. Zoom into the boundary to discover infinite self-similar spirals and minibrots." },
  { key: "julia",      label: "Julia",        glMode: 1, description: "Julia set — shape evolves as the animation parameter c changes. In Mandelbrot mode, Shift+click any point to pin its Julia set." },
  { key: "burning",    label: "Burning Ship", glMode: 2, description: "The Burning Ship fractal. Absolute-value iterations create asymmetric ship-like structures with fiery detail." },
  { key: "newton",     label: "Newton",       glMode: 3, description: "Newton fractal for z³−1=0. Each colour marks which of the three roots Newton-Raphson converges to from that point." },
  { key: "tricorn",    label: "Tricorn",      glMode: 4, description: "The Tricorn (Mandelbar) set. Complex conjugate iterations produce three-armed symmetry and distinctive antenna structures." },
] as const;

type FractalKey = (typeof FRACTAL_MODES)[number]["key"];

const PALETTES = ["Fire", "Ocean", "Neon", "Twilight", "Aurora"];

// CSS gradient approximations of each IQ cosine palette — used as inline swatches
// in the palette selector buttons so users can preview a palette before clicking.
const PALETTE_GRADIENTS = [
  "linear-gradient(to right, #ff6600, #cc1100, #220000, #cc4400, #ff8800)", // Fire
  "linear-gradient(to right, #0022bb, #0099cc, #00eeff, #00ccaa, #0022bb)", // Ocean
  "linear-gradient(to right, #ff0088, #44ff00, #ffee00, #ff0088)",           // Neon
  "linear-gradient(to right, #1133bb, #6611bb, #cc1177, #1133bb)",           // Twilight
  "linear-gradient(to right, #00ee55, #88bb00, #bb22aa, #1188dd, #00ee55)", // Aurora
];

// ─── Preset locations ─────────────────────────────────────────────────────────

type Preset = {
  name: string;
  mode: FractalKey;
  center: { x: number; y: number };
  zoom: number;
  juliaAngle?: number;
};

/** A user-saved bookmark extends Preset with a stable unique id. */
type FavoritePreset = Preset & { id: string };

const FAVORITES_KEY = "fractal-favorites";

const PRESETS: Preset[] = [
  // ── Mandelbrot ──
  {
    name: "Mandelbrot Overview",
    mode: "mandelbrot",
    center: { x: -0.5, y: 0 },
    zoom: 0.35,
  },
  {
    name: "Seahorse Valley",
    mode: "mandelbrot",
    center: { x: -0.7436448, y: 0.1318259 },
    zoom: 90,
  },
  {
    name: "Elephant Valley",
    mode: "mandelbrot",
    center: { x: 0.2825, y: 0.0 },
    zoom: 7,
  },
  {
    name: "Triple Spiral",
    mode: "mandelbrot",
    center: { x: -0.15925, y: 1.03195 },
    zoom: 35,
  },
  {
    name: "Mini Mandelbrot",
    mode: "mandelbrot",
    center: { x: -1.7549, y: 0.0 },
    zoom: 200,
  },
  {
    name: "Star Cluster",
    mode: "mandelbrot",
    center: { x: -0.5612, y: 0.6395 },
    zoom: 20,
  },
  // ── Julia ──
  {
    name: "Julia: Dragon",
    mode: "julia",
    center: { x: 0, y: 0 },
    zoom: 0.45,
    juliaAngle: 2.094, // c ≈ (-0.394, 0.683)
  },
  {
    name: "Julia: Ice Crystal",
    mode: "julia",
    center: { x: 0, y: 0 },
    zoom: 0.45,
    juliaAngle: Math.PI / 2, // c = (0, 0.7885)
  },
  {
    name: "Julia: Galaxy",
    mode: "julia",
    center: { x: 0, y: 0 },
    zoom: 0.45,
    juliaAngle: 0.65,
  },
  {
    name: "Julia: Star",
    mode: "julia",
    center: { x: 0, y: 0 },
    zoom: 0.45,
    juliaAngle: Math.PI, // c = (-0.7885, 0)
  },
  // ── Burning Ship ──
  {
    name: "Burning Ship",
    mode: "burning",
    center: { x: -0.4, y: 0.6 },
    zoom: 0.4,
  },
  {
    name: "Ship's Mast",
    mode: "burning",
    center: { x: -1.7656, y: -0.0418 },
    zoom: 28,
  },
  // ── Newton ──
  {
    name: "Newton: Three Basins",
    mode: "newton",
    center: { x: 0, y: 0 },
    zoom: 0.5,
  },
  {
    name: "Newton: Root Boundary",
    mode: "newton",
    center: { x: 0.52, y: 0.17 },
    zoom: 5,
  },
  {
    name: "Newton: Deep Tendrils",
    mode: "newton",
    center: { x: 0.5, y: 0.04 },
    zoom: 30,
  },
  // ── Tricorn ──
  {
    name: "Tricorn Overview",
    mode: "tricorn",
    center: { x: 0.0, y: 0.0 },
    zoom: 0.35,
  },
  {
    name: "Tricorn: Antennas",
    mode: "tricorn",
    center: { x: -0.56, y: 0.84 },
    zoom: 12,
  },
  {
    name: "Tricorn: Deep Spiral",
    mode: "tricorn",
    center: { x: -1.755, y: 0.0 },
    zoom: 45,
  },
];

// ─── Zoom formatting ──────────────────────────────────────────────────────────

/** Convert internal zoom value to a human-readable magnification string.
 *  Magnification is relative to the default Mandelbrot overview (zoom ≈ 0.35 → "1×"). */
function formatMag(zoom: number): string {
  const mag = zoom / 0.35;
  if (mag >= 1e9) return `${(mag / 1e9).toFixed(2)}B×`;
  if (mag >= 1e6) return `${(mag / 1e6).toFixed(2)}M×`;
  if (mag >= 1e3) return `${(mag / 1e3).toFixed(1)}K×`;
  if (mag >= 10)  return `${Math.round(mag)}×`;
  return `${mag.toFixed(1)}×`;
}

// Julia c parameter traces this path when animating
// (classic "dragon" orbit around the Mandelbrot boundary)
const JULIA_ORBIT_R = 0.7885;
const JULIA_ORBIT_SPEED = 0.004; // radians per frame (≈ 1571 frames per full loop at 60fps ≈ 26s)

// ─── Component ────────────────────────────────────────────────────────────────

export default function FractalsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef     = useRef<WebGLRenderingContext | null>(null);
  const progRef   = useRef<WebGLProgram | null>(null);
  const rafRef    = useRef<number>(0);
  const needsDrawRef = useRef(true);

  // View state – stored in refs so animation loop reads latest without re-render
  const centerRef  = useRef({ x: -0.5, y: 0.0 });
  const zoomRef    = useRef(0.35);
  const maxIterRef = useRef(200);
  const modeRef    = useRef<FractalKey>("mandelbrot");
  const palRef     = useRef(1); // ocean default

  // Animation state
  const juliaAngleRef  = useRef(0.0);
  const colorShiftRef  = useRef(0.0);
  const playingRef     = useRef(false);
  const dirRef         = useRef(1); // +1 forward, -1 backward

  // Drag state
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  // Pinch-to-zoom state (tracks all active pointers and the last pinch distance)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);

  // Fly-to animation state (smooth preset transitions)
  const flyAnimRef = useRef<{
    fromCenter: { x: number; y: number };
    fromZoom: number;
    toCenter: { x: number; y: number };
    toZoom: number;
    startTime: number;
    duration: number;
  } | null>(null);

  // Tracks the index of the most-recently applied built-in preset so that [ / ]
  // can cycle forwards / backwards through the PRESETS array.
  const currentPresetIdxRef = useRef(0);

  // Navigation history — back/forward through deliberate jumps (double-click, preset, shift+click)
  type NavEntry = { center: { x: number; y: number }; zoom: number; mode: FractalKey };
  const backStackRef    = useRef<NavEntry[]>([]);
  const forwardStackRef = useRef<NavEntry[]>([]);

  // React state (for UI re-render only)
  const [mode, setMode]         = useState<FractalKey>("mandelbrot");
  const [palette, setPalette]   = useState(1);
  const [playing, setPlaying]   = useState(false);
  const [maxIter, setMaxIter]   = useState(200);
  const [juliaAngle, setJuliaAngle] = useState(0);
  const [copied, setCopied]     = useState(false);
  const [mouseCoords, setMouseCoords] = useState<{ re: number; im: number } | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [savedBookmark, setSavedBookmark] = useState(false);
  // 0–1 fractional hue offset; mirrors colorShiftRef so the slider stays in sync
  const [colorShift, setColorShift] = useState(0);

  // ── User bookmarks (persisted in localStorage) ───────────────────────────────
  const [favorites, setFavorites] = useState<FavoritePreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? (JSON.parse(raw) as FavoritePreset[]) : [];
    } catch {
      return [];
    }
  });

  // Persist favorites to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);
  const [zoomLevel, setZoomLevel] = useState(zoomRef.current);
  const [centerDisplay, setCenterDisplay] = useState({ x: centerRef.current.x, y: centerRef.current.y });
  const [hintVisible, setHintVisible] = useState(true);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Preset name toast — shown briefly when cycling presets with [ / ]
  const [presetToast, setPresetToast] = useState<string | null>(null);
  const presetToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Navigation history state (for button enabled/disabled)
  const [canGoBack,    setCanGoBack]    = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Coordinate editing state — lets the user click the center display and type exact coordinates
  const [isEditingCoords, setIsEditingCoords] = useState(false);
  const [editRe, setEditRe] = useState("");
  const [editIm, setEditIm] = useState("");

  // Direct Julia c parameter (overrides angle-based orbit when set by shift+click)
  const juliaCDirectRef = useRef<{ x: number; y: number } | null>(null);
  const [juliaCDirect, setJuliaCDirect] = useState<{ x: number; y: number } | null>(null);

  // Show hint for 6 s after the page loads, then fade it away.
  // Re-show it briefly whenever the user interacts so they can rediscover controls.
  const resetHintTimer = useCallback(() => {
    setHintVisible(true);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintVisible(false), 6000);
  }, []);

  /** Show a brief preset name toast when cycling with [ / ] keys. */
  const showPresetToast = useCallback((name: string) => {
    setPresetToast(name);
    if (presetToastTimerRef.current) clearTimeout(presetToastTimerRef.current);
    presetToastTimerRef.current = setTimeout(() => setPresetToast(null), 2500);
  }, []);

  // ── Fullscreen toggle ────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {/* not available */});
    } else {
      document.exitFullscreen().catch(() => {/* not available */});
    }
  }, []);

  useEffect(() => {
    resetHintTimer();
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      if (presetToastTimerRef.current) clearTimeout(presetToastTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fullscreen change listener ───────────────────────────────────────────────
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement !== null);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // ── Init WebGL ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) { console.error("WebGL not supported"); return; }
    glRef.current = gl;

    const prog = buildProgram(gl);
    progRef.current = prog;
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    needsDrawRef.current = true;
  }, []);

  // ── Restore view from URL hash ───────────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    try {
      const p = new URLSearchParams(hash);
      const cx  = parseFloat(p.get("cx") ?? "");
      const cy  = parseFloat(p.get("cy") ?? "");
      const z   = parseFloat(p.get("z")  ?? "");
      const m   = p.get("m") as FractalKey | null;
      const pal = parseInt(p.get("p")    ?? "");
      const mi  = parseInt(p.get("mi")   ?? "");
      const ja  = parseFloat(p.get("ja") ?? "");

      if (!isNaN(cx) && !isNaN(cy)) { centerRef.current = { x: cx, y: cy }; setCenterDisplay({ x: cx, y: cy }); }
      if (!isNaN(z) && z > 0) { zoomRef.current = z; setZoomLevel(z); }
      if (m && FRACTAL_MODES.some((fm) => fm.key === m)) {
        modeRef.current = m;
        setMode(m);
      }
      if (!isNaN(pal) && pal >= 0 && pal < PALETTES.length) {
        palRef.current = pal;
        setPalette(pal);
      }
      if (!isNaN(mi) && mi >= 50 && mi <= 1000) {
        maxIterRef.current = mi;
        setMaxIter(mi);
      }
      if (!isNaN(ja)) {
        juliaAngleRef.current = ja;
        setJuliaAngle(ja);
      }
      needsDrawRef.current = true;
    } catch {
      // malformed hash — just ignore it
    }
  }, []); // runs once on mount

  // ── Draw ────────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const gl   = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !canvas) return;

    const W = canvas.width;
    const H = canvas.height;
    gl.viewport(0, 0, W, H);

    const glMode = FRACTAL_MODES.find(m => m.key === modeRef.current)?.glMode ?? 0;
    // Use direct c value (from shift+click) if available, otherwise orbit-based
    const cx = juliaCDirectRef.current?.x ?? Math.cos(juliaAngleRef.current) * JULIA_ORBIT_R;
    const cy = juliaCDirectRef.current?.y ?? Math.sin(juliaAngleRef.current) * JULIA_ORBIT_R;

    const u = (name: string) => gl.getUniformLocation(prog, name);
    gl.uniform2f(u("u_res"), W, H);
    gl.uniform2f(u("u_center"), centerRef.current.x, centerRef.current.y);
    gl.uniform1f(u("u_zoom"), zoomRef.current);
    gl.uniform1f(u("u_maxIter"), maxIterRef.current);
    gl.uniform1f(u("u_cx"), cx);
    gl.uniform1f(u("u_cy"), cy);
    gl.uniform1i(u("u_mode"), glMode);
    gl.uniform1f(u("u_colorShift"), colorShiftRef.current);
    gl.uniform1f(u("u_palIdx"), palRef.current);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    needsDrawRef.current = false;
  }, []);

  // ── Animation loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    let running = true;

    const loop = () => {
      if (!running) return;

      if (playingRef.current) {
        juliaAngleRef.current += JULIA_ORBIT_SPEED * dirRef.current;
        colorShiftRef.current += 0.0004 * dirRef.current;
        setJuliaAngle(juliaAngleRef.current); // update display
        setColorShift(((colorShiftRef.current % 1) + 1) % 1); // keep slider in sync
        needsDrawRef.current = true;
      }

      // ── Fly-to animation (smooth preset transitions) ──
      if (flyAnimRef.current) {
        const anim = flyAnimRef.current;
        const progress = Math.min(1, (Date.now() - anim.startTime) / anim.duration);
        // Ease in-out cubic
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        // Interpolate zoom in log-space so large zoom changes feel proportional
        const logFrom = Math.log(anim.fromZoom);
        const logTo   = Math.log(anim.toZoom);
        zoomRef.current = Math.exp(logFrom + (logTo - logFrom) * ease);
        // Interpolate center in fractal coordinates
        centerRef.current = {
          x: anim.fromCenter.x + (anim.toCenter.x - anim.fromCenter.x) * ease,
          y: anim.fromCenter.y + (anim.toCenter.y - anim.fromCenter.y) * ease,
        };
        setZoomLevel(zoomRef.current);
        setCenterDisplay({ ...centerRef.current });
        needsDrawRef.current = true;
        if (progress >= 1) flyAnimRef.current = null;
      }

      if (needsDrawRef.current) draw();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // ── Resize observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      needsDrawRef.current = true;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire if typing in a form element
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const panStep = 0.15 / zoomRef.current;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          centerRef.current = { ...centerRef.current, x: centerRef.current.x - panStep };
          setCenterDisplay({ ...centerRef.current });
          needsDrawRef.current = true;
          break;
        case "ArrowRight":
          e.preventDefault();
          centerRef.current = { ...centerRef.current, x: centerRef.current.x + panStep };
          setCenterDisplay({ ...centerRef.current });
          needsDrawRef.current = true;
          break;
        case "ArrowUp":
          e.preventDefault();
          centerRef.current = { ...centerRef.current, y: centerRef.current.y + panStep };
          setCenterDisplay({ ...centerRef.current });
          needsDrawRef.current = true;
          break;
        case "ArrowDown":
          e.preventDefault();
          centerRef.current = { ...centerRef.current, y: centerRef.current.y - panStep };
          setCenterDisplay({ ...centerRef.current });
          needsDrawRef.current = true;
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomRef.current = Math.min(1e8, zoomRef.current * 1.2);
          setZoomLevel(zoomRef.current);
          needsDrawRef.current = true;
          break;
        case "-":
          e.preventDefault();
          zoomRef.current = Math.max(0.05, zoomRef.current / 1.2);
          setZoomLevel(zoomRef.current);
          needsDrawRef.current = true;
          break;
        case " ":
          e.preventDefault();
          playingRef.current = !playingRef.current;
          setPlaying((p) => !p);
          break;
        case "z":
        case "Z":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) goForward();
            else goBack();
          }
          break;
        case "r":
        case "R": {
          // Reset to defaults for the current mode
          playingRef.current = false;
          setPlaying(false);
          juliaAngleRef.current = 0;
          setJuliaAngle(0);
          colorShiftRef.current = 0;
          setColorShift(0);
          dirRef.current = 1;
          const m = modeRef.current;
          if (m === "mandelbrot") {
            centerRef.current = { x: -0.5, y: 0 };
            zoomRef.current = 0.35;
          } else if (m === "julia") {
            centerRef.current = { x: 0.0, y: 0 };
            zoomRef.current = 0.45;
          } else if (m === "newton") {
            centerRef.current = { x: 0.0, y: 0 };
            zoomRef.current = 0.5;
          } else if (m === "tricorn") {
            centerRef.current = { x: 0.0, y: 0 };
            zoomRef.current = 0.35;
          } else {
            centerRef.current = { x: -0.4, y: 0.6 };
            zoomRef.current = 0.4;
          }
          setZoomLevel(zoomRef.current);
          setCenterDisplay({ ...centerRef.current });
          needsDrawRef.current = true;
          break;
        }
        case "s":
        case "S": {
          // Don't intercept Ctrl/Cmd+S (browser save dialog)
          if (e.ctrlKey || e.metaKey) break;
          e.preventDefault();
          const shareParams = new URLSearchParams({
            cx: centerRef.current.x.toString(),
            cy: centerRef.current.y.toString(),
            z:  zoomRef.current.toString(),
            m:  modeRef.current,
            p:  palRef.current.toString(),
            mi: maxIterRef.current.toString(),
            ja: juliaAngleRef.current.toString(),
          });
          const shareHash = shareParams.toString();
          window.history.replaceState(null, "", `#${shareHash}`);
          const shareUrl = `${window.location.origin}${window.location.pathname}#${shareHash}`;
          navigator.clipboard.writeText(shareUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }).catch(() => {/* clipboard unavailable */});
          break;
        }
        case "d":
        case "D": {
          // Don't intercept Ctrl/Cmd+D (browser bookmark dialog)
          if (e.ctrlKey || e.metaKey) break;
          e.preventDefault();
          const canvas = canvasRef.current;
          if (!canvas) break;
          // preserveDrawingBuffer: true guarantees the last rendered frame is still available
          const paletteName = PALETTES[palRef.current]?.toLowerCase() ?? "custom";
          const filename = `fractal-${modeRef.current}-${paletteName}-${Date.now()}.png`;
          const link = document.createElement("a");
          link.href = canvas.toDataURL("image/png");
          link.download = filename;
          link.click();
          break;
        }
        case "p":
        case "P": {
          e.preventDefault();
          const nextPal = (palRef.current + 1) % PALETTES.length;
          palRef.current = nextPal;
          setPalette(nextPal);
          needsDrawRef.current = true;
          break;
        }
        case "m":
        case "M": {
          e.preventDefault();
          juliaCDirectRef.current = null;
          setJuliaCDirect(null);
          const modeKeys = FRACTAL_MODES.map((f) => f.key) as FractalKey[];
          const currentIdx = modeKeys.indexOf(modeRef.current);
          const nextMode = modeKeys[(currentIdx + 1) % modeKeys.length];
          modeRef.current = nextMode;
          setMode(nextMode);
          if (nextMode === "mandelbrot") { centerRef.current = { x: -0.5, y: 0 }; zoomRef.current = 0.35; setZoomLevel(0.35); setCenterDisplay({ x: -0.5, y: 0 }); }
          if (nextMode === "julia")      { centerRef.current = { x:  0.0, y: 0 }; zoomRef.current = 0.45; setZoomLevel(0.45); setCenterDisplay({ x: 0.0, y: 0 }); }
          if (nextMode === "burning")    { centerRef.current = { x: -0.4, y: 0.6 }; zoomRef.current = 0.4; setZoomLevel(0.4); setCenterDisplay({ x: -0.4, y: 0.6 }); }
          if (nextMode === "newton")     { centerRef.current = { x:  0.0, y: 0 }; zoomRef.current = 0.5; setZoomLevel(0.5); setCenterDisplay({ x: 0.0, y: 0 }); }
          if (nextMode === "tricorn")    { centerRef.current = { x:  0.0, y: 0 }; zoomRef.current = 0.35; setZoomLevel(0.35); setCenterDisplay({ x: 0.0, y: 0 }); }
          needsDrawRef.current = true;
          break;
        }
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "[": {
          e.preventDefault();
          const prevIdx = (currentPresetIdxRef.current - 1 + PRESETS.length) % PRESETS.length;
          currentPresetIdxRef.current = prevIdx;
          applyPreset(PRESETS[prevIdx]);
          showPresetToast(PRESETS[prevIdx].name);
          break;
        }
        case "]": {
          e.preventDefault();
          const nextIdx = (currentPresetIdxRef.current + 1) % PRESETS.length;
          currentPresetIdxRef.current = nextIdx;
          applyPreset(PRESETS[nextIdx]);
          showPresetToast(PRESETS[nextIdx].name);
          break;
        }
        case "i": {
          // Increase max iterations by 50 (clamped to 1000)
          e.preventDefault();
          const newIterUp = Math.min(1000, maxIterRef.current + 50);
          maxIterRef.current = newIterUp;
          setMaxIter(newIterUp);
          needsDrawRef.current = true;
          break;
        }
        case "I": {
          // Decrease max iterations by 50 (clamped to 50) — Shift+I
          e.preventDefault();
          const newIterDown = Math.max(50, maxIterRef.current - 50);
          maxIterRef.current = newIterDown;
          setMaxIter(newIterDown);
          needsDrawRef.current = true;
          break;
        }
      }
      // Any fractal-control key resets the hint fade timer
      resetHintTimer();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resetHintTimer, toggleFullscreen, showPresetToast, goBack, goForward]); // all refs and state setters are stable; these callbacks are also stable

  // ── Pointer events (pan + pinch-to-zoom) ────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // ── Shift+click in Mandelbrot mode → explore Julia set for this c value ──
    if (e.shiftKey && modeRef.current === "mandelbrot" && pointersRef.current.size === 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const W = rect.width;
        const H = rect.height;
        const minDim = Math.min(W, H);
        const c = {
          x: (mouseX - W / 2) / (minDim * zoomRef.current) + centerRef.current.x,
          y: -(mouseY - H / 2) / (minDim * zoomRef.current) + centerRef.current.y,
        };
        // Record current position in navigation history before switching to Julia
        pushNavHistory();
        juliaCDirectRef.current = c;
        setJuliaCDirect(c);
        colorShiftRef.current = 0;
        setColorShift(0);
        dirRef.current = 1;
        playingRef.current = false;
        setPlaying(false);
        modeRef.current = "julia";
        setMode("julia");
        flyAnimRef.current = {
          fromCenter: { ...centerRef.current },
          fromZoom: zoomRef.current,
          toCenter: { x: 0, y: 0 },
          toZoom: 0.45,
          startTime: Date.now(),
          duration: 800,
        };
        needsDrawRef.current = true;
        resetHintTimer();
        return; // don't start a drag
      }
    }

    // Cancel any in-progress fly animation so the user takes control immediately
    flyAnimRef.current = null;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      // Single finger — start a pan
      dragRef.current = { x: e.clientX, y: e.clientY, cx: centerRef.current.x, cy: centerRef.current.y };
      lastPinchDistRef.current = null;
    } else {
      // Second finger arrived — cancel pan and initialise pinch-to-zoom
      dragRef.current = null;
      const pts = [...pointersRef.current.values()];
      lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
    resetHintTimer();
  }, [resetHintTimer, pushNavHistory]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      // ── Pinch-to-zoom ──────────────────────────────────────────────────────
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (lastPinchDistRef.current !== null && lastPinchDistRef.current > 0) {
        const factor = dist / lastPinchDistRef.current;
        const canvas = canvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          // Zoom centred on the midpoint between the two fingers
          const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
          const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
          const W = rect.width, H = rect.height;
          const minDim = Math.min(W, H);
          // Fractal-space point currently under the pinch midpoint
          const fractalX =  (midX - W / 2) / (minDim * zoomRef.current) + centerRef.current.x;
          const fractalY = -(midY - H / 2) / (minDim * zoomRef.current) + centerRef.current.y;
          const newZoom = Math.max(0.05, Math.min(1e8, zoomRef.current * factor));
          // Shift center so the same fractal point stays under the pinch midpoint
          centerRef.current = {
            x: fractalX - (midX - W / 2) / (minDim * newZoom),
            y: fractalY + (midY - H / 2) / (minDim * newZoom),
          };
          zoomRef.current = newZoom;
          setZoomLevel(newZoom);
          needsDrawRef.current = true;
        }
      }
      lastPinchDistRef.current = dist;
      return;
    }

    // ── Single-pointer pan (existing logic) ───────────────────────────────────
    if (!dragRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const scale  = 1 / (Math.min(canvas.offsetWidth, canvas.offsetHeight) * zoomRef.current);
    const dx = (e.clientX - dragRef.current.x) * scale;
    const dy = (e.clientY - dragRef.current.y) * scale;
    centerRef.current = { x: dragRef.current.cx - dx, y: dragRef.current.cy + dy };
    needsDrawRef.current = true;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      // All fingers lifted
      dragRef.current = null;
      lastPinchDistRef.current = null;
      setCenterDisplay({ ...centerRef.current });
    } else if (pointersRef.current.size === 1) {
      // One finger lifted — transition back to single-pointer pan from the current position
      lastPinchDistRef.current = null;
      const [pt] = [...pointersRef.current.values()];
      dragRef.current = { x: pt.x, y: pt.y, cx: centerRef.current.x, cy: centerRef.current.y };
    }
  }, []);

  // ── Mouse coordinate tracking ────────────────────────────────────────────────
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    const minDim = Math.min(W, H);
    const re = (mouseX - W / 2) / (minDim * zoomRef.current) + centerRef.current.x;
    const im = -(mouseY - H / 2) / (minDim * zoomRef.current) + centerRef.current.y;
    setMouseCoords({ re, im });
  }, []);

  const onMouseLeave = useCallback(() => {
    setMouseCoords(null);
  }, []);

  // ── Double-click to zoom in (4×) centred on clicked fractal point ───────────
  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    const minDim = Math.min(W, H);

    // Fractal-space coordinate currently under the cursor
    const fractalX =  (mouseX - W / 2) / (minDim * zoomRef.current) + centerRef.current.x;
    const fractalY = -(mouseY - H / 2) / (minDim * zoomRef.current) + centerRef.current.y;

    // Record current position in navigation history before jumping
    pushNavHistory();

    // Smoothly fly 4× into that point using the shared fly animation system
    flyAnimRef.current = {
      fromCenter: { ...centerRef.current },
      fromZoom: zoomRef.current,
      toCenter: { x: fractalX, y: fractalY },
      toZoom: Math.min(1e8, zoomRef.current * 4),
      startTime: Date.now(),
      duration: 500,
    };
    needsDrawRef.current = true;
    resetHintTimer();
  }, [resetHintTimer, pushNavHistory]);

  // ── Wheel (zoom to cursor) ───────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Cancel any in-progress fly animation so the user takes control immediately
    flyAnimRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const factor = e.deltaY > 0 ? 0.85 : 1 / 0.85;
    const newZoom = Math.max(0.05, Math.min(1e8, zoomRef.current * factor));

    // Keep the fractal point under the cursor fixed while zooming.
    // Use CSS dimensions (offsetWidth/Height) consistent with the pan handler.
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;
    const minDim = Math.min(W, H);

    // Fractal coordinate currently under the cursor (before zoom changes)
    const fractalX =  (mouseX - W / 2) / (minDim * zoomRef.current) + centerRef.current.x;
    const fractalY = -(mouseY - H / 2) / (minDim * zoomRef.current) + centerRef.current.y;

    // Shift center so that same fractal point stays under the cursor after zoom
    centerRef.current = {
      x: fractalX - (mouseX - W / 2) / (minDim * newZoom),
      y: fractalY + (mouseY - H / 2) / (minDim * newZoom),
    };

    zoomRef.current = newZoom;
    setZoomLevel(newZoom);
    setCenterDisplay({ ...centerRef.current });
    needsDrawRef.current = true;
    resetHintTimer();
  }, [resetHintTimer]);

  // ── UI handlers ─────────────────────────────────────────────────────────────
  const setModeUI = (m: FractalKey) => {
    modeRef.current = m;
    setMode(m);
    // Reset view to nice defaults per mode
    if (m === "mandelbrot") { centerRef.current = { x: -0.5, y: 0 };    zoomRef.current = 0.35; setZoomLevel(0.35); setCenterDisplay({ x: -0.5, y: 0 }); }
    if (m === "julia")      { centerRef.current = { x:  0.0, y: 0 };    zoomRef.current = 0.45; setZoomLevel(0.45); setCenterDisplay({ x: 0.0,  y: 0 }); }
    if (m === "burning")    { centerRef.current = { x: -0.4, y: 0.6 };  zoomRef.current = 0.4;  setZoomLevel(0.4);  setCenterDisplay({ x: -0.4, y: 0.6 }); }
    if (m === "newton")     { centerRef.current = { x:  0.0, y: 0 };    zoomRef.current = 0.5;  setZoomLevel(0.5);  setCenterDisplay({ x: 0.0,  y: 0 }); }
    if (m === "tricorn")    { centerRef.current = { x:  0.0, y: 0 };    zoomRef.current = 0.35; setZoomLevel(0.35); setCenterDisplay({ x: 0.0,  y: 0 }); }
    needsDrawRef.current = true;
  };

  const setPaletteUI = (i: number) => {
    palRef.current = i;
    setPalette(i);
    needsDrawRef.current = true;
  };

  const togglePlay = () => {
    // Resume animation → clear any direct Julia c override (animation uses orbit)
    juliaCDirectRef.current = null;
    setJuliaCDirect(null);
    playingRef.current = !playingRef.current;
    setPlaying(p => !p);
  };

  const stepFrame = (dir: number) => {
    // Stepping advances the orbit angle → clear direct c override
    juliaCDirectRef.current = null;
    setJuliaCDirect(null);
    dirRef.current = dir;
    juliaAngleRef.current += JULIA_ORBIT_SPEED * 8 * dir;
    colorShiftRef.current += 0.0004 * 8 * dir;
    setJuliaAngle(juliaAngleRef.current);
    setColorShift(((colorShiftRef.current % 1) + 1) % 1);
    needsDrawRef.current = true;
  };

  const setDir = (d: number) => {
    // Starting animation → clear direct c override
    juliaCDirectRef.current = null;
    setJuliaCDirect(null);
    dirRef.current = d;
    if (!playingRef.current) { playingRef.current = true; setPlaying(true); }
  };

  const reset = () => {
    juliaCDirectRef.current = null;
    setJuliaCDirect(null);
    playingRef.current = false; setPlaying(false);
    juliaAngleRef.current = 0;  setJuliaAngle(0);
    colorShiftRef.current = 0;  setColorShift(0);
    dirRef.current = 1;
    // Clear navigation history on full reset
    backStackRef.current = [];
    forwardStackRef.current = [];
    setCanGoBack(false);
    setCanGoForward(false);
    setModeUI(modeRef.current); // re-centres view
  };

  const updateMaxIter = (v: number) => {
    maxIterRef.current = v;
    setMaxIter(v);
    needsDrawRef.current = true;
  };

  const applyPreset = (preset: Preset) => {
    // Record current position in navigation history before jumping
    pushNavHistory();

    // Keep current preset index in sync so [ / ] continues from here
    const builtinIdx = PRESETS.indexOf(preset);
    if (builtinIdx !== -1) currentPresetIdxRef.current = builtinIdx;

    // Stop Julia/color animation and clear any direct c override
    juliaCDirectRef.current = null;
    setJuliaCDirect(null);
    playingRef.current = false;
    setPlaying(false);

    // Apply mode, julia angle, and color shift immediately (non-spatial changes)
    modeRef.current = preset.mode;
    setMode(preset.mode);
    const angle = preset.juliaAngle ?? 0;
    juliaAngleRef.current = angle;
    setJuliaAngle(angle);
    colorShiftRef.current = 0;
    setColorShift(0);
    dirRef.current = 1;

    // Fly smoothly to the preset view instead of snapping
    flyAnimRef.current = {
      fromCenter: { ...centerRef.current },
      fromZoom: zoomRef.current,
      toCenter: preset.center,
      toZoom: preset.zoom,
      startTime: Date.now(),
      duration: 1200,
    };

    needsDrawRef.current = true;
    setShowPresets(false);
  };

  const shareView = useCallback(() => {
    const params = new URLSearchParams({
      cx: centerRef.current.x.toString(),
      cy: centerRef.current.y.toString(),
      z:  zoomRef.current.toString(),
      m:  modeRef.current,
      p:  palRef.current.toString(),
      mi: maxIterRef.current.toString(),
      ja: juliaAngleRef.current.toString(),
    });
    const hash = params.toString();
    window.history.replaceState(null, "", `#${hash}`);
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* clipboard not available */});
  }, []);

  const saveImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Ensure the latest frame is rendered before capturing
    draw();
    const paletteName = PALETTES[palRef.current]?.toLowerCase() ?? "custom";
    const filename = `fractal-${modeRef.current}-${paletteName}-${Date.now()}.png`;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    link.click();
  }, [draw]);

  /** Save the current view as a personal bookmark in localStorage. */
  const saveBookmark = useCallback(() => {
    const modeName = FRACTAL_MODES.find((m) => m.key === modeRef.current)?.label ?? modeRef.current;
    const mag = formatMag(zoomRef.current);
    const name = `${modeName} · ${mag}`;
    const newFav: FavoritePreset = {
      id: Date.now().toString(),
      name,
      mode: modeRef.current,
      center: { ...centerRef.current },
      zoom: zoomRef.current,
      juliaAngle: juliaAngleRef.current,
    };
    setFavorites((prev) => [newFav, ...prev]);
    setSavedBookmark(true);
    setTimeout(() => setSavedBookmark(false), 2000);
  }, []);

  /** Delete a saved bookmark by id. */
  const deleteBookmark = useCallback((id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /** Push the current view onto the back-stack before a deliberate navigation jump. */
  const pushNavHistory = useCallback(() => {
    backStackRef.current = [
      ...backStackRef.current,
      { center: { ...centerRef.current }, zoom: zoomRef.current, mode: modeRef.current },
    ];
    forwardStackRef.current = [];
    setCanGoBack(true);
    setCanGoForward(false);
  }, []);

  /** Fly back to the previous history entry. */
  const goBack = useCallback(() => {
    if (backStackRef.current.length === 0) return;
    const target = backStackRef.current[backStackRef.current.length - 1];
    backStackRef.current = backStackRef.current.slice(0, -1);
    forwardStackRef.current = [
      { center: { ...centerRef.current }, zoom: zoomRef.current, mode: modeRef.current },
      ...forwardStackRef.current,
    ];
    if (target.mode !== modeRef.current) { modeRef.current = target.mode; setMode(target.mode); }
    flyAnimRef.current = {
      fromCenter: { ...centerRef.current },
      fromZoom: zoomRef.current,
      toCenter: target.center,
      toZoom: target.zoom,
      startTime: Date.now(),
      duration: 600,
    };
    setCenterDisplay(target.center);
    setZoomLevel(target.zoom);
    needsDrawRef.current = true;
    setCanGoBack(backStackRef.current.length > 0);
    setCanGoForward(true);
  }, []);

  /** Fly forward to the next history entry. */
  const goForward = useCallback(() => {
    if (forwardStackRef.current.length === 0) return;
    const target = forwardStackRef.current[0];
    forwardStackRef.current = forwardStackRef.current.slice(1);
    backStackRef.current = [
      ...backStackRef.current,
      { center: { ...centerRef.current }, zoom: zoomRef.current, mode: modeRef.current },
    ];
    if (target.mode !== modeRef.current) { modeRef.current = target.mode; setMode(target.mode); }
    flyAnimRef.current = {
      fromCenter: { ...centerRef.current },
      fromZoom: zoomRef.current,
      toCenter: target.center,
      toZoom: target.zoom,
      startTime: Date.now(),
      duration: 600,
    };
    setCenterDisplay(target.center);
    setZoomLevel(target.zoom);
    needsDrawRef.current = true;
    setCanGoBack(true);
    setCanGoForward(forwardStackRef.current.length > 0);
  }, []);

  const juliaCx = juliaCDirect
    ? juliaCDirect.x.toFixed(4)
    : (Math.cos(juliaAngle) * JULIA_ORBIT_R).toFixed(4);
  const juliaCy = juliaCDirect
    ? juliaCDirect.y.toFixed(4)
    : (Math.sin(juliaAngle) * JULIA_ORBIT_R).toFixed(4);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black select-none">
      {/* ── Canvas ── */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onDoubleClick={onDoubleClick}
      />

      {/* ── Controls overlay ── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 pointer-events-none">

        {/* Julia C display */}
        {mode === "julia" && (
          <div className="text-white/60 text-xs font-mono bg-black/40 backdrop-blur px-3 py-1 rounded-full pointer-events-none">
            c = {juliaCx} + {juliaCy}i
          </div>
        )}

        <div className="flex gap-3 items-center flex-wrap justify-center pointer-events-auto">

          {/* Fractal mode pills */}
          <div className="flex bg-black/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
            {FRACTAL_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setModeUI(m.key)}
                title={m.description}
                className={[
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === m.key
                    ? "bg-white/20 text-white"
                    : "text-white/50 hover:text-white/80 hover:bg-white/10",
                ].join(" ")}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Animation controls */}
          <div className="flex items-center gap-1 bg-black/50 backdrop-blur border border-white/10 rounded-xl px-2 py-1">
            <button
              title="Play Backward"
              onClick={() => setDir(-1)}
              className="p-1.5 text-white/60 hover:text-white transition-colors"
            >
              <SkipBack size={14} />
            </button>
            <button
              title="Step Backward"
              onClick={() => stepFrame(-1)}
              className="p-1.5 text-white/60 hover:text-white transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={togglePlay}
              className="p-1.5 text-white hover:text-white/80 transition-colors"
              title={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              title="Step Forward"
              onClick={() => stepFrame(1)}
              className="p-1.5 text-white/60 hover:text-white transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              title="Play Forward"
              onClick={() => setDir(1)}
              className="p-1.5 text-white/60 hover:text-white transition-colors"
            >
              <SkipForward size={14} />
            </button>
          </div>

          {/* Palette */}
          <div className="flex bg-black/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
            {PALETTES.map((name, i) => (
              <button
                key={i}
                onClick={() => setPaletteUI(i)}
                className={[
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
                  palette === i
                    ? "bg-white/20 text-white"
                    : "text-white/50 hover:text-white/80 hover:bg-white/10",
                ].join(" ")}
              >
                <span
                  className="w-7 h-1.5 rounded-full shrink-0 opacity-90"
                  style={{ background: PALETTE_GRADIENTS[i] }}
                />
                {name}
              </button>
            ))}
          </div>

          {/* Back / Forward navigation */}
          <div className="flex items-center bg-black/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              title="Back (Backspace)"
              className="p-2 text-white/60 hover:text-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <Undo2 size={14} />
            </button>
            <div className="w-px h-4 bg-white/15" />
            <button
              onClick={goForward}
              disabled={!canGoForward}
              title="Forward (Shift+Backspace)"
              className="p-2 text-white/60 hover:text-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <Redo2 size={14} />
            </button>
          </div>

          {/* Reset */}
          <button
            onClick={reset}
            title="Reset"
            className="p-2 bg-black/50 backdrop-blur border border-white/10 rounded-xl text-white/60 hover:text-white transition-colors"
          >
            <RotateCcw size={14} />
          </button>

          {/* Presets */}
          <div className="relative">
            <button
              onClick={() => setShowPresets((v) => !v)}
              title="Preset locations"
              className={[
                "flex items-center gap-1.5 px-2.5 py-2 backdrop-blur border rounded-xl text-xs font-medium transition-all duration-200",
                showPresets
                  ? "bg-white/20 border-white/30 text-white"
                  : "bg-black/50 border-white/10 text-white/60 hover:text-white",
              ].join(" ")}
            >
              <Bookmark size={13} />
              <span>Presets</span>
            </button>

            {showPresets && (
              <div className="absolute bottom-full mb-2 right-0 w-56 bg-black/80 backdrop-blur border border-white/15 rounded-xl overflow-hidden shadow-xl z-10 max-h-96 overflow-y-auto">
                {/* User bookmarks section (shown first, when any are saved) */}
                {favorites.length > 0 && (
                  <div>
                    <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-yellow-400/60">
                      My Bookmarks
                    </div>
                    {favorites.map((fav) => (
                      <div key={fav.id} className="flex items-center group">
                        <button
                          onClick={() => applyPreset(fav)}
                          className="flex-1 text-left px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors truncate"
                        >
                          {fav.name}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBookmark(fav.id);
                          }}
                          title="Delete bookmark"
                          className="pr-2 py-1.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    <div className="border-t border-white/10 my-1" />
                  </div>
                )}
                {/* Built-in preset groups */}
                {(["mandelbrot", "julia", "burning", "newton", "tricorn"] as FractalKey[]).map((groupKey) => {
                  const groupPresets = PRESETS.filter((p) => p.mode === groupKey);
                  const groupLabel =
                    groupKey === "mandelbrot"
                      ? "Mandelbrot"
                      : groupKey === "julia"
                      ? "Julia"
                      : groupKey === "burning"
                      ? "Burning Ship"
                      : groupKey === "newton"
                      ? "Newton"
                      : "Tricorn";
                  return (
                    <div key={groupKey}>
                      <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                        {groupLabel}
                      </div>
                      {groupPresets.map((preset) => (
                        <button
                          key={preset.name}
                          onClick={() => applyPreset(preset)}
                          className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save current view as a personal bookmark */}
          <button
            onClick={saveBookmark}
            title="Bookmark this view (appears in Presets → My Bookmarks)"
            className={[
              "flex items-center gap-1.5 px-2.5 py-2 backdrop-blur border rounded-xl text-xs font-medium transition-all duration-200",
              savedBookmark
                ? "bg-yellow-500/30 border-yellow-400/40 text-yellow-300"
                : "bg-black/50 border-white/10 text-white/60 hover:text-white",
            ].join(" ")}
          >
            {savedBookmark ? (
              <>
                <Check size={13} />
                <span>Saved!</span>
              </>
            ) : (
              <BookmarkPlus size={13} />
            )}
          </button>

          {/* Save as PNG */}
          <button
            onClick={saveImage}
            title="Save as PNG"
            className="p-2 bg-black/50 backdrop-blur border border-white/10 rounded-xl text-white/60 hover:text-white transition-colors"
          >
            <Camera size={14} />
          </button>

          {/* Share / copy link */}
          <button
            onClick={shareView}
            title="Copy shareable link to this view"
            className={[
              "flex items-center gap-1.5 px-2.5 py-2 backdrop-blur border rounded-xl text-xs font-medium transition-all duration-200",
              copied
                ? "bg-green-500/30 border-green-400/40 text-green-300"
                : "bg-black/50 border-white/10 text-white/60 hover:text-white",
            ].join(" ")}
          >
            {copied ? (
              <>
                <Check size={13} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Link size={13} />
                <span>Share</span>
              </>
            )}
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
            className="p-2 bg-black/50 backdrop-blur border border-white/10 rounded-xl text-white/60 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {/* Sliders row: iterations + color shift */}
        <div className="flex items-center gap-3 bg-black/40 backdrop-blur border border-white/10 rounded-xl px-4 py-2 pointer-events-auto">
          <Infinity size={12} className="text-white/50" />
          <span className="text-white/50 text-xs w-6">iter</span>
          <input
            type="range"
            min={50}
            max={1000}
            step={50}
            value={maxIter}
            onChange={(e) => updateMaxIter(Number(e.target.value))}
            className="w-28 accent-white/70"
          />
          <span className="text-white/60 text-xs w-8 text-right">{maxIter}</span>

          <div className="w-px h-4 bg-white/20 mx-1" />

          <Palette size={12} className="text-white/50" />
          <span className="text-white/50 text-xs w-6">hue</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={colorShift}
            onChange={(e) => {
              const v = Number(e.target.value);
              colorShiftRef.current = v;
              setColorShift(v);
              needsDrawRef.current = true;
            }}
            className="w-28 accent-white/70"
          />
        </div>
      </div>

      {/* ── Coordinate display — shows mouse position while hovering, center otherwise.
           Clicking the center display opens an inline editor to jump to exact coordinates. ── */}
      {isEditingCoords ? (
        <form
          className="absolute top-3 left-4 flex items-center gap-1 bg-black/70 backdrop-blur px-3 py-1.5 rounded-lg pointer-events-auto text-xs font-mono border border-white/25"
          onSubmit={(e) => {
            e.preventDefault();
            const re = parseFloat(editRe);
            const im = parseFloat(editIm);
            if (!isNaN(re) && !isNaN(im)) {
              centerRef.current = { x: re, y: im };
              setCenterDisplay({ x: re, y: im });
              needsDrawRef.current = true;
            }
            setIsEditingCoords(false);
          }}
          onKeyDown={(e) => { if (e.key === "Escape") setIsEditingCoords(false); }}
        >
          <span className="text-white/30 mr-1 shrink-0">ctr</span>
          <input
            type="text"
            value={editRe}
            onChange={(e) => setEditRe(e.target.value)}
            className="w-24 bg-transparent text-white outline-none border-b border-white/30 tabular-nums"
            autoFocus
            placeholder="0.000000"
            aria-label="Real part"
          />
          <span className="text-white/50 mx-0.5 shrink-0">+</span>
          <input
            type="text"
            value={editIm}
            onChange={(e) => setEditIm(e.target.value)}
            className="w-24 bg-transparent text-white outline-none border-b border-white/30 tabular-nums"
            placeholder="0.000000"
            aria-label="Imaginary part"
          />
          <span className="text-white/50 shrink-0">i</span>
          <button
            type="submit"
            className="ml-1.5 text-white/50 hover:text-white transition-colors shrink-0"
            title="Go to coordinates (Enter)"
          >
            ↵
          </button>
        </form>
      ) : (
        <div
          className={[
            "absolute top-3 left-4 text-white/60 text-xs font-mono bg-black/50 backdrop-blur px-3 py-1.5 rounded-lg tabular-nums",
            !mouseCoords
              ? "pointer-events-auto cursor-pointer hover:bg-black/65 hover:text-white/80 transition-colors"
              : "pointer-events-none",
          ].join(" ")}
          onClick={() => {
            if (!mouseCoords) {
              setEditRe(centerDisplay.x.toFixed(6));
              setEditIm(centerDisplay.y.toFixed(6));
              setIsEditingCoords(true);
            }
          }}
          title={!mouseCoords ? "Click to navigate to specific coordinates" : undefined}
        >
          {mouseCoords ? (
            <>
              {mouseCoords.re.toFixed(6)}{mouseCoords.im >= 0 ? " + " : " − "}{Math.abs(mouseCoords.im).toFixed(6)}i
            </>
          ) : (
            <span className="text-white/40">
              <span className="text-white/25 mr-1">ctr</span>
              {centerDisplay.x.toFixed(6)}{centerDisplay.y >= 0 ? " + " : " − "}{Math.abs(centerDisplay.y).toFixed(6)}i
            </span>
          )}
        </div>
      )}

      {/* ── Preset name toast — fades in when cycling presets with [ / ] ── */}
      <div
        className="absolute top-3 text-white/90 text-xs font-medium bg-black/65 backdrop-blur-sm px-4 py-1.5 rounded-full pointer-events-none whitespace-nowrap"
        style={{
          left: "50%",
          transition: "opacity 350ms ease, transform 350ms ease",
          opacity: presetToast ? 1 : 0,
          transform: presetToast
            ? "translateX(-50%) scale(1)"
            : "translateX(-50%) scale(0.92)",
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        {presetToast ?? ""}
      </div>

      {/* ── Zoom level + Hint ── */}
      <div className="absolute top-3 right-4 flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="text-white/70 text-xs font-mono bg-black/50 backdrop-blur px-3 py-1 rounded-lg tabular-nums">
          {formatMag(zoomLevel)}
        </div>
        <div
          className="text-white/30 text-xs text-right leading-relaxed"
          style={{
            transition: "opacity 1s ease",
            opacity: hintVisible ? 1 : 0,
          }}
        >
          {mode === "mandelbrot"
            ? "drag to pan · scroll to zoom · double-click to zoom in · shift+click for Julia set"
            : "drag to pan · scroll to zoom · pinch to zoom · double-click to zoom in"}
          <br />
          ← → ↑ ↓ pan · +/− zoom · space play · m mode · p palette · [ ] presets · r reset · s share · d save · f fullscreen
        </div>
      </div>
    </div>
  );
}
