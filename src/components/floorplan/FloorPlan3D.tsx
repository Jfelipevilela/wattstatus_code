import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Edges, Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BoxGeometry, CylinderGeometry, Matrix4, Vector3, type InstancedMesh, type OrthographicCamera } from "three";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Appliance } from "@/hooks/useAppliances";
import { formatCurrency, formatNumber } from "@/lib/energy";
import type { EnergyBucket } from "@/lib/property-energy";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { cn } from "@/lib/utils";
import type { Room } from "@/types/property";
import { heatColor, heatScale, metricValue } from "./heat";
import { PLAN_TOKENS } from "./tokens";
import type { FloorPlanProps } from "./FloorPlan2D";
import { buildWalls, wallBox, WALL_HEIGHTS, WALL_THICKNESS, type WallKind } from "./three/walls";
import { furnitureFor, type FurniturePiece } from "./three/furniture";
import { planDoors } from "./three/doors";
import { placeAppliances } from "./three/applianceModels";
import { easeInOutCubic, groupUnits, planTransition, TIMING, unitAt, type RoomPhase } from "./three/assembly";
import {
  disposeMaterials,
  FLOOR_FINISH,
  floorMaterial,
  furnitureMaterial,
  heatFloorMaterial,
  plateMaterial,
  wallCapMaterial,
  wallMaterial,
} from "./three/materials";

// Shared unit geometries, scaled per mesh; created once per mounted scene.
const useUnitGeometries = () => {
  const geometries = useMemo(() => ({ box: new BoxGeometry(1, 1, 1), cylinder: new CylinderGeometry(0.5, 0.5, 1, 20) }), []);
  useEffect(
    () => () => {
      geometries.box.dispose();
      geometries.cylinder.dispose();
      disposeMaterials();
    },
    [geometries],
  );
  return geometries;
};

const noRaycast = () => null;
const FLOOR_THICKNESS = 0.06;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
// Phones get slightly quicker transitions.
const motionSpeed = () => (typeof window !== "undefined" && window.innerWidth < 640 ? 1.25 : 1);

const useIsDark = () => {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
};

const useCompact = () => {
  const [compact, setCompact] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const update = () => setCompact(window.innerWidth < 640);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return compact;
};

// Projected size of the plan on screen, for an isometric-ish camera.
const fitZoom = (spanX: number, spanZ: number, width: number, height: number) =>
  Math.max(6, Math.min(width / ((spanX + spanZ) * 0.72 + 2), height / ((spanX + spanZ) * 0.42 + 2.6)));

// Time-based camera move: target and zoom travel together with ease-in-out,
// in a fixed duration, independent of frame rate.
function CameraRig({
  center,
  span,
  focus,
  resetToken,
}: {
  center: Vector3;
  span: { x: number; z: number };
  focus: { center: Vector3; span: { x: number; z: number } } | null;
  resetToken: number;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const tween = useRef<{ from: Vector3; to: Vector3; fromZoom: number; toZoom: number; start: number; duration: number } | null>(null);
  const initialized = useRef(false);
  // Moves the orbit target and the camera together, so the viewing angle
  // stays the same while the view pans to a room.
  const moveTarget = useCallback(
    (target: Vector3) => {
      if (!controls) return;
      const delta = target.clone().sub(controls.target);
      controls.target.add(delta);
      camera.position.add(delta);
    },
    [controls, camera],
  );
  const overview = fitZoom(span.x, span.z, size.width, size.height);

  useEffect(() => {
    if (!controls) return;
    controls.minZoom = overview * 0.6;
    controls.maxZoom = overview * 5;
  }, [controls, overview]);

  useEffect(() => {
    if (!controls) return;
    const ortho = camera as OrthographicCamera;
    const next = focus
      ? {
          target: focus.center.clone(),
          zoom: Math.max(overview, Math.min(overview * 1.9, fitZoom(focus.span.x, focus.span.z, size.width, size.height) * 0.55)),
        }
      : { target: center.clone(), zoom: overview };
    if (resetToken > 0 && !focus) camera.position.copy(controls.target).add(new Vector3(30, 36, 30));
    if (prefersReducedMotion() || !initialized.current) {
      initialized.current = true;
      tween.current = null;
      moveTarget(next.target);
      ortho.zoom = next.zoom;
      camera.updateProjectionMatrix();
      controls.update();
      invalidate();
      return;
    }
    // A new request redirects from wherever the camera is right now.
    tween.current = {
      from: controls.target.clone(),
      to: next.target,
      fromZoom: ortho.zoom,
      toZoom: next.zoom,
      start: performance.now(),
      duration: TIMING.camera / motionSpeed(),
    };
    invalidate();
  }, [controls, focus, center, overview, size.width, size.height, camera, invalidate, resetToken, moveTarget]);

  useFrame(() => {
    const move = tween.current;
    if (!controls || !move) return;
    const ortho = camera as OrthographicCamera;
    const t = Math.min(1, (performance.now() - move.start) / move.duration);
    const k = easeInOutCubic(t);
    moveTarget(move.from.clone().lerp(move.to, k));
    ortho.zoom = move.fromZoom + (move.toZoom - move.fromZoom) * k;
    ortho.updateProjectionMatrix();
    controls.update();
    if (t >= 1) tween.current = null;
    else invalidate();
  });
  return null;
}

// One room's furniture, drawn as one instanced mesh per shape and finish
// (a handful of draw calls instead of one per piece). Each unit (a whole sofa,
// bed or car) still animates on its own: useFrame rewrites the instance
// matrices of its pieces, with no React renders per frame, and frames are
// requested only while something moves.
const restMatrix = new Matrix4();
const writeUnits = (
  buckets: Array<{ pieces: Array<{ piece: FurniturePiece; unit: number }> }>,
  meshes: Array<InstancedMesh | null>,
  offset: (unit: number) => number,
  visible: (unit: number) => boolean,
) => {
  buckets.forEach((bucket, index) => {
    const mesh = meshes[index];
    if (!mesh) return;
    bucket.pieces.forEach(({ piece, unit }, at) => {
      const [sx, sy, sz] = visible(unit) ? piece.size : [0, 0, 0];
      restMatrix.makeScale(sx, sy, sz).setPosition(piece.x, piece.y + offset(unit), piece.z);
      mesh.setMatrixAt(at, restMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
};

function AnimatedFurniture({
  pieces,
  origin,
  dimmed,
  geometries,
  phase,
  offsets,
  onSettled,
}: {
  pieces: FurniturePiece[];
  origin: [number, number];
  dimmed: boolean;
  geometries: ReturnType<typeof useUnitGeometries>;
  phase: RoomPhase | null;
  offsets: { current: number[] };
  onSettled: (phase: RoomPhase) => void;
}) {
  const units = useMemo(() => groupUnits(pieces), [pieces]);
  const buckets = useMemo(() => {
    const byKind = new Map<string, { shape: FurniturePiece["shape"]; finish: FurniturePiece["finish"]; pieces: Array<{ piece: FurniturePiece; unit: number }> }>();
    units.forEach((unit, index) => unit.pieces.forEach((piece) => {
      const key = `${piece.shape}|${piece.finish}`;
      let bucket = byKind.get(key);
      if (!bucket) { bucket = { shape: piece.shape, finish: piece.finish, pieces: [] }; byKind.set(key, bucket); }
      bucket.pieces.push({ piece, unit: index });
    }));
    return [...byKind.entries()].map(([key, bucket]) => ({ key, ...bucket }));
  }, [units]);
  const meshes = useRef<Array<InstancedMesh | null>>([]);
  // Last pose of each unit, reapplied when React hands over a new mesh.
  const pose = useRef<{ offset: number[]; visible: boolean[] }>({ offset: [], visible: [] });
  const invalidate = useThree((state) => state.invalidate);
  const settled = useRef<RoomPhase | null>(null);
  const speed = useMemo(motionSpeed, []);

  useEffect(() => {
    settled.current = null;
    if (!phase) {
      // Safety: no phase means everything rests in place.
      pose.current = { offset: [], visible: [] };
      writeUnits(buckets, meshes.current, () => 0, () => true);
      offsets.current = units.map(() => 0);
    }
    invalidate();
  }, [phase, units, buckets, offsets, invalidate]);

  useFrame(() => {
    if (!phase || settled.current === phase) return;
    const now = performance.now();
    const states = units.map((_, index) => unitAt(phase, index, now, speed));
    pose.current = { offset: states.map((state) => state.offset), visible: states.map((state) => state.visible) };
    writeUnits(buckets, meshes.current, (unit) => states[unit].offset, (unit) => states[unit].visible);
    offsets.current = states.map((state) => state.offset);
    if (states.every((state) => state.done)) {
      settled.current = phase;
      onSettled(phase);
    } else invalidate();
  });

  return (
    <group position={[origin[0], FLOOR_THICKNESS, origin[1]]}>
      {buckets.map((bucket, index) => (
        <instancedMesh
          key={`${bucket.key}:${bucket.pieces.length}`}
          ref={(node) => {
            meshes.current[index] = node;
            // A fresh mesh starts with identity matrices: apply the last pose.
            if (node) writeUnits([bucket], [node], (unit) => pose.current.offset[unit] ?? 0, (unit) => pose.current.visible[unit] ?? true);
          }}
          args={[bucket.shape === "cylinder" ? geometries.cylinder : geometries.box, furnitureMaterial(bucket.finish, dimmed), bucket.pieces.length]}
          material={furnitureMaterial(bucket.finish, dimmed)}
          raycast={noRaycast}
          // Instances span the whole room; the room is always near the view.
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

function ApplianceBadge({
  appliance,
  position,
  selected,
  onSelect,
}: {
  appliance: Appliance;
  position: [number, number, number];
  selected: boolean;
  onSelect: () => void;
}) {
  const { icon: Icon } = applianceVisual(appliance.name);
  return (
    <Html position={position} center zIndexRange={[20, 10]}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        aria-label={`Aparelho ${appliance.name}`}
        className={cn(
          "group relative flex h-7 w-7 items-center justify-center rounded-full border bg-white text-zinc-700 shadow-md transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light",
          selected ? "border-energy-green-light ring-2 ring-energy-green-light" : "border-white",
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="pointer-events-none absolute bottom-full mb-1.5 hidden whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block group-focus-visible:block">
          {appliance.name}
          {appliance.integrationProvider ? " · com medidor" : " · estimado"}
        </span>
      </button>
    </Html>
  );
}

interface RoomInfo {
  // Level 1: always visible, short.
  value: string | null;
  // Level 2: hover preview.
  estimatedKWh: number;
  estimatedCost: number;
  applianceCount: number;
  measurement: string;
}

const roomInfo = (bucket: EnergyBucket | undefined, appliances: Appliance[], heat: FloorPlanProps["heat"], heatValue: number | null): RoomInfo => {
  const metered = appliances.filter((item) => item.integrationProvider).length;
  const measured = bucket && bucket.measuredIntervals > 0;
  const partial = measured && metered < appliances.length;
  const measurement = measured
    ? `medido ${formatNumber(bucket!.measuredKWh, 1)} kWh${partial ? " (parcial)" : ""}`
    : metered > 0
      ? "sem leitura no mês"
      : "sem medidor";
  const value = heat
    ? heatValue === null
      ? heat === "measured"
        ? "sem medição"
        : "sem aparelhos"
      : `${formatNumber(heatValue, 1)} kWh${heat === "measured" && partial ? " · parcial" : ""}`
    : bucket && bucket.applianceCount > 0
      ? `${formatNumber(bucket.estimatedKWh, 0)} kWh est.`
      : null;
  return {
    value,
    estimatedKWh: bucket?.estimatedKWh ?? 0,
    estimatedCost: bucket?.estimatedCost ?? 0,
    applianceCount: bucket?.applianceCount ?? 0,
    measurement,
  };
};

function RoomModel({
  room,
  geometries,
  energyMode,
  heatFill,
  info,
  compact,
  selected,
  dimmed,
  appliances,
  highlightedApplianceId,
  phase,
  offsets,
  onSettled,
  onSelect,
  onSelectAppliance,
}: {
  room: Room;
  geometries: ReturnType<typeof useUnitGeometries>;
  energyMode: boolean;
  heatFill: string | null;
  info: RoomInfo;
  compact: boolean;
  selected: boolean;
  dimmed: boolean;
  appliances: Appliance[];
  highlightedApplianceId: string | null;
  phase: RoomPhase | null;
  offsets: { current: number[] };
  onSettled: (phase: RoomPhase) => void;
  onSelect: () => void;
  onSelectAppliance?: (appliance: Appliance) => void;
}) {
  const { x, y, width, depth } = room.layout!;
  const [hover, setHover] = useState(false);
  const decor = useMemo(() => furnitureFor(room.type, width, depth), [room.type, width, depth]);
  // Every registered appliance gets its own model, or uses the matching
  // decorative object (TV, fridge, A/C...) when the room already has one.
  const applianceKey = appliances.map((item) => `${item.id}:${item.name}`).join("|");
  const placedAppliances = useMemo(
    () => placeAppliances(appliances, decor, width, depth),
    // applianceKey captures the appliance list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applianceKey, decor, width, depth],
  );
  const pieces = useMemo(() => [...decor, ...placedAppliances.flatMap((item) => item.pieces)], [decor, placedAppliances]);
  const state = selected ? "selected" : dimmed ? "dimmed" : "normal";
  const floor = energyMode
    ? heatFloorMaterial(heatFill ?? PLAN_TOKENS.noData, state)
    : floorMaterial(FLOOR_FINISH[room.type] ?? "wood", state);

  // Badges sit on the appliance's model (or the decoration standing in for
  // it); appliances that did not fit keep a badge in a row at the front.
  const badges = useMemo(() => {
    const loose: Appliance[] = [];
    const placed: Array<{ appliance: Appliance; position: [number, number, number] }> = [];
    for (const appliance of appliances) {
      const where = placedAppliances.find((item) => item.applianceId === appliance.id);
      const piece = where?.decorAnchor ? decor.find((item) => item.anchor === where.decorAnchor) : undefined;
      if (piece) {
        placed.push({ appliance, position: [x + piece.x, FLOOR_THICKNESS + piece.y + piece.size[1] / 2 + 0.3, y + piece.z] });
      } else if (where?.badge) {
        placed.push({ appliance, position: [x + where.badge[0], FLOOR_THICKNESS + where.badge[1], y + where.badge[2]] });
      } else loose.push(appliance);
    }
    const gap = 0.75;
    loose.forEach((appliance, index) => {
      const offset = (index - (loose.length - 1) / 2) * gap;
      placed.push({ appliance, position: [x + width / 2 + offset, 0.45, y + depth - 0.55] });
    });
    return placed;
  }, [appliances, placedAppliances, decor, x, y, width, depth]);

  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };

  return (
    <group>
      <mesh
        position={[x + width / 2, FLOOR_THICKNESS / 2, y + depth / 2]}
        scale={[width - 0.02, FLOOR_THICKNESS, depth - 0.02]}
        geometry={geometries.box}
        material={floor}
        onClick={click}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        {(selected || hover) && <Edges color={selected ? PLAN_TOKENS.selection : PLAN_TOKENS.hover} lineWidth={selected ? 2 : 1} />}
      </mesh>
      {!energyMode && (
        <AnimatedFurniture
          pieces={pieces}
          origin={[x, y]}
          dimmed={dimmed}
          geometries={geometries}
          phase={phase}
          offsets={offsets}
          onSettled={onSettled}
        />
      )}
      {/* Badges belong to the furniture: they appear once the room has settled. */}
      {!energyMode &&
        !phase &&
        badges.map(({ appliance, position }) => (
          <ApplianceBadge
            key={appliance.id}
            appliance={appliance}
            position={position}
            selected={appliance.id === highlightedApplianceId}
            onSelect={() => {
              onSelect();
              onSelectAppliance?.(appliance);
            }}
          />
        ))}
      <Html position={[x + width / 2, WALL_HEIGHTS.exterior + 0.35, y + depth / 2]} center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
        <div className="relative flex flex-col items-center">
          {hover && !compact && (
            <div className="absolute bottom-full mb-1.5 w-max min-w-[11rem] rounded-xl bg-zinc-900/95 px-3 py-2 text-left text-[11px] text-white shadow-xl">
              <p className="text-xs font-semibold">{room.name}</p>
              <p className="mt-1 tabular-nums">
                {formatNumber(info.estimatedKWh, 1)} kWh · {formatCurrency(info.estimatedCost)} <span className="text-white/60">estimado</span>
              </p>
              <p className="text-white/70">
                {info.applianceCount} {info.applianceCount === 1 ? "aparelho" : "aparelhos"} · {info.measurement}
              </p>
            </div>
          )}
          <div
            className={cn(
              "whitespace-nowrap rounded-full px-2 py-0.5 text-center text-[10px] font-medium shadow-sm transition-colors",
              selected ? "bg-zinc-900 text-white" : "bg-white/90 text-zinc-800",
              dimmed && !hover && "opacity-70",
            )}
          >
            {room.name}
            {info.value && (!compact || energyMode) && <span className="ml-1 opacity-70">· {info.value}</span>}
          </div>
        </div>
      </Html>
    </group>
  );
}

const WALL_ORDER: WallKind[] = ["exterior", "interior", "front"];

export default function FloorPlan3D({
  rooms,
  appliancesByRoom,
  energy,
  selectedRoomId,
  onSelectRoom,
  onSelectAppliance,
  heat,
  highlightedApplianceId = null,
  onContextLost,
}: FloorPlanProps & { onContextLost?: () => void }) {
  const geometries = useUnitGeometries();
  const dark = useIsDark();
  const compact = useCompact();
  // Leaving 3D (e.g. switching to the 2D editor) disposes the renderer, which
  // fires "webglcontextlost" on purpose. Only a loss while the scene is still
  // mounted is a real failure.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const placed = rooms.filter((room) => room.layout);
  const layoutKey = placed.map((room) => `${room.id}:${room.type}:${Object.values(room.layout!).join(",")}`).join("|");
  const bounds = useMemo(() => {
    const minX = Math.min(...placed.map((room) => room.layout!.x));
    const minZ = Math.min(...placed.map((room) => room.layout!.y));
    const maxX = Math.max(...placed.map((room) => room.layout!.x + room.layout!.width));
    const maxZ = Math.max(...placed.map((room) => room.layout!.y + room.layout!.depth));
    return {
      minX,
      minZ,
      span: { x: maxX - minX, z: maxZ - minZ },
      center: new Vector3((minX + maxX) / 2, 0.3, (minZ + maxZ) / 2),
    };
    // layoutKey captures every layout change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);
  const doors = useMemo(
    () => planDoors(placed.map((room) => ({ id: room.id, type: room.type, name: room.name, layout: room.layout! }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );
  const walls = useMemo(
    () => buildWalls(placed.map((room) => room.layout!), doors).sort((a, b) => WALL_ORDER.indexOf(a.kind) - WALL_ORDER.indexOf(b.kind)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );
  const unitCounts = useMemo(
    () => new Map(placed.map((room) => [room.id, groupUnits(furnitureFor(room.type, room.layout!.width, room.layout!.depth)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );

  // Room transitions. Phases change only when the selection changes, so React
  // renders twice per transition at most; the motion itself runs in useFrame.
  const [phases, setPhases] = useState<Map<string, RoomPhase>>(new Map());
  const phasesRef = useRef(phases);
  phasesRef.current = phases;
  const offsetsRef = useRef(new Map<string, { current: number[] }>());
  const offsetsFor = (roomId: string) => {
    let entry = offsetsRef.current.get(roomId);
    if (!entry) {
      entry = { current: [] };
      offsetsRef.current.set(roomId, entry);
    }
    return entry;
  };
  const previousSelection = useRef<string | null>(selectedRoomId);
  useEffect(() => {
    const previous = previousSelection.current;
    previousSelection.current = selectedRoomId;
    if (previous === selectedRoomId) return; // same room: nothing restarts
    if (heat || prefersReducedMotion()) {
      setPhases(new Map());
      return;
    }
    const offsets = new Map([...offsetsRef.current].map(([roomId, entry]) => [roomId, entry.current]));
    setPhases(
      planTransition(phasesRef.current, offsets, previous, selectedRoomId, performance.now(), (roomId) => unitCounts.get(roomId) ?? 0, motionSpeed()),
    );
  }, [selectedRoomId, heat, unitCounts]);
  useEffect(() => {
    // Energy mode hides furniture; leaving it starts from a fully built house.
    setPhases(new Map());
  }, [heat]);
  const settle = useCallback((roomId: string, phase: RoomPhase) => {
    setPhases((current) => {
      if (current.get(roomId) !== phase) return current; // a newer transition owns this room
      const next = new Map(current);
      next.delete(roomId);
      return next;
    });
  }, []);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const scale = heat ? heatScale(placed.map((room) => metricValue(energy.get(room.id), heat))) : null;
  const selected = placed.find((room) => room.id === selectedRoomId);
  const focus = useMemo(
    () =>
      selected?.layout
        ? {
            center: new Vector3(selected.layout.x + selected.layout.width / 2, 0.3, selected.layout.y + selected.layout.depth / 2),
            span: { x: selected.layout.width, z: selected.layout.depth },
          }
        : null,
    [selected?.layout],
  );

  const zoomBy = (factor: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as OrthographicCamera;
    camera.zoom = Math.min(controls.maxZoom, Math.max(controls.minZoom, camera.zoom * factor));
    camera.updateProjectionMatrix();
    controls.update();
  };
  const button =
    "flex h-10 w-10 items-center justify-center rounded-full border bg-card/90 text-foreground shadow-sm backdrop-blur hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="relative h-full w-full">
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 2]}
        // The rig moves target and camera together from the origin on mount.
        camera={{ position: [30, 36, 30], zoom: 30, near: -200, far: 400 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            // Checked after the current unmount, if any, has finished.
            setTimeout(() => {
              if (mounted.current) onContextLost?.();
            }, 0);
          });
        }}
        onPointerMissed={() => onSelectRoom(null)}
        aria-label="Maquete 3D do imóvel"
      >
        <hemisphereLight args={[dark ? "#c9d6ff" : "#ffffff", dark ? "#1b1d22" : "#d8d4cc", dark ? 0.75 : 0.9]} />
        <directionalLight position={[8, 18, 12]} intensity={dark ? 1.0 : 1.25} />
        <directionalLight position={[-10, 8, -4]} intensity={0.25} />

        <mesh
          raycast={noRaycast}
          geometry={geometries.box}
          material={plateMaterial(dark)}
          position={[bounds.center.x, -0.08, bounds.center.z]}
          scale={[bounds.span.x + 0.9, 0.16, bounds.span.z + 0.9]}
        />
        <ContactShadows
          key={layoutKey}
          frames={1}
          position={[bounds.center.x, 0.002 + FLOOR_THICKNESS, bounds.center.z]}
          scale={[bounds.span.x + 1, bounds.span.z + 1]}
          resolution={512}
          blur={2.4}
          opacity={dark ? 0.5 : 0.35}
          far={2}
        />

        {placed.map((room) => {
          const bucket = energy.get(room.id);
          const value = heat ? metricValue(bucket, heat) : null;
          const intensity = scale ? scale(value) : null;
          const roomAppliances = appliancesByRoom.get(room.id) ?? [];
          return (
            <RoomModel
              key={room.id}
              room={room}
              geometries={geometries}
              energyMode={Boolean(heat)}
              heatFill={intensity === null ? null : heatColor(intensity)}
              info={roomInfo(bucket, roomAppliances, heat, value)}
              compact={compact}
              selected={room.id === selectedRoomId}
              dimmed={Boolean(selectedRoomId && selectedRoomId !== room.id)}
              appliances={roomAppliances}
              highlightedApplianceId={highlightedApplianceId}
              phase={phases.get(room.id) ?? null}
              offsets={offsetsFor(room.id)}
              onSettled={(phase) => settle(room.id, phase)}
              onSelect={() => onSelectRoom(room.id)}
              onSelectAppliance={onSelectAppliance}
            />
          );
        })}

        {/* Door leaves stand open against the room they swing into. */}
        {doors
          .filter((door) => door.leaf)
          .map((door) => {
            const vertical = Math.abs(door.x1 - door.x2) < 1e-6;
            const length = Math.abs(vertical ? door.z2 - door.z1 : door.x2 - door.x1) - 0.12;
            const height = WALL_HEIGHTS.interior + 0.15;
            return (
              <mesh
                key={`${door.x1},${door.z1},${door.x2},${door.z2}`}
                raycast={noRaycast}
                geometry={geometries.box}
                material={furnitureMaterial("wood", false)}
                position={
                  vertical
                    ? [door.x1 + WALL_THICKNESS / 2 + length / 2, FLOOR_THICKNESS + height / 2, door.z1 + 0.08]
                    : [door.x1 + 0.08, FLOOR_THICKNESS + height / 2, door.z1 + WALL_THICKNESS / 2 + length / 2]
                }
                scale={vertical ? [length, height, 0.04] : [0.04, height, length]}
              />
            );
          })}
        {walls.map((wall, index) => {
          const { position, size } = wallBox(wall);
          return (
            <group key={index}>
              <mesh raycast={noRaycast} geometry={geometries.box} material={wallMaterial(dark, wall.kind === "front")} position={position} scale={size} />
              {wall.kind !== "front" && (
                <mesh
                  raycast={noRaycast}
                  geometry={geometries.box}
                  material={wallCapMaterial()}
                  position={[position[0], size[1] + 0.006, position[2]]}
                  scale={[size[0], 0.012, size[2]]}
                />
              )}
            </group>
          );
        })}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping={false}
          minPolarAngle={0.45}
          maxPolarAngle={1.1}
          minAzimuthAngle={Math.PI / 4 - 0.7}
          maxAzimuthAngle={Math.PI / 4 + 0.7}
        />
        <CameraRig center={bounds.center} span={bounds.span} focus={focus} resetToken={resetToken} />
      </Canvas>

      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <button type="button" className={button} aria-label="Aproximar" onClick={() => zoomBy(1.25)}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" className={button} aria-label="Afastar" onClick={() => zoomBy(0.8)}>
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={button}
          aria-label="Voltar à visão geral"
          onClick={() => {
            onSelectRoom(null);
            setResetToken((token) => token + 1);
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-card/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur sm:block">
        Arraste para girar · botão direito ou dois dedos para mover · role para zoom
      </p>
    </div>
  );
}
