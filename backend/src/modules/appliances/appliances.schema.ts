import { z } from "zod";

export const applianceInputSchema = z.object({
  name: z.string().min(2),
  power: z.number().positive(),
  usageHours: z.number().positive(),
  days: z.number().int().min(1).max(31),
  tariff: z.string().min(2),
  measuredConsumptionKWh: z.number().positive().optional(),
  integrationProvider: z.string().optional(),
  integrationDeviceId: z.string().optional(),
});

export const applianceUpdateSchema = applianceInputSchema.partial();

export type ApplianceInput = z.infer<typeof applianceInputSchema>;
