/**
 * Agent Soundscape — Ambient audio textures while the self-improve agent works.
 *
 * Generates subtle, non-intrusive sounds via the Web Audio API that let you
 * *hear* the agent working even when the tab is in the background. Each event
 * type has a distinct sonic character:
 *
 *   thinking   → low, breathy drone that slowly modulates (contemplation)
 *   tool_call  → soft percussive blip, pitch varies by tool type
 *   tool_result→ gentle ascending "received" tone
 *   error      → dissonant low rumble
 *
 * A constant background "presence" drone plays while any session is active,
 * giving a subtle auditory indicator of life.
 *
 * Respects the existing mute toggle from commit-sound.ts.
 */

import { isSoundMuted } from "./commit-sound";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// ── Volume control ─────────────────────────────────────────────────────────────

const MASTER_GAIN = 0.06; // Very quiet — ambient, not foreground

// ── Background presence drone ──────────────────────────────────────────────────

let droneOsc: OscillatorNode | null = null;
let droneGain: GainNode | null = null;
let droneLfo: OscillatorNode | null = null;
let droneActive = false;

/**
 * Start the background presence drone. A very low, slowly modulating
 * sine wave that says "I'm alive" at the edge of perception.
 */
export function startPresenceDrone(): void {
  if (droneActive || isSoundMuted()) return;
  try {
    const c = getCtx();
    const now = c.currentTime;

    // Main oscillator — very low frequency
    droneOsc = c.createOscillator();
    droneOsc.type = "sine";
    droneOsc.frequency.setValueAtTime(55, now); // A1 — deep bass

    // LFO to slowly modulate the pitch ±2Hz
    droneLfo = c.createOscillator();
    droneLfo.type = "sine";
    droneLfo.frequency.setValueAtTime(0.15, now); // Very slow wobble
    const lfoGain = c.createGain();
    lfoGain.gain.setValueAtTime(2, now);
    droneLfo.connect(lfoGain);
    lfoGain.connect(droneOsc.frequency);

    // Gain with slow fade-in
    droneGain = c.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(MASTER_GAIN * 0.4, now + 3);

    // Low-pass filter to keep it subby and unobtrusive
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(120, now);
    filter.Q.setValueAtTime(1, now);

    droneOsc.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(c.destination);

    droneOsc.start(now);
    droneLfo.start(now);
    droneActive = true;
  } catch {
    // Web Audio not available
  }
}

/** Stop the presence drone with a gentle fade-out. */
export function stopPresenceDrone(): void {
  if (!droneActive || !droneGain || !droneOsc || !ctx) return;
  try {
    const now = ctx.currentTime;
    droneGain.gain.cancelScheduledValues(now);
    droneGain.gain.setValueAtTime(droneGain.gain.value, now);
    droneGain.gain.linearRampToValueAtTime(0, now + 2);

    // Clean up after fade-out
    const osc = droneOsc;
    const lfo = droneLfo;
    setTimeout(() => {
      try {
        osc?.stop();
        lfo?.stop();
      } catch { /* already stopped */ }
    }, 2500);

    droneOsc = null;
    droneGain = null;
    droneLfo = null;
    droneActive = false;
  } catch {
    droneActive = false;
  }
}

// ── Throttle helper ────────────────────────────────────────────────────────────

const lastPlayed: Record<string, number> = {};

function shouldThrottle(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  if (lastPlayed[key] && now - lastPlayed[key] < minIntervalMs) return true;
  lastPlayed[key] = now;
  return false;
}

// ── Event sounds ───────────────────────────────────────────────────────────────

/**
 * Thinking sound — a brief, soft breathy pad that fades in and out.
 * Like the sound of concentration. Only plays every ~4 seconds max.
 */
export function playThinkingSound(): void {
  if (isSoundMuted() || shouldThrottle("thinking", 4000)) return;
  try {
    const c = getCtx();
    const now = c.currentTime;

    // Two detuned oscillators for a "pad" texture
    const osc1 = c.createOscillator();
    const osc2 = c.createOscillator();
    osc1.type = "sine";
    osc2.type = "sine";

    // Random note from a pentatonic scale (feels natural/meditative)
    const pentatonic = [220, 246.94, 277.18, 329.63, 369.99]; // A3 pentatonic
    const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.003, now); // Slight detune for shimmer

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MASTER_GAIN * 0.35, now + 0.3);
    gain.gain.linearRampToValueAtTime(MASTER_GAIN * 0.25, now + 1.0);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.linearRampToValueAtTime(400, now + 1.8);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 2);
    osc2.stop(now + 2);
  } catch { /* ignore */ }
}

/**
 * Tool call sound — a crisp, soft percussive blip.
 * Pitch varies based on the tool name for variety.
 */
export function playToolCallSound(toolName?: string): void {
  if (isSoundMuted() || shouldThrottle("tool_call", 300)) return;
  try {
    const c = getCtx();
    const now = c.currentTime;

    // Hash the tool name to pick a frequency from a major scale
    const scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77]; // C5 major
    const hash = (toolName ?? "default")
      .split("")
      .reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const freq = scale[hash % scale.length];

    const osc = c.createOscillator();
    osc.type = "triangle"; // Soft but present
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.15);

    const gain = c.createGain();
    gain.gain.setValueAtTime(MASTER_GAIN * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(c.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch { /* ignore */ }
}

/**
 * Tool result sound — a gentle ascending two-note "received" signal.
 * Max once per 500ms.
 */
export function playToolResultSound(): void {
  if (isSoundMuted() || shouldThrottle("tool_result", 500)) return;
  try {
    const c = getCtx();
    const now = c.currentTime;

    // Two quick ascending notes
    const notes = [440, 554.37]; // A4 → C#5
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      const gain = c.createGain();
      gain.gain.setValueAtTime(0, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(MASTER_GAIN * 0.3, now + i * 0.06 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.12);

      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.15);
    });
  } catch { /* ignore */ }
}

/**
 * Error sound — a low, dissonant rumble.
 * Tritone interval feels unsettling but brief.
 */
export function playErrorSound(): void {
  if (isSoundMuted() || shouldThrottle("error", 2000)) return;
  try {
    const c = getCtx();
    const now = c.currentTime;

    // Tritone: B2 + F3 — the devil's interval
    const freqs = [123.47, 174.61];
    freqs.forEach((freq) => {
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now);

      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.linearRampToValueAtTime(100, now + 0.6);

      const gain = c.createGain();
      gain.gain.setValueAtTime(MASTER_GAIN * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.7);
    });
  } catch { /* ignore */ }
}

// ── High-level dispatch ────────────────────────────────────────────────────────

/**
 * Play the appropriate ambient sound for an activity event.
 * This is the main entry point — call it from the activity feed.
 */
export function playSoundForEvent(
  kind: "thinking" | "tool_call" | "tool_result" | "text" | "error",
  toolName?: string,
): void {
  switch (kind) {
    case "thinking":
      playThinkingSound();
      break;
    case "tool_call":
      playToolCallSound(toolName);
      break;
    case "tool_result":
      playToolResultSound();
      break;
    case "error":
      playErrorSound();
      break;
    // "text" events are too frequent — skip
  }
}
