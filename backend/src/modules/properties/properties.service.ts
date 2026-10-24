import { randomUUID } from "crypto";
import { ApiError } from "../../middleware/error-handler";
import { STATE_TARIFFS } from "../../config/tariffs";
import type {
  ApplianceRecord,
  FloorRecord,
  PropertyRecord,
  RoomLayout,
  RoomRecord,
} from "../../types";
import type { EnergyInterval } from "../energy/energy-history";
import type { FloorInput, PropertyInput, PropertyUpdate, RoomInput } from "./properties.schema";

export interface PropertyRepository {
  listProperties(userId: string): Promise<PropertyRecord[]>;
  insertProperty(record: PropertyRecord): Promise<void>;
  updateProperty(userId: string, id: string, patch: Partial<PropertyRecord>): Promise<PropertyRecord | null>;
  setPrimaryProperty(userId: string, id: string): Promise<void>;
  deleteProperty(userId: string, id: string): Promise<boolean>;
  listFloors(userId: string, propertyId: string): Promise<FloorRecord[]>;
  insertFloor(record: FloorRecord): Promise<void>;
  updateFloor(userId: string, id: string, patch: Partial<FloorRecord>): Promise<FloorRecord | null>;
  deleteFloors(userId: string, propertyId: string, floorId?: string): Promise<void>;
  listRooms(userId: string, propertyId: string): Promise<RoomRecord[]>;
  insertRoom(record: RoomRecord): Promise<void>;
  updateRoom(userId: string, id: string, patch: Partial<RoomRecord>): Promise<RoomRecord | null>;
  deleteRooms(userId: string, propertyId: string, roomId?: string): Promise<void>;
  // Room totals per property in a single query, for the property list.
  countRoomsByProperty(userId: string): Promise<Record<string, number>>;
  listAppliances(userId: string): Promise<ApplianceRecord[]>;
  // Moves appliances matching the filter; only ever touches the user's records.
  moveAppliances(
    userId: string,
    filter: { propertyId?: string | null; roomId?: string; unassignedOnly?: boolean },
    target: { propertyId: string; roomId: string | null },
  ): Promise<number>;
  getEnergyHistory(userId: string, start: Date, end: Date): Promise<EnergyInterval[]>;
}

export const DEFAULT_PROPERTY_NAME = "Meu imóvel";
export const DEFAULT_FLOOR_NAME = "Térreo";
// Rows wrap at 12 m so auto-placed rooms form a compact, house-like block.
const PLAN_WIDTH = 12;

const ROOM_SIZES: Record<string, [number, number]> = {
  living: [6, 5],
  kitchen: [4, 4],
  bedroom: [4, 4],
  suite: [5, 4],
  bathroom: [3, 2],
  office: [3, 3],
  laundry: [3, 2],
  garage: [5, 6],
  balcony: [4, 2],
  outdoor: [6, 4],
  hallway: [4, 1],
  other: [4, 3],
};

const overlaps = (a: RoomLayout, b: RoomLayout) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth;

// First free slot scanning rows then columns, so the same rooms always land in
// the same place and existing rooms never move when a new one is added.
export const autoPlaceRoom = (type: string, existing: RoomLayout[]): RoomLayout => {
  const [width, depth] = ROOM_SIZES[type] ?? ROOM_SIZES.other;
  for (let y = 0; y <= 200 - depth; y++) {
    for (let x = 0; x <= PLAN_WIDTH - width; x++) {
      const candidate = { x, y, width, depth };
      if (!existing.some((room) => overlaps(candidate, room))) return candidate;
    }
  }
  return { x: 0, y: 0, width, depth };
};

const daysIn = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

// Same formula as the frontend estimate: per-appliance cost with its own
// tariff, then summed. Never an average tariff.
export const estimateMonthly = (appliance: ApplianceRecord, daysInMonth: number) => {
  const consumption = (appliance.power * appliance.usageHours * Math.min(appliance.days, daysInMonth)) / 1000;
  const rate =
    appliance.tariffValue ??
    (appliance.monthlyConsumption > 0 ? appliance.monthlyCost / appliance.monthlyConsumption : STATE_TARIFFS[appliance.tariff] ?? 0);
  return { consumption, cost: consumption * rate };
};

export class PropertyService {
  constructor(private repo: PropertyRepository) {}

  private now() {
    return new Date().toISOString();
  }

  private async createFloor(userId: string, propertyId: string, input: Partial<FloorInput> = {}) {
    const floors = await this.repo.listFloors(userId, propertyId);
    const record: FloorRecord = {
      id: randomUUID(),
      userId,
      propertyId,
      name: input.name ?? DEFAULT_FLOOR_NAME,
      level: input.level ?? 0,
      sortOrder: input.sortOrder ?? floors.length,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.repo.insertFloor(record);
    return record;
  }

  // Every user gets a default property; legacy appliances without a property
  // are attached to the primary one. Idempotent and never deletes anything.
  async ensureDefault(userId: string) {
    let properties = await this.repo.listProperties(userId);
    if (properties.length === 0) {
      const record: PropertyRecord = {
        id: randomUUID(),
        userId,
        name: DEFAULT_PROPERTY_NAME,
        type: "house",
        timezone: "America/Sao_Paulo",
        isPrimary: true,
        legacyDefault: true,
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      try {
        await this.repo.insertProperty(record);
        await this.createFloor(userId, record.id);
      } catch (err) {
        // A concurrent request created it first (unique legacyDefault index).
        if (!(err instanceof Error && /E11000|DUPLICATE/.test(err.message))) throw err;
      }
      properties = await this.repo.listProperties(userId);
    }
    const primary = properties.find((item) => item.isPrimary && !item.archivedAt) ?? properties.find((item) => !item.archivedAt);
    if (primary) {
      await this.repo.moveAppliances(userId, { propertyId: null }, { propertyId: primary.id, roomId: null });
      // Moving appliances does not touch properties: re-read only when the primary flag changed.
      if (!primary.isPrimary) {
        await this.repo.setPrimaryProperty(userId, primary.id);
        return this.repo.listProperties(userId);
      }
    }
    return properties;
  }

  async list(userId: string, includeArchived = false) {
    const properties = await this.ensureDefault(userId);
    return properties.filter((item) => includeArchived || !item.archivedAt);
  }

  async listWithStats(userId: string, includeArchived = false) {
    const [properties, rooms] = await Promise.all([
      this.list(userId, includeArchived),
      this.repo.countRoomsByProperty(userId),
    ]);
    return properties.map((property) => ({ ...property, roomCount: rooms[property.id] ?? 0 }));
  }

  async get(userId: string, id: string) {
    const property = (await this.repo.listProperties(userId)).find((item) => item.id === id);
    if (!property) throw new ApiError(404, "Imóvel não encontrado");
    return property;
  }

  private async activeProperty(userId: string, id: string) {
    const property = await this.get(userId, id);
    if (property.archivedAt) throw new ApiError(409, "Imóvel arquivado");
    return property;
  }

  async create(userId: string, input: PropertyInput) {
    const existing = await this.list(userId);
    const record: PropertyRecord = {
      id: randomUUID(),
      userId,
      ...input,
      isPrimary: existing.length === 0,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.repo.insertProperty(record);
    await this.createFloor(userId, record.id);
    return record;
  }

  async update(userId: string, id: string, input: PropertyUpdate) {
    const property = await this.get(userId, id);
    const { isPrimary, archived, ...fields } = input;
    if (archived === true && !property.archivedAt) {
      const others = (await this.repo.listProperties(userId)).filter((item) => item.id !== id && !item.archivedAt);
      if (others.length === 0) throw new ApiError(409, "Mantenha pelo menos um imóvel ativo");
      // Archived properties leave every total; their appliances would vanish
      // from the consolidated view, so they must be moved first.
      if ((await this.repo.listAppliances(userId)).some((item) => item.propertyId === id)) {
        throw new ApiError(409, "Mova os aparelhos deste imóvel antes de arquivá-lo");
      }
      await this.repo.updateProperty(userId, id, { archivedAt: this.now(), isPrimary: false, updatedAt: this.now() });
      if (property.isPrimary) await this.repo.setPrimaryProperty(userId, others[0].id);
    } else if (archived === false && property.archivedAt) {
      await this.repo.updateProperty(userId, id, { archivedAt: null, updatedAt: this.now() });
    }
    if (isPrimary) {
      if (property.archivedAt && archived !== false) throw new ApiError(409, "Imóvel arquivado");
      await this.repo.setPrimaryProperty(userId, id);
    }
    if (Object.keys(fields).length > 0) {
      await this.repo.updateProperty(userId, id, { ...fields, updatedAt: this.now() });
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string, moveAppliancesTo?: string) {
    const property = await this.get(userId, id);
    const all = await this.repo.listProperties(userId);
    const remaining = all.filter((item) => item.id !== id && !item.archivedAt);
    if (remaining.length === 0) throw new ApiError(409, "Mantenha pelo menos um imóvel ativo");
    const appliances = (await this.repo.listAppliances(userId)).filter((item) => item.propertyId === id);
    if (appliances.length > 0) {
      if (!moveAppliancesTo) {
        throw new ApiError(409, "Este imóvel tem aparelhos. Escolha para onde movê-los antes de excluir.");
      }
      if (moveAppliancesTo === id) throw new ApiError(400, "Escolha outro imóvel");
      await this.activeProperty(userId, moveAppliancesTo);
      await this.repo.moveAppliances(userId, { propertyId: id }, { propertyId: moveAppliancesTo, roomId: null });
    }
    await this.repo.deleteRooms(userId, id);
    await this.repo.deleteFloors(userId, id);
    await this.repo.deleteProperty(userId, id);
    if (property.isPrimary) await this.repo.setPrimaryProperty(userId, remaining[0].id);
    return true;
  }

  // Floors
  async listFloors(userId: string, propertyId: string) {
    await this.get(userId, propertyId);
    return (await this.repo.listFloors(userId, propertyId)).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async addFloor(userId: string, propertyId: string, input: FloorInput) {
    await this.activeProperty(userId, propertyId);
    return this.createFloor(userId, propertyId, input);
  }

  private async ownedFloor(userId: string, propertyId: string, floorId: string) {
    const floor = (await this.repo.listFloors(userId, propertyId)).find((item) => item.id === floorId);
    if (!floor) throw new ApiError(404, "Pavimento não encontrado neste imóvel");
    return floor;
  }

  async updateFloor(userId: string, propertyId: string, floorId: string, input: Partial<FloorInput>) {
    await this.activeProperty(userId, propertyId);
    await this.ownedFloor(userId, propertyId, floorId);
    return this.repo.updateFloor(userId, floorId, { ...input, updatedAt: this.now() });
  }

  async removeFloor(userId: string, propertyId: string, floorId: string) {
    await this.activeProperty(userId, propertyId);
    await this.ownedFloor(userId, propertyId, floorId);
    const floors = await this.repo.listFloors(userId, propertyId);
    if (floors.length <= 1) throw new ApiError(409, "O imóvel precisa de pelo menos um pavimento");
    const rooms = (await this.repo.listRooms(userId, propertyId)).filter((room) => room.floorId === floorId);
    if (rooms.length > 0) throw new ApiError(409, "Mova ou exclua os ambientes deste pavimento antes");
    await this.repo.deleteFloors(userId, propertyId, floorId);
    return true;
  }

  // Rooms
  async listRooms(userId: string, propertyId: string) {
    await this.get(userId, propertyId);
    return (await this.repo.listRooms(userId, propertyId)).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getRoom(userId: string, propertyId: string, roomId: string) {
    const room = (await this.repo.listRooms(userId, propertyId)).find((item) => item.id === roomId);
    if (!room) throw new ApiError(404, "Ambiente não encontrado neste imóvel");
    return room;
  }

  async addRoom(userId: string, propertyId: string, input: RoomInput) {
    await this.activeProperty(userId, propertyId);
    const floors = await this.listFloors(userId, propertyId);
    const floorId = input.floorId ?? floors[0]?.id ?? (await this.createFloor(userId, propertyId)).id;
    await this.ownedFloor(userId, propertyId, floorId);
    const rooms = await this.repo.listRooms(userId, propertyId);
    const sameFloor = rooms.filter((room) => room.floorId === floorId && room.layout);
    const record: RoomRecord = {
      id: randomUUID(),
      userId,
      propertyId,
      floorId,
      name: input.name,
      type: input.type ?? "other",
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? rooms.length,
      layout: input.layout ?? autoPlaceRoom(input.type ?? "other", sameFloor.map((room) => room.layout!)),
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    await this.repo.insertRoom(record);
    return record;
  }

  async updateRoom(userId: string, propertyId: string, roomId: string, input: Partial<RoomInput>) {
    await this.activeProperty(userId, propertyId);
    await this.getRoom(userId, propertyId, roomId);
    if (input.floorId) await this.ownedFloor(userId, propertyId, input.floorId);
    return this.repo.updateRoom(userId, roomId, { ...input, updatedAt: this.now() });
  }

  async removeRoom(userId: string, propertyId: string, roomId: string, moveTo?: string | null) {
    await this.activeProperty(userId, propertyId);
    await this.getRoom(userId, propertyId, roomId);
    if (moveTo) {
      if (moveTo === roomId) throw new ApiError(400, "Escolha outro ambiente");
      await this.getRoom(userId, propertyId, moveTo);
    }
    // Appliances and their measurement history stay; they only lose the room.
    await this.repo.moveAppliances(userId, { propertyId, roomId }, { propertyId, roomId: moveTo ?? null });
    await this.repo.deleteRooms(userId, propertyId, roomId);
    return true;
  }

  async saveLayout(userId: string, propertyId: string, rooms: Array<{ id: string; floorId?: string; layout: RoomLayout }>) {
    await this.activeProperty(userId, propertyId);
    const owned = new Map((await this.repo.listRooms(userId, propertyId)).map((room) => [room.id, room]));
    const floors = new Set((await this.repo.listFloors(userId, propertyId)).map((floor) => floor.id));
    for (const item of rooms) {
      if (!owned.has(item.id)) throw new ApiError(404, "Ambiente não encontrado neste imóvel");
      if (item.floorId && !floors.has(item.floorId)) throw new ApiError(404, "Pavimento não encontrado neste imóvel");
      if (item.layout.x + item.layout.width > 200 || item.layout.y + item.layout.depth > 200) {
        throw new ApiError(400, "Ambiente fora da área da planta");
      }
    }
    for (const item of rooms) {
      await this.repo.updateRoom(userId, item.id, {
        layout: item.layout,
        ...(item.floorId ? { floorId: item.floorId } : {}),
        updatedAt: this.now(),
      });
    }
    return this.listRooms(userId, propertyId);
  }

  // Validates the property/room pair an appliance is being assigned to.
  async resolvePlacement(userId: string, propertyId: string | null | undefined, roomId: string | null | undefined) {
    const properties = await this.list(userId);
    const property = propertyId
      ? properties.find((item) => item.id === propertyId)
      : properties.find((item) => item.isPrimary) ?? properties[0];
    if (!property) throw new ApiError(404, "Imóvel não encontrado");
    if (roomId) await this.getRoom(userId, property.id, roomId);
    return { propertyId: property.id, roomId: roomId ?? null };
  }

  async summary(userId: string, propertyId: string, at = new Date()) {
    const property = await this.get(userId, propertyId);
    const [floors, rooms, appliances] = await Promise.all([
      this.listFloors(userId, propertyId),
      this.listRooms(userId, propertyId),
      this.repo.listAppliances(userId),
    ]);
    const days = daysIn(at);
    const own = appliances.filter((item) => item.propertyId === propertyId);
    const roomIds = new Set(rooms.map((room) => room.id));
    const byRoom = new Map<string | null, { estimatedKWh: number; estimatedCost: number; applianceCount: number }>();
    for (const appliance of own) {
      const key = appliance.roomId && roomIds.has(appliance.roomId) ? appliance.roomId : null;
      const entry = byRoom.get(key) ?? { estimatedKWh: 0, estimatedCost: 0, applianceCount: 0 };
      const estimate = estimateMonthly(appliance, days);
      entry.estimatedKWh += estimate.consumption;
      entry.estimatedCost += estimate.cost;
      entry.applianceCount += 1;
      byRoom.set(key, entry);
    }
    const totals = [...byRoom.values()].reduce(
      (sum, entry) => ({
        estimatedKWh: sum.estimatedKWh + entry.estimatedKWh,
        estimatedCost: sum.estimatedCost + entry.estimatedCost,
        applianceCount: sum.applianceCount + entry.applianceCount,
      }),
      { estimatedKWh: 0, estimatedCost: 0, applianceCount: 0 },
    );
    return {
      property,
      floors,
      rooms: rooms.map((room) => ({ ...room, ...(byRoom.get(room.id) ?? { estimatedKWh: 0, estimatedCost: 0, applianceCount: 0 }) })),
      unassigned: byRoom.get(null) ?? { estimatedKWh: 0, estimatedCost: 0, applianceCount: 0 },
      totals: { ...totals, roomCount: rooms.length },
    };
  }

  // Measured intervals located in this property at capture time. Intervals
  // captured before locations were recorded are reported apart, never guessed.
  async energy(userId: string, propertyId: string, start: Date, end: Date, roomId?: string) {
    await this.get(userId, propertyId);
    if (roomId) await this.getRoom(userId, propertyId, roomId);
    const intervals = await this.repo.getEnergyHistory(userId, start, end);
    const located = intervals.filter(
      (item) => item.propertyId === propertyId && (!roomId || item.roomId === roomId),
    );
    const unlocated = intervals.filter((item) => !item.propertyId);
    return {
      intervals: located,
      unlocated: {
        count: unlocated.length,
        consumptionKWh: unlocated.reduce((sum, item) => sum + item.consumptionKWh, 0),
      },
    };
  }
}
