import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { Appliance } from "@/hooks/useAppliances";
import type { EnergyBucket } from "@/lib/property-energy";
import { formatNumber } from "@/lib/energy";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { roomColor, type Room, type RoomLayout } from "@/types/property";
import { heatColor, heatScale, metricValue, type HeatMetric } from "./heat";
import { overlappingRooms, snapMove, snapResize } from "./snap";

const SCALE = 32; // px per metre
const SNAP = 0.5;
const MAX_MARKERS = 6;

const snap = (value: number) => Math.round(value / SNAP) * SNAP;
const clampLayout = (layout: RoomLayout): RoomLayout => ({
  width: Math.min(40, Math.max(1, layout.width)),
  depth: Math.min(40, Math.max(1, layout.depth)),
  x: Math.min(200 - layout.width, Math.max(0, layout.x)),
  y: Math.min(200 - layout.depth, Math.max(0, layout.y)),
});

export interface FloorPlanProps {
  rooms: Room[];
  appliancesByRoom: Map<string, Appliance[]>;
  energy: Map<string, EnergyBucket>;
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  onSelectAppliance?: (appliance: Appliance) => void;
  highlightedApplianceId?: string | null;
  heat: HeatMetric | null;
  editing?: boolean;
  onLayoutChange?: (roomId: string, layout: RoomLayout) => void;
}

export function FloorPlan2D({
  rooms,
  appliancesByRoom,
  energy,
  selectedRoomId,
  onSelectRoom,
  onSelectAppliance,
  heat,
  editing = false,
  onLayoutChange,
}: FloorPlanProps) {
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; origin: RoomLayout } | null>(null);
  const placed = rooms.filter((room) => room.layout);
  const maxX = Math.max(8, ...placed.map((room) => room.layout!.x + room.layout!.width));
  const maxY = Math.max(6, ...placed.map((room) => room.layout!.y + room.layout!.depth));
  const pad = 1;
  const overlapping = editing ? overlappingRooms(placed) : new Set<string>();
  const scale = heat ? heatScale(placed.map((room) => metricValue(energy.get(room.id), heat))) : null;

  const begin = (event: PointerEvent, room: Room, mode: "move" | "resize") => {
    if (!editing || !room.layout) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { id: room.id, mode, startX: event.clientX, startY: event.clientY, origin: room.layout };
    onSelectRoom(room.id);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current || !onLayoutChange) return;
    const svg = event.currentTarget.getBoundingClientRect();
    // Convert screen pixels to metres using the rendered size of the plan.
    // The plan is letterboxed (meet), so the tighter axis sets the scale.
    const ratio = Math.max((maxX + pad * 2) / svg.width, (maxY + pad * 2) / svg.height);
    const dx = (event.clientX - current.startX) * ratio;
    const dy = (event.clientY - current.startY) * ratio;
    const next =
      current.mode === "move"
        ? { ...current.origin, x: snap(current.origin.x + dx), y: snap(current.origin.y + dy) }
        : { ...current.origin, width: snap(current.origin.width + dx), depth: snap(current.origin.depth + dy) };
    // Edges stick to nearby rooms so separate rooms join into one house.
    const others = placed.filter((room) => room.id !== current.id).map((room) => room.layout!);
    const snapped = current.mode === "move" ? snapMove(clampLayout(next), others) : snapResize(clampLayout(next), others);
    onLayoutChange(current.id, clampLayout(snapped));
  };
  const end = () => {
    drag.current = null;
  };
  const keyboard = (event: KeyboardEvent, room: Room) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectRoom(room.id);
      return;
    }
    if (!editing || !room.layout || !onLayoutChange) return;
    const step = SNAP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    const layout = room.layout;
    onLayoutChange(
      room.id,
      clampLayout(
        event.shiftKey
          ? { ...layout, width: layout.width + d[0], depth: layout.depth + d[1] }
          : { ...layout, x: layout.x + d[0], y: layout.y + d[1] },
      ),
    );
  };

  return (
    <svg
      role="group"
      aria-label="Planta baixa"
      viewBox={`${-pad * SCALE} ${-pad * SCALE} ${(maxX + pad * 2) * SCALE} ${(maxY + pad * 2) * SCALE}`}
      className="h-full w-full touch-none select-none"
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onClick={() => onSelectRoom(null)}
    >
      <defs>
        <pattern id="no-data" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" className="fill-zinc-100 dark:fill-zinc-800" />
          <line x1="0" y1="0" x2="0" y2="8" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth="3" />
        </pattern>
        <pattern id="grid" width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
          <path d={`M ${SCALE} 0 L 0 0 0 ${SCALE}`} fill="none" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={-pad * SCALE} y={-pad * SCALE} width="100%" height="100%" fill={editing ? "url(#grid)" : "transparent"} />
      {placed.map((room) => {
        const layout = room.layout!;
        const x = layout.x * SCALE;
        const y = layout.y * SCALE;
        const w = layout.width * SCALE;
        const h = layout.depth * SCALE;
        const bucket = energy.get(room.id);
        const value = heat ? metricValue(bucket, heat) : null;
        const intensity = scale ? scale(value) : null;
        const fill = heat ? (intensity === null ? "url(#no-data)" : heatColor(intensity)) : roomColor(room);
        const selected = room.id === selectedRoomId;
        const clash = overlapping.has(room.id);
        const appliances = appliancesByRoom.get(room.id) ?? [];
        const label = heat
          ? value === null
            ? heat === "measured"
              ? "sem medição"
              : "sem aparelhos"
            : `${formatNumber(value, 1)} kWh`
          : bucket && bucket.applianceCount > 0
            ? `${formatNumber(bucket.estimatedKWh, 0)} kWh · ${appliances.length} ap.`
            : "vazio";
        return (
          <g
            key={room.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${room.name}: ${label}${editing ? ". Setas movem, Shift + setas redimensionam" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelectRoom(room.id);
            }}
            onKeyDown={(event) => keyboard(event, room)}
            onPointerDown={(event) => begin(event, room, "move")}
            className={editing ? "cursor-move outline-none" : "cursor-pointer outline-none"}
          >
            <rect
              x={x + 2}
              y={y + 2}
              width={Math.max(0, w - 4)}
              height={Math.max(0, h - 4)}
              rx={10}
              fill={fill}
              className={
                clash ? "stroke-red-500" : selected ? "stroke-energy-700 dark:stroke-energy-400" : "stroke-white/70 dark:stroke-zinc-900"
              }
              strokeWidth={clash || selected ? 4 : 2}
              strokeDasharray={clash ? "8 5" : undefined}
              opacity={selected || !selectedRoomId ? 1 : 0.7}
            />
            <text x={x + 12} y={y + 24} className="fill-zinc-800 text-[13px] font-semibold">
              {room.name.length > Math.floor(layout.width * 3.4) ? `${room.name.slice(0, Math.floor(layout.width * 3.4) - 1)}…` : room.name}
            </text>
            <text x={x + 12} y={y + 41} className="fill-zinc-700 text-[11px]">
              {label}
            </text>
            {appliances.slice(0, MAX_MARKERS).map((appliance, index) => {
              const { icon: Icon } = applianceVisual(appliance.name);
              const perRow = Math.max(1, Math.floor((w - 20) / 30));
              const cx = x + 14 + (index % perRow) * 30;
              const cy = y + h - 32 - Math.floor(index / perRow) * 30;
              if (cy < y + 46) return null;
              return (
                <g
                  key={appliance.id}
                  role="button"
                  tabIndex={-1}
                  aria-label={appliance.name}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectRoom(room.id);
                    onSelectAppliance?.(appliance);
                  }}
                >
                  <title>{appliance.name}</title>
                  <rect x={cx} y={cy} width={24} height={24} rx={8} className="fill-white/90 stroke-zinc-300" />
                  <Icon x={cx + 5} y={cy + 5} width={14} height={14} className="text-zinc-700" />
                </g>
              );
            })}
            {appliances.length > MAX_MARKERS && (
              <text x={x + w - 12} y={y + h - 14} textAnchor="end" className="fill-zinc-700 text-[11px] font-medium">
                +{appliances.length - MAX_MARKERS}
              </text>
            )}
            {editing && (
              <rect
                x={x + w - 16}
                y={y + h - 16}
                width={12}
                height={12}
                rx={3}
                className="cursor-nwse-resize fill-energy-700"
                onPointerDown={(event) => begin(event, room, "resize")}
                aria-hidden="true"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
