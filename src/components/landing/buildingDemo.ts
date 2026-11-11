// Facade-local X follows the rotated window width; local Z always points out.
export const FACADE_COLUMNS = [[-1.65, 0, 1.65], [-1.35, 0, 1.35]] as const;
export function facadePosition(side: number, col: number, y: number, dx = 0, depth = 0): [number, number, number] {
  const column = FACADE_COLUMNS[side][col];
  return side ? [2.8 + depth, y, column - dx] : [column + dx, y, 2.2 + depth];
}

export const BUILDING_UNITS = Array.from({ length: 36 }, (_, index) => {
  const floor = Math.floor(index / 6);
  const side = Math.floor(index % 6 / 3);
  const col = index % 3;
  const lit = (floor * 3 + col + side * 2) % 5 !== 1 && (floor + col + side) % 4 !== 0;
  return {
    id: (floor + 1) * 100 + side * 3 + col + 1,
    floor, side, col, lit,
    appliances: 4 + index * 7 % 9,
    energy: 86 + index * 37 % 225,
    position: facadePosition(side, col, floor * 1.3 + 0.65, 0, 0.065),
  };
}).filter(unit => !(unit.floor === 0 && unit.side === 0 && unit.col === 1));
export type BuildingUnit = typeof BUILDING_UNITS[number];

