"use client";

import { useEffect, useRef, useCallback } from "react";

// ── Types ───────────────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  alpha: number;
  /** Hue in [0, 360) */
  hue: number;
  /** How far along its lifecycle (for gentle pulsing) */
  phase: number;
  phaseSpeed: number;
}

// ── Custom event integration ────────────────────────────────────────────────────
// SelfImproveToggle dispatches these events so the canvas can react without
// any shared state or polling.

export type AmbientEvent =
  | { type: "self-improve-running"; running: boolean }
  | { type: "self-improve-commit" }
  | { type: "page-change"; hue: number };

declare global {
  interface WindowEventMap {
    "ambient-event": CustomEvent<AmbientEvent>;
  }
}

export function dispatchAmbientEvent(detail: AmbientEvent) {
  window.dispatchEvent(new CustomEvent("ambient-event", { detail }));
}

// ── Constants ───────────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 48;
const BASE_SPEED = 0.15;
const RUNNING_SPEED_MULT = 2.8;
const COMMIT_FLASH_DURATION = 1800; // ms
const CONNECTION_DISTANCE = 120;
const CONNECTION_ALPHA = 0.06;

// ── Consciousness: adaptive frame rate ──────────────────────────────────────────
// The canvas has an "arousal" level from 0 (deep sleep) to 1 (fully awake).
// Arousal determines frame interval: asleep → ~250ms (4fps), awake → 16ms (60fps).
// Events spike arousal; it decays exponentially back toward sleep.
const AROUSAL_DECAY = 0.0015;       // per ms — ~2s from full to half
const MIN_FRAME_INTERVAL = 16;      // ms at full arousal (60fps)
const MAX_FRAME_INTERVAL = 250;     // ms at zero arousal (4fps)
const SLEEP_THRESHOLD = 0.02;       // below this, skip connection drawing
const HUE_CONVERGE_THRESHOLD = 0.5; // degrees — hue is "settled" below this

// ── Component ───────────────────────────────────────────────────────────────────

export function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const commitFlashRef = useRef(0); // timestamp of last commit flash
  const isDarkRef = useRef(true);
  /** Target hue for the current page; particles lerp toward this. */
  const pageHueRef = useRef(217); // default: blue (Chat page)
  /** Current interpolated hue center — smoothly chases pageHueRef. */
  const currentHueCenterRef = useRef(217);
  /** Arousal level: 0 = deep sleep, 1 = fully awake */
  const arousalRef = useRef(1); // start awake for initial render
  /** Whether the tab is visible */
  const visibleRef = useRef(true);

  const createParticle = useCallback(
    (width: number, height: number): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const speed = BASE_SPEED * (0.3 + Math.random() * 0.7);
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1 + Math.random() * 2,
        baseAlpha: 0.08 + Math.random() * 0.15,
        alpha: 0,
        hue: 160 + Math.random() * 40, // emerald range (160–200)
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.003 + Math.random() * 0.006,
      };
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Detect dark mode
    const checkDark = () => {
      isDarkRef.current =
        document.documentElement.classList.contains("dark");
    };
    checkDark();
    const darkObserver = new MutationObserver(checkDark);
    darkObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Resize handler
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Visibility change — fully pause when tab is hidden
    const handleVisibility = () => {
      visibleRef.current = !document.hidden;
      if (!document.hidden) {
        // Wake up and restart the loop
        arousalRef.current = Math.max(arousalRef.current, 0.3);
        scheduleNext(performance.now());
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Initialize particles
    const w = window.innerWidth;
    const h = window.innerHeight;
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
      createParticle(w, h)
    );

    // Listen for ambient events
    const handleAmbientEvent = (e: CustomEvent<AmbientEvent>) => {
      if (e.detail.type === "self-improve-running") {
        isRunningRef.current = e.detail.running;
        // Spike arousal when running state changes
        arousalRef.current = 1;
      } else if (e.detail.type === "self-improve-commit") {
        commitFlashRef.current = performance.now();
        arousalRef.current = 1;
      } else if (e.detail.type === "page-change") {
        pageHueRef.current = e.detail.hue;
        // Wake up to animate the hue transition
        arousalRef.current = Math.max(arousalRef.current, 0.8);
      }
    };
    window.addEventListener("ambient-event", handleAmbientEvent);

    // ── Adaptive animation loop ──────────────────────────────────────────
    let lastTime = performance.now();

    /** Compute how long to wait before the next frame based on arousal. */
    const frameInterval = (arousal: number): number => {
      // Lerp between max and min interval
      return MAX_FRAME_INTERVAL - arousal * (MAX_FRAME_INTERVAL - MIN_FRAME_INTERVAL);
    };

    /** Schedule the next frame — uses rAF when awake, setTimeout when drowsy. */
    const scheduleNext = (now: number) => {
      // Clear any pending timer
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);

      if (!visibleRef.current) return; // fully paused

      const interval = frameInterval(arousalRef.current);
      if (interval <= 20) {
        // High arousal: use rAF for smoothness
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Low arousal: use setTimeout to actually throttle CPU
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          animate(performance.now());
        }, interval);
      }
    };

    const animate = (now: number) => {
      const dt = Math.min(now - lastTime, 50); // cap delta to avoid jumps
      lastTime = now;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dark = isDarkRef.current;
      const running = isRunningRef.current;
      const flashAge = now - commitFlashRef.current;
      const flashIntensity =
        flashAge < COMMIT_FLASH_DURATION
          ? 1 - flashAge / COMMIT_FLASH_DURATION
          : 0;

      // ── Update arousal ──────────────────────────────────────────────────
      // Running or flashing keeps arousal pinned high
      if (running) {
        arousalRef.current = 1;
      } else if (flashIntensity > 0) {
        arousalRef.current = Math.max(arousalRef.current, flashIntensity);
      } else {
        // Check if hue is still transitioning
        const targetHue = pageHueRef.current;
        let hueDiff = targetHue - currentHueCenterRef.current;
        if (hueDiff > 180) hueDiff -= 360;
        if (hueDiff < -180) hueDiff += 360;
        const hueSettled = Math.abs(hueDiff) < HUE_CONVERGE_THRESHOLD;

        if (hueSettled) {
          // Decay toward sleep
          arousalRef.current *= Math.max(0, 1 - AROUSAL_DECAY * dt);
        } else {
          // Keep somewhat awake for hue lerp
          arousalRef.current = Math.max(arousalRef.current, 0.3);
        }
      }

      const arousal = arousalRef.current;

      ctx.clearRect(0, 0, width, height);

      // Smoothly lerp the hue center toward the target page hue.
      const targetHue = pageHueRef.current;
      let hueDiff = targetHue - currentHueCenterRef.current;
      if (hueDiff > 180) hueDiff -= 360;
      if (hueDiff < -180) hueDiff += 360;
      const lerpSpeed = 0.003;
      currentHueCenterRef.current += hueDiff * Math.min(lerpSpeed * dt, 1);
      currentHueCenterRef.current =
        ((currentHueCenterRef.current % 360) + 360) % 360;

      const hueCenter = currentHueCenterRef.current;

      const speedMult = running
        ? RUNNING_SPEED_MULT
        : 1 + flashIntensity * 1.5;

      const particles = particlesRef.current;

      // Update & draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Update position
        p.x += p.vx * speedMult * (dt / 16);
        p.y += p.vy * speedMult * (dt / 16);

        // When running, add subtle upward drift
        if (running) {
          p.vy -= 0.001 * (dt / 16);
          p.vy = Math.max(p.vy, -BASE_SPEED * 3);
        } else {
          p.vy += (Math.sin(p.phase) * BASE_SPEED * 0.5 - p.vy) * 0.001 * dt;
        }

        // Wrap around edges
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        // Phase for gentle pulsing
        p.phase += p.phaseSpeed * dt;
        const pulse = 0.7 + 0.3 * Math.sin(p.phase);

        // Compute alpha
        let alpha = p.baseAlpha * pulse;
        if (running) alpha *= 1.8;
        if (flashIntensity > 0) alpha += flashIntensity * 0.35;
        alpha = Math.min(alpha, 0.6);
        p.alpha = alpha;

        let hue = hueCenter + (p.hue - 180) * 0.25;
        if (running) hue = 155 + Math.sin(p.phase * 0.5) * 15;
        if (flashIntensity > 0)
          hue = hue + flashIntensity * (50 + Math.sin(p.phase) * 30);

        const saturation = dark ? 70 : 50;
        const lightness = dark ? 65 : 45;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1 + flashIntensity * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
        ctx.fill();

        // Draw glow when running or flashing
        if ((running || flashIntensity > 0) && p.radius > 1.2) {
          const glowAlpha = (running ? 0.04 : 0) + flashIntensity * 0.08;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${glowAlpha})`;
          ctx.fill();
        }
      }

      // Draw connections only when arousal is above sleep threshold (saves O(n²) work)
      if (dark && arousal > SLEEP_THRESHOLD) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < CONNECTION_DISTANCE) {
              const lineAlpha =
                CONNECTION_ALPHA *
                (1 - dist / CONNECTION_DISTANCE) *
                (running ? 2.5 : 1) *
                (1 + flashIntensity * 3);
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `hsla(${hueCenter}, 60%, 60%, ${Math.min(lineAlpha, 0.2)})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      // Schedule next frame adaptively
      scheduleNext(now);
    };

    // Kick off
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("ambient-event", handleAmbientEvent);
      document.removeEventListener("visibilitychange", handleVisibility);
      darkObserver.disconnect();
    };
  }, [createParticle]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
