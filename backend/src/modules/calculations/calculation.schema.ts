import { z } from "zod";
import { energyProfileSchema } from "../catalog/catalog.schema";

export const calculationSchema = z.object({
  name: z.string().optional(),
  power: z.number().finite().min(0).max(100000),
  usageHours: z.number().finite().min(0).max(24),
  days: z.number().int().min(1).max(31),
  tariff: z.string().min(2),
  tariffValue: z.number().finite().positive().optional(),
  measuredConsumptionKWh: z.number().positive().optional(),
  energyProfile: energyProfileSchema.optional(),
  cyclesPerMonth: z.number().int().min(0).max(1000).optional(),
});

export type CalculationSchema = z.infer<typeof calculationSchema>;
