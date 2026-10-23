import type { RoomLayout } from "@/types/property";

// Magnetic edges for the plan editor: a room dragged close to another snaps
// flush against it (or aligns with it), so separate rooms join into one house.
// Joined rooms then share a single wall in the 3D model.

export const SNAP_DISTANCE = 0.6;
const EPS = 1e-6;

const nearest = (value: number, candidates: number[]) => {
  let best: number | null = null;
  for (const candidate of candidates) {
    const gap = Math.abs(candidate - value);
    if (gap <= SNAP_DISTANCE + EPS && (best === null || gap < Math.abs(best - value))) best = candidate;
  }
  return best;
};

export const snapMove = (layout: RoomLayout, others: RoomLayout[]): RoomLayout => {
  const x = nearest(
    layout.x,
    others.flatMap((o) => [o.x + o.width, o.x - layout.width, o.x, o.x + o.width - layout.width]),
  );
  const y = nearest(
    layout.y,
    others.flatMap((o) => [o.y + o.depth, o.y - layout.depth, o.y, o.y + o.depth - layout.depth]),
  );
  return { ...layout, x: x ?? layout.x, y: y ?? layout.y };
};

export const snapResize = (layout: RoomLayout, others: RoomLayout[]): RoomLayout => {
  const right = nearest(layout.x + layout.width, others.flatMap((o) => [o.x, o.x + o.width]));
  const bottom = nearest(layout.y + layout.depth, others.flatMap((o) => [o.y, o.y + o.depth]));
  return {
    ...layout,
    width: right !== null && right - layout.x >= 1 ? right - layout.x : layout.width,
    depth: bottom !== null && bottom - layout.y >= 1 ? bottom - layout.y : layout.depth,
  };
};

// Rooms whose areas overlap another room on the same floor. Touching edges
// are fine (that is how rooms join); overlapping floors are not.
export const overlappingRooms = (rooms: Array<{ id: string; layout?: RoomLayout | null }>) => {
  const ids = new Set<string>();
  const placed = rooms.filter((room) => room.layout);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i].layout!;
      const b = placed[j].layout!;
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const d = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
      if (w > EPS && d > EPS) {
        ids.add(placed[i].id);
        ids.add(placed[j].id);
      }
    }
  }
  return ids;
};
