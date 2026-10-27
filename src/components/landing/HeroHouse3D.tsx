import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls, PerformanceMonitor } from "@react-three/drei";
import { RoundedBoxGeometry, type OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  type Group,
  type InstancedMesh,
  type Material,
  Matrix4,
  AdditiveBlending,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type PerspectiveCamera,
  type PointLight,
  RingGeometry,
  Shape,
  SphereGeometry,
  type Texture,
  Vector3,
} from "three";
import { furnitureFor, type FurnitureFinish, type FurniturePiece } from "@/components/floorplan/three/furniture";
import { DEMO_ROOMS, HOUSE_SIZE, type DemoRoom, type DemoRoomId } from "./content";
import {
  ACCENT_STRIPS,
  BOLLARDS,
  type Box,
  COPING,
  COVES,
  CX,
  CZ,
  DECK,
  EXTERIOR,
  FASCIA,
  FRAMES,
  FT,
  GLASS,
  H,
  HUB,
  INTERIOR,
  LAWN,
  outline,
  PLINTH,
  PLINTH_EDGE,
  pointOnPath,
  ROOF_OUTLINE,
  ROOF_THICKNESS,
  roomCenter,
  SCONCES,
  SKIRTING,
  SOFFIT_LIGHTS,
  TRACES,
  traceBoxes,
  TREES,
  WALL_CAPS,
  WATER,
} from "./house/layout";
import { haloTexture, TILE_METRES, tileTexture, WOOD_TILE_METRES, woodTexture } from "./house/textures";

/**
 * Hero house for the public landing. A demonstration model, not a property:
 * it never reads user data. Furniture comes from the Living Energy generator;
 * architecture, materials and the energy language are specific to the hero.
 *
 * Colours: warm amber inside the rooms, emerald for everything "energy".
 */

const EMERALD = "#45e0a4";
const AMBER = "#ffc58a";

const FINISH: Record<FurnitureFinish, { color: string; roughness: number; metalness?: number; opacity?: number }> = {
  fabric: { color: "#5b6d63", roughness: 0.95 },
  wood: { color: "#7a5236", roughness: 0.62 },
  white: { color: "#ebe7de", roughness: 0.42 },
  dark: { color: "#1f2925", roughness: 0.4 },
  metal: { color: "#b8b2a4", roughness: 0.25, metalness: 0.75 },
  glass: { color: "#bfe9d6", roughness: 0.05, opacity: 0.3 },
  accent: { color: "#3e5248", roughness: 1 },
  plant: { color: "#3d7a52", roughness: 0.85 },
};

const disposeAll = (items: Array<{ dispose: () => void }>) => items.forEach((item) => item.dispose());

const useSceneResources = () => {
  const resources = useMemo(() => {
    const standard = (color: string, roughness: number, extra: Partial<MeshStandardMaterial> = {}) =>
      Object.assign(new MeshStandardMaterial({ color, roughness }), extra);
    const basic = (color: string, opacity = 1) =>
      new MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
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
    const wood = woodTexture();
    const deckMap = wood.clone();
    deckMap.needsUpdate = true;
    deckMap.repeat.set(5.8 / WOOD_TILE_METRES, 2.2 / WOOD_TILE_METRES);
    const textures = { wood, deck: deckMap, tile: tileTexture(), halo: haloTexture(), lightPool: haloTexture("amber") };
    const roofShape = new Shape();
    ROOF_OUTLINE.forEach(([x, z], index) => {
      if (index === 0) roofShape.moveTo(x, z);
      else roofShape.lineTo(x, z);
    });
    roofShape.closePath();
    const roof = new ExtrudeGeometry(roofShape, { depth: ROOF_THICKNESS, bevelEnabled: false });
    roof.rotateX(Math.PI / 2).translate(0, H + ROOF_THICKNESS, 0);
    const geometries = {
      box: new BoxGeometry(1, 1, 1),
      roof,
      // Softened edges so furniture reads as objects, not blocks.
      rounded: new RoundedBoxGeometry(1, 1, 1, 2, 0.08),
      cylinder: new CylinderGeometry(0.5, 0.5, 1, 20),
      sphere: new SphereGeometry(0.5, 20, 14),
      ring: new RingGeometry(0.36, 0.4, 56),
      dot: new SphereGeometry(0.06, 12, 10),
      plane: new PlaneGeometry(1, 1),
    };
    const materials = {
      wall: standard("#e3ddd1", 0.94),
      skirting: standard("#4a3424", 0.6),
      cap: standard("#39433e", 0.7),
      plinth: standard("#0d1d17", 0.9),
      lawn: standard("#1d3b2c", 1),
      deck: standard("#8f7a68", 0.78, { map: deckMap }),
      stone: standard("#bcb6aa", 0.85),
      frame: standard("#4a524c", 0.3, { metalness: 0.75 }),
      roof: standard("#6c706a", 0.88),
      trunk: standard("#3b2c20", 0.9),
      canopy: standard("#2c6145", 0.85),
      glass: new MeshStandardMaterial({ color: "#e2f4ec", roughness: 0.02, metalness: 0.65, transparent: true, opacity: 0.13, depthWrite: false, side: DoubleSide }),
      water: standard("#145a50", 0.04, { emissive: new Color("#2aa587"), emissiveIntensity: 0.3, metalness: 0.45 }),
      warm: basic(AMBER),
      soffit: basic("#ffe2bd"),
      emerald: basic(EMERALD),
      edge: basic(EMERALD, 0.35),
      trace: basic(EMERALD, 0),
      pulse: basic("#d9ffef", 0),
      halo: new MeshBasicMaterial({ map: textures.halo, transparent: true, depthWrite: false, toneMapped: false }),
      lightPool: new MeshBasicMaterial({ map: textures.lightPool, transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending }),
    };
    return { geometries, materials, furniture, textures };
  }, []);
  useEffect(
    () => () => {
      disposeAll(Object.values(resources.geometries));
      disposeAll(Object.values(resources.materials));
      disposeAll(Object.values(resources.furniture));
      disposeAll(Object.values(resources.textures));
    },
    [resources],
  );
  return resources;
};
type Resources = ReturnType<typeof useSceneResources>;

// Static boxes of one material as a single instanced draw call.
function Boxes({ boxes, material, geometry, castShadow = false, receiveShadow = false }: { boxes: Box[]; material: Material; geometry: BufferGeometry; castShadow?: boolean; receiveShadow?: boolean }) {
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
  const { geometries } = resources;
  return (
    <>
      {buckets.map(([key, bucket]) => (
        <Boxes
          key={key}
          boxes={bucket.boxes}
          material={resources.furniture[bucket.finish]}
          geometry={bucket.shape === "cylinder" ? geometries.cylinder : bucket.finish === "glass" ? geometries.box : geometries.rounded}
          castShadow={shadows && bucket.finish !== "glass"}
          receiveShadow={shadows}
        />
      ))}
    </>
  );
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);
type RoomState = "idle" | "hover" | "selected" | "dimmed";

interface SceneProps {
  selected: DemoRoomId | null;
  hovered: DemoRoomId | null;
  onHover: (id: DemoRoomId | null) => void;
  onSelect: (id: DemoRoomId | null) => void;
  compact: boolean;
  reducedMotion: boolean;
  zoom: number;
  showMarkers: boolean;
  // Fraction of the canvas width to push the house to the right.
  shift: number;
  // Shadow work deferred until after the first frame (see HeroHouse3D).
  shadowsReady: boolean;
}

// One room: textured floor, an emerald outline that fades in on hover and
// selection, and the pointer handlers that drive the whole interaction.
function Room({ room, state, resources, onHover, onSelect }: { room: DemoRoom; state: RoomState; resources: Resources; onHover: SceneProps["onHover"]; onSelect: SceneProps["onSelect"] }) {
  const { floor, edge } = useMemo(() => {
    const source: Texture = room.floor === "wood" ? resources.textures.wood : resources.textures.tile;
    const metres = room.floor === "wood" ? WOOD_TILE_METRES : TILE_METRES;
    const map = source.clone();
    map.needsUpdate = true;
    map.repeat.set(room.w / metres, room.d / metres);
    return {
      floor: new MeshStandardMaterial({ map, roughness: room.floor === "tile" ? 0.32 : 0.55, emissive: new Color(EMERALD), emissiveIntensity: 0 }),
      edge: new MeshBasicMaterial({ color: EMERALD, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
    };
  }, [room, resources.textures]);
  useEffect(() => () => {
    floor.map?.dispose();
    floor.dispose();
    edge.dispose();
  }, [floor, edge]);
  const lines = useMemo(() => outline(room, FT + 0.008), [room]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [state, invalidate]);

  useFrame((_, delta) => {
    const glow = state === "selected" ? 0.07 : state === "hover" ? 0.035 : 0;
    const line = state === "selected" ? 0.95 : state === "hover" ? 0.6 : 0;
    const k = Math.min(1, delta * 8);
    floor.emissiveIntensity += (glow - floor.emissiveIntensity) * k;
    edge.opacity += (line - edge.opacity) * k;
    if (Math.abs(line - edge.opacity) > 0.005) invalidate();
  });

  const [cx, cz] = roomCenter(room);
  return (
    <>
      <mesh
        position={[cx, FT / 2, cz]}
        scale={[room.w, FT, room.d]}
        geometry={resources.geometries.box}
        material={floor}
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
      <Boxes boxes={lines} material={edge} geometry={resources.geometries.box} />
    </>
  );
}

// Pulsing rings at each room centre: brighter on the room in focus.
function RoomRings({ selected, hovered, resources, reducedMotion, start }: { selected: DemoRoomId | null; hovered: DemoRoomId | null; resources: Resources; reducedMotion: boolean; start: number }) {
  const refs = useRef<Array<InstancedMesh | null>>([]);
  const materials = useMemo(() => DEMO_ROOMS.map(() => resources.materials.edge.clone()), [resources.materials.edge]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const scratch = useMemo(() => ({ m: new Matrix4(), s: new Vector3() }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const intro = reducedMotion ? 1 : ease((t - start - 1.0) / 0.8);
    DEMO_ROOMS.forEach((room, index) => {
      const mesh = refs.current[index];
      if (!mesh) return;
      const focus = room.id === selected ? 1 : room.id === hovered ? 0.6 : 0;
      const wave = reducedMotion ? 0 : (t * 0.55 + index * 0.2) % 1;
      const scale = 1 + focus * (reducedMotion ? 0.4 : wave * 1.2);
      const [cx, cz] = roomCenter(room);
      scratch.m.makeRotationX(-Math.PI / 2).scale(scratch.s.set(scale, scale, scale)).setPosition(cx, FT + 0.012, cz);
      mesh.setMatrixAt(0, scratch.m);
      mesh.instanceMatrix.needsUpdate = true;
      materials[index].opacity = intro * (focus ? 0.95 * (1 - (reducedMotion ? 0 : wave) * 0.85) : 0.3);
    });
  });
  return (
    <>
      {DEMO_ROOMS.map((room, index) => (
        <instancedMesh key={room.id} ref={(node) => (refs.current[index] = node)} args={[resources.geometries.ring, materials[index], 1]} raycast={() => null} frustumCulled={false} />
      ))}
    </>
  );
}

// Circuit traces from the hub plus pulses travelling along them.
function EnergyFlow({ resources, reducedMotion, selected, start, compact }: { resources: Resources; reducedMotion: boolean; selected: DemoRoomId | null; start: number; compact: boolean }) {
  const traces = useMemo(() => traceBoxes(FT + 0.006), []);
  const perPath = compact ? 1 : 2;
  const pulses = useRef<InstancedMesh>(null);
  const hub = useRef<InstancedMesh>(null);
  const scratch = useMemo(() => ({ v: { x: 0, z: 0 }, m: new Matrix4() }), []);
  const { trace, pulse } = resources.materials;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const intro = reducedMotion ? 1 : ease((t - start - 0.9) / 1.2);
    trace.opacity = 0.38 * intro;
    pulse.opacity = intro;
    const mesh = pulses.current;
    if (mesh) {
      TRACES.forEach((path, p) => {
        const focus = DEMO_ROOMS[p].id === selected;
        for (let k = 0; k < perPath; k++) {
          const phase = reducedMotion ? 0.5 + k * 0.25 : (t * 0.2 * (focus ? 1.7 : 1) + k / perPath + p * 0.17) % 1;
          pointOnPath(path, phase, scratch.v);
          const s = focus ? 1.35 : 0.9;
          scratch.m.makeScale(s, s, s).setPosition(scratch.v.x, FT + 0.06, scratch.v.z);
          mesh.setMatrixAt(p * perPath + k, scratch.m);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (hub.current) {
      const s = 1.7 + (reducedMotion ? 0 : Math.sin(t * 1.8) * 0.2);
      scratch.m.makeScale(s, s, s).setPosition(HUB[0], FT + 0.09, HUB[1]);
      hub.current.setMatrixAt(0, scratch.m);
      hub.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <Boxes boxes={traces} material={trace} geometry={resources.geometries.box} />
      <instancedMesh ref={pulses} args={[resources.geometries.dot, pulse, TRACES.length * perPath]} raycast={() => null} frustumCulled={false} />
      <instancedMesh ref={hub} args={[resources.geometries.dot, resources.materials.emerald, 1]} raycast={() => null} frustumCulled={false} />
    </>
  );
}

// Warm interior lights fade in on load; the selected room brightens and the
// others settle back, so focus reads through light, not only through UI.
function RoomLights({ selected, compact, reducedMotion, start }: { selected: DemoRoomId | null; compact: boolean; reducedMotion: boolean; start: number }) {
  const rooms = compact ? DEMO_ROOMS.filter((room) => room.id !== "bathroom" && room.id !== "office") : DEMO_ROOMS;
  const refs = useRef<Array<PointLight | null>>([]);
  useFrame(({ clock }, delta) => {
    const intro = reducedMotion ? 1 : ease((clock.elapsedTime - start - 0.3) / 1.4);
    rooms.forEach((room, index) => {
      const light = refs.current[index];
      if (!light) return;
      const level = !selected ? 6.5 : room.id === selected ? 13 : 4;
      light.intensity += (level * intro - light.intensity) * Math.min(1, delta * 5);
    });
  });
  return (
    <>
      {rooms.map((room, index) => {
        const [cx, cz] = roomCenter(room);
        return <pointLight key={room.id} ref={(node) => (refs.current[index] = node)} position={[cx, 2.05, cz]} color={AMBER} intensity={0} distance={7} decay={1.5} />;
      })}
    </>
  );
}

// Warm pools of light on each floor, under the room lights.
function LightPools({ resources }: { resources: Resources }) {
  const pools = useMemo<Box[]>(() => DEMO_ROOMS.map((room) => {
    const [cx, cz] = roomCenter(room);
    const r = Math.min(room.w, room.d) * 0.95;
    return { p: [cx, FT + 0.004, cz], s: [r, 1, r] };
  }), []);
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const tilt = new Matrix4().makeRotationX(-Math.PI / 2);
    pools.forEach((pool, i) => mesh.setMatrixAt(i, m.makeScale(pool.s[0], pool.s[2], 1).premultiply(tilt).setPosition(...pool.p)));
    mesh.instanceMatrix.needsUpdate = true;
  }, [pools]);
  return <instancedMesh ref={ref} args={[resources.geometries.plane, resources.materials.lightPool, pools.length]} raycast={() => null} frustumCulled={false} />;
}

function Trees({ resources, shadows }: { resources: Resources; shadows: boolean }) {
  const trunks = useMemo<Box[]>(() => TREES.map((t) => ({ p: [t.x, t.h * 0.3, t.z], s: [0.08, t.h * 0.6, 0.08] })), []);
  const canopies = useMemo<Box[]>(() => TREES.map((t) => ({ p: [t.x, t.h * 0.62 + t.r * 0.5, t.z], s: [t.r * 2, t.r * 2.3, t.r * 2] })), []);
  return (
    <>
      <Boxes boxes={trunks} material={resources.materials.trunk} geometry={resources.geometries.cylinder} castShadow={shadows} />
      <Boxes boxes={canopies} material={resources.materials.canopy} geometry={resources.geometries.sphere} castShadow={shadows} />
    </>
  );
}

// Moves the orbit target and distance toward the selected room.
function CameraRig({ selected, zoom, reducedMotion, controls, base, compact }: { selected: DemoRoomId | null; zoom: number; reducedMotion: boolean; controls: React.RefObject<OrbitControlsImpl>; base: number; compact: boolean }) {
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
      const pull = compact ? 0.4 : 0.92;
      goal.set((x - CX) * pull, 0.5, (z - CZ) * pull);
    } else goal.set(0.2, 0.6, 0.5);
    // Phones keep the whole house in frame; only the target shifts.
    const distance = base * zoom * (room && !compact ? 0.76 : 1);
    const k = reducedMotion ? 1 : Math.min(1, delta * 2.8);
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

// On wide screens the canvas spans the whole hero; shift the projection so
// the house sits in the right-hand 60% without clipping at a hard edge.
function FrameOffset({ shift }: { shift: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    if (shift) camera.setViewOffset(size.width, size.height, -size.width * shift, 0, size.width, size.height);
    else camera.clearViewOffset();
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height, shift]);
  return null;
}

// A small pointer response keeps the house steady when no one interacts.
function Parallax({ children, reducedMotion }: { children: React.ReactNode; reducedMotion: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ pointer }) => {
    const group = ref.current;
    if (!group || reducedMotion) return;
    const goal = pointer.x * 0.015;
    group.rotation.y += (goal - group.rotation.y) * 0.035;
  });
  return <group ref={ref}>{children}</group>;
}

function Scene({ selected, hovered, onHover, onSelect, compact, reducedMotion, zoom, showMarkers, shift, shadowsReady }: SceneProps) {
  const resources = useSceneResources();
  const { geometries: g, materials: m } = resources;
  const controls = useRef<OrbitControlsImpl>(null);
  const size = useThree((s) => s.size);
  const clock = useThree((s) => s.clock);
  const [start] = useState(() => clock.elapsedTime);
  const shadows = !compact;
  const aspect = size.width / Math.max(1, size.height);
  // Fit by the part of the canvas the house actually uses.
  const useful = aspect * (1 - shift * 1.6);
  const base = compact ? 25 * Math.max(1, 1.0 / aspect) : 23 * Math.max(1, 1.25 / useful);
  const roomState = (id: DemoRoomId): RoomState => (id === selected ? "selected" : id === hovered ? "hover" : selected ? "dimmed" : "idle");

  return (
    <>
      <hemisphereLight args={["#7fb89c", "#06120e", 0.6]} />
      <ambientLight intensity={0.12} color="#cfe8dc" />
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate={!compact}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        minPolarAngle={0.72}
        maxPolarAngle={1.1}
        minAzimuthAngle={0.2}
        maxAzimuthAngle={1.05}
      />
      <FrameOffset shift={shift} />
      <CameraRig selected={selected} zoom={zoom} reducedMotion={reducedMotion} controls={controls} base={base} compact={compact} />
      <Parallax reducedMotion={reducedMotion}>
        <group position={[-CX, 0, -CZ]}>
          <directionalLight
            position={[18, 20, 14]}
            intensity={1.25}
            color="#e4efe6"
            castShadow={shadows}
            shadow-mapSize={[1536, 1536]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
            shadow-camera-left={-9}
            shadow-camera-right={9}
            shadow-camera-top={9}
            shadow-camera-bottom={-9}
            shadow-camera-near={1}
            shadow-camera-far={60}
            target-position={[CX, 0, CZ]}
          />
          <pointLight position={[HUB[0], 0.5, HUB[1]]} color={EMERALD} intensity={2.5} distance={3.5} decay={2} />
          {!compact && <pointLight position={[8.0, 0.6, HOUSE_SIZE.d + 1.2]} color="#3fd69c" intensity={2} distance={4} decay={2} />}

          {/* Ground: halo, plinth, garden strip, terrace, pool */}
          <mesh position={[CX, -0.45, CZ + 0.7]} rotation={[-Math.PI / 2, 0, 0]} scale={[34, 30, 1]} geometry={g.plane} material={m.halo} raycast={() => null} />
          <mesh position={PLINTH.p} scale={PLINTH.s} geometry={g.box} material={m.plinth} receiveShadow raycast={() => null} />
          <Boxes boxes={PLINTH_EDGE} material={m.edge} geometry={g.box} />
          <Boxes boxes={LAWN} material={m.lawn} geometry={g.box} receiveShadow />
          <Boxes boxes={DECK} material={m.deck} geometry={g.box} receiveShadow />
          <Boxes boxes={WATER} material={m.water} geometry={g.box} />
          <Boxes boxes={COPING} material={m.stone} geometry={g.box} receiveShadow />
          <Boxes boxes={BOLLARDS} material={m.warm} geometry={g.cylinder} />
          <Trees resources={resources} shadows={shadows} />
          {/* Soft grounding around the house; rendered once, not per frame. */}
          {shadowsReady && <ContactShadows position={[CX, 0.004, CZ + 0.6]} scale={[HOUSE_SIZE.w + 3, HOUSE_SIZE.d + 4]} far={2.5} blur={2.6} opacity={0.55} resolution={512} frames={1} color="#020806" />}

          {DEMO_ROOMS.map((room) => (
            <Room key={room.id} room={room} resources={resources} onHover={onHover} onSelect={onSelect} state={roomState(room.id)} />
          ))}

          <Boxes boxes={EXTERIOR} material={m.wall} geometry={g.box} castShadow={shadows} receiveShadow />
          <Boxes boxes={INTERIOR} material={m.wall} geometry={g.box} castShadow={shadows} receiveShadow />
          <Boxes boxes={WALL_CAPS} material={m.cap} geometry={g.box} />
          <Boxes boxes={SKIRTING} material={m.skirting} geometry={g.box} />
          <Boxes boxes={FASCIA} material={m.warm} geometry={g.box} />
          <LightPools resources={resources} />
          <mesh geometry={g.roof} material={m.roof} castShadow={shadows} receiveShadow raycast={() => null} />
          <Boxes boxes={SOFFIT_LIGHTS} material={m.soffit} geometry={g.box} />
          <Boxes boxes={COVES} material={m.warm} geometry={g.box} />
          <Boxes boxes={SCONCES} material={m.warm} geometry={g.box} />
          <Boxes boxes={ACCENT_STRIPS} material={m.warm} geometry={g.box} />
          <Boxes boxes={FRAMES} material={m.frame} geometry={g.box} />
          <Boxes boxes={GLASS} material={m.glass} geometry={g.box} />
          <Furniture resources={resources} shadows={shadows} />

          <RoomLights selected={selected} compact={compact} reducedMotion={reducedMotion} start={start} />
          <RoomRings selected={selected} hovered={hovered} resources={resources} reducedMotion={reducedMotion} start={start} />
          <EnergyFlow resources={resources} reducedMotion={reducedMotion} selected={selected} start={start} compact={compact} />

          {showMarkers &&
            DEMO_ROOMS.map((room, index) => {
              const [cx, cz] = roomCenter(room);
              return (
                <Html key={room.id} position={[cx, H * 0.68, cz]} center zIndexRange={[30, 10]}>
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
                    onFocus={() => onHover(room.id)}
                    onBlur={() => onHover(null)}
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

// The first frame skips the shadow pass; shadows join on the next idle
// moment, while the canvas is still fading in over the poster. This splits
// one long frame into two shorter tasks.
function ShadowsLater({ ready }: { ready: boolean }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = ready;
    if (ready) {
      gl.shadowMap.needsUpdate = true;
      performance.mark?.("hero-3d-shadows");
      invalidate();
    }
  }, [gl, ready, invalidate]);
  return null;
}

export interface HeroHouse3DProps extends Omit<SceneProps, "shadowsReady"> {
  active: boolean;
  onReady?: () => void;
  // The GPU dropped the context (driver reset, memory pressure): the page
  // falls back to the illustration and offers a retry.
  onLost?: () => void;
}

// Compiles every shader before the first frame. With compileAsync the
// browser can link programs in parallel (KHR_parallel_shader_compile), so
// the page stays responsive instead of freezing on the first render. The
// canvas does not draw until this resolves; the poster covers the wait.
function Warmup({ onWarm }: { onWarm: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let alive = true;
    const done = () => {
      if (!alive) return;
      onWarm();
      invalidate();
    };
    gl.compileAsync(scene, camera).then(done, done);
    return () => {
      alive = false;
    };
    // Once per mounted scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Marks the first drawn frame, for performance measurements.
function FirstFrame() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    performance.mark?.("hero-3d-first-frame");
  });
  return null;
}

export default function HeroHouse3D({ active, onReady, onLost, ...props }: HeroHouse3DProps) {
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, props.compact ? 1.5 : 1.75));
  const [warm, setWarm] = useState(false);
  const [shadowsReady, setShadowsReady] = useState(false);
  const [contactReady, setContactReady] = useState(false);
  useEffect(() => {
    if (!warm) return;
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => setShadowsReady(true), { timeout: 1200 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = globalThis.setTimeout(() => setShadowsReady(true), 300);
    return () => globalThis.clearTimeout(handle);
  }, [warm]);
  // Contact shadows compile their own shaders: a separate, later idle slot.
  useEffect(() => {
    if (!shadowsReady) return;
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => setContactReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = globalThis.setTimeout(() => setContactReady(true), 400);
    return () => globalThis.clearTimeout(handle);
  }, [shadowsReady]);
  const frameloop = !active || !warm ? "never" : props.reducedMotion ? "demand" : "always";
  return (
    <Canvas
      className="!touch-pan-y"
      frameloop={frameloop}
      dpr={dpr}
      shadows={!props.compact ? "soft" : false}
      gl={{ antialias: !props.compact, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 30, near: 0.5, far: 140, position: [13, 12.5, 15] }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMappingExposure = 1.05;
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onLost?.();
        }, { once: true });
      }}
      onPointerMissed={() => props.onSelect(null)}
      aria-hidden="true"
    >
      <PerformanceMonitor onDecline={() => setDpr((value) => Math.max(1, value - 0.25))} />
      <Scene {...props} shadowsReady={contactReady} />
      <ShadowsLater ready={shadowsReady} />
      <FirstFrame />
      <Warmup
        onWarm={() => {
          setWarm(true);
          onReady?.();
        }}
      />
    </Canvas>
  );
}
