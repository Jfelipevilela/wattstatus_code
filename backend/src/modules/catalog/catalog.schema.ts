import { z } from "zod";

export const energyProfileSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("POWER_TIME"),
      typicalPowerW: z.number().finite().positive().max(100000).optional(),
      standbyPowerW: z.number().finite().nonnegative().max(100000).optional(),
      measurementType: z.literal("ESTIMATED").optional(),
    })
    .strict(),
  z
    .object({
      method: z.literal("REFERENCE_PERIOD"),
      value: z.number().finite().nonnegative().max(100000),
      unit: z.literal("kWh"),
      period: z.enum(["DAY", "MONTH", "YEAR"]),
      measurementType: z.literal("ESTIMATED").optional(),
      testBasis: z.string().max(500).optional(),
    }).strict(),
  z
    .object({
      method: z.literal("REFERENCE_MONTHLY"),
      referenceMonthlyKwh: z.number().finite().nonnegative().max(100000),
    })
    .strict(),
  z
    .object({
      method: z.literal("PER_CYCLE"),
      energyPerCycleKwh: z.number().finite().nonnegative().max(10000),
      measurementType: z.literal("ESTIMATED").optional(),
    })
    .strict(),
]);
export const catalogIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/);
export const catalogDeviceSchema = z
  .object({
    id: catalogIdSchema,
    category: catalogIdSchema,
    subcategory: z.string().trim().min(1).max(80),
    brand: z.string().trim().min(1).max(80).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    displayName: z.string().trim().min(2).max(160),
    aliases: z.array(z.string().max(80)).max(30),
    energyProfile: energyProfileSchema,
    source: z
      .object({
        type: z.enum([
          "PBE",
          "ENERGY_STAR",
          "MANUFACTURER",
          "WATTSTATUS_GENERIC",
        ]),
        reference: z.string().min(1).max(1000),
        verifiedAt: z.string().datetime(),
        externalId: z.string().min(1).max(200).optional(),
        registrationNumber: z.string().max(100).optional(),
        sourceVersion: z.string().min(1).max(100).optional(),
        retrievedAt: z.string().datetime().optional(),
        lastSeenAt: z.string().datetime().optional(),
        official: z.boolean().optional(),
        manufacturer: z.string().min(1).max(80).optional(),
        metrics: z.record(z.enum(["value", "typicalPowerW", "standbyPowerW", "energyPerCycleKwh"]), z.string().url().max(1000).refine(value => {
          const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password;
        })).optional(),
      })
      .strict(),
    region: z.string().regex(/^[A-Z]{2}$/),
    verified: z.boolean(),
    isGeneric: z.boolean(),
    active: z.boolean().optional(),
    variant: z.object({ voltage: z.number().finite().positive().max(1000).optional(), identifier: z.string().max(120).optional() }).strict().optional(),
    specifications: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/).refine(value => !["constructor", "prototype", "__proto__"].includes(value)), z.union([z.string().max(200), z.number().finite()])).refine(value => Object.keys(value).length <= 30).optional(),
  })
  .strict()
  .superRefine((device, context) => {
    if (
      device.isGeneric &&
      (device.verified || device.source.type !== "WATTSTATUS_GENERIC")
    ) {
      context.addIssue({
        code: "custom",
        message: "Perfil genérico não pode ser especificação oficial.",
      });
    }
    if (
      device.source.type !== "WATTSTATUS_GENERIC" &&
      !/^https:\/\//.test(device.source.reference)
    ) {
      context.addIssue({
        code: "custom",
        message: "Fonte externa exige referência HTTPS.",
      });
    }
  });
const filter = z.string().trim().min(1).max(120);
export const catalogQuerySchema = z
  .object({
    search: z.string().trim().max(120).optional(),
    category: catalogIdSchema.optional(),
    subcategory: filter.optional(),
    brand: filter.optional(),
    model: filter.optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(12),
  })
  .strict();
export const catalogSeedSchema = z
  .object({
    version: z.number().int().positive(),
    categories: z
      .array(
        z
          .object({
            id: catalogIdSchema,
            name: z.string().min(1),
            icon: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    devices: z.array(catalogDeviceSchema).min(1),
  })
  .superRefine((seed, context) => {
    const categories = new Set(seed.categories.map((row) => row.id));
    if (
      categories.size !== seed.categories.length ||
      new Set(seed.devices.map((row) => row.id)).size !== seed.devices.length ||
      seed.devices.some((row) => !categories.has(row.category))
    ) {
      context.addIssue({
        code: "custom",
        message: "IDs duplicados ou categoria inexistente no seed.",
      });
    }
  });

// Indexed literal tokens, never a user-supplied regular expression or Mongo operator.
export const catalogTokens = (value: string) =>
  [
    ...new Set(
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .match(/[a-z0-9]+/g) || [],
    ),
  ].slice(0, 100);
