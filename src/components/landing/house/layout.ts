import { DEMO_ROOMS, HOUSE_SIZE, type DemoRoom } from "../content";

// Architecture of the demonstration house, in metres. Pure data: boxes as
// centre + size, so the scene draws each material as one instanced mesh.

export const H = 2.6; // exterior wall height
export const IH = 1.15; // cut-away interior walls
export const T = 0.14; // wall thickness
export const FT = 0.06; // floor thickness
export const CX = HOUSE_SIZE.w / 2;
export const CZ = HOUSE_SIZE.d / 2;
const W = HOUSE_SIZE.w;
const D = HOUSE_SIZE.d;

export type Box = { p: [number, number, number]; s: [number, number, number] };

// Axis-aligned box along a wall line.
export const span = (x1: number, z1: number, x2: number, z2: number, y0: number, y1: number, thick = T): Box => {
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const len = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  return {
    p: [(x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2],
    s: alongX ? [len + thick, y1 - y0, thick] : [thick, y1 - y0, len + thick],
  };
};

// A wall line with window bands cut out of it, plus slim frames.
const windowedWall = (axis: "x" | "z", fixed: number, from: number, to: number, windows: Array<[number, number, number, number]>) => {
  const at = (a: number, b: number, y0: number, y1: number, thick = T) =>
    axis === "x" ? span(a, fixed, b, fixed, y0, y1, thick) : span(fixed, a, fixed, b, y0, y1, thick);
  const solid: Box[] = [];
  const glass: Box[] = [];
  const frame: Box[] = [];
  let cursor = from;
  for (const [a, b, y0, y1] of windows) {
    if (a > cursor) solid.push(at(cursor, a, 0, H));
    solid.push(at(a, b, 0, y0), at(a, b, y1, H));
    glass.push(at(a, b, y0, y1, 0.02));
    frame.push(at(a, b, y0 - 0.02, y0 + 0.02, 0.08), at(a, b, y1 - 0.02, y1 + 0.02, 0.08));
    const mid = (a + b) / 2;
    frame.push(at(mid - 0.015, mid + 0.015, y0, y1, 0.06));
    cursor = b;
  }
  if (cursor < to) solid.push(at(cursor, to, 0, H));
  // Wall boxes overlap by the thickness at the joints; trim them.
  [...solid, ...glass, ...frame].forEach((box) => {
    if (axis === "x") box.s[0] = Math.max(0.01, box.s[0] - T);
    else box.s[2] = Math.max(0.01, box.s[2] - T);
  });
  return { solid, glass, frame };
};

const back = windowedWall("x", 0, 0, W, [
  [0.8, 3.2, 0.95, 2.2],
  [6.9, 9.4, 0.95, 2.2],
]);
const left = windowedWall("z", 0, 0, D, [[4.3, 7.1, 0.25, 2.35]]);

export const EXTERIOR: Box[] = [...back.solid, ...left.solid, span(0, 0, 0, 0, 0, H, T)];
export const INTERIOR: Box[] = [
  span(4, 0, 4, 3.6, 0, IH),
  span(6.3, 0, 6.3, 2.6, 0, IH),
  span(0, 3.6, 2.4, 3.6, 0, IH),
  span(3.3, 3.6, 4.6, 3.6, 0, IH),
  span(5.4, 3.6, 8.6, 3.6, 0, IH),
  span(9.4, 3.6, 10, 3.6, 0, IH),
  span(5.6, 3.6, 5.6, 5.0, 0, IH),
];

// Dark caps on every wall top: a crisp architectural line in the cut-away.
export const WALL_CAPS: Box[] = [...EXTERIOR, ...INTERIOR].map((box) => ({
  p: [box.p[0], box.p[1] + box.s[1] / 2 + 0.012, box.p[2]],
  s: [box.s[0] + 0.01, 0.024, box.s[2] + 0.01],
}));

// Glass facades on the two sides that face the camera.
const facade = () => {
  const glass: Box[] = [];
  const frame: Box[] = [];
  const bays = 6;
  for (let i = 0; i < bays; i++) glass.push(span((W / bays) * i, D, (W / bays) * (i + 1), D, 0.05, H - 0.05, 0.02));
  for (let i = 0; i < 4; i++) glass.push(span(W, (D / 4) * i, W, (D / 4) * (i + 1), 0.05, H - 0.05, 0.02));
  for (let i = 0; i <= bays; i++) frame.push({ p: [(W / bays) * i, H / 2, D], s: [0.035, H, 0.05] });
  for (let i = 0; i <= 4; i++) frame.push({ p: [W, H / 2, (D / 4) * i], s: [0.05, H, 0.035] });
  frame.push({ p: [W / 2, H - 0.025, D], s: [W + 0.05, 0.05, 0.06] }, { p: [W / 2, 0.025, D], s: [W + 0.05, 0.05, 0.06] });
  frame.push({ p: [W, H - 0.025, D / 2], s: [0.06, 0.05, D + 0.05] }, { p: [W, 0.025, D / 2], s: [0.06, 0.05, D + 0.05] });
  return { glass, frame };
};
const FACADE = facade();
export const GLASS: Box[] = [...FACADE.glass, ...back.glass, ...left.glass];
export const FRAMES: Box[] = [...FACADE.frame, ...back.frame, ...left.frame];

// Cantilevered roof over the private rooms and a slim side canopy.
export const ROOF: Box[] = [
  { p: [CX + 0.15, H + 0.09, 0.55], s: [W + 1.3, 0.18, 2.2] },
  { p: [-0.15, H + 0.09, CZ + 0.4], s: [1.1, 0.18, D + 1.0] },
];
// Warm downlights under the roof edge (exterior soffit).
export const SOFFIT_LIGHTS: Box[] = Array.from({ length: 9 }, (_, i) => ({ p: [0.4 + i * 1.18, H - 0.005, 1.5], s: [0.12, 0.012, 0.12] }));

// Interior warm lighting: cove strips on the tall walls and wall sconces.
export const COVES: Box[] = [
  { p: [CX, H - 0.06, T / 2 + 0.03], s: [W - 0.4, 0.03, 0.03] },
  { p: [T / 2 + 0.03, H - 0.06, CZ], s: [0.03, 0.03, D - 0.4] },
];
export const SCONCES: Box[] = [
  { p: [0.09 + T / 2, 1.75, 5.7 - 1.75], s: [0.04, 0.22, 0.09] },
  { p: [0.09 + T / 2, 1.75, 2.2], s: [0.04, 0.22, 0.09] },
  { p: [5.1, 1.75, 0.09 + T / 2], s: [0.09, 0.22, 0.04] },
];
// Kitchen under-counter strip and office desk light: small amber accents.
export const ACCENT_STRIPS: Box[] = [{ p: [9.85, 0.9, 5.7], s: [0.02, 0.015, 3.6] }];

// Outdoor: plinth, terrace, pool, garden.
export const PLINTH: Box = { p: [CX, -0.22, CZ + 0.7], s: [W + 2.2, 0.44, D + 3.4] };
export const PLINTH_EDGE: Box[] = [
  { p: [CX, 0.004, -1.0], s: [W + 2.2, 0.008, 0.016] },
  { p: [CX, 0.004, D + 2.4], s: [W + 2.2, 0.008, 0.016] },
  { p: [-1.1, 0.004, CZ + 0.7], s: [0.016, 0.008, D + 3.4] },
  { p: [W + 1.1, 0.004, CZ + 0.7], s: [0.016, 0.008, D + 3.4] },
];
export const DECK: Box[] = [{ p: [2.9, 0.035, D + 1.1], s: [5.8, 0.07, 2.2] }];
export const LAWN: Box[] = [{ p: [W + 0.55, 0.02, CZ + 0.7], s: [1.0, 0.04, D + 3.3] }];
export const WATER: Box[] = [{ p: [8.0, 0.025, D + 1.15], s: [3.4, 0.05, 1.5] }];
export const COPING: Box[] = [
  { p: [8.0, 0.06, D + 0.36], s: [3.6, 0.07, 0.1] },
  { p: [8.0, 0.06, D + 1.94], s: [3.6, 0.07, 0.1] },
  { p: [6.25, 0.06, D + 1.15], s: [0.1, 0.07, 1.68] },
  { p: [9.75, 0.06, D + 1.15], s: [0.1, 0.07, 1.68] },
];
export const BOLLARDS: Box[] = [0.4, 2.0, 3.6, 5.2].map((x) => ({ p: [x, 0.16, D + 2.15], s: [0.07, 0.3, 0.07] }));
// Low trees: trunk cylinders and canopy spheres.
export const TREES: Array<{ x: number; z: number; h: number; r: number }> = [
  { x: W + 0.55, z: 0.4, h: 1.5, r: 0.55 },
  { x: W + 0.55, z: 2.6, h: 1.1, r: 0.4 },
  { x: -0.7, z: D + 1.9, h: 1.3, r: 0.48 },
];

export const roomCenter = (room: DemoRoom): [number, number] => [room.x + room.w / 2, room.z + room.d / 2];
export const HUB: [number, number] = [5.0, 4.2];

// Manhattan trace from the hub to each room centre, like a circuit.
export const tracePath = (room: DemoRoom): Array<[number, number]> => {
  const [x, z] = roomCenter(room);
  if (room.z < 3.6) return [HUB, [x, HUB[1]], [x, z]];
  return [HUB, [HUB[0], z + 0.9], [x, z + 0.9], [x, z]];
};
export const TRACES = DEMO_ROOMS.map(tracePath);

export const traceBoxes = (y: number): Box[] =>
  TRACES.flatMap((path) =>
    path.slice(1).map(([bx, bz], i) => {
      const [ax, az] = path[i];
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const len = Math.hypot(bx - ax, bz - az);
      return { p: [(ax + bx) / 2, y, (az + bz) / 2], s: alongX ? [len + 0.025, 0.004, 0.025] : [0.025, 0.004, len + 0.025] } as Box;
    }),
  );

const pathLength = (path: Array<[number, number]>) =>
  path.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - path[i][0], point[1] - path[i][1]), 0);

export const pointOnPath = (path: Array<[number, number]>, t: number, out: { x: number; z: number }) => {
  let left = t * pathLength(path);
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (left <= len || i === path.length - 1) {
      const k = len === 0 ? 0 : Math.min(1, left / len);
      out.x = ax + (bx - ax) * k;
      out.z = az + (bz - az) * k;
      return out;
    }
    left -= len;
  }
  return out;
};

// Room outline drawn on the floor when hovered or selected.
export const outline = (room: DemoRoom, y: number, inset = 0.1, w = 0.03): Box[] => {
  const x0 = room.x + inset;
  const x1 = room.x + room.w - inset;
  const z0 = room.z + inset;
  const z1 = room.z + room.d - inset;
  return [
    { p: [(x0 + x1) / 2, y, z0], s: [x1 - x0, 0.006, w] },
    { p: [(x0 + x1) / 2, y, z1], s: [x1 - x0, 0.006, w] },
    { p: [x0, y, (z0 + z1) / 2], s: [w, 0.006, z1 - z0] },
    { p: [x1, y, (z0 + z1) / 2], s: [w, 0.006, z1 - z0] },
  ];
};
