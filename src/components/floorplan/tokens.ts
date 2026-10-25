// Living Energy plan tokens. The 3D scene needs literal colors, so the plan's
// palette lives here once and both the SVG and the WebGL views read it.
// Swap these values when the final WattStatus identity arrives.

export const PLAN_TOKENS = {
  plate: "#e4e4e7",
  wall: "#fafafa",
  selection: "#15803d",
  hover: "#71717a",
  noData: "#d4d4d8",
  markerStem: "#a1a1aa",
} as const;

// Soft, distinct floor tints. Rooms take them in order, so neighbours differ
// even when they share a type.
export const ROOM_PALETTE = ["#86efac", "#93c5fd", "#fde68a", "#c4b5fd", "#99f6e4", "#fbcfe8", "#bae6fd", "#d9f99d"];

// Heat map ramp: low, middle, high.
export const HEAT_STOPS: Array<[number, number, number]> = [
  [187, 247, 208],
  [253, 230, 138],
  [251, 146, 60],
];

export const MARKER_COLORS = {
  climate: "#0ea5e9",
  tv: "#8b5cf6",
  fridge: "#06b6d4",
  shower: "#f97316",
  light: "#eab308",
  other: "#00C853",
} as const;
