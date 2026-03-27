"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * NeuralPulse — a tiny animated EKG/brainwave SVG that lives in the navbar.
 *
 * It polls the self-improve activity API to determine agent state:
 *  - **off**:     no waveform, just a dormant dot
 *  - **idle**:    gentle sine wave (agent enabled but not actively running)
 *  - **active**:  fast, complex brainwave pattern (agent is thinking/working)
 *  - **commit**:  sharp spike burst then settle (commit just landed)
 *
 * The waveform is drawn via requestAnimationFrame for butter-smooth 60fps.
 */

type PulseState = "off" | "idle" | "active" | "commit";

const WIDTH = 64;
const HEIGHT = 20;
const MID_Y = HEIGHT / 2;

export function NeuralPulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PulseState>("off");
  const commitFlashRef = useRef(0); // countdown frames for commit spike
  const frameRef = useRef(0);
  const rafRef = useRef<number>(0);
  const [currentState, setCurrentState] = useState<PulseState>("off");

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

        // Detect commits by checking for text events mentioning "DONE ["
        const hasCommit = newEvents.some(
          (e) => e.kind === "text" && e.content.includes("DONE [")
        );

        if (hasCommit) {
          stateRef.current = "commit";
          commitFlashRef.current = 90; // ~1.5s at 60fps
          setCurrentState("commit");
        } else if (data.running) {
          // If we got new events, agent is actively working
          if (newEvents.length > lastEventCount) {
            stateRef.current = "active";
            setCurrentState("active");
          } else {
            // Running but no new events — still active (might be between tool calls)
            if (stateRef.current !== "commit") {
              stateRef.current = "active";
              setCurrentState("active");
            }
          }
          lastEventCount = newEvents.length;
        } else {
          // Check if enabled at all
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
            // If status fetch fails, assume off
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for commit celebration events dispatched by the self-improve toggle
  useEffect(() => {
    function handleCommit() {
      stateRef.current = "commit";
      commitFlashRef.current = 90;
      setCurrentState("commit");
    }
    window.addEventListener("self-improve:commit", handleCommit);
    return () => window.removeEventListener("self-improve:commit", handleCommit);
  }, []);

  // The drawing loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== WIDTH * dpr || canvas.height !== HEIGHT * dpr) {
      canvas.width = WIDTH * dpr;
      canvas.height = HEIGHT * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    frameRef.current++;
    const f = frameRef.current;
    const state = stateRef.current;

    // Handle commit flash countdown
    if (commitFlashRef.current > 0) {
      commitFlashRef.current--;
      if (commitFlashRef.current <= 0 && state === "commit") {
        stateRef.current = "idle";
        setCurrentState("idle");
      }
    }

    if (state === "off") {
      // Dormant: just a subtle breathing dot
      const breathe = Math.sin(f * 0.03) * 0.3 + 0.4;
      ctx.beginPath();
      ctx.arc(WIDTH / 2, MID_Y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120, 120, 120, ${breathe})`;
      ctx.fill();
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Draw the waveform line
    ctx.beginPath();
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Color based on state
    let color: string;
    let glowColor: string;
    if (state === "commit") {
      const flash = commitFlashRef.current / 90;
      color = `rgba(52, 211, 153, ${0.6 + flash * 0.4})`; // emerald
      glowColor = `rgba(52, 211, 153, ${0.3 * flash})`;
    } else if (state === "active") {
      color = "rgba(96, 165, 250, 0.8)"; // blue-400
      glowColor = "rgba(96, 165, 250, 0.15)";
    } else {
      color = "rgba(156, 163, 175, 0.5)"; // gray-400
      glowColor = "rgba(156, 163, 175, 0.05)";
    }

    // Optional glow for active/commit states
    if (state !== "idle") {
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 4;
      ctx.restore();
    }

    ctx.strokeStyle = color;

    // Generate waveform points
    for (let x = 0; x < WIDTH; x++) {
      const t = x / WIDTH;
      let y = MID_Y;

      if (state === "idle") {
        // Gentle sine wave
        y = MID_Y + Math.sin(t * Math.PI * 3 + f * 0.04) * 2.5;
      } else if (state === "active") {
        // Complex brainwave: sum of multiple frequencies
        const wave1 = Math.sin(t * Math.PI * 4 + f * 0.08) * 3;
        const wave2 = Math.sin(t * Math.PI * 7 + f * 0.12) * 1.5;
        const wave3 = Math.sin(t * Math.PI * 13 + f * 0.05) * 1;
        // Occasional spike
        const spike = Math.pow(Math.sin(t * Math.PI * 2 + f * 0.03), 8) * 4;
        y = MID_Y + wave1 + wave2 + wave3 + spike;
      } else if (state === "commit") {
        const progress = 1 - commitFlashRef.current / 90;
        // Sharp EKG spike that decays
        const spikePos = 0.3 + progress * 0.4;
        const dist = Math.abs(t - spikePos);

        if (dist < 0.05) {
          // The sharp spike
          const spikeAmt = (1 - dist / 0.05) * (1 - progress);
          y = MID_Y - spikeAmt * 8;
        } else if (dist < 0.1) {
          // Negative dip after spike
          const dipAmt = (1 - (dist - 0.05) / 0.05) * (1 - progress);
          y = MID_Y + dipAmt * 3;
        } else {
          // Background oscillation decaying
          const decay = Math.max(0, 1 - progress * 1.5);
          y =
            MID_Y +
            Math.sin(t * Math.PI * 6 + f * 0.08) * 2 * decay +
            Math.sin(t * Math.PI * 11 + f * 0.12) * 1 * decay;
        }
      }

      // Clamp
      y = Math.max(2, Math.min(HEIGHT - 2, y));

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Leading dot at the end of the waveform
    const lastY = (() => {
      const t = 1;
      if (state === "idle") return MID_Y + Math.sin(t * Math.PI * 3 + f * 0.04) * 2.5;
      if (state === "active") {
        return (
          MID_Y +
          Math.sin(t * Math.PI * 4 + f * 0.08) * 3 +
          Math.sin(t * Math.PI * 7 + f * 0.12) * 1.5 +
          Math.sin(t * Math.PI * 13 + f * 0.05) * 1
        );
      }
      return MID_Y;
    })();

    ctx.beginPath();
    ctx.arc(WIDTH - 1, Math.max(2, Math.min(HEIGHT - 2, lastY)), 1.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

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
      style={{ width: WIDTH, height: HEIGHT }}
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
