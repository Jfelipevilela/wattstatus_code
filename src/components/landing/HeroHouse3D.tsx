import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { furnitureFor, type FurnitureFinish, type FurniturePiece } from "@/components/floorplan/three/furniture";
import { DEMO_ROOMS, HOUSE_SIZE, type DemoRoom, type DemoRoomId } from "./content";

/**
 * Hero house for the public landing. A demonstration model, not a property:
 * it never reads user data. Furniture comes from the Living Energy generator;
 * the architecture, night palette and energy effects are specific to the hero.
 */

const H = 2.6; // exterior wall height
const IH = 1.2; // cut-away interior walls
const T = 0.14; // wall thickness
const FT = 0.06; // floor thickness
const CX = HOUSE_SIZE.w / 2;
const CZ = HOUSE_SIZE.d / 2;

type Box = { p: [number, number, number]; s: [number, number, number] };

// Axis-aligned box between two points, centred on the wall line.
const span = (x1: number, z1: number, x2: number, z2: number, y0: number, y1: number, thick = T): Box => {
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const len = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  return {
    p: [(x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2],
    s: alongX ? [len + thick, y1 - y0, thick] : [thick, y1 - y0, len + thick],
  };
};

// A wall line with window bands cut out of it.
const windowedWall = (
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  windows: Array<[number, number, number, number]>,
): { solid: Box[]; glass: Box[] } => {
  const at = (a: number, b: number, y0: number, y1: number, thick = T) =>
    axis === "x" ? span(a, fixed, b, fixed, y0, y1, thick) : span(fixed, a, fixed, b, y0, y1, thick);
  const solid: Box[] = [];
  const glass: Box[] = [];
  let cursor = from;
  for (const [a, b, y0, y1] of windows) {
    if (a > cursor) solid.push(at(cursor, a, 0, H));
    solid.push(at(a, b, 0, y0), at(a, b, y1, H));
    glass.push(at(a, b, y0, y1, 0.03));
    cursor = b;
  }
  if (cursor < to) solid.push(at(cursor, to, 0, H));
  // Wall boxes overlap by the thickness at the joints; trim the inner ones.
  solid.forEach((box) => {
    if (axis === "x") box.s[0] = Math.max(0.01, box.s[0] - T);
    else box.s[2] = Math.max(0.01, box.s[2] - T);
  });
  return { solid, glass };
};

const back = windowedWall("x", 0, 0, HOUSE_SIZE.w, [
  [0.9, 3.1, 1.0, 2.15],
  [7.0, 9.3, 1.0, 2.15],
]);
const left = windowedWall("z", 0, 0, HOUSE_SIZE.d, [[4.4, 7.0, 0.35, 2.3]]);

const EXTERIOR: Box[] = [...back.solid, ...left.solid, span(0, 0, 0, 0, 0, H, T)];
const INTERIOR: Box[] = [
  span(4, 0, 4, 3.6, 0, IH),
  span(6.3, 0, 6.3, 2.6, 0, IH),
  span(0, 3.6, 2.4, 3.6, 0, IH),
  span(3.3, 3.6, 4.6, 3.6, 0, IH),
  span(5.4, 3.6, 8.6, 3.6, 0, IH),
  span(9.4, 3.6, 10, 3.6, 0, IH),
  span(5.6, 3.6, 5.6, 5.1, 0, IH),
];
const WINDOWS: Box[] = [...back.glass, ...left.glass];

// Glass facades on the two sides that face the camera.
const facade = () => {
  const glass: Box[] = [];
  const frame: Box[] = [];
  const W = HOUSE_SIZE.w;
  const D = HOUSE_SIZE.d;
  for (let x = 0; x < W - 0.01; x += W / 8) glass.push(span(x, D, x + W / 8, D, 0.04, H - 0.04, 0.03));
  for (let z = 0; z < D - 0.01; z += D / 6) glass.push(span(W, z, W, z + D / 6, 0.04, H - 0.04, 0.03));
  for (let i = 0; i <= 8; i++) frame.push({ p: [(W / 8) * i, H / 2, D], s: [0.03, H, 0.04] });
  for (let i = 0; i <= 6; i++) frame.push({ p: [W, H / 2, (D / 6) * i], s: [0.04, H, 0.03] });
  frame.push({ p: [W / 2, H - 0.03, D], s: [W + 0.07, 0.06, 0.08] }, { p: [W / 2, 0.03, D], s: [W + 0.07, 0.06, 0.08] });
  frame.push({ p: [W, H - 0.03, D / 2], s: [0.08, 0.06, D + 0.07] }, { p: [W, 0.03, D / 2], s: [0.08, 0.06, D + 0.07] });
  return { glass, frame };
};
const FACADE = facade();

// Cantilevered roof eyebrow over the private rooms, plus a corner column.
const ROOF: Box[] = [
  { p: [CX, H + 0.08, 0.5], s: [HOUSE_SIZE.w + 0.9, 0.16, 2.0] },
  { p: [-0.1, H + 0.08, CZ], s: [1.0, 0.16, HOUSE_SIZE.d + 0.2] },
];
const LED_STRIPS: Box[] = [
  { p: [CX, H - 0.02, 1.48], s: [HOUSE_SIZE.w + 0.9, 0.025, 0.03] },
  { p: [0.39, H - 0.02, CZ], s: [0.03, 0.025, HOUSE_SIZE.d + 0.2] },
];

const roomCenter = (room: DemoRoom): [number, number] => [room.x + room.w / 2, room.z + room.d / 2];
const HUB: [number, number] = [5.0, 4.15];

// Manhattan trace from the hub to each room centre, like a circuit.
const tracePath = (room: DemoRoom): Array<[number, number]> => {
  const [x, z] = roomCenter(room);
  if (room.z < 3.6) return [HUB, [x, HUB[1]], [x, z]];
  return [HUB, [HUB[0], z + 0.9], [x, z + 0.9], [x, z]];
};
const pathLength = (path: Array<[number, number]>) =>
  path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i][0], point[1] - path[i][1]), 0);
const pointOnPath = (path: Array<[number, number]>, t: number, out: Vector3) => {
  let left = t * pathLength(path);
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (left <= len || i === path.length - 1) {
      const k = len === 0 ? 0 : Math.min(1, left / len);
      return out.set(ax + (bx - ax) * k, 0, az + (bz - az) * k);
    }
    left -= len;
  }
  return out;
};

const FINISH: Record<FurnitureFinish, { color: string; roughness: number; metalness?: number; opacity?: number; emissive?: string }> = {
  fabric: { color: "#56637a", roughness: 0.95 },
  wood: { color: "#8a6446", roughness: 0.7 },
  white: { color: "#e6e9ee", roughness: 0.45 },
  dark: { color: "#1b222d", roughness: 0.45 },
  metal: { color: "#a7b0bd", roughness: 0.28, metalness: 0.6 },
  glass: { color: "#9fd6ef", roughness: 0.08, opacity: 0.32 },
  accent: { color: "#33465c", roughness: 1 },
  plant: { color: "#2f6e4f", roughness: 0.9 },
};

const useSceneResources = () => {
  const resources = useMemo(() => {
    const standard = (color: string, roughness: number, extra: Partial<MeshStandardMaterial> = {}) =>
      Object.assign(new MeshStandardMaterial({ color, roughness }), extra);
    const furniture = Object.fromEntries(
      Object.entries(FINISH).map(([key, spec]) => [
        key,
        new MeshStandardMaterial({
          color: spec.color,
          roughness: spec.roughness,
          metalness: spec.metalness ?? 0,
          transparent: (spec.opacity ?? 1) < 1,
          opacity: spec.opacity ?? 1,
          depthWrite: (spec.opacity ?? 1) >= 1,
        }),
      ]),
    ) as Record<FurnitureFinish, MeshStandardMaterial>;
    return {
      box: new BoxGeometry(1, 1, 1),
      cylinder: new CylinderGeometry(0.5, 0.5, 1, 18),
      ring: new RingGeometry(0.34, 0.4, 48),
      dot: new SphereGeometry(0.07, 12, 12),
      furniture,
      wall: standard("#b4bbc5", 0.9),
      exterior: standard("#1a2230", 0.6),
      plinth: standard("#0b1320", 0.85),
      deck: standard("#4a3626", 0.8),
      frame: standard("#3a4658", 0.35, { metalness: 0.6 }),
      roof: standard("#121a26", 0.55),
      glass: new MeshStandardMaterial({ color: "#8fd3ff", roughness: 0.04, metalness: 0.5, transparent: true, opacity: 0.1, depthWrite: false, side: DoubleSide }),
      water: standard("#08384f", 0.08, { emissive: new Color("#0e7490"), emissiveIntensity: 0.32, metalness: 0.3 }),
      led: new MeshBasicMaterial({ color: "#7fe8ff", toneMapped: false }),
      edge: new MeshBasicMaterial({ color: "#38d6f5", transparent: true, opacity: 0.55, toneMapped: false }),
      trace: new MeshBasicMaterial({ color: "#38d6f5", transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
      pulse: new MeshBasicMaterial({ color: "#c9f6ff", transparent: true, opacity: 0, toneMapped: false }),
    };
  }, []);
  useEffect(
    () => () => {
      Object.values(resources).forEach((value) => {
        if ("dispose" in value) (value as { dispose: () => void }).dispose();
      });
      Object.values(resources.furniture).forEach((material) => material.dispose());
    },
    [resources],
  );
  return resources;
};
type Resources = ReturnType<typeof useSceneResources>;

// Static boxes of one material as a single instanced draw call.
function Boxes({ boxes, material, geometry, castShadow = false, receiveShadow = false }: { boxes: Box[]; material: MeshStandardMaterial | MeshBasicMaterial; geometry: BufferGeometry; castShadow?: boolean; receiveShadow?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    boxes.forEach((box, index) => mesh.setMatrixAt(index, matrix.makeScale(...box.s).setPosition(...box.p)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  return <instancedMesh ref={ref} args={[geometry, material, boxes.length]} castShadow={castShadow} receiveShadow={receiveShadow} raycast={() => null} />;
}

// All rooms' furniture, one instanced mesh per shape and finish.
function Furniture({ resources, shadows }: { resources: Resources; shadows: boolean }) {
  const buckets = useMemo(() => {
    const map = new Map<string, { shape: FurniturePiece["shape"]; finish: FurnitureFinish; boxes: Box[] }>();
    DEMO_ROOMS.forEach((room) => {
      furnitureFor(room.type, room.w, room.d).forEach((piece) => {
        const key = `${piece.shape}|${piece.finish}`;
        let bucket = map.get(key);
        if (!bucket) map.set(key, (bucket = { shape: piece.shape, finish: piece.finish, boxes: [] }));
        bucket.boxes.push({ p: [room.x + piece.x, FT + piece.y, room.z + piece.z], s: piece.size });
      });
    });
    return [...map.entries()];
  }, []);
  return (
    <>
      {buckets.map(([key, bucket]) => (
        <Boxes
          key={key}
          boxes={bucket.boxes}
          material={resources.furniture[bucket.finish]}
          geometry={bucket.shape === "cylinder" ? resources.cylinder : resources.box}
          castShadow={shadows && bucket.finish !== "glass"}
        />
      ))}
    </>
  );
}

const FLOOR_COLOR = { wood: "#7d5c42", tile: "#9aa5b2" } as const;
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);

interface SceneProps {
  selected: DemoRoomId | null;
  hovered: DemoRoomId | null;
  onHover: (id: DemoRoomId | null) => void;
  onSelect: (id: DemoRoomId | null) => void;
  compact: boolean;
  reducedMotion: boolean;
  zoom: number;
  showMarkers: boolean;
}

function Room({ room, state, resources, onHover, onSelect }: { room: DemoRoom; state: "idle" | "hover" | "selected"; resources: Resources; onHover: SceneProps["onHover"]; onSelect: SceneProps["onSelect"] }) {
  const material = useMemo(
    () => new MeshStandardMaterial({ color: FLOOR_COLOR[room.floor], roughness: room.floor === "tile" ? 0.35 : 0.65, emissive: new Color("#38d6f5"), emissiveIntensity: 0 }),
    [room.floor],
  );
  useEffect(() => () => material.dispose(), [material]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [state, invalidate]);

  useFrame((_, delta) => {
    const goal = state === "selected" ? 0.16 : state === "hover" ? 0.08 : 0;
    const k = Math.min(1, delta * 8);
    material.emissiveIntensity += (goal - material.emissiveIntensity) * k;
    if (Math.abs(goal - material.emissiveIntensity) > 0.002) invalidate();
  });

  const [cx, cz] = roomCenter(room);
  return (
    <mesh
        position={[cx, FT / 2, cz]}
        scale={[room.w, FT, room.d]}
        geometry={resources.box}
        material={material}
        receiveShadow
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          onHover(room.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect(room.id);
        }}
      />
  );
}

// Glowing rings at each room centre, pulsing while a room is in focus.
function RoomRings({ selected, hovered, resources, reducedMotion, start }: { selected: DemoRoomId | null; hovered: DemoRoomId | null; resources: Resources; reducedMotion: boolean; start: number }) {
  const refs = useRef<Array<InstancedMesh | null>>([]);
  const materials = useMemo(() => DEMO_ROOMS.map(() => resources.edge.clone()), [resources.edge]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const matrix = useMemo(() => new Matrix4(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const intro = reducedMotion ? 1 : ease((t - start - 1.0) / 0.8);
    DEMO_ROOMS.forEach((room, index) => {
      const mesh = refs.current[index];
      if (!mesh) return;
      const focus = room.id === selected ? 1 : room.id === hovered ? 0.6 : 0;
      const wave = reducedMotion ? 0 : (t * 0.6 + index * 0.2) % 1;
      const scale = 1 + focus * (reducedMotion ? 0.4 : wave * 1.1);
      const [cx, cz] = roomCenter(room);
      matrix.makeRotationX(-Math.PI / 2).scale(new Vector3(scale, scale, scale)).setPosition(cx, FT + 0.012, cz);
      mesh.setMatrixAt(0, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      materials[index].opacity = intro * (focus ? 0.9 * (1 - (reducedMotion ? 0 : wave) * 0.85) : 0.35);
    });
  });
  return (
    <>
      {DEMO_ROOMS.map((room, index) => (
        <instancedMesh
          key={room.id}
          ref={(node) => (refs.current[index] = node)}
          args={[resources.ring, materials[index], 1]}
          raycast={() => null}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

// Circuit traces from the hub plus pulses travelling along them.
function EnergyFlow({ resources, reducedMotion, selected, start, compact }: { resources: Resources; reducedMotion: boolean; selected: DemoRoomId | null; start: number; compact: boolean }) {
  const paths = useMemo(() => DEMO_ROOMS.map(tracePath), []);
  const traces = useMemo(() => {
    const boxes: Box[] = [];
    paths.forEach((path) =>
      path.slice(1).forEach(([bx, bz], i) => {
        const [ax, az] = path[i];
        const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
        const len = Math.hypot(bx - ax, bz - az);
        boxes.push({ p: [(ax + bx) / 2, FT + 0.006, (az + bz) / 2], s: alongX ? [len + 0.03, 0.004, 0.03] : [0.03, 0.004, len + 0.03] });
      }),
    );
    return boxes;
  }, [paths]);
  const perPath = compact ? 1 : 2;
  const pulses = useRef<InstancedMesh>(null);
  const hub = useRef<InstancedMesh>(null);
  const scratch = useMemo(() => ({ v: new Vector3(), m: new Matrix4() }), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const intro = reducedMotion ? 1 : ease((t - start - 0.9) / 1.2);
    resources.trace.opacity = 0.42 * intro;
    resources.pulse.opacity = intro;
    const mesh = pulses.current;
    if (mesh) {
      paths.forEach((path, p) => {
        const boost = DEMO_ROOMS[p].id === selected ? 1.6 : 1;
        for (let k = 0; k < perPath; k++) {
          const phase = reducedMotion ? 0.5 + k * 0.25 : (t * 0.22 * boost + k / perPath + p * 0.17) % 1;
          pointOnPath(path, phase, scratch.v);
          const s = DEMO_ROOMS[p].id === selected ? 1.25 : 0.85;
          scratch.m.makeScale(s, s, s).setPosition(scratch.v.x, FT + 0.07, scratch.v.z);
          mesh.setMatrixAt(p * perPath + k, scratch.m);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (hub.current) {
      const s = 1 + (reducedMotion ? 0 : Math.sin(t * 2) * 0.12);
      scratch.m.makeScale(s * 1.6, s * 1.6, s * 1.6).setPosition(HUB[0], FT + 0.1, HUB[1]);
      hub.current.setMatrixAt(0, scratch.m);
      hub.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <Boxes boxes={traces} material={resources.trace} geometry={resources.box} />
      <instancedMesh ref={pulses} args={[resources.dot, resources.pulse, paths.length * perPath]} raycast={() => null} frustumCulled={false} />
      <instancedMesh ref={hub} args={[resources.dot, resources.led, 1]} raycast={() => null} frustumCulled={false} />
    </>
  );
}

// Warm interior lights fade in once; the selected room brightens.
function RoomLights({ selected, compact, reducedMotion, start }: { selected: DemoRoomId | null; compact: boolean; reducedMotion: boolean; start: number }) {
  const rooms = compact ? DEMO_ROOMS.filter((room) => room.id !== "bathroom" && room.id !== "office") : DEMO_ROOMS;
  const refs = useRef<Array<PointLight | null>>([]);
  useFrame(({ clock }, delta) => {
    const intro = reducedMotion ? 1 : ease((clock.elapsedTime - start - 0.3) / 1.4);
    rooms.forEach((room, index) => {
      const light = refs.current[index];
      if (!light) return;
      const goal = (room.id === selected ? 15 : 7.5) * intro;
      light.intensity += (goal - light.intensity) * Math.min(1, delta * 5);
    });
  });
  return (
    <>
      {rooms.map((room, index) => {
        const [cx, cz] = roomCenter(room);
        return <pointLight key={room.id} ref={(node) => (refs.current[index] = node)} position={[cx, 2.0, cz]} color="#ffbe80" intensity={0} distance={7.5} decay={1.6} />;
      })}
    </>
  );
}

// Moves the orbit target and distance toward the selected room.
function CameraRig({ selected, zoom, reducedMotion, controls, base, compact }: { selected: DemoRoomId | null; zoom: number; reducedMotion: boolean; compact: boolean; controls: React.RefObject<OrbitControlsImpl>; base: number }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useMemo(() => new Vector3(), []);
  const dir = useMemo(() => new Vector3(), []);
  useEffect(() => invalidate(), [selected, zoom, invalidate]);
  useFrame((_, delta) => {
    const ctl = controls.current;
    if (!ctl) return;
    const room = DEMO_ROOMS.find((r) => r.id === selected);
    if (room) {
      const [x, z] = roomCenter(room);
      const pull = compact ? 0.35 : 0.9;
      goal.set((x - CX) * pull, 0.6, (z - CZ) * pull);
    } else goal.set(0, 0.7, 0.3);
    // Phones keep the whole house in frame; only the target shifts.
    const distance = base * zoom * (room && !compact ? 0.78 : 1);
    const k = reducedMotion ? 1 : Math.min(1, delta * 3.2);
    ctl.target.lerp(goal, k);
    dir.subVectors(camera.position, ctl.target);
    const current = dir.length();
    const next = current + (distance - current) * k;
    camera.position.copy(ctl.target).add(dir.normalize().multiplyScalar(next));
    ctl.update();
    if (ctl.target.distanceTo(goal) > 0.005 || Math.abs(next - distance) > 0.01) invalidate();
  });
  return null;
}

// Gentle sway and pointer parallax on the whole house.
function Parallax({ children, reducedMotion }: { children: React.ReactNode; reducedMotion: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock, pointer }) => {
    const group = ref.current;
    if (!group || reducedMotion) return;
    const t = clock.elapsedTime;
    const goal = Math.sin(t * 0.18) * 0.035 + pointer.x * 0.05;
    group.rotation.y += (goal - group.rotation.y) * 0.04;
  });
  return <group ref={ref}>{children}</group>;
}

function Scene({ selected, hovered, onHover, onSelect, compact, reducedMotion, zoom, showMarkers }: SceneProps) {
  const resources = useSceneResources();
  const controls = useRef<OrbitControlsImpl>(null);
  const size = useThree((s) => s.size);
  const clock = useThree((s) => s.clock);
  const [start] = useState(() => clock.elapsedTime);
  const shadows = !compact;
  const aspect = size.width / Math.max(1, size.height);
  const base = compact ? 17.5 * Math.max(1, 1.0 / aspect) : 24.5 * Math.max(1, 1.3 / aspect);
  const W = HOUSE_SIZE.w;
  const D = HOUSE_SIZE.d;

  const plinthEdge: Box[] = useMemo(
    () => [
      { p: [CX, 0.002, -0.9], s: [W + 1.8, 0.012, 0.02] },
      { p: [CX, 0.002, D + 2.1], s: [W + 1.8, 0.012, 0.02] },
      { p: [-0.9, 0.002, CZ + 0.6], s: [0.02, 0.012, D + 3.0] },
      { p: [W + 0.9, 0.002, CZ + 0.6], s: [0.02, 0.012, D + 3.0] },
    ],
    [W, D],
  );
  const outdoor = useMemo(
    () => ({
      deck: [{ p: [2.8, 0.03, D + 1.0], s: [5.6, 0.06, 2.0] }] as Box[],
      water: [{ p: [7.9, 0.02, D + 1.05], s: [3.6, 0.04, 1.5] }] as Box[],
      coping: [
        { p: [7.9, 0.05, D + 0.25], s: [3.8, 0.06, 0.1] },
        { p: [7.9, 0.05, D + 1.85], s: [3.8, 0.06, 0.1] },
        { p: [6.05, 0.05, D + 1.05], s: [0.1, 0.06, 1.7] },
        { p: [9.75, 0.05, D + 1.05], s: [0.1, 0.06, 1.7] },
      ] as Box[],
    }),
    [D],
  );

  return (
    <>
      <hemisphereLight args={["#5d7fb8", "#05080f", 0.9]} />
      <ambientLight intensity={0.18} color="#9fb8ff" />
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate={!compact}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        minPolarAngle={0.72}
        maxPolarAngle={1.12}
        minAzimuthAngle={0.15}
        maxAzimuthAngle={1.1}
      />
      <CameraRig selected={selected} zoom={zoom} reducedMotion={reducedMotion} controls={controls} base={base} compact={compact} />
      <Parallax reducedMotion={reducedMotion}>
        <group position={[-CX, 0, -CZ]}>
          <directionalLight
            position={[16, 18, 12]}
            intensity={1.1}
            color="#c4d8ff"
            castShadow={shadows}
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0004}
            shadow-camera-left={-9}
            shadow-camera-right={9}
            shadow-camera-top={9}
            shadow-camera-bottom={-9}
            shadow-camera-near={1}
            shadow-camera-far={60}
            target-position={[CX, 0, CZ]}
          />
          <pointLight position={[HUB[0], 0.6, HUB[1]]} color="#38d6f5" intensity={3} distance={4} decay={2} />

          {/* Base, terrace and pool */}
          <mesh position={[CX, -0.2, CZ + 0.6]} scale={[W + 1.8, 0.4, D + 3.0]} geometry={resources.box} material={resources.plinth} receiveShadow raycast={() => null} />
          <Boxes boxes={plinthEdge} material={resources.edge} geometry={resources.box} />
          <Boxes boxes={outdoor.deck} material={resources.deck} geometry={resources.box} receiveShadow />
          <Boxes boxes={outdoor.water} material={resources.water} geometry={resources.box} />
          <Boxes boxes={outdoor.coping} material={resources.wall} geometry={resources.box} />

          {DEMO_ROOMS.map((room) => (
            <Room key={room.id} room={room} resources={resources} onHover={onHover} onSelect={onSelect} state={room.id === selected ? "selected" : room.id === hovered ? "hover" : "idle"} />
          ))}

          <Boxes boxes={EXTERIOR} material={resources.wall} geometry={resources.box} castShadow={shadows} receiveShadow />
          <Boxes boxes={INTERIOR} material={resources.wall} geometry={resources.box} castShadow={shadows} receiveShadow />
          <Boxes boxes={ROOF} material={resources.roof} geometry={resources.box} castShadow={shadows} />
          <Boxes boxes={LED_STRIPS} material={resources.led} geometry={resources.box} />
          <Boxes boxes={FACADE.frame} material={resources.frame} geometry={resources.box} />
          <Boxes boxes={[...FACADE.glass, ...WINDOWS]} material={resources.glass} geometry={resources.box} />
          <Furniture resources={resources} shadows={shadows} />

          <RoomLights selected={selected} compact={compact} reducedMotion={reducedMotion} start={start} />
          <RoomRings selected={selected} hovered={hovered} resources={resources} reducedMotion={reducedMotion} start={start} />
          <EnergyFlow resources={resources} reducedMotion={reducedMotion} selected={selected} start={start} compact={compact} />

          {showMarkers &&
            DEMO_ROOMS.map((room, index) => {
              const [cx, cz] = roomCenter(room);
              return (
                <Html key={room.id} position={[cx, 1.75, cz]} center zIndexRange={[30, 10]}>
                  <button
                    type="button"
                    className="l-marker"
                    style={{ animationDelay: reducedMotion ? "0ms" : `${1700 + index * 90}ms` }}
                    data-active={room.id === selected}
                    aria-pressed={room.id === selected}
                    // The markers live inside the canvas wrapper: keep their
                    // clicks from reaching the scene's "clicked nothing" handler.
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(room.id === selected ? null : room.id);
                    }}
                    onMouseEnter={() => onHover(room.id)}
                    onMouseLeave={() => onHover(null)}
                  >
                    <span className="l-marker-dot" aria-hidden="true" />
                    {room.label}
                  </button>
                </Html>
              );
            })}
        </group>
      </Parallax>
    </>
  );
}

export interface HeroHouse3DProps extends Omit<SceneProps, "compact"> {
  compact: boolean;
  active: boolean;
  onReady?: () => void;
}

export default function HeroHouse3D({ active, onReady, ...props }: HeroHouse3DProps) {
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, props.compact ? 1.5 : 1.75));
  const frameloop = !active ? "never" : props.reducedMotion ? "demand" : "always";
  return (
    <Canvas
      className="!touch-pan-y"
      frameloop={frameloop}
      dpr={dpr}
      shadows={!props.compact ? "soft" : false}
      gl={{ antialias: !props.compact, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 30, near: 0.5, far: 120, position: [12.5, 12.5, 15] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        onReady?.();
      }}
      onPointerMissed={() => props.onSelect(null)}
      aria-hidden="true"
    >
      <PerformanceMonitor onDecline={() => setDpr((value) => Math.max(1, value - 0.25))} />
      <Scene {...props} />
    </Canvas>
  );
}
