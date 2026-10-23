import { z } from "zod";

const name = z.string().trim().min(1, "Informe um nome.").max(80);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").nullable().optional();
const icon = z.string().regex(/^[a-z0-9-]{1,32}$/, "Ícone inválido").nullable().optional();
const timezone = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário inválido");

export const propertyInputSchema = z.object({
  name,
  type: z.enum(["house", "apartment", "commercial", "other"]).default("house"),
  city: optionalText(80),
  state: z.string().trim().length(2).toUpperCase().nullable().optional(),
  country: optionalText(56),
  address: optionalText(160),
  description: optionalText(280),
  icon,
  color,
  timezone: timezone.default("America/Sao_Paulo"),
  tariffState: z.string().trim().length(2).toUpperCase().nullable().optional(),
  tariffValue: z.number().finite().positive().max(10).nullable().optional(),
});

export const propertyUpdateSchema = propertyInputSchema.partial().extend({
  isPrimary: z.literal(true).optional(),
  archived: z.boolean().optional(),
});

export const floorInputSchema = z.object({
  name,
  level: z.number().int().min(-5).max(100).default(0),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});
export const floorUpdateSchema = floorInputSchema.partial();

// Plan coordinates are in metres on a 0..200 grid; sizes stay realistic.
export const layoutSchema = z.object({
  x: z.number().finite().min(0).max(200),
  y: z.number().finite().min(0).max(200),
  width: z.number().finite().min(1).max(40),
  depth: z.number().finite().min(1).max(40),
});

export const roomInputSchema = z.object({
  name,
  type: z.string().trim().min(1).max(32).default("other"),
  floorId: z.string().uuid().optional(),
  icon,
  color,
  sortOrder: z.number().int().min(0).max(1000).optional(),
  layout: layoutSchema.nullable().optional(),
});
export const roomUpdateSchema = roomInputSchema.partial();

export const roomDeleteSchema = z.object({
  moveAppliancesTo: z.string().uuid().nullable().optional(),
});

export const propertyDeleteSchema = z.object({
  moveAppliancesTo: z.string().uuid().optional(),
});

export const layoutUpdateSchema = z.object({
  rooms: z
    .array(z.object({ id: z.string().uuid(), floorId: z.string().uuid().optional(), layout: layoutSchema }))
    .max(200),
});

export const energyQuerySchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  roomId: z.string().uuid().optional(),
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type PropertyUpdate = z.infer<typeof propertyUpdateSchema>;
export type FloorInput = z.infer<typeof floorInputSchema>;
export type RoomInput = z.infer<typeof roomInputSchema>;
