export type PropertyType = "house" | "apartment" | "commercial" | "other";

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  timezone: string;
  isPrimary: boolean;
  tariffState?: string | null;
  tariffValue?: number | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface Floor {
  id: string;
  propertyId: string;
  name: string;
  level: number;
  sortOrder: number;
}

export interface RoomLayout {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface Room {
  id: string;
  propertyId: string;
  floorId: string;
  name: string;
  type: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  layout?: RoomLayout | null;
}

export const PROPERTY_TYPES: Record<PropertyType, string> = {
  house: "Casa",
  apartment: "Apartamento",
  commercial: "Comércio",
  other: "Outro",
};

export const ROOM_TYPES: Record<string, string> = {
  living: "Sala",
  kitchen: "Cozinha",
  bedroom: "Quarto",
  suite: "Suíte",
  bathroom: "Banheiro",
  office: "Escritório",
  laundry: "Lavanderia",
  garage: "Garagem",
  balcony: "Varanda",
  outdoor: "Área externa",
  hallway: "Corredor",
  other: "Outro",
};

// Soft floor tints per room type, readable in both themes.
export const ROOM_COLORS: Record<string, string> = {
  living: "#86efac",
  kitchen: "#fde68a",
  bedroom: "#a5b4fc",
  suite: "#c4b5fd",
  bathroom: "#99f6e4",
  office: "#93c5fd",
  laundry: "#bae6fd",
  garage: "#d4d4d8",
  balcony: "#fbcfe8",
  outdoor: "#bbf7d0",
  hallway: "#e4e4e7",
  other: "#e5e7eb",
};

export const roomColor = (room: Pick<Room, "type" | "color">) => room.color || ROOM_COLORS[room.type] || ROOM_COLORS.other;
