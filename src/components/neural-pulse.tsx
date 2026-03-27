"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useEventBus } from "@/hooks/use-event-bus";

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
// Full navbar height (h-12 = 48px minus 8px vertical padding = 40px)
const WIDTH = 120;
const HEIGHT = 40;

// ── IQ cosine color palettes ────────────────────────────────────────────────
// color(t) = a + b * cos(2π(c*t + d))
// Each palette is [a, b, c, d] where each is [r, g, b]
type Palette = [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];

// Neon palettes — vivid, saturated colours that pop against any background.
// Inspired by the main fractals page: hot pink ↔ electric cyan ↔ acid green.

const PALETTE_IDLE: Palette = [
  [0.55, 0.25, 0.65],  // a — magenta-violet base
  [0.45, 0.35, 0.35],  // b — strong variation
  [1.0, 1.0, 1.0],     // c — frequency
  [0.0, 0.33, 0.67],   // d — rainbow phase spread
];

const PALETTE_ACTIVE: Palette = [
  [0.5, 0.3, 0.7],     // a — electric violet base
  [0.5, 0.5, 0.4],     // b — vivid swings
  [1.0, 1.2, 0.8],     // c — varied frequency for shimmer
  [0.0, 0.25, 0.55],   // d — cyan-magenta-gold phase
];

const PALETTE_COMMIT: Palette = [
  [0.2, 0.9, 0.5],     // a — neon green base
  [0.4, 0.3, 0.5],     // b — green→cyan→magenta
  [1.0, 0.8, 1.2],     // c
  [0.0, 0.15, 0.5],    // d
];

const PALETTE_OFF: Palette = [
  [0.4, 0.2, 0.5],     // a — muted violet
  [0.2, 0.15, 0.25],   // b — subtle neon hint
  [1.0, 1.0, 1.0],     // c
  [0.0, 0.33, 0.67],   // d — same rainbow spread, just dimmer
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
    maxIter: 12,
    cReal: -0.7,
    cImag: 0.27015,
    zoom: 3.0,
    brightness: 0.35,
    palette: PALETTE_OFF as Palette,
    animSpeed: 0.0005,
  });

  // Listen to SSE events to determine agent state (replaces polling)
  useEventBus("self-improve:activity", useCallback((raw: unknown) => {
    const data = raw as { events?: { id: number; kind: string; content: string }[]; running?: boolean };
    const newEvents = data.events ?? [];

    const hasCommit = newEvents.some(
      (e) => e.kind === "text" && e.content.includes("DONE [")
    );

    if (hasCommit) {
      stateRef.current = "commit";
      commitFlashRef.current = 120;
      setCurrentState("commit");
    } else if (data.running) {
      if (stateRef.current !== "commit") {
        stateRef.current = "active";
        setCurrentState("active");
      }
    }
  }, []));

  useEventBus("self-improve:status", useCallback((raw: unknown) => {
    const data = raw as { enabled?: boolean; running?: boolean };
    if (stateRef.current === "commit") return; // Don't interrupt commit flash

    if (data.running) {
      stateRef.current = "active";
      setCurrentState("active");
    } else if (data.enabled) {
      stateRef.current = "idle";
      setCurrentState("idle");
    } else {
      stateRef.current = "off";
      setCurrentState("off");
    }
  }, []));

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
    let targetBrightness: number;
    let targetPalette: Palette;

    switch (state) {
      case "off":
        targetMaxIter = 12;
        targetAnimSpeed = 0.0003;
        targetBrightness = 0.35;
        targetPalette = PALETTE_OFF;
        break;
      case "idle":
        targetMaxIter = 24;
        targetAnimSpeed = 0.0015;
        targetBrightness = 0.85;
        targetPalette = PALETTE_IDLE;
        break;
      case "active":
        targetMaxIter = 40;
        targetAnimSpeed = 0.006;
        targetBrightness = 1.0;
        targetPalette = PALETTE_ACTIVE;
        break;
      case "commit": {
        const flash = commitFlashRef.current / 120;
        targetMaxIter = 32;
        targetAnimSpeed = 0.003;
        targetBrightness = 0.9 + flash * 0.3;
        targetPalette = lerpPalette(PALETTE_IDLE, PALETTE_COMMIT, flash);
        break;
      }
    }

    // ── Smooth interpolation toward targets ───────────────────────────────
    // (zoom is handled dynamically below, not via static targets)
    const lerp = 0.06;
    sm.maxIter = sm.maxIter + (targetMaxIter - sm.maxIter) * lerp;
    sm.animSpeed = sm.animSpeed + (targetAnimSpeed - sm.animSpeed) * lerp;
    sm.brightness = sm.brightness + (targetBrightness - sm.brightness) * lerp;
    sm.palette = lerpPalette(sm.palette, targetPalette, lerp);

    // ── Animate the Julia set c parameter ─────────────────────────────────
    // Trace a path through interesting Julia set territory near the
    // Mandelbrot set boundary — a Lissajous-like orbit that visits
    // dendrites, spirals, and Douady rabbits.
    const t = f * sm.animSpeed;
    sm.cReal = -0.72 + 0.18 * Math.sin(t * 2.1) + 0.06 * Math.cos(t * 5.3);
    sm.cImag = 0.27 + 0.12 * Math.cos(t * 1.7) + 0.04 * Math.sin(t * 4.1);

    // ── Dynamic zoom: estimate Julia set extent via coarse sampling ──────
    // Sample a grid of points in a wide view to find the bounding box of
    // the interior (iter === maxIter), then compute a zoom that fits it
    // with some padding. This runs every frame but is cheap (coarse grid).
    const probeIter = Math.round(sm.maxIter);
    const probeSize = 4.0; // wide view in complex plane
    const probeSamples = 32; // 32×32 = 1024 samples — very fast
    const probeStep = probeSize / probeSamples;
    let extMinR = Infinity, extMaxR = -Infinity;
    let extMinI = Infinity, extMaxI = -Infinity;
    let foundInterior = false;

    for (let sy = 0; sy < probeSamples; sy++) {
      const szi = -probeSize / 2 + sy * probeStep;
      for (let sx = 0; sx < probeSamples; sx++) {
        const szr = -probeSize / 2 + sx * probeStep;
        let zr = szr, zi = szi;
        let it = 0;
        while (it < probeIter) {
          const zr2 = zr * zr;
          const zi2 = zi * zi;
          if (zr2 + zi2 > 4.0) break;
          zi = 2 * zr * zi + sm.cImag;
          zr = zr2 - zi2 + sm.cReal;
          it++;
        }
        if (it === probeIter) {
          foundInterior = true;
          if (szr < extMinR) extMinR = szr;
          if (szr > extMaxR) extMaxR = szr;
          if (szi < extMinI) extMinI = szi;
          if (szi > extMaxI) extMaxI = szi;
        }
      }
    }

    // Compute dynamic zoom from bounding box
    const aspect = pw / ph;
    if (foundInterior) {
      // Add padding (20%) around the fractal + account for glow halo
      const pad = 0.25;
      const extW = (extMaxR - extMinR) * (1 + pad);
      const extH = (extMaxI - extMinI) * (1 + pad);
      // Fit both axes: zoom = 2.0 / max(extH, extW/aspect)
      const needed = Math.max(extH, extW / aspect);
      const dynamicZoom = needed > 0.01 ? 2.0 / needed : 3.0;
      // Clamp zoom to reasonable bounds
      const clampedZoom = Math.max(1.0, Math.min(5.0, dynamicZoom));
      sm.zoom = sm.zoom + (clampedZoom - sm.zoom) * 0.08; // smooth zoom transitions
    }
    // If no interior found (degenerate c), keep current zoom

    // ── Render the Julia set ──────────────────────────────────────────────
    const maxIter = Math.round(sm.maxIter);
    const zoom = sm.zoom;
    const cR = sm.cReal;
    const cI = sm.cImag;
    const brightness = sm.brightness;
    const pal = sm.palette;
    const data = imgDataRef.current.data;

    // The view window in complex plane coordinates
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
          // Inside the Julia set — the compact, bounded fractal region.
          // Color based on final orbit position for rich internal detail.
          const mag = Math.sqrt(zr * zr + zi * zi);
          const angle = Math.atan2(zi, zr);
          const colorT = (angle / Math.PI + 1) * 0.5;
          const depthT = Math.min(1, mag * 0.5);

          const [r, g, b] = iqColor(colorT * 0.5 + depthT * 0.5, pal);
          // Keep RGB vivid (full neon), control visibility via alpha only
          const alpha = Math.min(1, brightness * (0.6 + depthT * 0.4));
          data[idx] = Math.round(r * 255);
          data[idx + 1] = Math.round(g * 255);
          data[idx + 2] = Math.round(b * 255);
          data[idx + 3] = Math.round(alpha * 255);
        } else {
          // Outside the Julia set — transparent. Points very near the
          // boundary get a neon glow halo for anti-aliasing.
          const nearness = iter / maxIter;
          if (nearness > 0.6) {
            const glowT = (nearness - 0.6) / 0.4; // 0..1
            const [r, g, b] = iqColor(glowT, pal);
            // Neon glow: full colour, alpha fades in
            const alpha = Math.pow(glowT, 1.5) * brightness * 0.7;
            data[idx] = Math.round(r * 255);
            data[idx + 1] = Math.round(g * 255);
            data[idx + 2] = Math.round(b * 255);
            data[idx + 3] = Math.round(Math.min(1, alpha) * 255);
          } else {
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = 0;
          }
        }
      }
    }

    ctx.putImageData(imgDataRef.current, 0, 0);

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
      className="flex-shrink-0 opacity-90 hover:opacity-100 transition-opacity cursor-default"
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
