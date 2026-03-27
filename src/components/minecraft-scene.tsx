'use client';

import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';

// ─── Palette ───────────────────────────────────────────────────────────────
const P = {
  HAIR:      0x3D2208,  // dark brown hair
  SKIN:      0xC8956C,  // warm skin tone
  SKIN_D:    0xB5824F,  // darker skin (shading)
  EYE_W:     0xEEEEEE,  // eye white
  EYE_B:     0x4A7EC7,  // blue iris
  EYE_P:     0x1A1A1A,  // pupil
  MOUTH_D:   0x6B1E1E,  // mouth corner / dark
  TEETH:     0xF2F0E0,  // teeth
  LIP:       0xA84040,  // lip colour
  PIG_PINK:  0xF9C4CE,  // pig body
  PIG_DARK:  0xE8A0A8,  // pig snout / darker pink
  PIG_EYE:   0x1A1A1A,
  PIG_HOOF:  0x4A3828,
  WING:      0xFDE8EC,
  WING_TIP:  0xFFC0CB,
  CLOUD:     0xF0F0F0,
  STAR:      0xFFFFFF,
  BG:        0x060614,
};

// ─── Charlie's Face Grid (8 × 8) ─────────────────────────────────────────
//  H=hair  S=skin  EW=eye-white  EB=eye-blue  EP=eye-pupil
//  MD=mouth-dark  T=teeth  LP=lip  SD=skin-dark (cheek)
const FACE: string[][] = [
  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],  // row 0 – hair
  ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'],  // row 1 – hair
  ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  // row 2 – forehead
  ['S', 'EW', 'EB', 'S', 'S', 'EB', 'EW', 'S'],  // row 3 – eyes top
  ['S', 'EP', 'EB', 'S', 'S', 'EB', 'EP', 'S'],  // row 4 – eyes bot
  ['S', 'S', 'S', 'SD', 'SD', 'S', 'S', 'S'],  // row 5 – nose/cheeks
  ['S', 'MD', 'LP', 'T', 'T', 'LP', 'MD', 'S'],  // row 6 – mouth
  ['S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'],  // row 7 – chin
];

const FACE_COLORS: Record<string, number> = {
  H: P.HAIR, S: P.SKIN, SD: P.SKIN_D,
  EW: P.EYE_W, EB: P.EYE_B, EP: P.EYE_P,
  MD: P.MOUTH_D, T: P.TEETH, LP: P.LIP,
};

// ─── Face builder ─────────────────────────────────────────────────────────
function buildFace(): THREE.Group {
  const group = new THREE.Group();

  // Re-use one geometry, swap materials per block
  const geo = new THREE.BoxGeometry(0.94, 0.94, 0.94);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const key = FACE[r][c];
      const mat = new THREE.MeshLambertMaterial({ color: FACE_COLORS[key] });
      const mesh = new THREE.Mesh(geo, mat);
      // Centre at origin: cols 0-7 → x -3.5…3.5, rows 0-7 → y 3.5…-3.5
      mesh.position.set(c - 3.5, -(r - 3.5), 0);
      group.add(mesh);
    }
  }

  // Solid head back (hair coloured)
  const backMat = new THREE.MeshLambertMaterial({ color: P.HAIR });
  const back = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 0.94), backMat);
  back.position.set(0, 0, -0.94);
  group.add(back);

  return group;
}

// ─── Minecraft pig builder ─────────────────────────────────────────────────
function buildPig(): THREE.Group {
  const pig = new THREE.Group();

  const mk = (w: number, h: number, d: number, col: number) =>
    new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: col })
    );

  // Body
  const body = mk(1.4, 0.9, 2.0, P.PIG_PINK);
  pig.add(body);

  // Head
  const head = mk(1.0, 1.0, 1.0, P.PIG_PINK);
  head.position.set(0, 0.1, 1.25);
  pig.add(head);

  // Snout
  const snout = mk(0.6, 0.4, 0.35, P.PIG_DARK);
  snout.position.set(0, -0.05, 1.82);
  pig.add(snout);

  // Nostrils
  [-0.14, 0.14].forEach(x => {
    const n = mk(0.1, 0.1, 0.06, P.PIG_EYE);
    n.position.set(x, -0.05, 2.01);
    pig.add(n);
  });

  // Eyes
  [-0.28, 0.28].forEach(x => {
    const e = mk(0.2, 0.2, 0.1, P.PIG_EYE);
    e.position.set(x, 0.25, 1.77);
    pig.add(e);
  });

  // Ears
  [-0.42, 0.42].forEach(x => {
    const ear = mk(0.2, 0.25, 0.15, P.PIG_DARK);
    ear.position.set(x, 0.6, 1.25);
    pig.add(ear);
  });

  // Legs + hooves
  [[-0.5, 0.65], [0.5, 0.65], [-0.5, -0.65], [0.5, -0.65]].forEach(([x, z]) => {
    const leg = mk(0.3, 0.65, 0.3, P.PIG_PINK);
    leg.position.set(x, -0.775, z);
    pig.add(leg);
    const hoof = mk(0.3, 0.15, 0.3, P.PIG_HOOF);
    hoof.position.set(x, -1.175, z);
    pig.add(hoof);
  });

  // WINGS (when pigs fly!)
  const wingGeo = new THREE.BoxGeometry(1.0, 0.12, 0.7);
  const wingMat = new THREE.MeshLambertMaterial({ color: P.WING });

  const wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-1.15, 0.15, 0);
  wingL.rotation.z = 0.3;
  pig.add(wingL);
  pig.userData.wingL = wingL;

  const wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(1.15, 0.15, 0);
  wingR.rotation.z = -0.3;
  pig.add(wingR);
  pig.userData.wingR = wingR;

  // Wing tips (feather detail)
  const tipGeo = new THREE.BoxGeometry(0.4, 0.08, 0.25);
  const tipMat = new THREE.MeshLambertMaterial({ color: P.WING_TIP });

  const tipL = new THREE.Mesh(tipGeo, tipMat);
  tipL.position.set(-0.25, 0, 0.2);
  wingL.add(tipL);

  const tipR = new THREE.Mesh(tipGeo, tipMat);
  tipR.position.set(0.25, 0, 0.2);
  wingR.add(tipR);

  pig.scale.setScalar(0.72);
  return pig;
}

// ─── Minecraft cloud builder ───────────────────────────────────────────────
function buildCloud(): THREE.Group {
  const cloud = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: P.CLOUD });

  const blocks = [
    [0, 0, 0, 1.4, 0.8, 1.2],
    [1.0, 0.2, 0, 1.2, 0.9, 1.0],
    [-1.0, 0.1, 0, 1.0, 0.7, 1.0],
    [0.3, 0.5, 0, 0.9, 0.6, 0.8],
  ];

  blocks.forEach(([x, y, z, w, h, d]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    cloud.add(m);
  });

  return cloud;
}

// ─── Main component ────────────────────────────────────────────────────────
type MinecraftSceneProps = {
  /** Called once the scene is ready, providing a function to capture the current frame as a PNG. */
  onReady?: (capture: () => void) => void;
};

export default function MinecraftScene({ onReady }: MinecraftSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Refs so the capture callback (stable across renders) can reach into the effect's objects.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef    = useRef<THREE.Scene | null>(null);
  const cameraRef   = useRef<THREE.Camera | null>(null);
  // Refs for the day/night HUD overlay – updated every animation frame without triggering React re-renders.
  const sunRef  = useRef<HTMLSpanElement>(null);
  const moonRef = useRef<HTMLSpanElement>(null);

  // Build the stable capture function once, wire it up via onReady when the renderer is first set.
  const capture = useCallback(() => {
    const renderer = rendererRef.current;
    const scene    = sceneRef.current;
    const camera   = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    // Re-render so preserveDrawingBuffer gives a fresh frame.
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `minecraft-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || window.innerWidth;
    const H = mount.clientHeight || window.innerHeight;

    // ── Drag-to-rotate state ──
    let rotY = 0;
    let rotX = 0;
    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    // ── Scroll-to-zoom state ──
    const MIN_CAM_Z = 7;
    const MAX_CAM_Z = 38;
    let camZ = 18;
    let targetCamZ = 18;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetCamZ = Math.max(MIN_CAM_Z, Math.min(MAX_CAM_Z, targetCamZ + e.deltaY * 0.04));
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      rotY += dx * 0.008;
      rotX = Math.max(-0.45, Math.min(0.45, rotX - dy * 0.006));
    };
    const onPointerUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    // ── Keyboard orbit / zoom ──
    const keys = new Set<string>();
    const ORBIT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_']);
    const DEFAULT_ROT_Y = 0;
    const DEFAULT_ROT_X = 0;
    const DEFAULT_CAM_Z = 18;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;
      if (ORBIT_KEYS.has(e.key)) e.preventDefault();
      // Reset view to default position with R
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotY = DEFAULT_ROT_Y;
        rotX = DEFAULT_ROT_X;
        camZ = DEFAULT_CAM_Z;
        targetCamZ = DEFAULT_CAM_Z;
        return;
      }
      keys.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Scene ──
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(P.BG);
    const nightBg = new THREE.Color(0x060614);
    const dayBg   = new THREE.Color(0x4A90D9);
    scene.background = bgColor;
    const fogObj = new THREE.FogExp2(P.BG, 0.018);
    scene.fog = fogObj;

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200);
    camera.position.set(0, 1.5, 18);

    // ── Renderer (pixelated Minecraft feel) ──
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.domElement.style.imageRendering = 'pixelated';
    renderer.domElement.style.cursor = 'grab';
    mount.appendChild(renderer.domElement);

    // Expose scene objects so the stable capture() callback can reach them.
    rendererRef.current = renderer;
    sceneRef.current    = scene;
    cameraRef.current   = camera;
    // Notify the parent that capture is available.
    onReady?.(capture);

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // ── Lights ──
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);
    const sun = new THREE.DirectionalLight(0xFFE87C, 1.1);
    sun.position.set(8, 14, 10);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88AAFF, 0.35);
    fill.position.set(-6, -4, -6);
    scene.add(fill);

    // ── Stars ──
    const sverts: number[] = [];
    for (let i = 0; i < 400; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 80 + Math.random() * 30;
      sverts.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sverts, 3));
    const starsMat = new THREE.PointsMaterial({ color: P.STAR, size: 0.4, transparent: true, opacity: 1 });
    scene.add(new THREE.Points(sGeo, starsMat));

    // ── Main rotating group ──
    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // Face
    const face = buildFace();
    mainGroup.add(face);

    // ── Pigs ──
    type PigData = {
      mesh: THREE.Group;
      angle: number;
      speed: number;
      radius: number;
      baseY: number;
      phase: number;
    };

    const pigs: PigData[] = [];
    const NUM_PIGS = 7;

    for (let i = 0; i < NUM_PIGS; i++) {
      const pig = buildPig();
      const angle = (i / NUM_PIGS) * Math.PI * 2;
      const radius = 9 + (i % 3) * 2.5;
      const baseY = -1.5 + (i % 5) * 1.2;

      pig.position.set(
        Math.cos(angle) * radius,
        baseY,
        Math.sin(angle) * radius
      );

      mainGroup.add(pig);
      pigs.push({
        mesh: pig,
        angle,
        speed: 0.22 + (i % 4) * 0.08,
        radius,
        baseY,
        phase: (i / NUM_PIGS) * Math.PI * 2,
      });
    }

    // ── Clouds ──
    type CloudData = { mesh: THREE.Group; angle: number; speed: number; radius: number; y: number };
    const clouds: CloudData[] = [];

    for (let i = 0; i < 5; i++) {
      const cloud = buildCloud();
      const angle = (i / 5) * Math.PI * 2;
      const radius = 14 + (i % 3) * 3;
      const y = 5 + (i % 3) * 2;
      cloud.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      cloud.scale.setScalar(0.9 + Math.random() * 0.4);
      mainGroup.add(cloud);
      clouds.push({ mesh: cloud, angle, speed: 0.05 + i * 0.01, radius, y });
    }

    // ── Animation ──
    let rafId: number;
    let t = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      t += 0.012;

      // ── Day / night cycle ──────────────────────────────────────────────────
      // dayFactor: 0 = full night, 1 = full day.  One full cycle ≈ 2.9 minutes.
      const dayFactor = (Math.sin(t * 0.036) + 1) * 0.5;
      // Update day/night HUD overlay via direct DOM mutation – no React re-render cost.
      if (sunRef.current)  sunRef.current.style.opacity  = dayFactor.toFixed(3);
      if (moonRef.current) moonRef.current.style.opacity = (1 - dayFactor).toFixed(3);
      bgColor.lerpColors(nightBg, dayBg, dayFactor);
      fogObj.color.copy(bgColor);
      starsMat.opacity = Math.max(0, 1 - dayFactor * 1.25);
      ambientLight.intensity = 0.55 + dayFactor * 0.35;
      sun.intensity = 1.1 + dayFactor * 0.45;
      // Warm sunrise/sunset orange → pure white midday
      sun.color.setHSL(0.08 - dayFactor * 0.06, 0.7 - dayFactor * 0.45, 0.7 + dayFactor * 0.3);

      // Smooth zoom interpolation
      camZ += (targetCamZ - camZ) * 0.1;
      camera.position.setZ(camZ);

      // Keyboard orbit / zoom
      if (keys.has('ArrowLeft'))  rotY -= 0.035;
      if (keys.has('ArrowRight')) rotY += 0.035;
      if (keys.has('ArrowUp'))    rotX = Math.max(-0.45, rotX - 0.025);
      if (keys.has('ArrowDown'))  rotX = Math.min(0.45, rotX + 0.025);
      if (keys.has('+') || keys.has('=')) targetCamZ = Math.max(MIN_CAM_Z, targetCamZ - 0.4);
      if (keys.has('-') || keys.has('_')) targetCamZ = Math.min(MAX_CAM_Z, targetCamZ + 0.4);

      // Spin the whole world (auto-rotate when not dragging; add user drag delta always)
      if (!isDragging) {
        rotY += 0.012 * 0.55;
      }
      mainGroup.rotation.y = rotY;
      mainGroup.rotation.x = rotX + Math.sin(t * 0.18) * 0.04;

      // Pigs orbit + bob + flap
      pigs.forEach(pig => {
        pig.angle += pig.speed * 0.012;
        pig.phase += 0.11;

        const x = Math.cos(pig.angle) * pig.radius;
        const z = Math.sin(pig.angle) * pig.radius;
        const y = pig.baseY + Math.sin(pig.phase) * 0.45;

        pig.mesh.position.set(x, y, z);
        // Face the direction of travel
        pig.mesh.rotation.y = -(pig.angle - Math.PI / 2);

        // Wing flap
        const flap = Math.sin(pig.phase * 2.8) * 0.55;
        const wL = pig.mesh.userData.wingL as THREE.Mesh;
        const wR = pig.mesh.userData.wingR as THREE.Mesh;
        if (wL) wL.rotation.z = 0.3 + flap;
        if (wR) wR.rotation.z = -0.3 - flap;
      });

      // Clouds drift
      clouds.forEach(cloud => {
        cloud.angle += cloud.speed * 0.005;
        cloud.mesh.position.set(
          Math.cos(cloud.angle) * cloud.radius,
          cloud.y,
          Math.sin(cloud.angle) * cloud.radius
        );
      });

      renderer.render(scene, camera);
    };

    animate();

    // ── Resize handler ──
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      // Clear refs so stale captures are no-ops.
      rendererRef.current = null;
      sceneRef.current    = null;
      cameraRef.current   = null;
    };
  }, [capture, onReady]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />

      {/* ── Day / night cycle indicator ──
          Sun and moon emojis are stacked and cross-faded by the animation loop
          (direct opacity mutations on sunRef / moonRef).  No React re-renders. */}
      <div
        className="absolute pointer-events-none select-none"
        style={{ top: 12, right: 16, width: 22, height: 22 }}
      >
        {/* Sun – visible during day (opacity driven by dayFactor) */}
        <span
          ref={sunRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            filter: 'drop-shadow(0 0 5px rgba(255,215,0,0.9))',
          }}
        >
          ☀
        </span>
        {/* Moon – visible during night (opacity driven by 1 − dayFactor) */}
        <span
          ref={moonRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            filter: 'drop-shadow(0 0 5px rgba(148,163,230,0.9))',
            opacity: 0,
          }}
        >
          🌙
        </span>
      </div>
    </div>
  );
}
