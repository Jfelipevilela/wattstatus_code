import type { RoomLayout } from "@/types/property";
import { furnitureFor } from "./furniture";

// Doors between rooms for the 3D model. A door goes where two rooms meet and
// a real home would connect them (living areas reach every room, a suite
// reaches its bathroom, bedrooms never open into each other), then every
// room left unreachable gets a door to a reachable neighbour. Each door
// sits on a stretch of wall with no furniture on either side, as close to a
// corner as possible.

export interface DoorRoom {
  id: string;
  type: string;
  name?: string;
  layout: RoomLayout;
}

export interface Door {
  // Opening on the shared wall, from (x1, z1) to (x2, z2).
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  // Wide openings (living room to kitchen, balcony...) have no door leaf.
  leaf: boolean;
  // Room the leaf swings into, the one on the wall's +x / +z side.
  roomId: string;
}

const EPS = 1e-6;
const DOOR = 0.9;
const WIDE = 1.6;
// Free floor wanted on both sides of a door: the leaf swings within it.
// Where furniture leaves less, the door becomes a plain passage.
const SWING = 0.85;
const PASSAGE = 0.35;
const NOOK = 0.08;
const END = 0.15;

const SOCIAL = new Set(["living", "hallway", "dining"]);
const OPEN_PLAN = new Set(["living", "dining", "kitchen", "balcony"]);
const PRIVATE = new Set(["bedroom", "suite", "office"]);

// How natural a door from `room` into `next` is: lower first; null never.
const preference = (room: DoorRoom, next: DoorRoom): number | null => {
  const suiteBath = room.type === "bathroom" && /su[ií]te/i.test(room.name ?? "");
  if (PRIVATE.has(room.type) && PRIVATE.has(next.type)) return null;
  if (suiteBath) return next.type === "suite" ? 0 : null;
  const order: Record<string, string[]> = {
    bedroom: ["hallway", "living", "dining"],
    suite: ["hallway", "living", "dining"],
    office: ["hallway", "living", "dining"],
    bathroom: ["hallway", "living", "dining", "laundry", "bedroom"],
    laundry: ["kitchen", "outdoor", "hallway", "garage", "balcony", "living"],
    garage: ["living", "outdoor", "kitchen", "hallway", "laundry", "balcony"],
    kitchen: ["living", "dining", "hallway", "laundry", "balcony"],
    balcony: ["living", "dining", "kitchen"],
    outdoor: ["living", "kitchen", "laundry", "garage"],
    hallway: ["living", "dining", "kitchen", "hallway"],
  };
  const list = order[room.type] ?? ["hallway", "living", "dining", "kitchen"];
  const index = list.indexOf(next.type);
  return index < 0 ? null : index;
};

interface Shared {
  a: DoorRoom; // on the -x / -z side
  b: DoorRoom;
  vertical: boolean; // wall along z, at x = line
  line: number;
  start: number;
  end: number;
}

const sharedWalls = (rooms: DoorRoom[]): Shared[] => {
  const result: Shared[] = [];
  for (const a of rooms) {
    for (const b of rooms) {
      if (a === b) continue;
      const la = a.layout;
      const lb = b.layout;
      if (Math.abs(la.x + la.width - lb.x) < EPS) {
        const start = Math.max(la.y, lb.y);
        const end = Math.min(la.y + la.depth, lb.y + lb.depth);
        if (end - start > EPS) result.push({ a, b, vertical: true, line: lb.x, start, end });
      }
      if (Math.abs(la.y + la.depth - lb.y) < EPS) {
        const start = Math.max(la.x, lb.x);
        const end = Math.min(la.x + la.width, lb.x + lb.width);
        if (end - start > EPS) result.push({ a, b, vertical: false, line: lb.y, start, end });
      }
    }
  }
  return result;
};

type Rect = { x0: number; x1: number; z0: number; z1: number };

const obstacles = (room: DoorRoom): Rect[] =>
  furnitureFor(room.type, room.layout.width, room.layout.depth)
    .filter((piece) => piece.size[1] >= 0.05)
    .map((piece) => ({
      x0: room.layout.x + piece.x - piece.size[0] / 2,
      x1: room.layout.x + piece.x + piece.size[0] / 2,
      z0: room.layout.y + piece.z - piece.size[2] / 2,
      z1: room.layout.y + piece.z + piece.size[2] / 2,
    }));

// Where along the wall the opening fits with free floor around it, nearest
// to one end of the wall first; null when furniture blocks the whole wall.
const findSpot = (wall: Shared, width: number, blocked: Rect[], swing: number): number | null => {
  const candidates: number[] = [];
  for (let t = wall.start + END; t + width <= wall.end - END + EPS; t += 0.05) candidates.push(t);
  candidates.sort((p, q) => Math.min(p - wall.start, wall.end - p - width) - Math.min(q - wall.start, wall.end - q - width));
  for (const t of candidates) {
    const band: Rect = wall.vertical
      ? { x0: wall.line - swing, x1: wall.line + swing, z0: t, z1: t + width }
      : { x0: t, x1: t + width, z0: wall.line - swing, z1: wall.line + swing };
    const free = !blocked.some((r) => r.x0 < band.x1 && band.x0 < r.x1 && r.z0 < band.z1 && band.z0 < r.z1);
    if (free) return t;
  }
  return null;
};

export const planDoors = (rooms: DoorRoom[]): Door[] => {
  const walls = sharedWalls(rooms);
  const furniture = new Map(rooms.map((room) => [room.id, obstacles(room)]));
  const doors: Door[] = [];
  const connected = new Set<string>();
  const edges = new Map<string, Set<string>>();
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const done = new Set<string>();

  const tryDoor = (wall: Shared) => {
    const key = pairKey(wall.a.id, wall.b.id);
    if (done.has(key)) return true;
    const wide = OPEN_PLAN.has(wall.a.type) && OPEN_PLAN.has(wall.b.type);
    const blocked = [...furniture.get(wall.a.id)!, ...furniture.get(wall.b.id)!];
    // Widest opening first for open-plan rooms; a door with room to swing
    // first, else a plain passage that furniture may stand close to.
    const widths = wide ? [WIDE, 1.2, DOOR] : [DOOR];
    let spot: { t: number; width: number; leaf: boolean } | null = null;
    for (const swing of [SWING, PASSAGE, NOOK]) {
      for (const width of widths) {
        const t = width <= wall.end - wall.start - 2 * END + EPS ? findSpot(wall, width, blocked, swing) : null;
        if (t !== null) {
          spot = { t, width, leaf: !wide && swing === SWING };
          break;
        }
      }
      if (spot) break;
    }
    if (!spot) return false;
    const { t, width, leaf } = spot;
    done.add(key);
    doors.push(
      wall.vertical
        ? { x1: wall.line, z1: t, x2: wall.line, z2: t + width, leaf, roomId: wall.b.id }
        : { x1: t, z1: wall.line, x2: t + width, z2: wall.line, leaf, roomId: wall.b.id },
    );
    for (const [from, to] of [[wall.a.id, wall.b.id], [wall.b.id, wall.a.id]]) {
      if (!edges.has(from)) edges.set(from, new Set());
      edges.get(from)!.add(to);
    }
    return true;
  };

  // Open-plan living areas flow into each other.
  for (const wall of walls) if (OPEN_PLAN.has(wall.a.type) && OPEN_PLAN.has(wall.b.type)) tryDoor(wall);
  // Every other room gets a single door, to its most natural neighbour.
  for (const room of rooms) {
    if (OPEN_PLAN.has(room.type)) continue;
    const options = walls
      .filter((wall) => wall.a.id === room.id || wall.b.id === room.id)
      .map((wall) => ({ wall, rank: preference(room, wall.a.id === room.id ? wall.b : wall.a) }))
      .filter((option): option is { wall: Shared; rank: number } => option.rank !== null)
      .sort((p, q) => p.rank - q.rank);
    if (options.some((option) => done.has(pairKey(option.wall.a.id, option.wall.b.id)))) continue;
    options.find((option) => tryDoor(option.wall));
  }

  // Every room reachable from the entrance (a living area when there is one);
  // stragglers get a door to a reachable neighbour, bedrooms never to another.
  const reach = () => {
    connected.clear();
    const start = rooms.find((room) => SOCIAL.has(room.type)) ?? rooms[0];
    if (!start) return;
    const queue = [start.id];
    connected.add(start.id);
    while (queue.length) {
      const id = queue.shift()!;
      for (const next of edges.get(id) ?? []) {
        if (!connected.has(next)) {
          connected.add(next);
          queue.push(next);
        }
      }
    }
  };
  for (let guard = 0; guard < rooms.length; guard++) {
    reach();
    const bridge = walls.find(
      (wall) =>
        connected.has(wall.a.id) !== connected.has(wall.b.id) &&
        !(PRIVATE.has(wall.a.type) && PRIVATE.has(wall.b.type)) &&
        !done.has(pairKey(wall.a.id, wall.b.id)) &&
        tryDoor(wall),
    );
    if (!bridge) break;
  }
  return doors;
};
