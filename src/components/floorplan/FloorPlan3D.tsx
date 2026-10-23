import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector3 } from "three";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Appliance } from "@/hooks/useAppliances";
import { formatNumber } from "@/lib/energy";
import { roomColor, type Room } from "@/types/property";
import { heatColor, heatScale, metricValue } from "./heat";
import { MARKER_COLORS, PLAN_TOKENS } from "./tokens";
import type { FloorPlanProps } from "./FloorPlan2D";

const FLOOR_HEIGHT = 0.16;
const WALL_HEIGHT = 0.9;
const WALL = 0.1;
const markerColor = (name: string) => {
  const text = name.toLowerCase();
  if (/\bar\b|condicion|split/.test(text)) return MARKER_COLORS.climate;
  if (/tv|televis|crystal/.test(text)) return MARKER_COLORS.tv;
  if (/geladeira|freezer|refriger/.test(text)) return MARKER_COLORS.fridge;
  if (/chuveiro/.test(text)) return MARKER_COLORS.shower;
  if (/lampada|lâmpada|luz|led/.test(text)) return MARKER_COLORS.light;
  return MARKER_COLORS.other;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Moves the orbit target toward the selected room. Renders on demand only
// while the camera is travelling.
function CameraFocus({ target }: { target: Vector3 | null }) {
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((state) => state.invalidate);
  const goal = useRef<Vector3 | null>(null);
  useEffect(() => {
    if (!controls || !target) return;
    if (prefersReducedMotion()) {
      controls.target.copy(target);
      controls.update();
      invalidate();
      return;
    }
    goal.current = target.clone();
    invalidate();
  }, [controls, target, invalidate]);
  useFrame(() => {
    if (!controls || !goal.current) return;
    controls.target.lerp(goal.current, 0.18);
    controls.update();
    if (controls.target.distanceTo(goal.current) < 0.02) goal.current = null;
    else invalidate();
  });
  return null;
}

function RoomBlock({
  room,
  fill,
  dimmed,
  selected,
  label,
  appliances,
  onSelect,
  onSelectAppliance,
}: {
  room: Room;
  fill: string;
  dimmed: boolean;
  selected: boolean;
  label: string;
  appliances: Appliance[];
  onSelect: () => void;
  onSelectAppliance?: (appliance: Appliance) => void;
}) {
  const { x, y, width, depth } = room.layout!;
  const cx = x + width / 2;
  const cz = y + depth / 2;
  const [hover, setHover] = useState(false);
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };
  const walls: Array<[number, number, number, number]> = [
    [cx, y + WALL / 2, width, WALL],
    [cx, y + depth - WALL / 2, width, WALL],
    [x + WALL / 2, cz, WALL, depth],
    [x + width - WALL / 2, cz, WALL, depth],
  ];
  const lift = selected ? 0.08 : 0;
  // Markers sit in a centred grid kept 0.7 m away from the walls.
  const MARKER_GAP = 0.8;
  const perRow = Math.max(1, Math.floor((width - 1.4) / MARKER_GAP) + 1);
  const markers = appliances.slice(0, 8);
  const rowsUsed = Math.ceil(markers.length / perRow);
  return (
    <group
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
      <mesh position={[cx, FLOOR_HEIGHT / 2 + lift, cz]}>
        <boxGeometry args={[width - 0.04, FLOOR_HEIGHT, depth - 0.04]} />
        <meshStandardMaterial color={fill} roughness={0.85} transparent opacity={dimmed ? 0.55 : 1} />
        {(selected || hover) && <Edges color={selected ? PLAN_TOKENS.selection : PLAN_TOKENS.hover} lineWidth={selected ? 2.5 : 1} />}
      </mesh>
      {walls.map(([wx, wz, ww, wd], index) => (
        <mesh key={index} position={[wx, FLOOR_HEIGHT + WALL_HEIGHT / 2 + lift, wz]}>
          <boxGeometry args={[ww, WALL_HEIGHT, wd]} />
          <meshStandardMaterial color={PLAN_TOKENS.wall} roughness={0.6} transparent opacity={dimmed ? 0.35 : 0.9} />
        </mesh>
      ))}
      {markers.map((appliance, index) => {
        const row = Math.floor(index / perRow);
        const inRow = Math.min(perRow, markers.length - row * perRow);
        const px = cx + ((index % perRow) - (inRow - 1) / 2) * MARKER_GAP;
        const pz = y + depth - 0.7 - (rowsUsed - 1 - row) * MARKER_GAP;
        if (pz < y + 0.7) return null;
        const color = markerColor(appliance.name);
        return (
          <group
            key={appliance.id}
            position={[px, FLOOR_HEIGHT + lift, pz]}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onSelectAppliance?.(appliance);
            }}
          >
            <mesh position={[0, 0.25, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.5, 8]} />
              <meshStandardMaterial color={PLAN_TOKENS.markerStem} />
            </mesh>
            <mesh position={[0, 0.58, 0]}>
              <sphereGeometry args={[0.17, 16, 12]} />
              <meshStandardMaterial color={color} roughness={0.35} emissive={color} emissiveIntensity={0.15} />
            </mesh>
          </group>
        );
      })}
      <Html position={[cx, FLOOR_HEIGHT + WALL_HEIGHT + 0.3 + lift, cz]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-center text-[11px] font-medium shadow-sm backdrop-blur ${
            selected ? "bg-zinc-900 text-white" : "bg-white/90 text-zinc-800"
          }`}
        >
          {room.name}
          <span className="ml-1 opacity-70">· {label}</span>
        </div>
      </Html>
    </group>
  );
}

export default function FloorPlan3D({
  rooms,
  appliancesByRoom,
  energy,
  selectedRoomId,
  onSelectRoom,
  onSelectAppliance,
  heat,
  onContextLost,
}: FloorPlanProps & { onContextLost?: () => void }) {
  const placed = rooms.filter((room) => room.layout);
  const bounds = useMemo(() => {
    const maxX = Math.max(6, ...placed.map((room) => room.layout!.x + room.layout!.width));
    const maxZ = Math.max(6, ...placed.map((room) => room.layout!.y + room.layout!.depth));
    return { maxX, maxZ, center: new Vector3(maxX / 2, 0, maxZ / 2), span: Math.max(maxX, maxZ) };
  }, [placed]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const scale = heat ? heatScale(placed.map((room) => metricValue(energy.get(room.id), heat))) : null;
  const selected = placed.find((room) => room.id === selectedRoomId);
  const focus = useMemo(
    () =>
      selected?.layout
        ? new Vector3(selected.layout.x + selected.layout.width / 2, 0, selected.layout.y + selected.layout.depth / 2)
        : null,
    [selected?.layout],
  );

  const zoom = (factor: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as { zoom: number; updateProjectionMatrix: () => void };
    camera.zoom = Math.min(160, Math.max(8, camera.zoom * factor));
    camera.updateProjectionMatrix();
    controls.update();
  };
  const reset = () => {
    controlsRef.current?.reset();
    onSelectRoom(null);
  };
  const button =
    "flex h-10 w-10 items-center justify-center rounded-full border bg-card/90 text-foreground shadow-sm backdrop-blur hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="relative h-full w-full">
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 2]}
        camera={{
          position: [bounds.center.x + 18, 18, bounds.center.z + 18],
          zoom: Math.max(12, 520 / bounds.span),
          near: -100,
          far: 200,
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            onContextLost?.();
          });
        }}
        onPointerMissed={() => onSelectRoom(null)}
        aria-label="Planta 3D interativa"
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[10, 20, 8]} intensity={1.1} />
        <directionalLight position={[-8, 10, -6]} intensity={0.35} />
        <mesh position={[bounds.center.x, -0.06, bounds.center.z]}>
          <boxGeometry args={[bounds.maxX + 1.6, 0.12, bounds.maxZ + 1.6]} />
          <meshStandardMaterial color={PLAN_TOKENS.plate} roughness={1} />
        </mesh>
        {placed.map((room) => {
          const bucket = energy.get(room.id);
          const value = heat ? metricValue(bucket, heat) : null;
          const intensity = scale ? scale(value) : null;
          const fill = heat ? (intensity === null ? PLAN_TOKENS.noData : heatColor(intensity)) : roomColor(room);
          const label = heat
            ? value === null
              ? heat === "measured"
                ? "sem medição"
                : "sem aparelhos"
              : `${formatNumber(value, 1)} kWh`
            : bucket && bucket.applianceCount > 0
              ? `${formatNumber(bucket.estimatedKWh, 0)} kWh`
              : "vazio";
          return (
            <RoomBlock
              key={room.id}
              room={room}
              fill={fill}
              dimmed={Boolean(selectedRoomId && selectedRoomId !== room.id)}
              selected={room.id === selectedRoomId}
              label={label}
              appliances={appliancesByRoom.get(room.id) ?? []}
              onSelect={() => onSelectRoom(room.id)}
              onSelectAppliance={onSelectAppliance}
            />
          );
        })}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={bounds.center}
          enableDamping={false}
          minPolarAngle={0.35}
          maxPolarAngle={1.15}
          minZoom={8}
          maxZoom={160}
        />
        <CameraFocus target={focus} />
      </Canvas>
      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <button type="button" className={button} aria-label="Aproximar" onClick={() => zoom(1.25)}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" className={button} aria-label="Afastar" onClick={() => zoom(0.8)}>
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" className={button} aria-label="Restaurar vista" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-full bg-card/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur sm:block">
        Arraste para girar · botão direito ou dois dedos para mover · role para zoom
      </p>
    </div>
  );
}
