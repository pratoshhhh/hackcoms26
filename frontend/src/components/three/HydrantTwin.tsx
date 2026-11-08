/**
 * Procedural low-poly hydrant "digital twin". Illustrative only — it visualises the
 * hydrant's *reported state*, not a reconstruction of field conditions.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { HydrantStatus, ObstructionType } from "@/types";
import { cn, token } from "@/lib/utils";
import { useReducedMotion } from "@/hooks";

interface Props {
  status: HydrantStatus;
  obstruction: ObstructionType | null;
  monitored: boolean;
  className?: string;
}

export type Palette = ReturnType<typeof usePalette>;

export function usePalette() {
  return useMemo(
    () => ({
      bg: token("surface-2"),
      body: token("twin-body"),
      cap: token("twin-cap"),
      ground: token("twin-ground"),
      snow: token("twin-snow"),
      vehicle: token("twin-vehicle"),
      debris: token("twin-debris"),
      ok: token("ok"),
      warn: token("warn"),
      crit: token("crit"),
      muted: token("muted"),
      accent: token("accent"),
      line: token("line"),
    }),
    [],
  );
}

const statusColor = (p: Palette, s: HydrantStatus) => (s === "clear" ? p.ok : s === "warning" ? p.warn : s === "blocked" ? p.crit : p.muted);

/** Critically-damped approach toward a target (no overshoot — DESIGN.md §9). */
export function useDamped(target: number, reduced: boolean, lambda = 5) {
  const v = useRef(target);
  useFrame((_, dt) => {
    v.current = reduced ? target : THREE.MathUtils.damp(v.current, target, lambda, Math.min(dt, 0.05));
  });
  return v;
}

export function HydrantBody({ p }: { p: Palette }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.55, metalness: 0.25, flatShading: true }), [p]);
  const cap = useMemo(() => new THREE.MeshStandardMaterial({ color: p.cap, roughness: 0.4, metalness: 0.6, flatShading: true }), [p]);
  return (
    <group>
      <mesh material={mat} position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.38, 0.08, 10]} />
      </mesh>
      <mesh material={mat} position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.26, 0.75, 10]} />
      </mesh>
      <mesh material={mat} position={[0, 0.84, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.06, 10]} />
      </mesh>
      <mesh material={cap} position={[0, 0.96, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.25, 0.18, 10]} />
      </mesh>
      <mesh material={cap} position={[0, 1.05, 0]} castShadow>
        <sphereGeometry args={[0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={cap} position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.09, 5]} />
      </mesh>
      {/* side hose nozzles */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={mat} position={[s * 0.32, 0.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.08, 0.09, 0.18, 8]} />
          </mesh>
          <mesh material={cap} position={[s * 0.43, 0.62, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.095, 0.095, 0.05, 8]} />
          </mesh>
        </group>
      ))}
      {/* pumper nozzle (street side, +z) */}
      <mesh material={mat} position={[0, 0.55, 0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.13, 0.2, 8]} />
      </mesh>
      <mesh material={cap} position={[0, 0.55, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.135, 0.135, 0.05, 8]} />
      </mesh>
    </group>
  );
}

/** Ultrasonic sensor + scanning cone. Cone length reflects measured clearance. */
export function Scanner({ p, status, reduced }: { p: Palette; status: HydrantStatus; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const cone = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: p.accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }), [p]);
  const len = useDamped(status === "blocked" ? 0.55 : status === "warning" ? 0.9 : status === "offline" ? 0 : 1.6, reduced, 4);
  useFrame(({ clock }) => {
    if (!group.current || !cone.current) return;
    const t = clock.getElapsedTime();
    group.current.rotation.y = reduced ? 0 : Math.sin(t * 0.9) * 0.35;
    cone.current.scale.set(1, Math.max(0.001, len.current), 1);
    cone.current.position.z = len.current / 2;
    mat.color.set(status === "blocked" ? p.crit : status === "warning" ? p.warn : p.accent);
    mat.opacity = status === "offline" ? 0 : reduced ? 0.14 : 0.1 + 0.06 * (0.5 + 0.5 * Math.sin(t * 3));
  });
  return (
    <group position={[0, 0.9, 0.29]}>
      <mesh>
        <boxGeometry args={[0.12, 0.07, 0.05]} />
        <meshStandardMaterial color={status === "offline" ? p.muted : p.line} emissive={status === "offline" ? p.muted : p.accent} emissiveIntensity={status === "offline" ? 0 : 0.6} />
      </mesh>
      <group ref={group}>
        <mesh ref={cone} material={mat} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.35, 1, 24, 1, true]} />
        </mesh>
      </group>
    </group>
  );
}

export function Snow({ p, amount, reduced }: { p: Palette; amount: number; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const v = useDamped(amount, reduced, 3.5);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: p.snow, roughness: 0.95, flatShading: true }), [p]);
  const lumps = useMemo(
    () => [
      [0, 0.05, 0.5, 0.55],
      [0.45, 0.02, 0.35, 0.42],
      [-0.45, 0.02, 0.35, 0.45],
      [0.3, 0.0, -0.35, 0.4],
      [-0.3, 0.0, -0.35, 0.38],
      [0, 0.1, 0.85, 0.5],
      [0.7, 0.0, 0.7, 0.35],
      [-0.7, 0.0, 0.7, 0.33],
    ],
    [],
  );
  useFrame(() => {
    if (!g.current) return;
    g.current.scale.set(1, Math.max(0.001, v.current), 1);
    g.current.visible = v.current > 0.01;
  });
  return (
    <group ref={g}>
      {lumps.map(([x, y, z, r], i) => (
        <mesh key={i} material={mat} position={[x, y, z]} scale={[1, 0.75, 1]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function Vehicle({ p, present, reduced }: { p: Palette; present: boolean; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const x = useDamped(present ? 0 : 5, reduced, 3);
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: p.vehicle, roughness: 0.4, metalness: 0.5, flatShading: true }), [p]);
  const float = useMemo(() => new THREE.MeshStandardMaterial({ color: p.line, roughness: 0.2, metalness: 0.3 }), [p]);
  const tire = useMemo(() => new THREE.MeshStandardMaterial({ color: p.ground, roughness: 0.9 }), [p]);
  useFrame(() => {
    if (!g.current) return;
    g.current.position.x = x.current;
    g.current.visible = x.current < 4.9;
  });
  return (
    <group ref={g} position={[5, 0, 1.15]}>
      <mesh material={body} position={[0, 0.36, 0]} castShadow>
        <boxGeometry args={[2.1, 0.42, 0.95]} />
      </mesh>
      <mesh material={float} position={[-0.1, 0.72, 0]} castShadow>
        <boxGeometry args={[1.05, 0.32, 0.85]} />
      </mesh>
      {[
        [0.68, 0.45],
        [-0.68, 0.45],
        [0.68, -0.45],
        [-0.68, -0.45],
      ].map(([wx, wz], i) => (
        <mesh key={i} material={tire} position={[wx, 0.17, wz]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.12, 12]} />
        </mesh>
      ))}
    </group>
  );
}

function Debris({ p, amount, reduced }: { p: Palette; amount: number; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const v = useDamped(amount, reduced, 4);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: p.debris, roughness: 0.9, flatShading: true }), [p]);
  useFrame(() => {
    if (!g.current) return;
    g.current.scale.setScalar(Math.max(0.001, v.current));
    g.current.visible = v.current > 0.01;
  });
  return (
    <group ref={g}>
      <mesh material={mat} position={[0.15, 0.18, 0.6]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.5, 0.36, 0.4]} />
      </mesh>
      <mesh material={mat} position={[-0.35, 0.12, 0.5]} rotation={[0, -0.3, 0.1]} castShadow>
        <boxGeometry args={[0.35, 0.24, 0.3]} />
      </mesh>
      <mesh material={mat} position={[0.5, 0.25, 0.25]} castShadow>
        <coneGeometry args={[0.18, 0.5, 6]} />
      </mesh>
    </group>
  );
}

/** One-shot ground shockwave when the status changes — the 3D half of the CLEAR→BLOCKED moment. */
export function Shockwave({ p, status, reduced }: { p: Palette; status: HydrantStatus; reduced: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const t = useRef(1);
  const first = useRef(true);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: p.crit, transparent: true, opacity: 0, depthWrite: false }), [p]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    mat.color.set(statusColor(p, status));
    t.current = 0;
  }, [status, reduced, p, mat]);
  useFrame((_, dt) => {
    if (!mesh.current || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / 0.9);
    const e = 1 - Math.pow(1 - t.current, 3);
    mesh.current.scale.setScalar(0.6 + e * 2.4);
    mat.opacity = 0.5 * (1 - t.current);
  });
  return (
    <mesh ref={mesh} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
      <ringGeometry args={[0.8, 0.86, 48]} />
    </mesh>
  );
}

function Scene({ status, obstruction, reduced }: Props & { reduced: boolean }) {
  const p = usePalette();
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const blockedLike = status === "blocked" || status === "warning";
  const amount = status === "blocked" ? 1 : status === "warning" ? 0.5 : 0;
  useFrame(() => ringMat.current?.color.set(statusColor(p, status)));
  return (
    <>
      <color attach="background" args={[p.bg]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 48]} />
        <meshStandardMaterial color={p.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.78, 0.82, 64]} />
        <meshBasicMaterial ref={ringMat} transparent opacity={0.8} />
      </mesh>
      <ContactShadows position={[0, 0.011, 0]} opacity={0.45} blur={2.2} scale={4} far={1.5} />
      <HydrantBody p={p} />
      <Scanner p={p} status={status} reduced={reduced} />
      <Snow p={p} amount={blockedLike && (obstruction === "snow" || obstruction === "ice") ? amount : 0} reduced={reduced} />
      <Vehicle p={p} present={blockedLike && obstruction === "vehicle"} reduced={reduced} />
      <Debris p={p} amount={blockedLike && (obstruction === "debris" || obstruction === "vegetation") ? amount : 0} reduced={reduced} />
      <Shockwave p={p} status={status} reduced={reduced} />
    </>
  );
}

export default function HydrantTwin({ className, ...props }: Props) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("h-52 overflow-hidden rounded-lg border border-line", className)} aria-label="Interactive 3D illustration of the hydrant's reported state">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [2.1, 1.5, 2.6], fov: 38 }} gl={{ antialias: true, powerPreference: "low-power" }}>
        <Scene {...props} reduced={reduced} />
        <OrbitControls
          enablePan={false}
          minDistance={2.4}
          maxDistance={8}
          maxPolarAngle={Math.PI / 2.15}
          target={[0, 0.55, 0.3]}
          autoRotate={!reduced}
          autoRotateSpeed={0.5}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
