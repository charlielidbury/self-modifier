'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const MinecraftScene = dynamic(
  () => import('@/components/minecraft-scene'),
  { ssr: false }
);

export default function MinecraftPage() {
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Minecraft-style pixel title overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none flex flex-col items-center pt-5 gap-1">
        <h1
          className="text-yellow-300 font-bold tracking-widest select-none"
          style={{
            fontFamily: 'monospace',
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
            fontFamily: 'monospace',
            textShadow: '2px 2px 0 #000',
            letterSpacing: '0.2em',
          }}
        >
          WHEN PIGS FLY
        </p>
      </div>

      {/* Drag-to-rotate hint */}
      <div
        className="absolute bottom-8 left-0 right-0 z-10 pointer-events-none flex justify-center"
        style={{
          transition: 'opacity 1s ease',
          opacity: hintVisible ? 1 : 0,
        }}
      >
        <p
          className="text-white/60 text-xs tracking-widest select-none"
          style={{
            fontFamily: 'monospace',
            textShadow: '2px 2px 0 #000',
            letterSpacing: '0.15em',
          }}
        >
          ← ↕ DRAG TO LOOK AROUND · SCROLL TO ZOOM · ARROW KEYS TO ORBIT · +/− TO ZOOM
        </p>
      </div>

      {/* Three.js canvas */}
      <MinecraftScene />

    </div>
  );
}
