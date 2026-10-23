import type { RoomLayout } from "@/types/property";

// Wall layout for the isometric model. The camera looks from +x/+z, so each
// room's min-x and min-z sides are its "back" (drawn tall, they frame the
// room) and max-x/max-z its "front" (cut down so the interior stays visible).
// A boundary shared by two rooms is drawn exactly once, as a mid-height
// interior wall, which avoids overlapping coplanar faces (z-fighting).

export const WALL_THICKNESS = 0.1;
export const WALL_HEIGHTS = { exterior: 1.05, interior: 0.6, front: 0.16 } as const;
export type WallKind = keyof typeof WALL_HEIGHTS;

export interface WallSegment {
  // Axis-aligned centre line from (x1, z1) to (x2, z2).
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  kind: WallKind;
}

const EPS = 1e-6;
type Interval = [number, number];

const subtract = (base: Interval, cuts: Interval[]): Interval[] => {
  let parts: Interval[] = [base];
  for (const [cs, ce] of cuts) {
    parts = parts.flatMap(([s, e]) => {
      if (ce <= s + EPS || cs >= e - EPS) return [[s, e] as Interval];
      const out: Interval[] = [];
      if (cs > s + EPS) out.push([s, cs]);
      if (ce < e - EPS) out.push([ce, e]);
      return out;
    });
  }
  return parts.filter(([s, e]) => e - s > EPS);
};

const intersect = (a: Interval, b: Interval): Interval | null => {
  const s = Math.max(a[0], b[0]);
  const e = Math.min(a[1], b[1]);
  return e - s > EPS ? [s, e] : null;
};

// Openings cut into interior walls (doors), as segments on the wall line.
export interface WallOpening {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export const buildWalls = (rooms: RoomLayout[], openings: WallOpening[] = []): WallSegment[] => {
  const walls: WallSegment[] = [];
  const cutsOn = (vertical: boolean, line: number): Interval[] =>
    openings
      .filter((o) => (vertical ? Math.abs(o.x1 - line) < EPS && Math.abs(o.x2 - line) < EPS : Math.abs(o.z1 - line) < EPS && Math.abs(o.z2 - line) < EPS))
      .map((o) => (vertical ? [Math.min(o.z1, o.z2), Math.max(o.z1, o.z2)] : [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)]) as Interval);
  rooms.forEach((room, index) => {
    const others = rooms.filter((_, other) => other !== index);
    const xSpan: Interval = [room.x, room.x + room.width];
    const zSpan: Interval = [room.y, room.y + room.depth];
    const right = room.x + room.width;
    const bottom = room.y + room.depth;

    // West (back) side: interior where a neighbour's east side touches it.
    const westShared = others
      .filter((n) => Math.abs(n.x + n.width - room.x) < EPS)
      .map((n) => intersect(zSpan, [n.y, n.y + n.depth]))
      .filter((part): part is Interval => part !== null);
    for (const [s, e] of westShared.flatMap((part) => subtract(part, cutsOn(true, room.x)))) walls.push({ x1: room.x, z1: s, x2: room.x, z2: e, kind: "interior" });
    for (const [s, e] of subtract(zSpan, westShared)) walls.push({ x1: room.x, z1: s, x2: room.x, z2: e, kind: "exterior" });

    // North (back) side.
    const northShared = others
      .filter((n) => Math.abs(n.y + n.depth - room.y) < EPS)
      .map((n) => intersect(xSpan, [n.x, n.x + n.width]))
      .filter((part): part is Interval => part !== null);
    for (const [s, e] of northShared.flatMap((part) => subtract(part, cutsOn(false, room.y)))) walls.push({ x1: s, z1: room.y, x2: e, z2: room.y, kind: "interior" });
    for (const [s, e] of subtract(xSpan, northShared)) walls.push({ x1: s, z1: room.y, x2: e, z2: room.y, kind: "exterior" });

    // East and south (front) sides: only where no neighbour's back side is.
    const eastCovered = others
      .filter((n) => Math.abs(n.x - right) < EPS)
      .map((n) => [n.y, n.y + n.depth] as Interval);
    for (const [s, e] of subtract(zSpan, eastCovered)) walls.push({ x1: right, z1: s, x2: right, z2: e, kind: "front" });
    const southCovered = others
      .filter((n) => Math.abs(n.y - bottom) < EPS)
      .map((n) => [n.x, n.x + n.width] as Interval);
    for (const [s, e] of subtract(xSpan, southCovered)) walls.push({ x1: s, z1: bottom, x2: e, z2: bottom, kind: "front" });
  });
  return walls;
};

// Box (centre + size) for a wall segment, extended by half a thickness at
// each end so corners close without gaps.
export const wallBox = (wall: WallSegment) => {
  const height = WALL_HEIGHTS[wall.kind];
  const horizontal = Math.abs(wall.z1 - wall.z2) < EPS;
  const length = Math.abs(horizontal ? wall.x2 - wall.x1 : wall.z2 - wall.z1) + WALL_THICKNESS;
  return {
    position: [(wall.x1 + wall.x2) / 2, height / 2, (wall.z1 + wall.z2) / 2] as [number, number, number],
    size: (horizontal ? [length, height, WALL_THICKNESS] : [WALL_THICKNESS, height, length]) as [number, number, number],
  };
};
