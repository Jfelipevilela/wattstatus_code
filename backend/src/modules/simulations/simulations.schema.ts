import { z } from "zod";
import { catalogIdSchema } from "../catalog/catalog.schema";

export const simulationUsageSchema = z.object({
  power: z.number().finite().min(0).max(100000).optional(),
  usageHours: z.number().finite().min(0).max(24).optional(),
  days: z.number().int().min(1).max(31).optional(),
  cyclesPerMonth: z.number().int().min(0).max(1000).optional(),
  cyclesPerWeek: z.number().int().min(0).max(230).optional(),
  standbyEnabled: z.boolean().optional(),
  estimateByUsage: z.boolean().optional(),
}).strict().refine(usage => usage.cyclesPerMonth === undefined || usage.cyclesPerWeek === undefined,
  "Escolha ciclos por semana ou por mês, sem misturar as frequências.");

export const simulationItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  source: z.enum(["USER_APPLIANCE", "CATALOG"]),
  userApplianceId: z.string().uuid().optional(),
  catalogDeviceId: catalogIdSchema.optional(),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  quantity: z.number().int().min(1).max(1000),
  usage: simulationUsageSchema.optional(),
}).strict().refine(item => item.source === "USER_APPLIANCE"
  ? Boolean(item.userApplianceId) && item.catalogDeviceId === undefined
  : Boolean(item.catalogDeviceId) && item.userApplianceId === undefined,
"Selecione uma única origem válida para cada aparelho.");

export const simulationCalculationSchema = z.object({
  sourcePropertyId: z.string().uuid().optional(),
  sourceRoomId: z.string().uuid().optional(),
  tariffPerKwh: z.number().finite().min(0).max(100000),
  items: z.array(simulationItemSchema).max(100),
}).strict().superRefine((input, context) => {
  if (Boolean(input.sourcePropertyId) !== Boolean(input.sourceRoomId)) {
    context.addIssue({ code: "custom", message: "Informe o imóvel e o ambiente de origem juntos." });
  }
  if (new Set(input.items.map(item => item.id)).size !== input.items.length) {
    context.addIssue({ code: "custom", message: "Cada item precisa de um identificador próprio." });
  }
});

export const simulationResolveSchema = z.object({ catalogDeviceId: catalogIdSchema }).strict();
export const simulationRoomParamsSchema = z.object({ propertyId: z.string().uuid(), roomId: z.string().uuid() });
