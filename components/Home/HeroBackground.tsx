"use client";

// ==========================================================
// LegalSetu — hero background: a courthouse colonnade
// ----------------------------------------------------------
// A receding row of classical columns dissolving into fog, with
// slow drifting dust in the light. Reads instantly as "law /
// courthouse" without a single texture, model file, or network
// request — everything is procedural geometry, so there is
// nothing to download and nothing that can suspend and blank
// the page (which is exactly what an HDR environment map did).
//
// Deliberately cheap: ~30 meshes, one points cloud, two lights,
// no postprocessing. It also stops rendering entirely once the
// hero scrolls out of view.
// ==========================================================

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";

const DUST_COUNT = 350;

function Column({ x, z, isDark }: { x: number; z: number; isDark: boolean }) {
  const shaft = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isDark ? "#334561" : "#cbd5e1",
        metalness: 0.15,
        roughness: 0.7,
      }),
    [isDark]
  );
  const trim = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isDark ? "#c9a24a" : "#b6c2d4",
        metalness: 0.4,
        roughness: 0.5,
      }),
    [isDark]
  );

  return (
    <group position={[x, 0, z]}>
      {/* base */}
      <mesh position={[0, -3.6, 0]} material={trim}>
        <boxGeometry args={[1.5, 0.35, 1.5]} />
      </mesh>
      {/* shaft */}
      <mesh position={[0, 0, 0]} material={shaft}>
        <cylinderGeometry args={[0.5, 0.58, 7, 16]} />
      </mesh>
      {/* capital */}
      <mesh position={[0, 3.7, 0]} material={trim}>
        <boxGeometry args={[1.5, 0.45, 1.5]} />
      </mesh>
    </group>
  );
}

function Colonnade({ isDark }: { isDark: boolean }) {
  const columns = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const z = -3 - i * 6;
      out.push({ x: -4.2, z });
      out.push({ x: 4.2, z });
    }
    return out;
  }, []);

  return (
    <group>
      {columns.map((c, i) => (
        <Column key={i} x={c.x} z={c.z} isDark={isDark} />
      ))}
    </group>
  );
}

function Dust({ isDark }: { isDark: boolean }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(DUST_COUNT * 3);
    const spd = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = -Math.random() * 34;
      spd[i] = 0.08 + Math.random() * 0.18;
    }
    return { positions: pos, speeds: spd };
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  useFrame((_, delta) => {
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const step = Math.min(delta, 0.05);
    for (let i = 0; i < DUST_COUNT; i++) {
      arr[i * 3 + 1] += speeds[i] * step;
      if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = -6;
    }
    attr.needsUpdate = true;
    if (ref.current) ref.current.rotation.y += delta * 0.008;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.05}
        sizeAttenuation
        transparent
        opacity={isDark ? 0.65 : 0.4}
        color={isDark ? "#93c5fd" : "#64748b"}
        depthWrite={false}
        blending={isDark ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}

function SceneAtmosphere({ isDark }: { isDark: boolean }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.FogExp2(isDark ? "#0b1120" : "#eef2f8", 0.052);
    return () => {
      scene.fog = null;
    };
  }, [scene, isDark]);
  return null;
}

function CameraDrift() {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const targetX = Math.sin(t * 0.09) * 0.35 + pointer.current.x * 0.5;
    const targetY = Math.cos(t * 0.07) * 0.2 - pointer.current.y * 0.3;
    const k = 1 - Math.pow(0.05, Math.min(delta, 0.1));
    state.camera.position.x += (targetX - state.camera.position.x) * k;
    state.camera.position.y += (targetY - state.camera.position.y) * k;
    state.camera.lookAt(0, 0, -14);
  });

  return null;
}

export default function HeroBackground({ isDark = true }: { isDark?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [enabled, setEnabled] = useState(false);

  // Phones get the scales in the hero and nothing else. Two WebGL
  // contexts plus the three.js bundle is a lot to ask of a mid-range
  // Android for a background people barely register.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setEnabled(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Stop rendering the moment the hero leaves the screen — a
  // background nobody can see should not cost a single frame.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
    // Re-runs once `enabled` flips, since the host div does not exist before then.
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 6], fov: 50 }}
      >
        <SceneAtmosphere isDark={isDark} />
        <CameraDrift />
        <ambientLight intensity={isDark ? 0.35 : 0.7} />
        <directionalLight position={[0, 6, 4]} intensity={isDark ? 1.0 : 1.3} color={isDark ? "#cfe0ff" : "#ffffff"} />
        <pointLight position={[0, -1, -8]} intensity={isDark ? 2.2 : 1.0} distance={26} color="#e8c15c" />
        <Colonnade isDark={isDark} />
        <Dust isDark={isDark} />
      </Canvas>
    </div>
  );
}
