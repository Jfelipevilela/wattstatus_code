import { z } from "zod";
import { catalogIdSchema, energyProfileSchema } from "../catalog/catalog.schema";

export const applianceInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  power: z.number().finite().nonnegative().max(100000),
  usageHours: z.number().finite().min(0).max(24),
  days: z.number().int().min(1).max(31),
  tariff: z.string().min(2),
  tariffValue: z.number().finite().positive().optional(),
  measuredConsumptionKWh: z.number().finite().nonnegative().optional(),
  integrationProvider: z.literal("smartthings").optional(),
  integrationDeviceId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  catalogDeviceId: catalogIdSchema.optional(),
  energyProfile: energyProfileSchema.optional(),
  cyclesPerMonth: z.number().int().min(0).max(1000).optional(),
  room: z.string().trim().max(80).optional(),
  propertyId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
});

export const applianceUpdateSchema = applianceInputSchema.partial();

export type ApplianceInput = z.infer<typeof applianceInputSchema>;
