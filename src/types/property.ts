import { ROOM_PALETTE } from "@/components/floorplan/tokens";

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
  // Present on list responses.
  roomCount?: number;
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

// A room's own color, else a palette tint by its order in the property.
export const roomColor = (room: Pick<Room, "color" | "sortOrder">) =>
  room.color || ROOM_PALETTE[Math.abs(room.sortOrder) % ROOM_PALETTE.length];

const TYPE_HINTS: Array<[RegExp, string]> = [
  [/su[ií]te/, "suite"],
  [/quarto|dormit/, "bedroom"],
  [/cozinha|copa/, "kitchen"],
  [/banheiro|lavabo|wc/, "bathroom"],
  [/escrit[oó]rio|home office|estudo/, "office"],
  [/lavanderia|área de servi[cç]o|area de servi[cç]o/, "laundry"],
  [/garagem/, "garage"],
  [/varanda|sacada|terra[cç]o/, "balcony"],
  [/quintal|piscina|jardim|área externa|area externa|churrasq/, "outdoor"],
  [/corredor|hall/, "hallway"],
  [/sala|living|estar/, "living"],
];

// Room type suggested by a free-form name, e.g. "Quarto do João" -> bedroom.
export const inferRoomType = (name: string) => {
  const text = name.toLowerCase();
  return TYPE_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
};
