/**
 * Commit celebration sound — a short, pleasant ascending arpeggio
 * synthesized via the Web Audio API. No external audio files needed.
 *
 * The chime plays a quick major-triad arpeggio (root → 3rd → 5th → octave)
 * with soft sine oscillators and gentle gain envelopes so it feels
 * delightful without being intrusive.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a single soft tone at the given frequency.
 * Returns a promise that resolves when the tone finishes.
 */
function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gain: number,
): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  // Soft sine wave
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);

  // Low-pass to soften harmonics
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2000, startTime);

  // Gentle envelope: quick attack, sustain, smooth decay
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02);
  gainNode.gain.setValueAtTime(gain, startTime + duration * 0.4);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Play the commit celebration chime — a bright ascending major arpeggio.
 *
 * Notes (in key of E5): E5 → G#5 → B5 → E6
 * Feels triumphant and sparkly, like a little achievement unlocked.
 */
export function playCommitChime(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // E major arpeggio frequencies
    const notes = [
      659.25,  // E5
      830.61,  // G#5
      987.77,  // B5
      1318.51, // E6
    ];

    const noteSpacing = 0.08;  // 80ms between each note
    const noteDuration = 0.35; // each note rings for 350ms
    const baseGain = 0.12;     // soft volume

    notes.forEach((freq, i) => {
      const startTime = now + i * noteSpacing;
      // Each successive note slightly quieter for natural decay feel
      const gain = baseGain * (1 - i * 0.08);
      playTone(ctx, freq, startTime, noteDuration, gain);
    });

    // Add a subtle shimmer — a high harmonic that sparkles on top
    const shimmerOsc = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    shimmerOsc.type = "sine";
    shimmerOsc.frequency.setValueAtTime(2637, now + 0.24); // E7
    shimmerGain.gain.setValueAtTime(0, now + 0.24);
    shimmerGain.gain.linearRampToValueAtTime(0.04, now + 0.28);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(ctx.destination);
    shimmerOsc.start(now + 0.24);
    shimmerOsc.stop(now + 0.7);
  } catch {
    // Web Audio API not available — silently skip
  }
}

/** Mute state persisted to localStorage */
const MUTE_KEY = "self-improve-sound-muted";

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "true";
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MUTE_KEY, muted ? "true" : "false");
}

/**
 * Play the commit chime unless the user has muted it.
 */
export function playCommitChimeIfUnmuted(): void {
  if (!isSoundMuted()) {
    playCommitChime();
  }
}
