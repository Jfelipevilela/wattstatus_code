import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Edges, Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BoxGeometry, CylinderGeometry, Vector3, type OrthographicCamera } from "three";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Appliance } from "@/hooks/useAppliances";
import { formatNumber } from "@/lib/energy";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { cn } from "@/lib/utils";
import type { Room } from "@/types/property";
import { heatColor, heatScale, metricValue } from "./heat";
import { PLAN_TOKENS } from "./tokens";
import type { FloorPlanProps } from "./FloorPlan2D";
import { buildWalls, wallBox, WALL_HEIGHTS, type WallKind } from "./three/walls";
import { furnitureFor, type FurniturePiece } from "./three/furniture";
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

const useIsDark = () => {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
};

// Which furniture piece an appliance can sit on, by its name.
const applianceAnchor = (name: string) => {
  const text = name.toLowerCase();
  if (/\bar\b|condicion|split/.test(text)) return "ac";
  if (/\btv\b|televis|crystal|qled|oled/.test(text)) return "tv";
  if (/geladeira|refriger|freezer/.test(text)) return "fridge";
  if (/computador|notebook|\bpc\b|monitor/.test(text)) return "desk";
  if (/lavar|lavadora|secadora/.test(text)) return "washer";
  return null;
};

// Projected size of the plan on screen, for an isometric-ish camera.
const fitZoom = (spanX: number, spanZ: number, width: number, height: number) =>
  Math.max(6, Math.min(width / ((spanX + spanZ) * 0.72 + 2), height / ((spanX + spanZ) * 0.42 + 2.6)));

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
  const goal = useRef<{ target: Vector3; zoom: number } | null>(null);
  const initialized = useRef(false);
  // Moves the orbit target and the camera together, so the viewing angle
  // stays the same while the view pans to a room.
  const moveTarget = (target: Vector3) => {
    if (!controls) return;
    const delta = target.clone().sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
  };
  const overview = fitZoom(span.x, span.z, size.width, size.height);

  useEffect(() => {
    if (!controls) return;
    controls.minZoom = overview * 0.6;
    controls.maxZoom = overview * 5;
  }, [controls, overview]);

  useEffect(() => {
    if (!controls) return;
    const next = focus
      ? { target: focus.center.clone(), zoom: Math.max(overview, Math.min(overview * 1.9, fitZoom(focus.span.x, focus.span.z, size.width, size.height) * 0.55)) }
      : { target: center.clone(), zoom: overview };
    if (resetToken > 0 && !focus) {
      // Back to the default angle as well as the default framing.
      const offset = new Vector3(30, 36, 30);
      camera.position.copy(controls.target).add(offset);
    }
    if (prefersReducedMotion() || !initialized.current) {
      initialized.current = true;
      moveTarget(next.target);
      (camera as OrthographicCamera).zoom = next.zoom;
      camera.updateProjectionMatrix();
      controls.update();
      invalidate();
      return;
    }
    goal.current = next;
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, focus, center, overview, size.width, size.height, camera, invalidate, resetToken]);

  useFrame(() => {
    if (!controls || !goal.current) return;
    const ortho = camera as OrthographicCamera;
    moveTarget(controls.target.clone().lerp(goal.current.target, 0.16));
    ortho.zoom += (goal.current.zoom - ortho.zoom) * 0.16;
    ortho.updateProjectionMatrix();
    controls.update();
    const done = controls.target.distanceTo(goal.current.target) < 0.01 && Math.abs(ortho.zoom - goal.current.zoom) < 0.05;
    if (done) goal.current = null;
    else invalidate();
  });
  return null;
}

function Furniture({
  pieces,
  origin,
  dimmed,
  geometries,
}: {
  pieces: FurniturePiece[];
  origin: [number, number];
  dimmed: boolean;
  geometries: ReturnType<typeof useUnitGeometries>;
}) {
  return (
    <group position={[origin[0], FLOOR_THICKNESS, origin[1]]}>
      {pieces.map((piece) => (
        <mesh
          key={piece.key}
          raycast={noRaycast}
          geometry={piece.shape === "cylinder" ? geometries.cylinder : geometries.box}
          material={furnitureMaterial(piece.finish, dimmed)}
          position={[piece.x, piece.y, piece.z]}
          scale={piece.size}
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

function RoomModel({
  room,
  geometries,
  energyMode,
  heatFill,
  label,
  showLabel,
  selected,
  dimmed,
  appliances,
  highlightedApplianceId,
  onSelect,
  onSelectAppliance,
}: {
  room: Room;
  geometries: ReturnType<typeof useUnitGeometries>;
  energyMode: boolean;
  heatFill: string | null;
  label: string;
  showLabel: boolean;
  selected: boolean;
  dimmed: boolean;
  appliances: Appliance[];
  highlightedApplianceId: string | null;
  onSelect: () => void;
  onSelectAppliance?: (appliance: Appliance) => void;
}) {
  const { x, y, width, depth } = room.layout!;
  const [hover, setHover] = useState(false);
  const pieces = useMemo(() => furnitureFor(room.type, width, depth), [room.type, width, depth]);
  const state = selected ? "selected" : dimmed ? "dimmed" : "normal";
  const floor = energyMode
    ? heatFloorMaterial(heatFill ?? PLAN_TOKENS.noData, state)
    : floorMaterial(FLOOR_FINISH[room.type] ?? "wood", state);

  // Badges sit on matching furniture when there is one, otherwise in a row
  // along the open front of the room.
  const badges = useMemo(() => {
    const used = new Set<string>();
    const loose: Appliance[] = [];
    const placed: Array<{ appliance: Appliance; position: [number, number, number] }> = [];
    for (const appliance of appliances.slice(0, 8)) {
      const anchor = applianceAnchor(appliance.name);
      const piece = anchor && !used.has(anchor) ? pieces.find((item) => item.anchor === anchor) : undefined;
      if (piece && anchor) {
        used.add(anchor);
        placed.push({ appliance, position: [x + piece.x, FLOOR_THICKNESS + piece.y + piece.size[1] / 2 + 0.3, y + piece.z] });
      } else loose.push(appliance);
    }
    const gap = 0.75;
    loose.forEach((appliance, index) => {
      const offset = (index - (loose.length - 1) / 2) * gap;
      placed.push({ appliance, position: [x + width / 2 + offset, 0.45, y + depth - 0.55] });
    });
    return placed;
  }, [appliances, pieces, x, y, width, depth]);

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
      {!energyMode && <Furniture pieces={pieces} origin={[x, y]} dimmed={dimmed} geometries={geometries} />}
      {!energyMode &&
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
      {(showLabel || hover || energyMode) && (
        <Html position={[x + width / 2, WALL_HEIGHTS.exterior + 0.35, y + depth / 2]} center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
          <div
            className={cn(
              "whitespace-nowrap rounded-full px-2.5 py-1 text-center font-medium shadow-sm",
              energyMode ? "bg-white/95 text-[10px] text-zinc-800" : "text-[11px]",
              !energyMode && (selected ? "bg-zinc-900 text-white" : "bg-white/95 text-zinc-800"),
            )}
          >
            {energyMode ? label : `${room.name} · ${label}`}
          </div>
        </Html>
      )}
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
  const walls = useMemo(
    () => buildWalls(placed.map((room) => room.layout!)).sort((a, b) => WALL_ORDER.indexOf(a.kind) - WALL_ORDER.indexOf(b.kind)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey],
  );
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
            onContextLost?.();
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
          const metered = roomAppliances.filter((item) => item.integrationProvider).length;
          const partial = heat === "measured" && value !== null && metered < roomAppliances.length;
          const label = heat
            ? value === null
              ? heat === "measured"
                ? "sem medição"
                : "sem aparelhos"
              : `${formatNumber(value, 1)} kWh${partial ? " · parcial" : ""}`
            : bucket && bucket.applianceCount > 0
              ? `${formatNumber(bucket.estimatedKWh, 0)} kWh`
              : "sem aparelhos";
          return (
            <RoomModel
              key={room.id}
              room={room}
              geometries={geometries}
              energyMode={Boolean(heat)}
              heatFill={intensity === null ? null : heatColor(intensity)}
              label={label}
              showLabel={room.id === selectedRoomId}
              selected={room.id === selectedRoomId}
              dimmed={Boolean(selectedRoomId && selectedRoomId !== room.id)}
              appliances={roomAppliances}
              highlightedApplianceId={highlightedApplianceId}
              onSelect={() => onSelectRoom(room.id)}
              onSelectAppliance={onSelectAppliance}
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
