import type { FurnitureFinish, FurniturePiece } from "./furniture";
import { AirVent, Bath, Cpu, Fan, Flame, Lightbulb, Microwave, Monitor, Refrigerator, Tv, WashingMachine } from "lucide-react";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { normalizeSearch } from "@/lib/energy";
import { WALL_THICKNESS } from "./walls";

// 3D models for the user's registered appliances. Unlike decorative
// furniture, these come from real records: every appliance in a room gets a
// low-poly model, unless the room's decoration already has the same object
// (the living-room TV, the kitchen fridge, the bedroom A/C), which is then
// used as that appliance instead of adding a second one.

export type ApplianceKind =
  | "ac"
  | "tv"
  | "fridge"
  | "freezer"
  | "microwave"
  | "oven"
  | "washer"
  | "computer"
  | "console"
  | "shower"
  | "heater"
  | "fan"
  | "lamp"
  | "router"
  | "charger"
  | "generic";

const KIND_RULES: Array<[RegExp, ApplianceKind]> = [
  [/\bar\b|ar[- ]condicionado|condicionad|split|climatiz/, "ac"],
  [/\btv\b|televis|crystal|qled|oled|smart tv/, "tv"],
  [/freezer|congelador/, "freezer"],
  [/geladeira|refrigerador|frigobar/, "fridge"],
  [/micro[- ]?ondas|airfryer|air fryer|fritadeira|cafeteira|torradeira|sanduicheira|liquidificador/, "microwave"],
  [/forno|fogao|fogão|cooktop/, "oven"],
  [/lavar|lavadora|secadora|lava[- ]lou/, "washer"],
  [/computador|notebook|\bpc\b|monitor|desktop|impressora/, "computer"],
  [/videogame|video game|playstation|xbox|console|nintendo|som|soundbar|caixa de som/, "console"],
  [/chuveiro|ducha|banheira|aquecedor de agua|aquecedor de água|boiler/, "shower"],
  [/aquecedor|ferro de passar|secador/, "heater"],
  [/ventilador|circulador|exaustor/, "fan"],
  [/lampada|lâmpada|luz|led|luminaria|luminária|abajur|ilumina/, "lamp"],
  [/roteador|modem|wi-?fi|repetidor/, "router"],
  [/carregador|wallbox|veiculo eletrico|veículo elétrico/, "charger"],
];

const normalize = (name: string) => name.toLowerCase().normalize("NFC");

// Extra spellings seen in real records ("Arcondicionado", "Split 12000 BTUs").
const EXTRA_RULES: Array<[RegExp, ApplianceKind]> = [[/\bbtu|\binverter\b|\ba\/c\b|\bac\b|arcondicionado/, "ac"]];

// The badge icon comes from applianceVisual; when the name rules above do not
// recognise an appliance, the icon's category decides, so the model always
// matches the icon the user sees.
const ICON_KIND = new Map<unknown, ApplianceKind>([
  [AirVent, "ac"],
  [Tv, "tv"],
  [Refrigerator, "fridge"],
  [Bath, "shower"],
  [WashingMachine, "washer"],
  [Microwave, "microwave"],
  [Flame, "oven"],
  [Lightbulb, "lamp"],
  [Fan, "fan"],
  [Cpu, "computer"],
  [Monitor, "computer"],
]);

export const applianceKind = (name: string): ApplianceKind => {
  const text = normalize(name);
  const plain = normalizeSearch(name);
  return (
    KIND_RULES.find(([pattern]) => pattern.test(text) || pattern.test(plain))?.[1] ??
    EXTRA_RULES.find(([pattern]) => pattern.test(plain))?.[1] ??
    ICON_KIND.get(applianceVisual(name).icon) ??
    "generic"
  );
};

// Decorative furniture that already represents a kind (see furniture.ts anchors).
const DECOR_ANCHOR: Partial<Record<ApplianceKind, string>> = {
  ac: "ac",
  tv: "tv",
  fridge: "fridge",
  computer: "desk",
  washer: "washer",
};

// Wall models get a wall panel behind them, at least as tall as the model's
// walls (1.05 m) and rising above them for units mounted higher, so they read
// as fixed to the wall and never float.
type Mount = "floor" | "wall";
const PANEL_THICKNESS = 0.05;
const PANEL_HEIGHT = 1.05;
// Below half the spacing between models, so neighbouring panels never meet.
const PANEL_MARGIN = 0.03;
// Free depth wanted in front of a wall model before it settles above furniture.
const CLEAR_FRONT = 0.7;
interface Part {
  name: string;
  x: number; // min corner, relative to the model footprint
  z: number;
  w: number;
  d: number;
  h: number;
  y0?: number;
  finish: FurnitureFinish;
  shape?: "box" | "cylinder";
}
interface Model {
  mount: Mount;
  w: number; // footprint along x
  d: number; // footprint along z (depth from the back wall)
  parts: Part[];
  // Height of the badge above the floor.
  top: number;
}

const MODELS: Record<ApplianceKind, Model> = {
  ac: {
    mount: "wall",
    w: 0.92,
    d: 0.24,
    top: 1.6,
    parts: [
      { name: "unit", x: 0, z: 0, w: 0.92, d: 0.22, h: 0.26, y0: 1.02, finish: "white" },
      { name: "louver", x: 0.06, z: 0.215, w: 0.8, d: 0.02, h: 0.04, y0: 1.04, finish: "dark" },
      { name: "display", x: 0.72, z: 0.215, w: 0.1, d: 0.012, h: 0.03, y0: 1.18, finish: "accent" },
    ],
  },
  charger: {
    mount: "wall",
    w: 0.32,
    d: 0.16,
    top: 1.2,
    parts: [
      { name: "box", x: 0, z: 0, w: 0.32, d: 0.14, h: 0.38, y0: 0.55, finish: "white" },
      { name: "led", x: 0.12, z: 0.14, w: 0.08, d: 0.012, h: 0.02, y0: 0.82, finish: "accent" },
    ],
  },
  shower: {
    mount: "wall",
    w: 0.4,
    d: 0.32,
    top: 1.35,
    parts: [
      { name: "pipe", x: 0.17, z: 0.0, w: 0.05, d: 0.05, h: 0.45, y0: 0.55, finish: "metal", shape: "cylinder" },
      { name: "arm", x: 0.17, z: 0.0, w: 0.05, d: 0.28, h: 0.04, y0: 0.98, finish: "metal" },
      { name: "head", x: 0.05, z: 0.1, w: 0.3, d: 0.22, h: 0.06, y0: 0.92, finish: "metal", shape: "cylinder" },
    ],
  },
  tv: {
    mount: "floor",
    w: 1.2,
    d: 0.42,
    top: 1.35,
    parts: [
      { name: "rack", x: 0, z: 0, w: 1.2, d: 0.42, h: 0.42, finish: "wood" },
      { name: "screen", x: 0.08, z: 0.12, w: 1.04, d: 0.05, h: 0.62, y0: 0.5, finish: "dark" },
      { name: "foot", x: 0.52, z: 0.1, w: 0.16, d: 0.14, h: 0.08, y0: 0.42, finish: "metal" },
    ],
  },
  fridge: {
    mount: "floor",
    w: 0.7,
    d: 0.7,
    top: 2.05,
    parts: [
      { name: "body", x: 0, z: 0, w: 0.7, d: 0.68, h: 1.75, finish: "metal" },
      { name: "split", x: 0.03, z: 0.675, w: 0.64, d: 0.02, h: 0.02, y0: 1.08, finish: "dark" },
      { name: "handle", x: 0.08, z: 0.68, w: 0.03, d: 0.03, h: 0.5, y0: 0.7, finish: "dark" },
    ],
  },
  freezer: {
    mount: "floor",
    w: 1.0,
    d: 0.62,
    top: 1.15,
    parts: [
      { name: "body", x: 0, z: 0, w: 1.0, d: 0.62, h: 0.84, finish: "white" },
      { name: "lid", x: 0, z: 0, w: 1.0, d: 0.62, h: 0.05, y0: 0.84, finish: "metal" },
    ],
  },
  microwave: {
    mount: "floor",
    w: 0.62,
    d: 0.52,
    top: 1.45,
    parts: [
      { name: "cabinet", x: 0, z: 0, w: 0.62, d: 0.52, h: 0.86, finish: "white" },
      { name: "worktop", x: 0, z: 0, w: 0.62, d: 0.54, h: 0.04, y0: 0.86, finish: "wood" },
      { name: "device", x: 0.06, z: 0.08, w: 0.5, d: 0.36, h: 0.29, y0: 0.9, finish: "dark" },
      { name: "window", x: 0.1, z: 0.44, w: 0.3, d: 0.01, h: 0.18, y0: 0.95, finish: "glass" },
    ],
  },
  oven: {
    mount: "floor",
    w: 0.62,
    d: 0.6,
    top: 1.25,
    parts: [
      { name: "body", x: 0, z: 0, w: 0.62, d: 0.6, h: 0.86, finish: "metal" },
      { name: "door", x: 0.06, z: 0.59, w: 0.5, d: 0.015, h: 0.4, y0: 0.15, finish: "glass" },
      { name: "hob", x: 0.06, z: 0.08, w: 0.5, d: 0.44, h: 0.02, y0: 0.86, finish: "dark" },
    ],
  },
  washer: {
    mount: "floor",
    w: 0.62,
    d: 0.62,
    top: 1.2,
    parts: [
      { name: "body", x: 0, z: 0, w: 0.62, d: 0.6, h: 0.85, finish: "white" },
      { name: "drum", x: 0.14, z: 0.6, w: 0.34, d: 0.02, h: 0.34, y0: 0.25, finish: "glass" },
      { name: "panel", x: 0.04, z: 0.6, w: 0.54, d: 0.02, h: 0.08, y0: 0.72, finish: "dark" },
    ],
  },
  computer: {
    mount: "floor",
    w: 1.0,
    d: 0.58,
    top: 1.45,
    parts: [
      { name: "top", x: 0, z: 0, w: 1.0, d: 0.56, h: 0.05, y0: 0.7, finish: "wood" },
      { name: "leg-l", x: 0.05, z: 0.05, w: 0.06, d: 0.46, h: 0.7, finish: "dark" },
      { name: "leg-r", x: 0.89, z: 0.05, w: 0.06, d: 0.46, h: 0.7, finish: "dark" },
      { name: "monitor", x: 0.25, z: 0.08, w: 0.5, d: 0.04, h: 0.32, y0: 0.82, finish: "dark" },
      { name: "stand", x: 0.46, z: 0.1, w: 0.08, d: 0.08, h: 0.08, y0: 0.75, finish: "metal" },
      { name: "keyboard", x: 0.27, z: 0.3, w: 0.46, d: 0.14, h: 0.02, y0: 0.75, finish: "white" },
    ],
  },
  console: {
    mount: "floor",
    w: 0.8,
    d: 0.4,
    top: 0.95,
    parts: [
      { name: "stand", x: 0, z: 0, w: 0.8, d: 0.4, h: 0.45, finish: "wood" },
      { name: "device", x: 0.15, z: 0.08, w: 0.5, d: 0.26, h: 0.08, y0: 0.45, finish: "dark" },
    ],
  },
  heater: {
    mount: "floor",
    w: 0.45,
    d: 0.3,
    top: 1.0,
    parts: [
      { name: "body", x: 0, z: 0, w: 0.45, d: 0.25, h: 0.6, y0: 0.05, finish: "white" },
      { name: "grill", x: 0.05, z: 0.25, w: 0.35, d: 0.02, h: 0.4, y0: 0.12, finish: "accent" },
      { name: "feet", x: 0.03, z: 0.0, w: 0.39, d: 0.3, h: 0.05, finish: "dark" },
    ],
  },
  fan: {
    mount: "floor",
    w: 0.45,
    d: 0.45,
    top: 1.55,
    parts: [
      { name: "base", x: 0, z: 0, w: 0.45, d: 0.45, h: 0.05, finish: "dark", shape: "cylinder" },
      { name: "pole", x: 0.2, z: 0.2, w: 0.05, d: 0.05, h: 1.0, y0: 0.05, finish: "metal", shape: "cylinder" },
      { name: "head", x: 0.05, z: 0.15, w: 0.35, d: 0.14, h: 0.35, y0: 1.0, finish: "white", shape: "cylinder" },
    ],
  },
  lamp: {
    mount: "floor",
    w: 0.36,
    d: 0.36,
    top: 1.75,
    parts: [
      { name: "base", x: 0.06, z: 0.06, w: 0.24, d: 0.24, h: 0.03, finish: "dark", shape: "cylinder" },
      { name: "pole", x: 0.16, z: 0.16, w: 0.04, d: 0.04, h: 1.15, y0: 0.03, finish: "metal", shape: "cylinder" },
      { name: "shade", x: 0, z: 0, w: 0.36, d: 0.36, h: 0.28, y0: 1.18, finish: "white", shape: "cylinder" },
    ],
  },
  router: {
    mount: "floor",
    w: 0.4,
    d: 0.35,
    top: 0.95,
    parts: [
      { name: "stand", x: 0, z: 0, w: 0.4, d: 0.35, h: 0.55, finish: "wood" },
      { name: "device", x: 0.08, z: 0.08, w: 0.24, d: 0.16, h: 0.05, y0: 0.55, finish: "dark" },
      { name: "antenna", x: 0.28, z: 0.1, w: 0.02, d: 0.02, h: 0.18, y0: 0.6, finish: "dark", shape: "cylinder" },
    ],
  },
  generic: {
    mount: "floor",
    w: 0.5,
    d: 0.45,
    top: 1.05,
    parts: [
      { name: "stand", x: 0, z: 0, w: 0.5, d: 0.45, h: 0.6, finish: "wood" },
      { name: "device", x: 0.1, z: 0.1, w: 0.3, d: 0.25, h: 0.18, y0: 0.6, finish: "white" },
    ],
  },
};

const MARGIN = WALL_THICKNESS / 2 + 0.06;
const STEP = 0.1;
const GAP = 0.08;

type Rect = { x: number; z: number; w: number; d: number };
// A footprint plus the heights it occupies. Two boxes clash only when they
// overlap in plan and in height, so a wall A/C can sit above a low sofa.
type Box = Rect & { y0: number; y1: number };
const clash = (a: Box, b: Box) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.z < b.z + b.d + GAP && b.z < a.z + a.d + GAP && a.y0 < b.y1 && b.y0 < a.y1;

// Space taken by decorative furniture: whole objects, ignoring flat rugs.
const occupied = (pieces: FurniturePiece[]): Box[] => {
  const units = new Map<string, FurniturePiece[]>();
  for (const piece of pieces) {
    const id = piece.key.split("/")[0];
    units.set(id, [...(units.get(id) ?? []), piece]);
  }
  const boxes: Box[] = [];
  for (const parts of units.values()) {
    const x = Math.min(...parts.map((p) => p.x - p.size[0] / 2));
    const z = Math.min(...parts.map((p) => p.z - p.size[2] / 2));
    const y0 = Math.min(...parts.map((p) => p.y - p.size[1] / 2));
    const y1 = Math.max(...parts.map((p) => p.y + p.size[1] / 2));
    if (y1 - y0 < 0.05 && y1 < 0.1) continue; // rugs
    boxes.push({
      x,
      z,
      w: Math.max(...parts.map((p) => p.x + p.size[0] / 2)) - x,
      d: Math.max(...parts.map((p) => p.z + p.size[2] / 2)) - z,
      y0,
      y1,
    });
  }
  return boxes;
};

const heights = (model: Model) => ({
  y0: Math.min(...model.parts.map((part) => part.y0 ?? 0)),
  y1: Math.max(...model.parts.map((part) => (part.y0 ?? 0) + part.h)),
});

export interface PlacedAppliance {
  applianceId: string;
  kind: ApplianceKind;
  // Pieces in room-local coordinates; empty when the decoration stands in.
  pieces: FurniturePiece[];
  // Room-local badge position, or null when no room was left for the model.
  badge: [number, number, number] | null;
  // Decorative anchor used instead of a model, if any.
  decorAnchor: string | null;
}

// Places a model for every appliance, scanning the room from the back wall
// forward for the first free spot. Deterministic: the same appliances in the
// same room always land in the same place. Nothing crosses walls, furniture
// or other appliances; an appliance without room keeps only its badge.
export const placeAppliances = (
  appliances: Array<{ id: string; name: string }>,
  furniture: FurniturePiece[],
  width: number,
  depth: number,
): PlacedAppliance[] => {
  const taken = occupied(furniture);
  const decorAnchors = new Set(furniture.map((piece) => piece.anchor).filter(Boolean) as string[]);
  const usedAnchors = new Set<string>();
  const result: PlacedAppliance[] = [];
  for (const appliance of appliances) {
    const kind = applianceKind(appliance.name);
    const anchor = DECOR_ANCHOR[kind];
    if (anchor && decorAnchors.has(anchor) && !usedAnchors.has(anchor)) {
      usedAnchors.add(anchor);
      result.push({ applianceId: appliance.id, kind, pieces: [], badge: null, decorAnchor: anchor });
      continue;
    }
    const model = MODELS[kind];
    const { y0, y1 } = heights(model);
    let spot: Box | null = null;
    // Wall models scan the back wall; floor models scan the room from the
    // back wall forward. The first free spot wins, so placement is stable.
    const rows = model.mount === "wall" ? [MARGIN] : [];
    if (model.mount === "floor") for (let z = MARGIN; z + model.d <= depth - MARGIN + 1e-6; z += STEP) rows.push(z);
    // Wall models first look for a stretch of wall with nothing standing in
    // front of it, so a desk or bench never seems to run through the unit;
    // only then do they settle above lower furniture.
    const passes = model.mount === "wall" ? [CLEAR_FRONT, 0] : [0];
    for (const front of passes) {
      for (const z of rows) {
        for (let x = MARGIN; x + model.w <= width - MARGIN + 1e-6 && !spot; x += STEP) {
          const candidate = { x, z, w: model.w, d: model.d, y0, y1 };
          const reach = { ...candidate, d: Math.max(model.d, front), y0: front ? 0 : y0 };
          if (!taken.some((box) => clash(reach, box))) spot = candidate;
        }
        if (spot) break;
      }
      if (spot) break;
    }
    if (!spot) {
      result.push({ applianceId: appliance.id, kind, pieces: [], badge: null, decorAnchor: null });
      continue;
    }
    taken.push(spot);
    // Behind wall models, against the wall's inner face, slightly wider than
    // the model but never past the side walls.
    const panelX0 = Math.max(WALL_THICKNESS / 2, spot.x - PANEL_MARGIN);
    const panelX1 = Math.min(width - WALL_THICKNESS / 2, spot.x + model.w + PANEL_MARGIN);
    const panelHeight = Math.max(PANEL_HEIGHT, ...model.parts.map((part) => (part.y0 ?? 0) + part.h + 0.06));
    if (model.mount === "wall") {
      taken.push({ x: panelX0, z: spot.z - PANEL_THICKNESS, w: panelX1 - panelX0, d: PANEL_THICKNESS, y0: 0, y1: panelHeight });
    }
    const parts =
      model.mount === "wall"
        ? [
            ...model.parts,
            {
              name: "wall-panel",
              x: panelX0 - spot.x,
              z: -PANEL_THICKNESS,
              w: panelX1 - panelX0,
              d: PANEL_THICKNESS,
              h: panelHeight,
              finish: "white" as const,
            },
          ]
        : model.parts;
    const pieces = parts.map((part) => ({
      key: `appliance-${appliance.id}/${part.name}`,
      shape: part.shape ?? "box",
      x: spot!.x + part.x + part.w / 2,
      y: (part.y0 ?? 0) + part.h / 2,
      z: spot!.z + part.z + part.d / 2,
      size: [part.w, part.h, part.d] as [number, number, number],
      finish: part.finish,
    }));
    result.push({
      applianceId: appliance.id,
      kind,
      pieces,
      badge: [spot.x + model.w / 2, model.top, spot.z + model.d / 2],
      decorAnchor: null,
    });
  }
  return result;
};
