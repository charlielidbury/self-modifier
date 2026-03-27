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
  | { type: "self-improve-commit" };

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

// ── Component ───────────────────────────────────────────────────────────────────

export function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const isRunningRef = useRef(false);
  const commitFlashRef = useRef(0); // timestamp of last commit flash
  const isDarkRef = useRef(true);

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
      } else if (e.detail.type === "self-improve-commit") {
        commitFlashRef.current = performance.now();
      }
    };
    window.addEventListener("ambient-event", handleAmbientEvent);

    // ── Animation loop ────────────────────────────────────────────────────
    let lastTime = performance.now();

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

      ctx.clearRect(0, 0, width, height);

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
          // Clamp vertical speed to prevent runaway
          p.vy = Math.max(p.vy, -BASE_SPEED * 3);
        } else {
          // Slowly restore natural drift
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

        // Shift hue toward emerald-green when running, toward blue-violet on flash
        let hue = p.hue;
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

      // Draw faint connections between nearby particles
      if (dark) {
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
              ctx.strokeStyle = `hsla(170, 60%, 60%, ${Math.min(lineAlpha, 0.2)})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("ambient-event", handleAmbientEvent);
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
