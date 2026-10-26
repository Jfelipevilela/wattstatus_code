import { createHash } from "crypto";
import { catalogDeviceSchema } from "./catalog.schema";
import type { CatalogDevice, CatalogSource, EnergyProfile } from "./catalog.types";
import { normalizeEnergyProfile } from "./reference";
import { identityText } from "./import/normalizer";

const sourceKey = (source: CatalogSource) => `${source.type}:${source.externalId || source.reference}`;
export const catalogFingerprint = (row: CatalogDevice) => {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key, item]) => !["retrievedAt", "lastSeenAt", "verifiedAt"].includes(key) && item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  };
  return createHash("sha256").update(JSON.stringify(stable(row))).digest("hex");
};
const rank = (profile: EnergyProfile) => profile.method === "REFERENCE_PERIOD" ? 0 : profile.method === "PER_CYCLE" ? 1 : 2;
const sourceRank = (source: CatalogSource, region: string) => source.type === "PBE" && region === "BR" ? 0 : source.type === "MANUFACTURER" ? 1 : source.type === "ENERGY_STAR" ? 2 : source.type === "EPREL" ? 3 : 4;
export const canonicalCatalogId = (row: CatalogDevice) => row.equivalence && row.verified && !row.isGeneric && row.variant?.voltage
  ? `product-${createHash("sha256").update(JSON.stringify([row.equivalence.key, identityText(row.brand), identityText(row.model), row.region,
      row.variant.voltage, row.variant.identifier || null])).digest("hex").slice(0, 32)}` : row.id;

export function resolveCatalog(records: CatalogDevice[]): CatalogDevice[] {
  const groups = new Map<string, CatalogDevice[]>();
  for (const row of records) {
    const id = canonicalCatalogId(row); const group = groups.get(id) || []; group.push(row); groups.set(id, group);
  }
  return [...groups].map(([id, rows]) => {
    if (rows.length === 1) return { ...rows[0], id };
    const first = rows[0];
    if (!first.equivalence || rows.some(row => !row.verified || row.isGeneric || !row.equivalence ||
      row.equivalence.key !== first.equivalence!.key || row.category !== first.category ||
      row.region !== first.region || identityText(row.brand) !== identityText(first.brand) || identityText(row.model) !== identityText(first.model) ||
      !row.variant?.voltage || row.variant.voltage !== first.variant?.voltage || row.variant.identifier !== first.variant?.identifier)) {
      throw new Error("EQUIVALENCE_UNPROVEN");
    }
    type Evidence = { profile: EnergyProfile; source: CatalogSource };
    const bySource = new Map<string, Evidence[]>();
    for (const row of rows) {
      const replacement = new Map<string, Evidence[]>();
      for (const entry of row.profiles || [{ profile: row.energyProfile, source: row.source }]) {
        const key = sourceKey(entry.source), group = replacement.get(key) || [];
        group.push({ profile: normalizeEnergyProfile(entry.profile), source: entry.source }); replacement.set(key, group);
      }
      for (const [key, entries] of replacement) bySource.set(key, entries);
    }
    const profiles = [...bySource.values()].flat().sort((a, b) => rank(a.profile) - rank(b.profile) || sourceRank(a.source, first.region) - sourceRank(b.source, first.region));
    const selected = profiles[0]; let profile = selected.profile;
    // Equally ranked sources disagreeing about a metric require review, not an order-dependent winner.
    for (const [index, entry] of profiles.entries()) for (const other of profiles.slice(index + 1)) {
      if (rank(entry.profile) !== rank(other.profile) || sourceRank(entry.source, first.region) !== sourceRank(other.source, first.region)) continue;
      for (const key of ["value", "unit", "period", "energyPerCycleKwh", "typicalPowerW", "standbyPowerW"] as const) {
        const left = (entry.profile as unknown as Record<string, unknown>)[key];
        const right = (other.profile as unknown as Record<string, unknown>)[key];
        if (left !== undefined && right !== undefined && left !== right) throw new Error("METRIC_CONFLICT_REQUIRES_REVIEW");
      }
    }
    const metricUrls = { ...selected.source.metrics };
    if (profile.method === "POWER_TIME") {
      const operating = profiles.find(entry => entry.profile.method === "POWER_TIME" && entry.profile.typicalPowerW !== undefined);
      const standby = profiles.find(entry => entry.profile.method === "POWER_TIME" && entry.profile.standbyPowerW !== undefined);
      profile = { ...profile, typicalPowerW: operating?.profile.method === "POWER_TIME" ? operating.profile.typicalPowerW : undefined,
        standbyPowerW: standby?.profile.method === "POWER_TIME" ? standby.profile.standbyPowerW : undefined };
      if (operating) metricUrls.typicalPowerW = operating.source.metrics?.typicalPowerW || operating.source.reference;
      if (standby) metricUrls.standbyPowerW = standby.source.metrics?.standbyPowerW || standby.source.reference;
    }
    return catalogDeviceSchema.parse({ ...first, ...rows[rows.length - 1], id,
      energyProfile: profile, source: { ...selected.source, metrics: metricUrls },
      sources: [...new Map(profiles.map(entry => [sourceKey(entry.source), entry.source])).values()], profiles });
  });
}
