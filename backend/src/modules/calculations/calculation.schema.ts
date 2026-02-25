import { z } from "zod";

export const calculationSchema = z.object({
  name: z.string().optional(),
  power: z.number().positive(),
  usageHours: z.number().positive(),
  days: z.number().int().min(1).max(31),
  tariff: z.string().min(2),
  measuredConsumptionKWh: z.number().positive().optional(),
});

export type CalculationSchema = z.infer<typeof calculationSchema>;
