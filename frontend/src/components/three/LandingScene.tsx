/**
 * Landing hero: an architectural-model city block with one monitored hydrant that
 * loops through clear → blocked by snow → cleared. Calm by default: slow drift,
 * no camera tricks, fog fades the edges into the page background.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Pause, Play } from "lucide-react";
import type { HydrantStatus } from "@/types";
import { token } from "@/lib/utils";
import { useReducedMotion } from "@/hooks";
import { HydrantBody, Scanner, Shockwave, Snow, usePalette, type Palette } from "./HydrantTwin";
import { StatusChip } from "@/components/hydrants/status";
import { rng } from "@/utils/random";

/** Timeline (seconds) of the looping story. */
const LOOP = 12;
function statusAt(t: number): HydrantStatus {
  const s = t % LOOP;
  if (s >= 4.6 && s < 9.2) return "blocked";
  return "clear";
}

function City({ p }: { p: Palette }) {
  const blocks = useMemo(() => {
    const r = rng(7);
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const pitch = 2.4;
    for (let gx = -3; gx <= 3; gx++) {
      for (let gz = -3; gz <= 3; gz++) {
        const cx = gx * pitch + pitch / 2;
        const cz = gz * pitch + pitch / 2;
        // Keep the block in front of the featured hydrant open (a small plaza) so nothing occludes it.
        if (gx === 0 && gz === 0) continue;
        const near = Math.abs(gx) <= 1 && Math.abs(gz) <= 1;
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const w = 0.5 + r() * 0.8;
          const d = 0.5 + r() * 0.8;
          out.push({ x: cx + (r() - 0.5) * (1.6 - w), z: cz + (r() - 0.5) * (1.6 - d), w, d, h: (near ? 0.18 : 0.25) + r() * r() * (near ? 0.5 : 1.2) });
        }
      }
    }
    return out;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: token("surface-1"), roughness: 0.9 }), []);
  const ground = useMemo(() => new THREE.MeshStandardMaterial({ color: token("bg"), roughness: 1 }), []);
  const road = useMemo(() => new THREE.MeshStandardMaterial({ color: p.ground, roughness: 1 }), [p]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow material={ground}>
        <planeGeometry args={[40, 40]} />
      </mesh>
      {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
        <group key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[i * 2.4, 0, 0]} receiveShadow material={road}>
            <planeGeometry args={[0.6, 18]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.001, i * 2.4]} receiveShadow material={road}>
            <planeGeometry args={[0.6, 18]} />
          </mesh>
        </group>
      ))}
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow material={mat}>
          <boxGeometry args={[b.w, b.h, b.d]} />
        </mesh>
      ))}
    </group>
  );
}

/** Other monitored hydrants: small posts at intersections, all accessible except one warning. */
function NeighborHydrants({ p }: { p: Palette }) {
  const spots: [number, number, string][] = [
    [-2.4, -2.4, p.ok],
    [2.4, -2.4, p.ok],
    [-2.4, 2.4, p.warn],
    [4.8, 0, p.ok],
    [0, 4.8, p.ok],
    [-4.8, -2.4, p.ok],
    [2.4, 4.8, p.ok],
  ];
  return (
    <>
      {spots.map(([x, z, c], i) => (
        <group key={i} position={[x + 0.42, 0, z + 0.42]}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.07, 0.24, 8]} />
            <meshStandardMaterial color={p.body} roughness={0.6} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
            <ringGeometry args={[0.16, 0.19, 32]} />
            <meshBasicMaterial color={c} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Hero({ status, reduced, paused }: { status: HydrantStatus; reduced: boolean; paused: boolean }) {
  const p = usePalette();
  const root = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dt) => {
    if (root.current && !reduced && !paused) root.current.rotation.y += dt * 0.06;
    ring.current?.color.set(status === "blocked" ? p.crit : p.ok);
  });
  return (
    <group ref={root}>
      <City p={p} />
      <NeighborHydrants p={p} />
      {/* The featured hydrant sits on the corner of the central intersection. */}
      <group position={[0.5, 0, 0.5]} rotation={[0, Math.PI / 4, 0]} scale={0.8}>
        <HydrantBody p={p} />
        <Scanner p={p} status={status} reduced={reduced || paused} />
        <Snow p={p} amount={status === "blocked" ? 1 : 0} reduced={reduced} />
        <Shockwave p={p} status={status} reduced={reduced} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.95, 1.02, 64]} />
          <meshBasicMaterial ref={ring} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Frames the featured hydrant away from the overlaid headline:
 * right of the text on wide screens, below it on phones.
 * Screen-right on the ground plane is (1,0,-1); screen-down is toward the camera (1,0,1).
 */
function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const s = Math.SQRT1_2;
    let tx = 0.5;
    let tz = 0.5;
    if (size.width >= 1024) {
      const k = 2.2; // push hydrant right
      tx -= k * s;
      tz += k * s;
    } else if (size.width >= 640) {
      const k = 1.1;
      const j = 0.8; // a little right, a little down
      tx += -k * s - j * s;
      tz += k * s - j * s;
    } else {
      const j = 2.0; // push hydrant down below the text
      tx -= j * s;
      tz -= j * s;
    }
    camera.lookAt(tx, 0.3, tz);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function Fog() {
  const c = useMemo(() => token("bg"), []);
  return <fog attach="fog" args={[c, 11, 22]} />;
}

export default function LandingScene() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<HydrantStatus>("clear");
  const clock = useRef(0);

  useEffect(() => {
    if (reduced || paused) return;
    const id = setInterval(() => {
      clock.current += 0.2;
      setStatus(statusAt(clock.current));
    }, 200);
    return () => clearInterval(id);
  }, [reduced, paused]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        frameloop={paused || reduced ? "demand" : "always"}
        camera={{ position: [6.4, 6.2, 7.6], fov: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        aria-hidden
      >
        <CameraRig />
        <Fog />
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 9, 4]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} />
        <Hero status={status} reduced={reduced} paused={paused} />
      </Canvas>

      {/* Live caption + pause sit bottom-right, away from the overlaid headline. */}
      <div className="absolute bottom-6 right-6 z-10 flex items-center gap-2">
        <span className="float hidden items-center gap-2 rounded-lg px-3 py-2 text-xs sm:flex">
          <span className="num text-text-2">ROC-0001</span>
          <StatusChip status={status} />
          <span className="text-text-3">
            66 Eastland Ave · {status === "blocked" ? "plow windrow, 22 cm clear" : "148 cm clear"}
          </span>
        </span>
        {!reduced && (
          <button
            onClick={() => setPaused((v) => !v)}
            className="float grid size-9 place-items-center rounded-lg text-text-2 hover:text-text-1"
            aria-label={paused ? "Play animation" : "Pause animation"}
          >
            {paused ? <Play className="size-4" strokeWidth={1.5} /> : <Pause className="size-4" strokeWidth={1.5} />}
          </button>
        )}
      </div>
    </div>
  );
}
