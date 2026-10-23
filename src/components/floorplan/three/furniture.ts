import { WALL_THICKNESS } from "./walls";

// Decorative low-poly furniture per room type. Pieces are placed in room-local
// metres (origin at the room's min corner), mostly against the back walls so
// they read well from the camera. A piece is dropped when it would cross a
// wall or overlap a piece already placed, so small rooms simply get less.
// Furniture is decoration only: it never creates or implies an appliance.

export type FurnitureFinish = "fabric" | "wood" | "white" | "dark" | "metal" | "glass" | "accent" | "plant";

export interface FurniturePiece {
  key: string;
  shape: "box" | "cylinder";
  // Centre in room-local coordinates; y is height of the centre.
  x: number;
  y: number;
  z: number;
  size: [number, number, number];
  finish: FurnitureFinish;
  // Anchor used by appliance badges ("tv", "fridge", "desk", "ac").
  anchor?: string;
}

const MARGIN = WALL_THICKNESS / 2 + 0.06;

interface Draft {
  key: string;
  shape?: "box" | "cylinder";
  x: number; // min corner x
  z: number; // min corner z
  w: number;
  d: number;
  h: number;
  y0?: number; // base height
  finish: FurnitureFinish;
  anchor?: string;
  // Pieces of one object share a group and are kept or dropped together.
  group?: string;
  // Sits on top of another piece; skips the overlap check against it.
  stacked?: boolean;
}

const fits = (p: Draft, w: number, d: number) =>
  p.x >= MARGIN - 1e-6 && p.z >= MARGIN - 1e-6 && p.x + p.w <= w - MARGIN + 1e-6 && p.z + p.d <= d - MARGIN + 1e-6;

const overlaps = (a: Draft, b: Draft) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

const resolve = (drafts: Draft[], w: number, d: number): FurniturePiece[] => {
  const groups = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const id = draft.group ?? draft.key;
    groups.set(id, [...(groups.get(id) ?? []), draft]);
  }
  const placed: Draft[] = [];
  for (const parts of groups.values()) {
    const ground = parts.filter((part) => !part.stacked);
    const ok =
      parts.every((part) => fits(part, w, d)) &&
      ground.every((part) => !placed.some((other) => !other.stacked && overlaps(part, other)));
    if (ok) placed.push(...parts);
  }
  return placed.map((p) => ({
    key: p.key,
    shape: p.shape ?? "box",
    x: p.x + p.w / 2,
    y: (p.y0 ?? 0) + p.h / 2,
    z: p.z + p.d / 2,
    size: [p.w, p.h, p.d],
    finish: p.finish,
    anchor: p.anchor,
  }));
};

const living = (w: number, d: number): Draft[] => {
  const sofaW = Math.min(2.2, w - 1.2);
  const sx = (w - sofaW) / 2;
  const m = MARGIN;
  return [
    { key: "sofa-seat", group: "sofa", x: sx, z: m, w: sofaW, d: 0.9, h: 0.42, finish: "fabric" },
    { key: "sofa-back", group: "sofa", stacked: true, x: sx, z: m, w: sofaW, d: 0.22, h: 0.4, y0: 0.42, finish: "fabric" },
    { key: "sofa-arm-l", group: "sofa", stacked: true, x: sx, z: m, w: 0.18, d: 0.9, h: 0.2, y0: 0.42, finish: "fabric" },
    { key: "sofa-arm-r", group: "sofa", stacked: true, x: sx + sofaW - 0.18, z: m, w: 0.18, d: 0.9, h: 0.2, y0: 0.42, finish: "fabric" },
    { key: "coffee", x: w / 2 - 0.5, z: m + 1.2, w: 1, d: 0.55, h: 0.36, finish: "wood" },
    { key: "rug", stacked: true, x: w / 2 - 1.2, z: m + 0.75, w: 2.4, d: 1.5, h: 0.015, finish: "accent" },
    { key: "rack", group: "tv", x: m, z: d / 2 - 0.9, w: 0.45, d: 1.8, h: 0.45, finish: "wood" },
    { key: "tv", group: "tv", stacked: true, x: m + 0.12, z: d / 2 - 0.7, w: 0.06, d: 1.4, h: 0.8, y0: 0.5, finish: "dark", anchor: "tv" },
    { key: "plant", shape: "cylinder", x: w - m - 0.45, z: m, w: 0.4, d: 0.4, h: 0.9, finish: "plant" },
  ];
};

const bedroom = (w: number, d: number, suite = false): Draft[] => {
  const m = MARGIN;
  // Tall pieces go in the back corner so they never hide the room.
  const wardrobe = w >= 3.2 ? 0.7 : 0;
  const bedW = Math.min(suite ? 1.9 : 1.6, w - 1.4 - wardrobe);
  const bx = wardrobe + (w - wardrobe - bedW) / 2;
  return [
    ...(wardrobe ? [{ key: "wardrobe", x: m, z: m, w: 0.6, d: Math.min(1.6, d - 2 * m), h: 1.2, finish: "white" as const }] : []),
    { key: "bed", group: "bed", x: bx, z: m, w: bedW, d: 2.0, h: 0.42, finish: "white" },
    { key: "headboard", group: "bed", stacked: true, x: bx, z: m, w: bedW, d: 0.1, h: 0.55, y0: 0.42, finish: "wood" },
    { key: "pillows", group: "bed", stacked: true, x: bx + 0.15, z: m + 0.15, w: bedW - 0.3, d: 0.35, h: 0.1, y0: 0.42, finish: "fabric" },
    { key: "blanket", group: "bed", stacked: true, x: bx, z: m + 1.0, w: bedW, d: 1.0, h: 0.06, y0: 0.42, finish: "accent" },
    { key: "nightstand-l", x: bx - 0.55, z: m, w: 0.45, d: 0.4, h: 0.5, finish: "wood" },
    { key: "nightstand-r", x: bx + bedW + 0.1, z: m, w: 0.45, d: 0.4, h: 0.5, finish: "wood" },
    { key: "ac-unit", stacked: true, x: w / 2 - 0.45, z: m, w: 0.9, d: 0.2, h: 0.28, y0: 1.2, finish: "white", anchor: "ac" },
  ];
};

const kitchen = (w: number, d: number): Draft[] => {
  const m = MARGIN;
  const counterW = w - 2 * m - 0.85;
  return [
    { key: "fridge", x: m, z: m, w: 0.75, d: 0.7, h: 1.8, finish: "metal", anchor: "fridge" },
    { key: "counter", group: "counter", x: m + 0.85, z: m, w: counterW, d: 0.6, h: 0.9, finish: "white" },
    { key: "worktop", group: "counter", stacked: true, x: m + 0.85, z: m, w: counterW, d: 0.62, h: 0.04, y0: 0.9, finish: "dark" },
    { key: "sink", group: "counter", stacked: true, x: m + 0.85 + counterW / 2 - 0.3, z: m + 0.1, w: 0.6, d: 0.4, h: 0.02, y0: 0.94, finish: "metal" },
    { key: "island", x: w / 2 - 0.7, z: d / 2 + 0.1, w: 1.4, d: 0.7, h: 0.9, finish: "wood" },
  ];
};

const bathroom = (w: number, d: number): Draft[] => {
  const m = MARGIN;
  return [
    { key: "vanity", group: "vanity", x: m, z: m, w: 0.8, d: 0.45, h: 0.85, finish: "wood" },
    { key: "basin", group: "vanity", stacked: true, x: m + 0.15, z: m + 0.05, w: 0.5, d: 0.35, h: 0.06, y0: 0.85, finish: "white" },
    { key: "toilet-base", group: "toilet", shape: "cylinder", x: m + 1.0, z: m + 0.2, w: 0.4, d: 0.5, h: 0.42, finish: "white" },
    { key: "toilet-tank", group: "toilet", stacked: true, x: m + 1.0, z: m, w: 0.4, d: 0.18, h: 0.4, y0: 0.42, finish: "white" },
    { key: "shower-floor", group: "shower", x: w - m - 0.9, z: m, w: 0.9, d: 0.9, h: 0.04, finish: "white" },
    { key: "shower-glass", group: "shower", stacked: true, x: w - m - 0.9, z: m + 0.88, w: 0.9, d: 0.02, h: 1.6, y0: 0.04, finish: "glass" },
  ];
};

const office = (w: number, d: number): Draft[] => {
  const m = MARGIN;
  const shelf = w >= 2.6 ? 0.45 : 0;
  const deskW = Math.min(1.6, w - 2 * m - shelf);
  const dx = Math.max(m + shelf, (w - deskW) / 2);
  void d;
  return [
    ...(shelf ? [{ key: "shelf", x: m, z: m, w: 0.35, d: 1.0, h: 1.1, finish: "white" as const }] : []),
    { key: "desk", group: "desk", x: dx, z: m, w: deskW, d: 0.7, h: 0.74, finish: "wood", anchor: "desk" },
    { key: "monitor", group: "desk", stacked: true, x: dx + deskW / 2 - 0.3, z: m + 0.08, w: 0.6, d: 0.05, h: 0.36, y0: 0.78, finish: "dark" },
    { key: "chair", shape: "cylinder", x: w / 2 - 0.27, z: m + 0.85, w: 0.55, d: 0.55, h: 0.48, finish: "dark" },
  ];
};

const laundry = (w: number): Draft[] => {
  const m = MARGIN;
  return [
    { key: "washer", x: m, z: m, w: 0.62, d: 0.62, h: 0.85, finish: "white", anchor: "washer" },
    { key: "tank", x: m + 0.75, z: m, w: 0.6, d: 0.5, h: 0.85, finish: "white" },
    { key: "shelf", x: w - m - 0.9, z: m, w: 0.9, d: 0.35, h: 1.4, finish: "wood" },
  ];
};

const garage = (w: number, d: number): Draft[] => {
  const m = MARGIN;
  return [
    { key: "car-body", group: "car", x: w / 2 - 0.9, z: d / 2 - 2.1, w: 1.8, d: 4.2, h: 0.65, y0: 0.15, finish: "accent" },
    { key: "car-cabin", group: "car", stacked: true, x: w / 2 - 0.75, z: d / 2 - 0.9, w: 1.5, d: 2.0, h: 0.45, y0: 0.8, finish: "glass" },
    { key: "workbench", x: m, z: m, w: 1.6, d: 0.55, h: 0.9, finish: "wood" },
  ];
};

const outdoor = (w: number, d: number): Draft[] => {
  const m = MARGIN;
  return [
    { key: "bench", x: m + 0.2, z: m, w: 1.4, d: 0.45, h: 0.45, finish: "wood" },
    { key: "plant-a", shape: "cylinder", x: w - m - 0.6, z: m + 0.1, w: 0.55, d: 0.55, h: 1.1, finish: "plant" },
    { key: "plant-b", shape: "cylinder", x: m + 0.2, z: d - m - 0.6, w: 0.45, d: 0.45, h: 0.8, finish: "plant" },
  ];
};

const generic = (w: number, d: number): Draft[] => [
  { key: "rug", stacked: true, x: w / 2 - Math.min(1.2, w / 3), z: d / 2 - Math.min(0.8, d / 3), w: Math.min(2.4, (w * 2) / 3), d: Math.min(1.6, (d * 2) / 3), h: 0.015, finish: "accent" },
  { key: "plant", shape: "cylinder", x: MARGIN, z: MARGIN, w: 0.4, d: 0.4, h: 0.85, finish: "plant" },
];

export const furnitureFor = (type: string, width: number, depth: number): FurniturePiece[] => {
  const drafts =
    type === "living"
      ? living(width, depth)
      : type === "bedroom"
        ? bedroom(width, depth)
        : type === "suite"
          ? bedroom(width, depth, true)
          : type === "kitchen"
            ? kitchen(width, depth)
            : type === "bathroom"
              ? bathroom(width, depth)
              : type === "office"
                ? office(width, depth)
                : type === "laundry"
                  ? laundry(width)
                  : type === "garage"
                    ? garage(width, depth)
                    : type === "outdoor" || type === "balcony"
                      ? outdoor(width, depth)
                      : generic(width, depth);
  return resolve(drafts, width, depth);
};
