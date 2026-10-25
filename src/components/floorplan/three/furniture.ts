import { WALL_THICKNESS } from "./walls";

/**
 * WattStatus Living Energy 3D — furniture generator v2.
 *
 * - 100% procedural and deterministic: no downloaded assets and no randomness.
 * - Drop-in public API for FloorPlan3D: same types, shape union and furnitureFor().
 * - Assemblies are placed atomically; their own parts may overlap intentionally.
 * - Only independent floor-standing assemblies participate in footprint collision.
 * - Overlays (rugs, mirrors, wall A/C) don't reserve floor area.
 * - All visible primitive extents stay inside the room's local footprint.
 * - Decorative objects never create Energy/Appliance records.
 *
 * Coordinate system: room min corner is (0, 0); X=width, Z=depth,
 * Y is height above floor. A FurniturePiece uses its CENTER for x/y/z.
 */
export type FurnitureFinish =
  | "fabric" | "wood" | "white" | "dark"
  | "metal" | "glass" | "accent" | "plant";

export interface FurniturePiece {
  key: string;
  shape: "box" | "cylinder";
  x: number;
  y: number;
  z: number;
  size: [number, number, number];
  finish: FurnitureFinish;
  anchor?: string;
}

type Shape = FurniturePiece["shape"];
type Area = { x: number; z: number; w: number; d: number };
type Primitive = Area & {
  name: string;
  y0: number;
  h: number;
  finish: FurnitureFinish;
  shape: Shape;
  anchor?: string;
};

type Assembly = {
  id: string;
  parts: Primitive[];
  /** Only floor-standing assemblies block neighboring furniture. */
  layer: "floor" | "overlay";
  /**
   * Free space kept around a floor object. Two objects keep the smaller of
   * their pads apart, so companions (nightstands, chairs, plants) can sit
   * close to what they serve while large pieces keep a walkway between them.
   */
  pad?: number;
};


const CLEARANCE = Math.max(0.10, WALL_THICKNESS / 2 + 0.07);
const GAP = 0.04;
const MIN_PART = 0.012;
// Free floor between two large pieces: a narrow but real walkway.
const WALKWAY = 0.45;
// Companion pieces that stand right next to another one.
const SNUG = GAP;

const rect = (
  name: string, x: number, z: number, w: number, d: number,
  h: number, finish: FurnitureFinish, y0 = 0, anchor?: string,
): Primitive => ({ name, x, z, w, d, h, finish, y0, shape: "box", anchor });

const round = (
  name: string, x: number, z: number, w: number, d: number,
  h: number, finish: FurnitureFinish, y0 = 0, anchor?: string,
): Primitive => ({ ...rect(name, x, z, w, d, h, finish, y0, anchor), shape: "cylinder" });

const floor = (id: string, parts: Primitive[], pad = WALKWAY): Assembly => ({ id, parts, layer: "floor", pad });
const overlay = (id: string, parts: Primitive[]): Assembly => ({ id, parts, layer: "overlay" });

const boundsOf = (parts: Primitive[]): Area => {
  const x = Math.min(...parts.map((p) => p.x));
  const z = Math.min(...parts.map((p) => p.z));
  return {
    x,
    z,
    w: Math.max(...parts.map((p) => p.x + p.w)) - x,
    d: Math.max(...parts.map((p) => p.z + p.d)) - z,
  };
};

const finitePositive = (n: number) => Number.isFinite(n) && n > 0;
const inRoom = (a: Area, width: number, depth: number) =>
  a.x >= CLEARANCE - 1e-6 && a.z >= CLEARANCE - 1e-6 &&
  a.x + a.w <= width - CLEARANCE + 1e-6 &&
  a.z + a.d <= depth - CLEARANCE + 1e-6;

const touching = (a: Area, b: Area, gap = GAP) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap &&
  a.z < b.z + b.d + gap && b.z < a.z + a.d + gap;

const compile = (assemblies: Assembly[], width: number, depth: number): FurniturePiece[] => {
  if (!finitePositive(width) || !finitePositive(depth) ||
      width <= 2 * CLEARANCE || depth <= 2 * CLEARANCE) return [];

  const reserved: Array<Area & { pad: number }> = [];
  const result: FurniturePiece[] = [];
  const keys = new Set<string>();

  for (const object of assemblies) {
    if (!object.parts.length) continue;
    if (!object.parts.every((p) =>
      [p.x, p.y0, p.z, p.w, p.d, p.h].every(Number.isFinite) &&
      p.y0 >= 0 && p.w >= MIN_PART && p.d >= MIN_PART && p.h >= MIN_PART &&
      inRoom(p, width, depth)
    )) continue;

    const area = boundsOf(object.parts);
    const pad = object.pad ?? WALKWAY;
    if (object.layer === "floor" && reserved.some((item) => touching(item, area, Math.max(GAP, Math.min(pad, item.pad))))) continue;

    // An assembly's surfaces, legs, cushions, etc. are intentionally allowed
    // to overlap one another; collision applies between separate floor objects.
    if (object.layer === "floor") reserved.push({ ...area, pad });
    for (const p of object.parts) {
      const key = `${object.id}/${p.name}`;
      if (keys.has(key)) continue;
      keys.add(key);
      result.push({
        key,
        shape: p.shape,
        x: p.x + p.w / 2,
        y: p.y0 + p.h / 2,
        z: p.z + p.d / 2,
        size: [p.w, p.h, p.d],
        finish: p.finish,
        ...(p.anchor ? { anchor: p.anchor } : {}),
      });
    }
  }
  return result;
};

// ------------------------- Shared design elements -------------------------

function pottedPlant(id: string, x: number, z: number, scale = 1): Assembly {
  const s = scale;
  return floor(id, [
    round("pot", x + 0.08 * s, z + 0.08 * s, 0.27 * s, 0.27 * s, 0.36 * s, "white"),
    round("stem", x + 0.202 * s, z + 0.202 * s, 0.028 * s, 0.028 * s, 0.44 * s, "wood", 0.34 * s),
    round("canopy-low", x, z, 0.43 * s, 0.43 * s, 0.36 * s, "plant", 0.61 * s),
    round("canopy-top", x + 0.10 * s, z + 0.10 * s, 0.24 * s, 0.24 * s, 0.28 * s, "plant", 0.87 * s),
  ], 0.2);
}

function rug(id: string, x: number, z: number, w: number, d: number): Assembly {
  return overlay(id, [
    rect("border", x, z, w, d, 0.014, "wood", 0.002),
    rect("weave", x + 0.065, z + 0.065, w - 0.13, d - 0.13, 0.013, "accent", 0.016),
  ]);
}

function table(id: string, x: number, z: number, w: number, d: number, h: number,
  top: FurnitureFinish = "wood", pad = WALKWAY): Assembly {
  const leg = 0.075;
  return floor(id, [
    rect("top", x, z, w, d, 0.065, top, h - 0.065),
    rect("leg-fl", x + 0.09, z + 0.07, leg, leg, h - 0.065, "dark"),
    rect("leg-fr", x + w - 0.09 - leg, z + 0.07, leg, leg, h - 0.065, "dark"),
    rect("leg-bl", x + 0.09, z + d - 0.07 - leg, leg, leg, h - 0.065, "dark"),
    rect("leg-br", x + w - 0.09 - leg, z + d - 0.07 - leg, leg, leg, h - 0.065, "dark"),
  ], pad);
}

// ------------------------- Room-specific layouts -------------------------

function living(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  const sofaW = Math.min(2.45, Math.max(0.85, w - 2 * m - 0.35));
  const sx = (w - sofaW) / 2;
  const sz = m + 0.05;
  const sofaParts: Primitive[] = [
    rect("base", sx, sz, sofaW, 0.88, 0.26, "dark", 0.10),
    rect("cushion-left", sx + 0.15, sz + 0.25, (sofaW - 0.32) / 2, 0.56, 0.16, "fabric", 0.37),
    rect("cushion-right", sx + 0.17 + (sofaW - 0.32) / 2, sz + 0.25, (sofaW - 0.32) / 2, 0.56, 0.16, "fabric", 0.37),
    rect("back", sx, sz, sofaW, 0.18, 0.78, "fabric", 0.12),
    rect("arm-left", sx, sz + 0.12, 0.16, 0.75, 0.57, "fabric", 0.20),
    rect("arm-right", sx + sofaW - 0.16, sz + 0.12, 0.16, 0.75, 0.57, "fabric", 0.20),
    rect("feet-left", sx + 0.10, sz + 0.12, 0.08, 0.08, 0.10, "wood"),
    rect("feet-right", sx + sofaW - 0.18, sz + 0.12, 0.08, 0.08, 0.10, "wood"),
  ];
  const tvX = w - m - 0.48;
  const tvZ = Math.max(m + 0.15, d - m - 1.8);
  const tvParts: Primitive[] = [
    rect("console", tvX, tvZ, 0.48, 1.70, 0.45, "wood"),
    rect("console-top", tvX - 0.01, tvZ - 0.01, 0.49, 1.72, 0.04, "dark", 0.45),
    rect("screen", tvX + 0.20, tvZ + 0.18, 0.055, 1.34, 0.78, "dark", 0.54, "tv"),
    rect("tv-base", tvX + 0.11, tvZ + 0.76, 0.20, 0.16, 0.05, "metal", 0.49),
  ];
  return [
    floor("living-sofa", sofaParts),
    table("living-coffee-table", w / 2 - 0.48, sz + 1.23, 0.96, 0.55, 0.36, "wood", 0.3),
    floor("living-tv-console", tvParts),
    pottedPlant("living-plant", m + 0.04, d - m - 0.48, 0.90),
    rug("living-rug", w / 2 - 1.20, sz + 0.68, 2.40, 1.60),
  ];
}

function bedroom(w: number, d: number, suite: boolean): Assembly[] {
  const m = CLEARANCE;
  // The headboard rests on the side (west) wall, so the back wall, usually
  // shared with the hallway, stays free for the door. Brazilian sizes: a
  // queen bed in suites, a standard double elsewhere, a single when the room
  // is too narrow for either.
  const length = 2.03;
  const fits = (bed: number) => d - 2 * m >= bed + 2 * 0.47;
  const bedW = [suite ? 1.58 : 1.38, 1.38, 0.88].find(fits) ?? Math.max(0.6, d - 2 * m - 0.1);
  const nightstands = fits(bedW);
  // Bed and nightstands sit towards the front, leaving the back for the door.
  const group = bedW + (nightstands ? 2 * 0.47 : 0);
  const z = Math.max(m, d - m - group) + (nightstands ? 0.47 : 0);
  const x = m + 0.06; // clear of the A/C wall panel
  const head = 0.12;
  const bed: Primitive[] = [
    rect("headboard", x, z - 0.05, head, bedW + 0.10, 0.96, "wood"),
    rect("frame", x + 0.08, z, 1.95, bedW, 0.30, "wood", 0.13),
    rect("mattress", x + 0.14, z + 0.04, 1.84, bedW - 0.08, 0.16, "white", 0.43),
    ...(bedW > 1
      ? [
          rect("pillow-left", x + 0.22, z + 0.12, 0.40, (bedW - 0.34) / 2, 0.09, "fabric", 0.59),
          rect("pillow-right", x + 0.22, z + 0.22 + (bedW - 0.34) / 2, 0.40, (bedW - 0.34) / 2, 0.09, "fabric", 0.59),
        ]
      : [rect("pillow", x + 0.22, z + 0.12, 0.40, bedW - 0.24, 0.09, "fabric", 0.59)]),
    rect("duvet", x + 0.92, z + 0.05, 1.05, bedW - 0.10, 0.075, "accent", 0.59),
    rect("duvet-fold", x + 0.90, z + 0.05, 0.13, bedW - 0.10, 0.03, "fabric", 0.665),
  ];
  const nightstand = (id: string, nz: number): Assembly => floor(id, [
    rect("body", x + 0.02, nz, 0.43, 0.42, 0.43, "wood", 0.06),
    rect("drawer", x + 0.43, nz + 0.04, 0.018, 0.34, 0.13, "white", 0.22),
    round("lamp", x + 0.13, nz + 0.15, 0.12, 0.12, 0.22, "accent", 0.49),
  ], SNUG);
  const wardrobe: Assembly = floor("bedroom-wardrobe", [
    rect("body", w - m - 1.25, m, 1.25, 0.6, 1.62, "white"),
    rect("door-left", w - m - 1.21, m + 0.6, 0.55, 0.025, 1.44, "wood", 0.10),
    rect("door-right", w - m - 0.59, m + 0.6, 0.55, 0.025, 1.44, "wood", 0.10),
  ]);
  return [
    floor("bedroom-bed", bed),
    ...(nightstands
      ? [nightstand("bedroom-nightstand-left", z - 0.47), nightstand("bedroom-nightstand-right", z + bedW + 0.05)]
      : []),
    // Wardrobe in the back corner opposite the bed, only when it leaves room
    // for the door beside it.
    ...(w - 2 * m >= length + 0.6 + 1.25 + 1.0 ? [wardrobe] : []),
    // Split A/C above the headboard, on a wall panel that rises above the
    // 1.05 m wall so it never floats.
    ...(bedW >= 1.2
      ? [overlay("bedroom-wall-ac", [
          rect("wall-panel", m, z + bedW / 2 - 0.56, 0.05, 1.12, 1.36, "white"),
          rect("unit", m + 0.05, z + bedW / 2 - 0.46, 0.22, 0.92, 0.26, "white", 1.02, "ac"),
          rect("louver", m + 0.265, z + bedW / 2 - 0.40, 0.02, 0.80, 0.04, "dark", 1.04),
          rect("display", m + 0.265, z + bedW / 2 + 0.26, 0.012, 0.10, 0.03, "accent", 1.18),
        ])]
      : []),
  ];
}

function kitchen(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  const fridgeX = m + 0.04;
  const counterX = m + 0.90;
  const counterW = Math.min(3.15, Math.max(0, w - counterX - m - 0.04));
  const fridge = floor("kitchen-fridge", [
    rect("body", fridgeX, m + 0.03, 0.68, 0.69, 1.76, "metal", 0, "fridge"),
    rect("door-top", fridgeX + 0.035, m + 0.705, 0.61, 0.018, 0.63, "white", 1.08),
    rect("door-bottom", fridgeX + 0.035, m + 0.705, 0.61, 0.018, 0.94, "white", 0.07),
    rect("handle", fridgeX + 0.08, m + 0.728, 0.025, 0.025, 0.55, "dark", 0.72),
  ], SNUG);
  const counter = floor("kitchen-counter", [
    rect("cabinets", counterX, m + 0.03, counterW, 0.60, 0.87, "white"),
    rect("worktop", counterX - 0.01, m + 0.02, counterW + 0.02, 0.64, 0.065, "wood", 0.87),
    rect("backsplash", counterX, m + 0.04, counterW, 0.028, 0.34, "white", 0.93),
    rect("sink", counterX + counterW * 0.12, m + 0.14, Math.min(0.55, counterW * 0.32), 0.35, 0.014, "metal", 0.935),
    round("tap", counterX + counterW * 0.29, m + 0.12, 0.04, 0.04, 0.30, "metal", 0.94),
    round("hob-left", counterX + counterW * 0.72, m + 0.17, 0.16, 0.16, 0.018, "dark", 0.94),
    round("hob-right", counterX + counterW * 0.85, m + 0.17, 0.16, 0.16, 0.018, "dark", 0.94),
  ]);
  return [
    fridge,
    ...(counterW >= 0.9 ? [counter] : []),
    table("kitchen-island", w / 2 - 0.67, m + 1.45, 1.34, 0.70, 0.87, "wood", 0.7),
    pottedPlant("kitchen-plant", w - m - 0.44, d - m - 0.44, 0.65),
  ];
}

function bathroom(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  const vanity = (x: number, z: number) => floor("bathroom-vanity", [
    rect("cabinet", x, z + 0.10, 0.77, 0.48, 0.69, "wood", 0.15),
    rect("worktop", x, z + 0.09, 0.78, 0.50, 0.055, "white", 0.84),
    round("basin", x + 0.18, z + 0.18, 0.40, 0.29, 0.055, "white", 0.90),
    round("tap", x + 0.38, z + 0.12, 0.035, 0.035, 0.16, "metal", 0.90),
  ], SNUG);
  const toilet = (x: number, z: number) => floor("bathroom-toilet", [
    round("bowl", x, z + 0.09, 0.43, 0.52, 0.39, "white", 0.06),
    round("seat", x + 0.02, z + 0.10, 0.39, 0.46, 0.045, "white", 0.45),
    rect("tank", x + 0.03, z, 0.37, 0.15, 0.49, "white", 0.40),
  ], SNUG);
  // The shower box takes the far end; its glass faces the rest of the room.
  const shower = (x: number, z: number, glassZ: number) => floor("bathroom-shower", [
    rect("tray", x, z, 0.96, 0.96, 0.07, "white"),
    rect("glass", x, glassZ, 0.96, 0.018, 1.56, "glass", 0.07),
    round("shower-head", x + 0.41, z + 0.38, 0.17, 0.17, 0.06, "metal", 1.50),
  ], SNUG);
  const mirror = (x: number) => overlay("bathroom-mirror", [
    rect("mirror", x + 0.13, m + 0.025, 0.50, 0.025, 0.58, "glass", 1.16),
  ]);
  // Sink and toilet share the back wall; the shower goes beside them when
  // the room is wide enough, else at the front (the usual layout of the
  // narrow, ~1.5 m wide Brazilian bathroom). Small half-baths get no shower.
  const items = [vanity(m, m), toilet(Math.min(m + 0.85, w - m - 0.43), m), mirror(m)];
  if (w - 2 * m >= 1.28 + 0.05 + 0.96) items.push(shower(w - m - 0.96, m + 0.05, m + 0.99));
  else if (d - 2 * m >= 0.70 + 0.96) items.push(shower(w - m - 0.96, d - m - 0.96, d - m - 0.96));
  return items;
}

function office(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  const deskW = Math.min(1.70, w - 2 * m - 0.15);
  const dx = (w - deskW) / 2;
  return [
    floor("office-desk", [
      rect("surface", dx, m + 0.08, deskW, 0.69, 0.055, "wood", 0.73, "desk"),
      rect("leg-left", dx + 0.07, m + 0.16, 0.075, 0.55, 0.73, "dark"),
      rect("leg-right", dx + deskW - 0.145, m + 0.16, 0.075, 0.55, 0.73, "dark"),
      rect("screen", dx + deskW / 2 - 0.33, m + 0.12, 0.66, 0.05, 0.38, "dark", 0.89),
      rect("screen-pedestal", dx + deskW / 2 - 0.06, m + 0.14, 0.12, 0.13, 0.12, "metal", 0.79),
      rect("keyboard", dx + deskW / 2 - 0.32, m + 0.48, 0.64, 0.18, 0.025, "white", 0.795),
    ]),
    floor("office-chair", [
      round("seat", w / 2 - 0.26, m + 1.00, 0.52, 0.52, 0.12, "fabric", 0.44),
      rect("back", w / 2 - 0.24, m + 1.43, 0.48, 0.10, 0.56, "dark", 0.47),
      round("pedestal", w / 2 - 0.045, m + 1.22, 0.09, 0.09, 0.45, "metal"),
      round("base", w / 2 - 0.32, m + 1.08, 0.64, 0.34, 0.055, "dark"),
    ], SNUG),
    floor("office-bookshelf", [
      rect("body", m, d - m - 0.42, 1.00, 0.42, 1.65, "wood"),
      rect("shelf-1", m + 0.06, d - m - 0.41, 0.88, 0.39, 0.035, "white", 0.55),
      rect("shelf-2", m + 0.06, d - m - 0.41, 0.88, 0.39, 0.035, "white", 1.08),
    ]),
    pottedPlant("office-plant", w - m - 0.47, d - m - 0.47, 0.72),
  ];
}

function dining(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  const tw = Math.min(1.65, w - 2 * m - 0.30);
  const td = Math.min(1.00, d - 2 * m - 0.95);
  const x = (w - tw) / 2;
  const z = (d - td) / 2;
  const chairs = [
    floor("dining-chair-back", [
      rect("seat", w / 2 - 0.22, z - 0.62, 0.44, 0.43, 0.09, "fabric", 0.42),
      rect("back", w / 2 - 0.22, z - 0.64, 0.44, 0.09, 0.45, "wood", 0.45),
    ], SNUG),
    floor("dining-chair-front", [
      rect("seat", w / 2 - 0.22, z + td + 0.20, 0.44, 0.43, 0.09, "fabric", 0.42),
      rect("back", w / 2 - 0.22, z + td + 0.54, 0.44, 0.09, 0.45, "wood", 0.45),
    ], SNUG),
  ];
  return [
    table("dining-table", x, z, tw, td, 0.74),
    ...chairs,
    pottedPlant("dining-plant", m + 0.03, m + 0.03, 0.82),
    rug("dining-rug", w / 2 - Math.min(1.25, w / 3), d / 2 - Math.min(1.0, d / 3),
      Math.min(2.50, 2 * w / 3), Math.min(2.0, 2 * d / 3)),
  ];
}

function laundry(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  return [
    floor("laundry-washer", [
      rect("body", m + 0.02, m + 0.04, 0.67, 0.65, 0.82, "white", 0.05, "washer"),
      rect("control-strip", m + 0.07, m + 0.66, 0.57, 0.022, 0.11, "dark", 0.73),
      round("drum-door", m + 0.16, m + 0.23, 0.38, 0.38, 0.035, "metal", 0.87),
    ], SNUG),
    floor("laundry-utility-sink", [
      rect("sink-base", m + 0.82, m + 0.04, 0.63, 0.54, 0.78, "white"),
      rect("basin", m + 0.89, m + 0.08, 0.49, 0.40, 0.10, "metal", 0.78),
      round("faucet", m + 1.10, m + 0.07, 0.045, 0.045, 0.23, "metal", 0.88),
    ]),
    floor("laundry-cabinet", [
      rect("body", w - m - 0.91, d - m - 0.39, 0.91, 0.39, 1.55, "wood"),
      rect("shelf", w - m - 0.85, d - m - 0.38, 0.79, 0.37, 0.05, "white", 0.74),
    ]),
  ];
}

/**
 * Miniatura de carro low-poly para a garagem. O veículo é inteiramente
 * decorativo: não é cadastrado como aparelho nem cria consumo energético.
 *
 * Compatível com o gerador V2: Assembly, floor(), rect() e compile().
 * Todos os componentes pertencem à MESMA montagem para permitir que rodas,
 * vidros e acabamento se sobreponham intencionalmente à carroceria.
 */
function garageCar(x: number, z: number, compact: boolean): Assembly {
  const width = compact ? 1.62 : 1.92;
  const length = compact ? 3.40 : 4.16;
  const cabWidth = width - 0.43;
  const cabLength = compact ? 1.36 : 1.74;
  const cabX = x + (width - cabWidth) / 2;
  const cabZ = z + (compact ? 0.88 : 1.14);
  const frontAxle = z + (compact ? 0.58 : 0.70);
  const rearAxle = z + length - (compact ? 0.68 : 0.80);
  const tireLength = compact ? 0.38 : 0.44;
  const tireWidth = 0.23;
  const tireHeight = compact ? 0.40 : 0.45;

  // Visão isométrica: materiais escuros definem os pneus e a grelha;
  // superfícies verdes indicam a carroceria, sem introduzir novas cores.
  const parts: Primitive[] = [
    // Chassi, carroceria e volumes que definem a silhueta.
    rect("undercarriage", x + 0.12, z + 0.15, width - 0.24, length - 0.30, 0.24, "dark", 0.17),
    rect("body", x + 0.10, z + 0.23, width - 0.20, length - 0.46, 0.43, "accent", 0.29),
    rect("hood", x + 0.17, z + 0.30, width - 0.34, compact ? 0.60 : 0.80, 0.08, "accent", 0.72),
    rect("rear-deck", x + 0.17, z + length - (compact ? 0.76 : 0.92), width - 0.34, compact ? 0.46 : 0.59, 0.09, "accent", 0.72),

    // Cabine, janelas e teto. O teto fino deixa a linha de vidro legível.
    rect("cabin-glass", cabX, cabZ, cabWidth, cabLength, 0.43, "glass", 0.76),
    rect("roof", cabX + 0.08, cabZ + 0.17, cabWidth - 0.16, cabLength - 0.34, 0.10, "accent", 1.17),
    rect("windscreen", cabX + 0.07, cabZ - 0.075, cabWidth - 0.14, 0.09, 0.30, "glass", 0.85),
    rect("rear-window", cabX + 0.07, cabZ + cabLength - 0.015, cabWidth - 0.14, 0.09, 0.27, "glass", 0.86),
    rect("left-window", cabX - 0.014, cabZ + 0.23, 0.04, cabLength - 0.46, 0.24, "glass", 0.92),
    rect("right-window", cabX + cabWidth - 0.026, cabZ + 0.23, 0.04, cabLength - 0.46, 0.24, "glass", 0.92),

    // Acabamento da frente e traseira, com faróis contrastantes.
    rect("front-bumper", x + 0.20, z + 0.10, width - 0.40, 0.12, 0.15, "dark", 0.25),
    rect("front-grille", x + width / 2 - 0.29, z + 0.225, 0.58, 0.04, 0.12, "dark", 0.46),
    rect("headlight-left", x + 0.23, z + 0.225, 0.20, 0.065, 0.12, "white", 0.58),
    rect("headlight-right", x + width - 0.43, z + 0.225, 0.20, 0.065, 0.12, "white", 0.58),
    rect("rear-bumper", x + 0.20, z + length - 0.22, width - 0.40, 0.12, 0.15, "dark", 0.25),
    rect("taillight-left", x + 0.23, z + length - 0.29, 0.18, 0.06, 0.11, "metal", 0.58),
    rect("taillight-right", x + width - 0.41, z + length - 0.29, 0.18, 0.06, 0.11, "metal", 0.58),

    // Retrovisores sem ultrapassar a largura total reservada do carro.
    rect("mirror-left", x + 0.02, cabZ + 0.20, 0.16, 0.14, 0.12, "dark", 0.81),
    rect("mirror-right", x + width - 0.18, cabZ + 0.20, 0.16, 0.14, 0.12, "dark", 0.81),
  ];

  // Pneus de perfil baixo e calotas estilizadas. Como o renderizador ainda
  // não rotaciona cilindros, usamos cubos para garantir eixos corretos.
  for (const [side, wheelX] of [
    ["left", x + 0.015],
    ["right", x + width - tireWidth - 0.015],
  ] as const) {
    for (const [axle, wheelZ] of [
      ["front", frontAxle],
      ["rear", rearAxle],
    ] as const) {
      parts.push(
        rect(`tire-${side}-${axle}`, wheelX, wheelZ, tireWidth, tireLength, tireHeight, "dark", 0.035),
        rect(`hub-${side}-${axle}`, wheelX + 0.055, wheelZ + 0.10, tireWidth - 0.11, tireLength - 0.20, 0.08, "metal", 0.48),
      );
    }
  }

  return floor("garage-car", parts);
}

function garageScooter(x: number, z: number): Assembly {
  return floor("garage-scooter", [
    rect("frame", x + 0.10, z + 0.18, 0.36, 1.05, 0.24, "accent", 0.23),
    rect("front-tire", x + 0.06, z + 0.10, 0.43, 0.19, 0.43, "dark", 0.06),
    rect("rear-tire", x + 0.06, z + 1.15, 0.43, 0.19, 0.43, "dark", 0.06),
    rect("seat", x + 0.13, z + 0.68, 0.30, 0.38, 0.12, "dark", 0.49),
    rect("handlebar", x + 0.02, z + 0.16, 0.52, 0.07, 0.08, "metal", 0.93),
    rect("steering-post", x + 0.25, z + 0.17, 0.055, 0.09, 0.50, "metal", 0.44),
  ]);
}

function garage(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  const availableWidth = w - 2 * m;
  const availableDepth = d - 2 * m;
  const assemblies: Assembly[] = [];

  // Prioridade para o carro: mobiliário secundário não pode fazê-lo sumir
  // ao competir pela mesma área da garagem.
  if (availableWidth >= 2.30 && availableDepth >= 4.75) {
    assemblies.push(garageCar((w - 1.92) / 2, Math.max((d - 4.16) / 2, d - m - 4.16 - 0.10), false));
  } else if (availableWidth >= 1.88 && availableDepth >= 3.75) {
    assemblies.push(garageCar((w - 1.62) / 2, Math.max((d - 3.40) / 2, d - m - 3.40 - 0.10), true));
  } else if (availableWidth >= 0.85 && availableDepth >= 1.55) {
    assemblies.push(garageScooter((w - 0.55) / 2, (d - 1.44) / 2));
  }

  // Bancada opcional, sujeita às verificações habituais de colisão.
  if (availableWidth >= 1.65 && availableDepth >= 0.95) {
    assemblies.push(table(
      "garage-workbench",
      m + 0.05,
      m + 0.05,
      Math.min(1.35, availableWidth * 0.49),
      0.55,
      0.86,
    ));
  }
  return assemblies;
}

function outdoor(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  return [
    floor("outdoor-bench", [
      rect("seat", m + 0.30, m + 0.08, 1.45, 0.51, 0.13, "wood", 0.44),
      rect("back", m + 0.30, m + 0.08, 1.45, 0.10, 0.61, "wood", 0.52),
      rect("foot-left", m + 0.43, m + 0.17, 0.11, 0.37, 0.44, "dark"),
      rect("foot-right", m + 1.49, m + 0.17, 0.11, 0.37, 0.44, "dark"),
    ]),
    pottedPlant("outdoor-plant-a", w - m - 0.46, m + 0.06),
    pottedPlant("outdoor-plant-b", m + 0.06, d - m - 0.49, 0.78),
    table("outdoor-side-table", w / 2 - 0.35, d / 2 + 0.25, 0.70, 0.48, 0.52),
  ];
}

function generic(w: number, d: number): Assembly[] {
  const m = CLEARANCE;
  const rw = Math.min(2.3, Math.max(0.4, w - 2 * m - 0.20));
  const rd = Math.min(1.50, Math.max(0.4, d - 2 * m - 0.20));
  return [
    pottedPlant("generic-plant", m + 0.04, m + 0.04, 0.90),
    rug("generic-rug", (w - rw) / 2, (d - rd) / 2, rw, rd),
  ];
}

const aliases: Record<string, string> = {
  sala: "living", "sala de estar": "living", "living-room": "living",
  quarto: "bedroom", "quarto de dormir": "bedroom", suíte: "suite", suite: "suite",
  cozinha: "kitchen", banheiro: "bathroom", escritório: "office", escritorio: "office",
  lavanderia: "laundry", "área de serviço": "laundry", "area de servico": "laundry",
  garagem: "garage", varanda: "balcony", quintal: "outdoor", jardim: "outdoor",
  jantar: "dining", "sala de jantar": "dining", "dining-room": "dining",
};

/** Public entrypoint used by FloorPlan3D.tsx. Dimensions are in metres. */
export const furnitureFor = (type: string, width: number, depth: number): FurniturePiece[] => {
  if (!finitePositive(width) || !finitePositive(depth)) return [];
  // Existing API expects canonical English room types; aliases are optional
  // compatibility for old or imported room records.
  const raw = (type || "").trim().toLocaleLowerCase("pt-BR");
  const kind = aliases[raw] ?? raw;
  const assemblies = kind === "living" ? living(width, depth)
    : kind === "bedroom" ? bedroom(width, depth, false)
    : kind === "suite" ? bedroom(width, depth, true)
    : kind === "kitchen" ? kitchen(width, depth)
    : kind === "bathroom" ? bathroom(width, depth)
    : kind === "office" ? office(width, depth)
    : kind === "dining" ? dining(width, depth)
    : kind === "laundry" ? laundry(width, depth)
    : kind === "garage" ? garage(width, depth)
    : kind === "outdoor" || kind === "balcony" ? outdoor(width, depth)
    : generic(width, depth);
  return compile(assemblies, width, depth);
};
