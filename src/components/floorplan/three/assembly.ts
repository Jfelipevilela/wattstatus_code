import type { FurniturePiece } from "./furniture";

// Furniture "assembly" animation for room changes: the previous room's
// furniture sinks through the floor, the camera travels, then the new room's
// furniture drops in from above and settles. Pure timing maths lives here so
// it can be tested without WebGL; FloorPlan3D only applies the offsets.

// Pieces are keyed "assembly/part" (see furniture.ts). A unit is one whole
// object - a sofa, a bed, the car - that always moves in one piece.
export interface FurnitureUnit {
  id: string;
  pieces: FurniturePiece[];
}

export const groupUnits = (pieces: FurniturePiece[]): FurnitureUnit[] => {
  const units = new Map<string, FurniturePiece[]>();
  for (const piece of pieces) {
    const id = piece.key.includes("/") ? piece.key.split("/")[0] : piece.key;
    units.set(id, [...(units.get(id) ?? []), piece]);
  }
  return [...units].map(([id, list]) => ({ id, pieces: list }));
};

export const TIMING = {
  exit: 300, // ms each unit takes to sink
  exitStagger: 45,
  camera: 480,
  enterDelay: 220, // enter starts while the camera is still moving
  enter: 520,
  enterStagger: 55,
  restore: 380, // the previous room quietly re-assembles afterwards
  dropHeight: 2.0, // metres above the final position
  sinkDepth: 1.4, // metres below the floor, hidden by floor and base
  maxStaggered: 8, // later units share the last slot, keeping it short
} as const;

export const easeInCubic = (t: number) => t * t * t;
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
// Decelerates into place with a small overshoot (a few centimetres at the
// drop height used here) and settles.
export const easeOutBack = (t: number, overshoot = 0.7) => {
  const c3 = overshoot + 1;
  return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const slot = (index: number) => Math.min(index, TIMING.maxStaggered);

export type RoomPhase =
  | { kind: "exit"; start: number; from: number[]; restoreAt: number | null }
  | { kind: "enter"; start: number }
  | { kind: "restore"; start: number; from: number[] };

export interface UnitState {
  offset: number; // y offset in metres; 0 is the resting position
  visible: boolean;
}

// Offset of one unit at time `now`. `done` is true once the unit is at rest
// (or hidden for good) and no further frames are needed for it.
export const unitAt = (phase: RoomPhase | null, index: number, now: number, speed = 1): UnitState & { done: boolean } => {
  const state = rawUnitAt(phase, index, now, speed);
  return { ...state, offset: state.offset + 0 }; // never -0
};

const rawUnitAt = (phase: RoomPhase | null, index: number, now: number, speed: number): UnitState & { done: boolean } => {
  if (!phase) return { offset: 0, visible: true, done: true };
  const ms = (value: number) => value / speed;
  if (phase.kind === "enter") {
    const start = phase.start + ms(slot(index) * TIMING.enterStagger);
    if (now < start) return { offset: TIMING.dropHeight, visible: false, done: false };
    const t = clamp01((now - start) / ms(TIMING.enter));
    return { offset: TIMING.dropHeight * (1 - easeOutBack(t)), visible: true, done: t >= 1 };
  }
  if (phase.kind === "restore") {
    const from = phase.from[index] ?? 0;
    const t = clamp01((now - phase.start) / ms(TIMING.restore));
    return { offset: from * (1 - easeOutCubic(t)), visible: true, done: t >= 1 };
  }
  // exit, then optionally rise back once the new room is assembled
  if (phase.restoreAt !== null && now >= phase.restoreAt) {
    const t = clamp01((now - phase.restoreAt) / ms(TIMING.restore));
    return { offset: -TIMING.sinkDepth * (1 - easeOutCubic(t)), visible: true, done: t >= 1 };
  }
  const from = phase.from[index] ?? 0;
  const start = phase.start + ms(slot(index) * TIMING.exitStagger);
  const t = clamp01((now - start) / ms(TIMING.exit));
  const offset = from + (-TIMING.sinkDepth - from) * easeInCubic(t);
  const sunk = t >= 1;
  return { offset, visible: !sunk, done: sunk && phase.restoreAt === null };
};

// When the furniture of a room selected as `next` is fully assembled.
export const enterEnd = (start: number, units: number, speed = 1) =>
  start + (slot(Math.max(0, units - 1)) * TIMING.enterStagger + TIMING.enter) / speed;

// Phases for a selection change. Rooms caught mid-animation that are neither
// the old nor the new selection rise back to rest from where they are, so a
// fast series of clicks never leaves furniture hidden or hanging.
export const planTransition = (
  current: Map<string, RoomPhase>,
  offsets: Map<string, number[]>,
  previous: string | null,
  next: string | null,
  now: number,
  unitsIn: (roomId: string) => number,
  speed = 1,
) => {
  const plan = new Map<string, RoomPhase>();
  for (const roomId of current.keys()) {
    if (roomId === previous || roomId === next) continue;
    const from = offsets.get(roomId) ?? [];
    if (from.some((value) => Math.abs(value) > 1e-3)) plan.set(roomId, { kind: "restore", start: now, from });
  }
  if (!next || next === previous) {
    // Back to the overview: a room still sinking or dropping just settles.
    if (previous && current.has(previous)) {
      plan.set(previous, { kind: "restore", start: now, from: offsets.get(previous) ?? [] });
    }
    return plan;
  }
  const enterStart = now + TIMING.enterDelay / speed;
  plan.set(next, { kind: "enter", start: enterStart });
  if (previous) {
    plan.set(previous, {
      kind: "exit",
      start: now,
      from: offsets.get(previous) ?? [],
      restoreAt: enterEnd(enterStart, unitsIn(next), speed) + 60 / speed,
    });
  }
  return plan;
};
