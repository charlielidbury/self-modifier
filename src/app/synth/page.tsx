"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type OscType = "sine" | "square" | "sawtooth" | "triangle";

interface ActiveNote {
  oscillator: OscillatorNode;
  gain: GainNode;
}

// ── Note helpers ─────────────────────────────────────────────────────────────

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteFrequency(note: number): number {
  // note 0 = C4 (middle C = MIDI 60)
  return 261.626 * Math.pow(2, note / 12);
}

// Computer keyboard → semitone offset from root
const KEY_MAP: Record<string, number> = {
  a: 0,  w: 1,  s: 2,  e: 3,  d: 4,  f: 5,  t: 6,
  g: 7,  y: 8,  h: 9,  u: 10, j: 11, k: 12, o: 13,
  l: 14, p: 15, ";": 16, "[": 17, "'": 18,
};

// Which semitone offsets are "black keys"
const BLACK_KEY_SET = new Set([1, 3, 6, 8, 10, 13, 15]);

// All semitone offsets in visual order for the on-screen keyboard
const ALL_SEMITONES = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
const WHITE_SEMITONES = ALL_SEMITONES.filter(s => !BLACK_KEY_SET.has(s));

// Map semitone to the keyboard key label
const SEMITONE_TO_KEY: Record<number, string> = {};
for (const [key, semitone] of Object.entries(KEY_MAP)) {
  SEMITONE_TO_KEY[semitone] = key === ";" ? ";" : key.toUpperCase();
}

// ── Waveform colours ─────────────────────────────────────────────────────────

const WAVE_COLORS: Record<OscType, { main: string; glow: string }> = {
  sine:     { main: "#f472b6", glow: "rgba(244,114,182,0.3)" },
  square:   { main: "#a78bfa", glow: "rgba(167,139,250,0.3)" },
  sawtooth: { main: "#34d399", glow: "rgba(52,211,153,0.3)" },
  triangle: { main: "#38bdf8", glow: "rgba(56,189,248,0.3)" },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function SynthPage() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeNotesRef = useRef<Map<number, ActiveNote>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);

  const [waveform, setWaveform] = useState<OscType>("sine");
  const [octave, setOctave] = useState(4);
  const [volume, setVolume] = useState(0.5);
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());
  const [reverbOn, setReverbOn] = useState(false);

  // Refs for latest values (avoids stale closures)
  const waveformRef = useRef(waveform);
  const octaveRef = useRef(octave);
  const volumeRef = useRef(volume);
  const reverbOnRef = useRef(reverbOn);

  useEffect(() => { waveformRef.current = waveform; }, [waveform]);
  useEffect(() => { octaveRef.current = octave; }, [octave]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { reverbOnRef.current = reverbOn; }, [reverbOn]);

  // Reverb convolver node
  const reverbRef = useRef<ConvolverNode | null>(null);
  const reverbGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);

  // ── Init audio context ───────────────────────────────────────────────────

  const ensureAudioCtx = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const masterGain = ctx.createGain();
    masterGain.gain.value = volumeRef.current;
    masterGainRef.current = masterGain;

    // Create reverb (simple impulse response)
    const reverbNode = ctx.createConvolver();
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 2;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    reverbNode.buffer = impulse;
    reverbRef.current = reverbNode;

    // Dry/wet routing
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;
    dryGainRef.current = dryGain;

    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0;
    reverbGainRef.current = reverbGain;

    // Routing: masterGain → [dryGain, reverbNode→reverbGain] → analyser → destination
    masterGain.connect(dryGain);
    masterGain.connect(reverbNode);
    reverbNode.connect(reverbGain);
    dryGain.connect(analyser);
    reverbGain.connect(analyser);
    analyser.connect(ctx.destination);

    return ctx;
  }, []);

  // Update master volume
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume, audioCtxRef.current!.currentTime, 0.02);
    }
  }, [volume]);

  // Update reverb wet/dry
  useEffect(() => {
    if (reverbGainRef.current && dryGainRef.current && audioCtxRef.current) {
      const t = audioCtxRef.current.currentTime;
      reverbGainRef.current.gain.setTargetAtTime(reverbOn ? 0.5 : 0, t, 0.05);
      dryGainRef.current.gain.setTargetAtTime(1, t, 0.05);
    }
  }, [reverbOn]);

  // ── Note on/off ──────────────────────────────────────────────────────────

  const noteOn = useCallback((semitone: number) => {
    if (activeNotesRef.current.has(semitone)) return;

    const ctx = ensureAudioCtx();
    const osc = ctx.createOscillator();
    osc.type = waveformRef.current;
    const absoluteNote = semitone + (octaveRef.current - 4) * 12;
    osc.frequency.value = noteFrequency(absoluteNote);

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, ctx.currentTime);
    noteGain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.02); // attack

    osc.connect(noteGain);
    noteGain.connect(masterGainRef.current!);
    osc.start();

    activeNotesRef.current.set(semitone, { oscillator: osc, gain: noteGain });
    setActiveKeys(prev => new Set(prev).add(semitone));
  }, [ensureAudioCtx]);

  const noteOff = useCallback((semitone: number) => {
    const note = activeNotesRef.current.get(semitone);
    if (!note) return;

    const ctx = audioCtxRef.current!;
    note.gain.gain.cancelScheduledValues(ctx.currentTime);
    note.gain.gain.setValueAtTime(note.gain.gain.value, ctx.currentTime);
    note.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15); // release
    note.oscillator.stop(ctx.currentTime + 0.2);

    activeNotesRef.current.delete(semitone);
    setActiveKeys(prev => {
      const next = new Set(prev);
      next.delete(semitone);
      return next;
    });
  }, []);

  // ── Keyboard input ───────────────────────────────────────────────────────

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();

      // Octave shift with z/x
      if (key === "z") { setOctave(o => Math.max(1, o - 1)); return; }
      if (key === "x") { setOctave(o => Math.min(7, o + 1)); return; }

      const semitone = KEY_MAP[key];
      if (semitone !== undefined) {
        e.preventDefault();
        noteOn(semitone);
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const semitone = KEY_MAP[key];
      if (semitone !== undefined) {
        noteOff(semitone);
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [noteOn, noteOff]);

  // ── Oscilloscope visualizer ──────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx2d = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const colors = WAVE_COLORS[waveformRef.current];

      ctx2d.fillStyle = "rgba(0,0,0,0.08)";
      ctx2d.fillRect(0, 0, w, h);

      // Centre line
      ctx2d.strokeStyle = "rgba(255,255,255,0.06)";
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(0, h / 2);
      ctx2d.lineTo(w, h / 2);
      ctx2d.stroke();

      if (!analyserRef.current) {
        // Draw idle flat line
        ctx2d.strokeStyle = "rgba(255,255,255,0.12)";
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.moveTo(0, h / 2);
        ctx2d.lineTo(w, h / 2);
        ctx2d.stroke();
        return;
      }

      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      // Glow layer
      ctx2d.shadowColor = colors.glow;
      ctx2d.shadowBlur = 16;
      ctx2d.strokeStyle = colors.main;
      ctx2d.lineWidth = 2.5;
      ctx2d.lineJoin = "round";
      ctx2d.lineCap = "round";
      ctx2d.beginPath();

      const sliceWidth = w / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
        x += sliceWidth;
      }
      ctx2d.stroke();

      // Reset shadow
      ctx2d.shadowBlur = 0;
      ctx2d.shadowColor = "transparent";
    };

    draw();
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, []);

  // ── Cleanup audio on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      activeNotesRef.current.forEach((note) => {
        try { note.oscillator.stop(); } catch {}
      });
      activeNotesRef.current.clear();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const colors = WAVE_COLORS[waveform];

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 p-4 sm:p-8 overflow-auto">
      {/* Title */}
      <div className="text-center select-none">
        <h1
          className="text-3xl sm:text-4xl font-bold tracking-tight"
          style={{ color: colors.main }}
        >
          Synthesizer
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Play with your keyboard · <kbd className="font-mono text-xs px-1 py-0.5 rounded border border-border bg-muted">A</kbd>–<kbd className="font-mono text-xs px-1 py-0.5 rounded border border-border bg-muted">&apos;</kbd> for notes · <kbd className="font-mono text-xs px-1 py-0.5 rounded border border-border bg-muted">Z</kbd>/<kbd className="font-mono text-xs px-1 py-0.5 rounded border border-border bg-muted">X</kbd> to shift octave
        </p>
      </div>

      {/* Oscilloscope */}
      <div
        className="w-full max-w-2xl h-32 sm:h-40 rounded-xl border border-white/10 overflow-hidden"
        style={{
          background: "rgba(0,0,0,0.6)",
          boxShadow: `0 0 40px 8px ${colors.glow}, inset 0 0 30px rgba(0,0,0,0.5)`,
        }}
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        {/* Waveform selector */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border/50">
          {(["sine", "square", "sawtooth", "triangle"] as OscType[]).map((w) => (
            <button
              key={w}
              onClick={() => setWaveform(w)}
              className="relative px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 capitalize"
              style={{
                background: waveform === w ? colors.main + "22" : "transparent",
                color: waveform === w ? colors.main : "var(--color-muted-foreground)",
                boxShadow: waveform === w ? `0 0 12px ${colors.glow}` : undefined,
              }}
            >
              {w === "sawtooth" ? "saw" : w}
            </button>
          ))}
        </div>

        {/* Octave */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">Octave</span>
          <button
            onClick={() => setOctave(o => Math.max(1, o - 1))}
            className="w-7 h-7 rounded-md bg-muted/60 border border-border/50 text-foreground hover:bg-muted transition-colors flex items-center justify-center text-sm font-mono"
          >
            −
          </button>
          <span className="font-mono font-bold w-5 text-center" style={{ color: colors.main }}>
            {octave}
          </span>
          <button
            onClick={() => setOctave(o => Math.min(7, o + 1))}
            className="w-7 h-7 rounded-md bg-muted/60 border border-border/50 text-foreground hover:bg-muted transition-colors flex items-center justify-center text-sm font-mono"
          >
            +
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">Vol</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-pink-400"
            style={{ accentColor: colors.main }}
          />
          <span className="font-mono text-xs w-8" style={{ color: colors.main }}>
            {Math.round(volume * 100)}%
          </span>
        </div>

        {/* Reverb toggle */}
        <button
          onClick={() => setReverbOn(r => !r)}
          className="px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150"
          style={{
            background: reverbOn ? colors.main + "22" : "transparent",
            borderColor: reverbOn ? colors.main + "44" : "var(--color-border)",
            color: reverbOn ? colors.main : "var(--color-muted-foreground)",
            boxShadow: reverbOn ? `0 0 12px ${colors.glow}` : undefined,
          }}
        >
          Reverb {reverbOn ? "ON" : "OFF"}
        </button>
      </div>

      {/* Piano keyboard */}
      <div className="w-full max-w-2xl select-none">
        <div className="relative" style={{ height: 160 }}>
          {/* White keys */}
          <div className="flex h-full gap-[2px]">
            {WHITE_SEMITONES.map((semitone) => {
              const isActive = activeKeys.has(semitone);
              const absoluteNote = semitone + (octave - 4) * 12;
              const noteName = NOTE_NAMES[((absoluteNote % 12) + 12) % 12];
              const keyLabel = SEMITONE_TO_KEY[semitone] ?? "";

              return (
                <button
                  key={semitone}
                  onPointerDown={(e) => { e.preventDefault(); noteOn(semitone); }}
                  onPointerUp={() => noteOff(semitone)}
                  onPointerLeave={() => noteOff(semitone)}
                  className="flex-1 rounded-b-lg border border-white/20 transition-all duration-75 flex flex-col items-center justify-end pb-2 gap-1 cursor-pointer"
                  style={{
                    background: isActive
                      ? `linear-gradient(to bottom, ${colors.main}44, ${colors.main}22)`
                      : "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(240,240,240,0.9))",
                    boxShadow: isActive
                      ? `0 0 20px ${colors.glow}, inset 0 -2px 6px rgba(0,0,0,0.1)`
                      : "inset 0 -2px 6px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.1)",
                    transform: isActive ? "scaleY(0.98)" : undefined,
                    transformOrigin: "top",
                  }}
                >
                  <span className="text-[10px] font-mono text-black/30 dark:text-black/40">
                    {noteName}
                  </span>
                  <span className="text-[9px] font-mono text-black/20 dark:text-black/30 uppercase">
                    {keyLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Black keys — positioned absolutely */}
          <div className="absolute inset-x-0 top-0" style={{ height: "62%" }}>
            {(() => {
              // Map each black key to its horizontal position relative to white keys
              const whiteKeyWidth = 100 / WHITE_SEMITONES.length; // percentage width
              const blackKeyWidth = whiteKeyWidth * 0.6;

              // For each black key semitone, figure out which white key it sits between
              const blackKeys: { semitone: number; leftPercent: number }[] = [];
              for (const semitone of ALL_SEMITONES) {
                if (!BLACK_KEY_SET.has(semitone)) continue;
                // Find the white key index just before this black key
                const whiteIndex = WHITE_SEMITONES.filter(s => s < semitone).length;
                const leftPercent = whiteIndex * whiteKeyWidth - blackKeyWidth / 2;
                blackKeys.push({ semitone, leftPercent });
              }

              return blackKeys.map(({ semitone, leftPercent }) => {
                const isActive = activeKeys.has(semitone);
                const keyLabel = SEMITONE_TO_KEY[semitone] ?? "";

                return (
                  <button
                    key={semitone}
                    onPointerDown={(e) => { e.preventDefault(); noteOn(semitone); }}
                    onPointerUp={() => noteOff(semitone)}
                    onPointerLeave={() => noteOff(semitone)}
                    className="absolute h-full rounded-b-md transition-all duration-75 flex flex-col items-center justify-end pb-2 cursor-pointer z-10"
                    style={{
                      left: `${leftPercent}%`,
                      width: `${blackKeyWidth}%`,
                      background: isActive
                        ? `linear-gradient(to bottom, ${colors.main}, ${colors.main}88)`
                        : "linear-gradient(to bottom, #1a1a2e, #0f0f1e)",
                      boxShadow: isActive
                        ? `0 0 16px ${colors.glow}`
                        : "0 4px 8px rgba(0,0,0,0.4), inset 0 -2px 3px rgba(0,0,0,0.3)",
                      transform: isActive ? "scaleY(0.97)" : undefined,
                      transformOrigin: "top",
                    }}
                  >
                    <span className="text-[8px] font-mono text-white/30 uppercase">
                      {keyLabel}
                    </span>
                  </button>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Note display */}
      <div className="h-6 flex items-center justify-center gap-2">
        {activeKeys.size > 0 ? (
          Array.from(activeKeys).sort((a, b) => a - b).map((semitone) => {
            const absoluteNote = semitone + (octave - 4) * 12;
            const noteName = NOTE_NAMES[((absoluteNote % 12) + 12) % 12];
            const noteOctave = octave + Math.floor(semitone / 12);
            return (
              <span
                key={semitone}
                className="font-mono text-sm font-bold px-2 py-0.5 rounded-md"
                style={{
                  color: colors.main,
                  background: colors.main + "15",
                }}
              >
                {noteName}{noteOctave}
              </span>
            );
          })
        ) : (
          <span className="text-xs text-muted-foreground/40">Press a key to play</span>
        )}
      </div>
    </div>
  );
}
