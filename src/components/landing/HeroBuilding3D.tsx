import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, PlaneGeometry, SphereGeometry, MeshStandardMaterial, MeshBasicMaterial, Matrix4, Vector3, DoubleSide, type InstancedMesh, type BufferGeometry, type Material } from "three";

import { Html } from "@react-three/drei";
import { BUILDING_UNITS, FACADE_COLUMNS, facadePosition } from "./buildingDemo";
import { BUILDING_ENERGY_PATHS, BUILDING_ENERGY_TRACES, buildingEnergyPoint } from "./buildingEnergy";
import { ApartmentCard } from "./ApartmentCard";
import { haloTexture } from "./house/textures";

type V = [number, number, number];
type Piece = { p: V; s: V; rotation?: number };
const COLORS = { wall: "#bdbdbd", trim: "#777777", frame: "#454545", dark: "#292b2c", warm: "#e8b678", curtain: "#d9cbb5", wood: "#705a46", fabric: "#656b64", leaf: "#45634c", trunk: "#66584a", green: "#45e0a4", paving: "#a9a9a9", lamp: "#ffe0ac" };
type Finish = keyof typeof COLORS;

// Fixed illustration only: no consumption, property or account data.
function makeBuilding() {
  const buckets = Object.fromEntries(Object.keys(COLORS).map(key => [key, []])) as Record<Finish, Piece[]>;
  const add = (finish: Finish, p: V, s: V, rotation = 0) => buckets[finish].push({ p, s, rotation });
  add("trim", [0, -0.16, 0], [8, 0.3, 7]);
  add("paving", [0, 0.015, 2.85], [7.7, 0.07, 1.2]);
  for (let x = -3.6; x < 4; x += 0.6) add("trim", [x, 0.055, 2.85], [0.012, 0.012, 1.2]);
  add("wall", [0, 4.25, 0], [5.6, 8.5, 4.4]);
  for (let floor = 0; floor < 6; floor++) {
    add("trim", [0, floor * 1.3 + 1.25, 0], [5.85, 0.12, 4.65]);
    for (let side = 0; side < 2; side++) {
      const rotation = side ? Math.PI / 2 : 0;
      const positions = FACADE_COLUMNS[side];
      positions.forEach((_, col) => {
        if (!side && !floor && col === 1) return;
        const y = floor * 1.3 + 0.65;
        // Local coordinates face outward, so both elevations share every detail.
        const local = (finish: Finish, dx: number, dy: number, depth: number, w: number, h: number, d: number, leafRotation = 0) => {
          const p = facadePosition(side, col, y + dy, dx, depth);
          add(finish, p, [w, h, depth < 0.05 ? Math.min(d, 0.008) : d], rotation + leafRotation);
        };
        const lit = BUILDING_UNITS.find(unit => unit.floor === floor && unit.side === side && unit.col === col)!.lit;
        const open = (floor + col + side) % 3 === 0;
        const width = side ? 0.8 : 1;
        local("frame", 0, 0, 0.006, width + 0.13, 0.94, 0.028);
        local(lit ? "warm" : "dark", 0, 0, 0.024, width, 0.8, 0.008);
        // Furniture silhouettes sit in front of the lit room backing, behind the sash.
        if (lit) {
          local("wood", 0.22, -0.17, 0.032, 0.31, 0.055, 0.08);
          local("wood", 0.22, -0.28, 0.032, 0.04, 0.22, 0.06);
          local("fabric", -0.17, -0.26, 0.032, 0.42, 0.20, 0.10);
          local("fabric", -0.17, -0.14, 0.032, 0.40, 0.07, 0.08);
          local("dark", 0.32, 0.03, 0.032, 0.025, 0.34, 0.03);
          local("lamp", 0.32, 0.19, 0.032, 0.16, 0.12, 0.07);
          if (col === 0) {
            local("wood", -0.32, 0.12, 0.032, 0.18, 0.40, 0.06);
            for (let shelf = 0; shelf < 3; shelf++) local("curtain", -0.32, shelf * 0.12, 0.040, 0.15, 0.025, 0.03);
          }
          local("wood", 0.06, -0.32, 0.036, 0.11, 0.12, 0.07);
          local("leaf", 0.06, -0.20, 0.036, 0.15, 0.18, 0.07);
        }
        const closed = (floor + col * 2 + side) % 5 === 0;
        for (let pleat = 0; pleat < (closed ? 8 : 4); pleat++) {
          const dx = closed ? -width * 0.43 + pleat * width * 0.12 : (pleat < 2 ? -1 : 1) * (width * 0.42 - (pleat % 2) * 0.055);
          local("curtain", dx, 0, 0.044 + (pleat % 2) * 0.002, closed ? width * 0.12 : 0.065, 0.76, 0.025);
        }
        for (const edge of [-1, 1]) {
          local("frame", edge * (width / 2), 0, 0.055, 0.035, 0.85, 0.055);
          local("frame", 0, edge * 0.4, 0.055, width, 0.035, 0.055);
        }
        // A slight leaf turn stays inside the opening; no displaced duplicate sash.
        const angle = open ? 0.08 : 0;
        const leafWidth = width / 2 - 0.025;
        const hinge = -width / 2 + 0.025;
        const leafCenter = hinge + leafWidth * Math.cos(angle) / 2;
        const leafDepth = 0.055 + leafWidth * Math.sin(angle) / 2;
        for (const edge of [-1, 1]) {
          local("frame", leafCenter, edge * 0.37, leafDepth, leafWidth, 0.025, 0.015, -angle);
          local("frame", leafCenter + edge * leafWidth * Math.cos(angle) / 2, 0,
            leafDepth + edge * leafWidth * Math.sin(angle) / 2, 0.025, 0.76, 0.015, -angle);
        }
        local("paving", 0, -0.46, 0.06, width + 0.16, 0.06, 0.16);
        if (floor > 0 && (floor + col + side) % 3 === 1) {
          // The slab starts at the wall, with the guardrail on its outer edge.
          local("trim", 0, -0.49, 0.16, width + 0.20, 0.08, 0.34);
          local("frame", 0, -0.14, 0.31, width + 0.20, 0.025, 0.025);
          for (let rail = -2; rail <= 2; rail++) local("frame", rail * width / 4, -0.30, 0.31, 0.02, 0.32, 0.02);
        }
      });
    }
  }
  add("trim", [0, 8.55, 0], [5.95, 0.22, 4.75]);
  add("wall", [-0.8, 8.9, -0.7], [2.2, 0.5, 1.8]);
  add("frame", [0, 0.65, 2.26], [1.1, 1.3, 0.12]);
  add("warm", [0, 0.66, 2.33], [0.94, 1.14, 0.025]);
  add("frame", [0, 0.65, 2.36], [0.045, 1.3, 0.04]);
  add("trim", [0, 1.4, 2.7], [2.3, 0.14, 1.3]);
  add("paving", [0, 0.06, 2.7], [2.5, 0.12, 1.5]);
  for (const x of [-0.85, 0, 0.85]) add("lamp", [x, 1.315, 2.9], [0.16, 0.025, 0.22]);
  // Underground supply, meter and exposed service riser.
  add("dark", [3.2, 0.09, 2.55], [0.07, 0.07, 1.7]);
  add("dark", [3.2, 0.39, 1.7], [0.07, 0.65, 0.07]);
  add("trim", [2.92, 0.7, 1.7], [0.30, 0.66, 0.45]);
  add("dark", [3.085, 0.75, 1.7], [0.025, 0.26, 0.29]);
  add("green", [3.105, 0.8, 1.7], [0.025, 0.065, 0.18]);
  add("frame", [2.99, 0.8, 1.9], [0.08, 0.055, 0.45]);
  // Street service pole feeds the meter; the circuit itself hugs the facade.
  add("frame", [3.65, 1.4, 3.15], [0.07, 2.8, 0.07]);
  add("frame", [3.65, 2.8, 3.15], [0.5, 0.055, 0.055]);
  for (const x of [-3.35, 3.4]) {
    add("trunk", [x, 0.55, -1.8], [0.13, 1.1, 0.13]);
    add("leaf", [x, 1.2, -1.8], [0.8, 1.15, 0.8]);
    add("leaf", [x, 0.3, 0.5], [0.65, 0.5, 0.8]);
  }
  for (const x of [-3.45, 3.5]) {
    add("frame", [x, 1.05, 2.8], [0.065, 2.1, 0.065]);
    add("frame", [x - 0.17, 2.1, 2.8], [0.4, 0.07, 0.15]);
    add("lamp", [x - 0.17, 2.05, 2.8], [0.25, 0.025, 0.12]);
  }
  return buckets;
}
const BUILDING = makeBuilding();
const WINDOW_GLOWS: Piece[] = BUILDING.warm.map(({ p, s, rotation = 0 }) => ({
  p: [p[0] + (rotation ? 0.018 : 0), p[1], p[2] + (rotation ? 0 : 0.018)],
  s: [s[0] * 1.08, s[1] * 1.08, 1], rotation,
}));

function Instances({ pieces, geometry, material }: { pieces: Piece[]; geometry: BufferGeometry; material: Material }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new Matrix4();
    const scale = new Matrix4();
    pieces.forEach(({ p, s, rotation = 0 }, i) => {
      matrix.makeRotationY(rotation).multiply(scale.makeScale(...s)).setPosition(...p);
      ref.current!.setMatrixAt(i, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [pieces]);
  return <instancedMesh ref={ref} args={[geometry, material, pieces.length]} raycast={() => null} />;
}

// Same materials, timing, pulse geometry and selection response as house EnergyFlow.
function BuildingEnergyFlow({ reducedMotion, selected, box, dot, trace, pulse }: {
  reducedMotion: boolean; selected: number | null; box: BufferGeometry; dot: BufferGeometry;
  trace: MeshBasicMaterial; pulse: MeshBasicMaterial;
}) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree(s => s.invalidate);
  const clock = useThree(s => s.clock);
  const [start] = useState(() => clock.elapsedTime);
  const scratch = useMemo(() => ({ matrix: new Matrix4(), point: new Vector3() }), []);
  useEffect(() => { invalidate(); }, [reducedMotion, selected, invalidate]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const progress = Math.max(0, Math.min(1, (t - start - 0.9) / 1.2));
    const intro = reducedMotion ? 1 : 1 - (1 - progress) ** 3;
    trace.opacity = 0.38 * intro;
    pulse.opacity = intro;
    const mesh = ref.current;
    if (!mesh) return;
    BUILDING_ENERGY_PATHS.forEach((path, p) => {
      const focus = path.unit !== null && path.unit === selected;
      for (let k = 0; k < 2; k++) {
        const phase = reducedMotion ? 0.5 + k * 0.25 : (t * 0.2 * (focus ? 1.7 : 1) + k / 2 + p * 0.17) % 1;
        buildingEnergyPoint(path, phase, scratch.point);
        const s = focus ? 1.35 : 0.9;
        mesh.setMatrixAt(p * 2 + k, scratch.matrix.makeScale(s, s, s).setPosition(scratch.point));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    // Canvas remains demand-driven and its existing offscreen pause still applies.
    if (!reducedMotion) invalidate();
  });
  return <>
    <Instances pieces={BUILDING_ENERGY_TRACES} geometry={box} material={trace} />
    <instancedMesh ref={ref} args={[dot, pulse, BUILDING_ENERGY_PATHS.length * 2]} frustumCulled={false} raycast={() => null} />
  </>;
}

// One instanced hit surface for all units; decorative geometry never raycasts.
function UnitTargets({ geometry, selected, onSelect, onHover }: { geometry: BufferGeometry; selected: number | null; onSelect: (id: number | null) => void; onHover: (id: number | null) => void }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new Matrix4();
    const scale = new Matrix4();
    BUILDING_UNITS.forEach((unit, index) => {
      matrix.makeRotationY(unit.side ? Math.PI / 2 : 0).multiply(scale.makeScale(unit.side ? 1.12 : 1.35, 1.06, 1)).setPosition(...unit.position);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, []);
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const unit = BUILDING_UNITS[event.instanceId ?? -1];
    if (unit) onSelect(selected === unit.id ? null : unit.id);
  };
  return <instancedMesh ref={ref} args={[geometry, undefined, BUILDING_UNITS.length]} onClick={pick} onPointerOver={event => {
    event.stopPropagation();
    onHover(BUILDING_UNITS[event.instanceId ?? -1]?.id ?? null);
  }} onPointerOut={() => onHover(null)}>
    <meshBasicMaterial side={DoubleSide} transparent opacity={0} depthWrite={false} />
  </instancedMesh>;
}

export default function HeroBuilding3D({ reducedMotion = false, selected, onSelect }: { reducedMotion?: boolean; selected: number | null; onSelect: (id: number | null) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const gl = useThree(s => s.gl);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => {
    if (selected === null) return;
    const update = () => invalidate();
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [selected, invalidate]);
  const cardPortal = useMemo(() => ({ current: gl.domElement.closest<HTMLElement>("[data-building-stage]") }), [gl]);
  useEffect(() => {
    gl.domElement.style.cursor = hovered === null ? "" : "pointer";
    return () => { gl.domElement.style.cursor = ""; };
  }, [gl, hovered]);
  const resources = useMemo(() => {
    const glowTexture = haloTexture("amber");
    return {
      glowTexture,
    glow: new MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0.23, depthWrite: false, toneMapped: false }),
    trace: new MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    pulse: new MeshBasicMaterial({ color: "#d9ffef", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    dot: new SphereGeometry(0.06, 12, 10),
    plane: new PlaneGeometry(1, 1),
    box: new BoxGeometry(1, 1, 1), sphere: new SphereGeometry(0.5, 8, 6),
    materials: Object.fromEntries(Object.entries(COLORS).map(([key, color]) => [key,
      ["warm", "lamp", "green"].includes(key)
        ? new MeshBasicMaterial({ color, toneMapped: false })
        : new MeshStandardMaterial({ color, roughness: 0.85 })])) as Record<string, Material>,
    };
  }, []);
  useEffect(() => () => {
    resources.glowTexture.dispose();
    resources.glow.dispose();
    resources.trace.dispose();
    resources.pulse.dispose();
    resources.dot.dispose();
    resources.plane.dispose();
    resources.box.dispose();
    resources.sphere.dispose();
    Object.values(resources.materials).forEach(material => material.dispose());
  }, [resources]);
  return <group scale={0.78} position={[0, -2.7, 0]} dispose={null}>
    {(Object.keys(BUILDING) as Finish[]).map(finish => <Instances key={finish} pieces={BUILDING[finish]} geometry={finish === "leaf" ? resources.sphere : resources.box} material={resources.materials[finish]} />)}
    <Instances pieces={WINDOW_GLOWS} geometry={resources.plane} material={resources.glow} />
    <UnitTargets geometry={resources.plane} selected={selected} onSelect={onSelect} onHover={setHovered} />
    {BUILDING_UNITS.map(unit => <group key={unit.id} position={unit.position} rotation={[0, unit.side ? Math.PI / 2 : 0, 0]}>
      {(selected === unit.id || hovered === unit.id) && <mesh position={[0, 0, 0.002]} raycast={() => null}>
        <planeGeometry args={[unit.side ? 0.8 : 1, 0.8]} />
        <meshStandardMaterial color={COLORS.green} emissive={COLORS.green} emissiveIntensity={selected === unit.id ? 0.65 : 0.25} transparent opacity={selected === unit.id ? 0.5 : 0.22} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>}
      {selected === unit.id && <Html portal={cardPortal} position={[0, 0.1, 0.01]} zIndexRange={[40, 30]} style={{ pointerEvents: "auto" }} calculatePosition={(object, camera, size) => {
        const point = new Vector3().setFromMatrixPosition(object.matrixWorld).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        const stage = cardPortal.current?.getBoundingClientRect() ?? rect;
        const element = cardPortal.current?.querySelector<HTMLElement>("[data-apartment-card]");
        const width = element?.offsetWidth ?? 212;
        const height = element?.offsetHeight ?? 174;
        const x = rect.left - stage.left + (point.x + 1) * size.width / 2;
        const y = rect.top - stage.top + (1 - point.y) * size.height / 2;
        const left = Math.max(8, -stage.left + 8);
        const right = Math.min(stage.width, window.innerWidth - stage.left) - width - 8;
        const top = Math.max(8, -stage.top + 8);
        const bottom = Math.min(stage.height, window.innerHeight - stage.top) - height - 8;
        const above = y - height - 18 >= top;
        const cardX = Math.max(left, Math.min(right, x - width / 2));
        const cardY = Math.max(top, Math.min(bottom, above ? y - height - 18 : y + 18));
        // A short leader ends at the projected unit, even when the card is clamped.
        if (element) {
          const startX = Math.max(12, Math.min(width - 12, x - cardX));
          const startY = above ? height : 0;
          const dx = x - cardX - startX;
          const dy = y - cardY - startY;
          element.style.setProperty("--leader-x", `${startX}px`);
          element.style.setProperty("--leader-y", `${startY}px`);
          element.style.setProperty("--leader-length", `${Math.hypot(dx, dy)}px`);
          element.style.setProperty("--leader-angle", `${Math.atan2(dy, dx)}rad`);
        }
        return [cardX, cardY];
      }}><ApartmentCard unit={unit} onClose={() => onSelect(null)} anchored /></Html>}
    </group>)}
    <pointLight position={[0, 1.05, 3]} color="#ffc58a" intensity={1.5} distance={3} decay={2} />
    <BuildingEnergyFlow reducedMotion={reducedMotion} selected={selected} box={resources.box} dot={resources.dot} trace={resources.trace} pulse={resources.pulse} />
  </group>;
}
