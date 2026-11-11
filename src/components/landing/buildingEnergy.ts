import { BUILDING_UNITS } from "./buildingDemo";

type Point = [number, number, number];
type Path = { unit: number | null; points: Point[]; lengths: number[]; length: number };

function path(unit: number | null, points: Point[]): Path {
  const lengths = points.slice(1).map((b, i) => Math.hypot(...b.map((v, axis) => v - points[i][axis])));
  return { unit, points, lengths, length: lengths.reduce((sum, value) => sum + value, 0) };
}

// Only 6 mm off the wall, like the house's floor circuits. The corner joins
// both elevations without a diagonal floating across either facade.
const X = 2.806;
const Z = 2.206;
export const BUILDING_ENERGY_PATHS = [
  path(null, [[3.65, 2.8, 3.196], [3.65, 0.062, 3.196], [3.2, 0.062, 3.196], [3.2, 0.062, 1.7], [3.2, 0.8, 1.7], [X, 0.8, 1.7], [X, 0.12, 1.7], [X, 0.12, Z]]),
  path(null, [[X, 0.12, Z], [X, 7.92, Z]]),
  ...BUILDING_UNITS.filter(unit => unit.lit).map(unit => {
    const y = unit.floor * 1.3 + 0.12;
    const end = unit.floor * 1.3 + 0.20;
    return path(unit.id, unit.side
      ? [[X, y, Z], [X, y, unit.position[2]], [X, end, unit.position[2]]]
      : [[X, y, Z], [unit.position[0], y, Z], [unit.position[0], end, Z]]);
  }),
];

// One instanced draw for every trace; no duplicated shared riser per unit.
export const BUILDING_ENERGY_TRACES = BUILDING_ENERGY_PATHS.flatMap(({ points }) => points.slice(1).map((b, i) => {
  const a = points[i];
  const axis = b.findIndex((value, index) => value !== a[index]);
  const s: Point = [0.025, 0.025, 0.004];
  // Thin normal to the surface, 25 mm wide, matching traceBoxes in the house.
  if (a[0] === X && b[0] === X) { s[0] = 0.004; s[2] = 0.025; }
  else if (a[1] === b[1] && a[1] === 0.062) { s[1] = 0.004; s[2] = 0.025; }
  s[axis] = Math.abs(b[axis] - a[axis]) + 0.025;
  return { p: a.map((value, index) => (value + b[index]) / 2) as Point, s };
}));

export function buildingEnergyPoint(path: Path, phase: number, out: { set: (x: number, y: number, z: number) => unknown }) {
  let distance = phase * path.length;
  for (let i = 0; i < path.lengths.length; i++) {
    const length = path.lengths[i];
    if (distance <= length || i === path.lengths.length - 1) {
      const k = length === 0 ? 0 : Math.min(1, distance / length);
      const a = path.points[i];
      const b = path.points[i + 1];
      out.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
      return;
    }
    distance -= length;
  }
}
