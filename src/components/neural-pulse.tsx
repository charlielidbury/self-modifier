"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * NeuralPulse — a tiny animated Julia set fractal that lives in the navbar.
 *
 * It polls the self-improve activity API to determine agent state, then renders
 * a continuously morphing Julia set whose complexity and intensity reflect
 * the agent's consciousness:
 *
 *  - **off**:     Near-static, low-iteration, faintly glowing fractal
 *  - **idle**:    Slow graceful drift through parameter space, soft colors
 *  - **active**:  Rapid morphing, high iterations, vivid saturated palette
 *  - **commit**:  Emerald flash + zoom pulse, then settle
 *
 * Rendered pixel-by-pixel via ImageData for maximum performance at 60fps.
 */

type PulseState = "off" | "idle" | "active" | "commit";

// Canvas dimensions (CSS pixels — scaled by DPR internally)
const WIDTH = 72;
const HEIGHT = 24;

// ── IQ cosine color palettes ────────────────────────────────────────────────
// color(t) = a + b * cos(2π(c*t + d))
// Each palette is [a, b, c, d] where each is [r, g, b]
type Palette = [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];

const PALETTE_IDLE: Palette = [
  [0.4, 0.4, 0.45],    // a — base gray-blue
  [0.15, 0.15, 0.2],   // b — subtle variation
  [1.0, 1.0, 1.0],     // c — frequency
  [0.0, 0.1, 0.2],     // d — phase offsets
];

const PALETTE_ACTIVE: Palette = [
  [0.5, 0.5, 0.55],    // a — brighter base
  [0.35, 0.4, 0.5],    // b — vivid variation
  [1.0, 1.0, 1.0],     // c
  [0.0, 0.15, 0.35],   // d — blue-violet phase
];

const PALETTE_COMMIT: Palette = [
  [0.3, 0.7, 0.5],     // a — emerald-shifted base
  [0.3, 0.35, 0.3],    // b
  [1.0, 1.0, 0.8],     // c
  [0.0, 0.1, 0.15],    // d
];

const PALETTE_OFF: Palette = [
  [0.35, 0.35, 0.35],  // a — neutral gray
  [0.08, 0.08, 0.08],  // b — barely any variation
  [1.0, 1.0, 1.0],     // c
  [0.0, 0.0, 0.0],     // d
];

function iqColor(t: number, pal: Palette): [number, number, number] {
  const [a, b, c, d] = pal;
  const tau = Math.PI * 2;
  return [
    Math.max(0, Math.min(1, a[0] + b[0] * Math.cos(tau * (c[0] * t + d[0])))),
    Math.max(0, Math.min(1, a[1] + b[1] * Math.cos(tau * (c[1] * t + d[1])))),
    Math.max(0, Math.min(1, a[2] + b[2] * Math.cos(tau * (c[2] * t + d[2])))),
  ];
}

// Lerp between two palettes
function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  const l = (x: number, y: number) => x + (y - x) * t;
  return [
    [l(a[0][0], b[0][0]), l(a[0][1], b[0][1]), l(a[0][2], b[0][2])],
    [l(a[1][0], b[1][0]), l(a[1][1], b[1][1]), l(a[1][2], b[1][2])],
    [l(a[2][0], b[2][0]), l(a[2][1], b[2][1]), l(a[2][2], b[2][2])],
    [l(a[3][0], b[3][0]), l(a[3][1], b[3][1]), l(a[3][2], b[3][2])],
  ];
}

export function NeuralPulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PulseState>("off");
  const commitFlashRef = useRef(0);
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const imgDataRef = useRef<ImageData | null>(null);
  const [currentState, setCurrentState] = useState<PulseState>("off");

  // Smoothly interpolated values for rendering
  const smoothRef = useRef({
    maxIter: 6,
    cReal: -0.7,
    cImag: 0.27015,
    zoom: 1.4,
    brightness: 0.4,
    palette: PALETTE_OFF as Palette,
    animSpeed: 0.0005,
  });

  // Poll the self-improve activity endpoint to determine state
  useEffect(() => {
    let cancelled = false;
    let lastEventId = 0;
    let lastEventCount = 0;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/self-improve/activity?since=${lastEventId}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();

        const newEvents: { id: number; kind: string; content: string }[] = data.events ?? [];
        if (newEvents.length > 0) {
          lastEventId = newEvents[newEvents.length - 1].id;
        }

        const hasCommit = newEvents.some(
          (e) => e.kind === "text" && e.content.includes("DONE [")
        );

        if (hasCommit) {
          stateRef.current = "commit";
          commitFlashRef.current = 120; // ~2s at 60fps
          setCurrentState("commit");
        } else if (data.running) {
          if (newEvents.length > lastEventCount) {
            stateRef.current = "active";
            setCurrentState("active");
          } else {
            if (stateRef.current !== "commit") {
              stateRef.current = "active";
              setCurrentState("active");
            }
          }
          lastEventCount = newEvents.length;
        } else {
          try {
            const statusRes = await fetch("/api/self-improve");
            if (statusRes.ok) {
              const status = await statusRes.json();
              if (status.enabled) {
                if (stateRef.current !== "commit") {
                  stateRef.current = "idle";
                  setCurrentState("idle");
                }
              } else {
                if (stateRef.current !== "commit") {
                  stateRef.current = "off";
                  setCurrentState("off");
                }
              }
            }
          } catch {
            if (stateRef.current !== "commit") {
              stateRef.current = "off";
              setCurrentState("off");
            }
          }
        }
      } catch {
        // Network error — don't change state
      }

      if (!cancelled) {
        setTimeout(poll, 2000);
      }
    }

    poll();
    return () => { cancelled = true; };
  }, []);

  // Listen for commit events from the self-improve toggle
  useEffect(() => {
    function handleCommit() {
      stateRef.current = "commit";
      commitFlashRef.current = 120;
      setCurrentState("commit");
    }
    window.addEventListener("self-improve:commit", handleCommit);
    return () => window.removeEventListener("self-improve:commit", handleCommit);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(WIDTH * dpr);
    const ph = Math.round(HEIGHT * dpr);

    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      imgDataRef.current = null;
    }

    if (!imgDataRef.current || imgDataRef.current.width !== pw || imgDataRef.current.height !== ph) {
      imgDataRef.current = ctx.createImageData(pw, ph);
    }

    frameRef.current++;
    const f = frameRef.current;
    const state = stateRef.current;
    const sm = smoothRef.current;

    // Handle commit flash countdown
    if (commitFlashRef.current > 0) {
      commitFlashRef.current--;
      if (commitFlashRef.current <= 0 && state === "commit") {
        stateRef.current = "idle";
        setCurrentState("idle");
      }
    }

    // ── Target parameters based on state ──────────────────────────────────
    let targetMaxIter: number;
    let targetAnimSpeed: number;
    let targetZoom: number;
    let targetBrightness: number;
    let targetPalette: Palette;

    switch (state) {
      case "off":
        targetMaxIter = 8;
        targetAnimSpeed = 0.0003;
        targetZoom = 1.3;
        targetBrightness = 0.35;
        targetPalette = PALETTE_OFF;
        break;
      case "idle":
        targetMaxIter = 16;
        targetAnimSpeed = 0.0015;
        targetZoom = 1.4;
        targetBrightness = 0.65;
        targetPalette = PALETTE_IDLE;
        break;
      case "active":
        targetMaxIter = 32;
        targetAnimSpeed = 0.006;
        targetZoom = 1.5;
        targetBrightness = 1.0;
        targetPalette = PALETTE_ACTIVE;
        break;
      case "commit": {
        const flash = commitFlashRef.current / 120;
        targetMaxIter = 28;
        targetAnimSpeed = 0.003;
        // Zoom pulse: zooms in then back out
        targetZoom = 1.4 + Math.sin(flash * Math.PI) * 0.4;
        targetBrightness = 0.7 + flash * 0.5;
        targetPalette = lerpPalette(PALETTE_IDLE, PALETTE_COMMIT, flash);
        break;
      }
    }

    // ── Smooth interpolation toward targets ───────────────────────────────
    const lerp = 0.06;
    sm.maxIter = sm.maxIter + (targetMaxIter - sm.maxIter) * lerp;
    sm.animSpeed = sm.animSpeed + (targetAnimSpeed - sm.animSpeed) * lerp;
    sm.zoom = sm.zoom + (targetZoom - sm.zoom) * lerp;
    sm.brightness = sm.brightness + (targetBrightness - sm.brightness) * lerp;
    sm.palette = lerpPalette(sm.palette, targetPalette, lerp);

    // ── Animate the Julia set c parameter ─────────────────────────────────
    // Trace a path through interesting Julia set territory near the
    // Mandelbrot set boundary — a Lissajous-like orbit that visits
    // dendrites, spirals, and Douady rabbits.
    const t = f * sm.animSpeed;
    sm.cReal = -0.72 + 0.18 * Math.sin(t * 2.1) + 0.06 * Math.cos(t * 5.3);
    sm.cImag = 0.27 + 0.12 * Math.cos(t * 1.7) + 0.04 * Math.sin(t * 4.1);

    // ── Render the Julia set ──────────────────────────────────────────────
    const maxIter = Math.round(sm.maxIter);
    const zoom = sm.zoom;
    const cR = sm.cReal;
    const cI = sm.cImag;
    const brightness = sm.brightness;
    const pal = sm.palette;
    const data = imgDataRef.current.data;

    // The view window in complex plane coordinates
    const aspect = pw / ph;
    const rangeY = 2.0 / zoom;
    const rangeX = rangeY * aspect;
    const minR = -rangeX / 2;
    const minI = -rangeY / 2;
    const stepR = rangeX / pw;
    const stepI = rangeY / ph;

    // Escape radius squared
    const escSq = 4.0;

    for (let py = 0; py < ph; py++) {
      const zi0 = minI + py * stepI;
      for (let px = 0; px < pw; px++) {
        const zr0 = minR + px * stepR;

        let zr = zr0;
        let zi = zi0;
        let iter = 0;

        // Julia set iteration: z = z² + c
        while (iter < maxIter) {
          const zr2 = zr * zr;
          const zi2 = zi * zi;
          if (zr2 + zi2 > escSq) break;
          zi = 2 * zr * zi + cI;
          zr = zr2 - zi2 + cR;
          iter++;
        }

        const idx = (py * pw + px) * 4;

        if (iter === maxIter) {
          // Inside the set — dark with faint glow
          const glow = brightness * 0.08;
          data[idx] = Math.round(glow * 60);
          data[idx + 1] = Math.round(glow * 60);
          data[idx + 2] = Math.round(glow * 70);
          data[idx + 3] = 255;
        } else {
          // Smooth iteration count for anti-banding
          const zr2 = zr * zr;
          const zi2 = zi * zi;
          const smooth = iter + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / Math.LN2;
          const colorT = smooth / maxIter;

          const [r, g, b] = iqColor(colorT, pal);
          data[idx] = Math.round(r * brightness * 255);
          data[idx + 1] = Math.round(g * brightness * 255);
          data[idx + 2] = Math.round(b * brightness * 255);
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgDataRef.current, 0, 0);

    // Subtle vignette overlay for polish
    const grad = ctx.createRadialGradient(pw / 2, ph / 2, pw * 0.25, pw / 2, ph / 2, pw * 0.6);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, pw, ph);

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      className="flex-shrink-0 rounded-sm opacity-90 hover:opacity-100 transition-opacity cursor-default"
      style={{
        width: WIDTH,
        height: HEIGHT,
        imageRendering: "auto",
      }}
      title={
        currentState === "off"
          ? "Self-improve: disabled"
          : currentState === "idle"
            ? "Self-improve: idle"
            : currentState === "active"
              ? "Self-improve: working…"
              : "Self-improve: commit!"
      }
      aria-label={`Self-improve status: ${currentState}`}
    />
  );
}
