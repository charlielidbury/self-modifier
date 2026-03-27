'use client';

import { useEffect, useRef } from 'react';
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
export default function MinecraftScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || window.innerWidth;
    const H = mount.clientHeight || window.innerHeight;

    // ── Drag-to-rotate state ──
    let rotY = 0;
    let isDragging = false;
    let lastPointerX = 0;

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
      renderer.domElement.style.cursor = 'grabbing';
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      rotY += dx * 0.008;
    };
    const onPointerUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    // ── Scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(P.BG);
    scene.fog = new THREE.FogExp2(P.BG, 0.018);

    // ── Camera ──
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200);
    camera.position.set(0, 1.5, 18);

    // ── Renderer (pixelated Minecraft feel) ──
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.domElement.style.imageRendering = 'pixelated';
    renderer.domElement.style.cursor = 'grab';
    mount.appendChild(renderer.domElement);

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
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
    scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: P.STAR, size: 0.4 })));

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

      // Smooth zoom interpolation
      camZ += (targetCamZ - camZ) * 0.1;
      camera.position.setZ(camZ);

      // Spin the whole world (auto-rotate when not dragging; add user drag delta always)
      if (!isDragging) {
        rotY += 0.012 * 0.55;
      }
      mainGroup.rotation.y = rotY;
      mainGroup.rotation.x = Math.sin(t * 0.18) * 0.07;

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
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
