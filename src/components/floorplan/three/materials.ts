import { Color, MeshStandardMaterial } from "three";
import type { FurnitureFinish } from "./furniture";

// One shared material per look. Rooms never create their own materials
// except heat-map floors, which are cached by colour. Everything is flat
// colour with tuned roughness: no textures to download.

export type FloorFinish = "wood" | "tile" | "concrete" | "deck";

export const FLOOR_FINISH: Record<string, FloorFinish> = {
  living: "wood",
  bedroom: "wood",
  suite: "wood",
  office: "wood",
  hallway: "wood",
  kitchen: "tile",
  bathroom: "tile",
  laundry: "tile",
  garage: "concrete",
  balcony: "deck",
  outdoor: "deck",
  other: "wood",
};

const cache = new Map<string, MeshStandardMaterial>();

const material = (key: string, create: () => MeshStandardMaterial) => {
  let value = cache.get(key);
  if (!value) {
    value = create();
    cache.set(key, value);
  }
  return value;
};

const FLOOR_COLORS: Record<FloorFinish, string> = {
  wood: "#d9b48a",
  tile: "#e7ecef",
  concrete: "#c8c9cc",
  deck: "#b88a5c",
};

export const floorMaterial = (finish: FloorFinish, state: "normal" | "selected" | "dimmed" = "normal") =>
  material(`floor:${finish}:${state}`, () => {
    const base = new MeshStandardMaterial({
      color: FLOOR_COLORS[finish],
      roughness: finish === "tile" ? 0.45 : 0.8,
      metalness: 0,
    });
    if (state === "selected") {
      base.emissive = new Color("#00C853");
      base.emissiveIntensity = 0.18;
    }
    if (state === "dimmed") {
      base.transparent = true;
      base.opacity = 0.55;
    }
    return base;
  });

export const heatFloorMaterial = (color: string, state: "normal" | "selected" | "dimmed" = "normal") =>
  material(`heat:${color}:${state}`, () => {
    const base = new MeshStandardMaterial({ color, roughness: 0.6 });
    if (state === "selected") {
      base.emissive = new Color("#ffffff");
      base.emissiveIntensity = 0.12;
    }
    if (state === "dimmed") {
      base.transparent = true;
      base.opacity = 0.6;
    }
    return base;
  });

export const wallMaterial = (dark: boolean, dimmed = false) =>
  material(`wall:${dark}:${dimmed}`, () =>
    new MeshStandardMaterial({
      color: dark ? "#e9e7e2" : "#fbfaf7",
      roughness: 0.9,
      transparent: dimmed,
      opacity: dimmed ? 0.45 : 1,
    }),
  );

export const wallCapMaterial = () => material("wall-cap", () => new MeshStandardMaterial({ color: "#3f3f46", roughness: 0.7 }));

export const plateMaterial = (dark: boolean) =>
  material(`plate:${dark}`, () => new MeshStandardMaterial({ color: dark ? "#2a2d33" : "#e6e8e4", roughness: 1 }));

const FURNITURE: Record<FurnitureFinish, { color: string; roughness: number; metalness?: number; opacity?: number }> = {
  fabric: { color: "#7c8aa0", roughness: 1 },
  wood: { color: "#a0724b", roughness: 0.75 },
  white: { color: "#f4f4f2", roughness: 0.55 },
  dark: { color: "#2b2f36", roughness: 0.5 },
  metal: { color: "#c3c8cf", roughness: 0.3, metalness: 0.4 },
  glass: { color: "#bfe3f2", roughness: 0.1, opacity: 0.35 },
  accent: { color: "#9fd9b4", roughness: 1 },
  plant: { color: "#3f8f5b", roughness: 0.9 },
};

export const furnitureMaterial = (finish: FurnitureFinish, dimmed = false) =>
  material(`furniture:${finish}:${dimmed}`, () => {
    const spec = FURNITURE[finish];
    const opacity = (spec.opacity ?? 1) * (dimmed ? 0.5 : 1);
    return new MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness ?? 0,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
  });

// Releases every cached material, e.g. when the 3D view unmounts.
export const disposeMaterials = () => {
  for (const value of cache.values()) value.dispose();
  cache.clear();
};
