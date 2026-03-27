'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Camera, Check } from 'lucide-react';

const MinecraftScene = dynamic(
  () => import('@/components/minecraft-scene'),
  { ssr: false }
);

const CONTROLS = [
  { keys: ['Drag'],    desc: 'Look around' },
  { keys: ['Scroll'],  desc: 'Zoom in / out' },
  { keys: ['← →'],    desc: 'Orbit left / right' },
  { keys: ['↑ ↓'],    desc: 'Orbit up / down' },
  { keys: ['+', '−'], desc: 'Zoom in / out' },
  { keys: ['R'],       desc: 'Reset view' },
  { keys: ['S'],       desc: 'Save screenshot' },
];

export default function MinecraftPage() {
  const [hintVisible, setHintVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [screenshotDone, setScreenshotDone] = useState(false);
  const captureFnRef  = useRef<(() => void) | null>(null);
  const screenshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide the initial bottom hint after 3 s
  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleSceneReady = useCallback((fn: () => void) => {
    captureFnRef.current = fn;
  }, []);

  const handleScreenshot = useCallback(() => {
    captureFnRef.current?.();
    setScreenshotDone(true);
    if (screenshotTimerRef.current) clearTimeout(screenshotTimerRef.current);
    screenshotTimerRef.current = setTimeout(() => setScreenshotDone(false), 2000);
  }, []);

  // Close the panel with Escape; S = save screenshot
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setPanelOpen(false);
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      handleScreenshot();
    }
  }, [handleScreenshot]);
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const monoStyle: React.CSSProperties = { fontFamily: 'monospace' };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Minecraft-style pixel title overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none flex flex-col items-center pt-5 gap-1">
        <h1
          className="text-yellow-300 font-bold tracking-widest select-none"
          style={{
            ...monoStyle,
            fontSize: 'clamp(1rem, 3vw, 1.75rem)',
            textShadow: '3px 3px 0 #000, -1px -1px 0 #000',
            letterSpacing: '0.15em',
          }}
        >
          ✦ CHARLIE LIDBURY ✦
        </h1>
        <p
          className="text-pink-300 text-xs tracking-widest select-none"
          style={{
            ...monoStyle,
            textShadow: '2px 2px 0 #000',
            letterSpacing: '0.2em',
          }}
        >
          WHEN PIGS FLY
        </p>
      </div>

      {/* Auto-fade bottom hint (shown only for first 3 s) */}
      <div
        className="absolute bottom-8 left-0 right-0 z-10 pointer-events-none flex justify-center"
        style={{ transition: 'opacity 1s ease', opacity: hintVisible ? 1 : 0 }}
      >
        <p
          className="text-white/60 text-xs tracking-widest select-none"
          style={{
            ...monoStyle,
            textShadow: '2px 2px 0 #000',
            letterSpacing: '0.15em',
          }}
        >
          ← ↕ DRAG TO LOOK AROUND · SCROLL TO ZOOM · ARROW KEYS TO ORBIT · +/− TO ZOOM
        </p>
      </div>

      {/* ── Screenshot button (bottom-right) ────────────────────────────── */}
      <button
        onClick={handleScreenshot}
        title="Save scene as PNG"
        aria-label="Save scene as PNG"
        className="absolute bottom-5 right-5 z-20 flex items-center justify-center rounded border border-white/25 bg-black/60 backdrop-blur-sm text-white/60 hover:text-white/90 hover:border-white/50 hover:bg-black/80 transition-all"
        style={{
          ...monoStyle,
          width: '28px',
          height: '28px',
        }}
      >
        {screenshotDone
          ? <Check size={13} className="text-green-400" />
          : <Camera size={13} />}
      </button>

      {/* ── Controls toggle (bottom-left) ────────────────────────────────── */}
      <div className="absolute bottom-5 left-5 z-20 flex flex-col items-start gap-2">
        {/* Expandable controls panel */}
        {panelOpen && (
          <div
            className="mb-1 rounded border border-white/20 bg-black/75 backdrop-blur-sm px-4 py-3 text-white/80"
            style={{ ...monoStyle, minWidth: '220px' }}
          >
            <p
              className="text-[10px] uppercase tracking-widest text-white/40 mb-2 select-none"
              style={{ letterSpacing: '0.2em' }}
            >
              Controls
            </p>
            <table className="w-full border-separate" style={{ borderSpacing: '0 3px' }}>
              <tbody>
                {CONTROLS.map(({ keys, desc }) => (
                  <tr key={desc}>
                    <td className="pr-3 align-middle">
                      <span className="flex items-center gap-1">
                        {keys.map((k) => (
                          <kbd
                            key={k}
                            className="inline-flex items-center justify-center rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-[11px] text-white/80 select-none"
                            style={monoStyle}
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </td>
                    <td className="text-[11px] text-white/60 select-none whitespace-nowrap">
                      {desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          title={panelOpen ? 'Hide controls' : 'Show controls'}
          aria-label={panelOpen ? 'Hide controls' : 'Show controls'}
          className="flex items-center justify-center rounded border border-white/25 bg-black/60 backdrop-blur-sm text-white/60 hover:text-white/90 hover:border-white/50 hover:bg-black/80 transition-colors select-none"
          style={{
            ...monoStyle,
            width: '28px',
            height: '28px',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          {panelOpen ? '✕' : '?'}
        </button>
      </div>

      {/* Three.js canvas */}
      <MinecraftScene onReady={handleSceneReady} />
    </div>
  );
}
