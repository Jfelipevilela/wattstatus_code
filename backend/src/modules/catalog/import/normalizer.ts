// Locale is declared by each adapter; ambiguous separators are not guessed.
export const decimal = (input: unknown, locale: "BR" | "US" = "BR") => {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") throw new Error("NUMBER_REQUIRED");
  let value = input.trim();
  const pattern = locale === "BR" ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/ : /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/;
  if (!pattern.test(value)) throw new Error("NUMBER_FORMAT");
  if (locale === "BR") value = value.replace(/\./g, "").replace(",", ".");
  else value = value.replace(/,/g, "");
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("NUMBER_INVALID");
  return result;
};
export const text = (input: unknown) => typeof input === "string" ? input.normalize("NFC").trim().replace(/\s+/g, " ") : "";
export const identityText = (input: unknown) => text(input).toLocaleUpperCase("en-US");

export function normalizeRawRecord(input: unknown, locale: "BR" | "US") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("OBJECT_REQUIRED");
  const row = structuredClone(input) as Record<string, unknown>;
  if (row.energyProfile && typeof row.energyProfile === "object" && !Array.isArray(row.energyProfile)) {
    const profile = row.energyProfile as Record<string, unknown>;
    const periods: Record<string, string> = { dia: "DAY", day: "DAY", mes: "MONTH", mês: "MONTH", month: "MONTH", ano: "YEAR", year: "YEAR" };
    if (profile.method === "REFERENCE_PERIOD") {
      const combined = typeof profile.value === "string" && profile.value.trim().match(/^(-?[\d.,]+)\s+kWh\/(dia|day|mês|mes|month|ano|year)$/i);
      if (combined) {
        const period = periods[combined[2].toLowerCase()];
        if (profile.period && profile.period !== period) throw new Error("PERIOD_CONFLICT");
        profile.value = combined[1]; profile.unit = "kWh"; profile.period = period;
      }
    }
    for (const key of ["value", "referenceMonthlyKwh", "typicalPowerW", "standbyPowerW", "energyPerCycleKwh"]) {
      if (profile[key] !== undefined) profile[key] = decimal(profile[key], locale);
    }
  }
  if (row.variant && typeof row.variant === "object") {
    const variant = row.variant as Record<string, unknown>;
    if (variant.voltage !== undefined) variant.voltage = decimal(typeof variant.voltage === "string" ? variant.voltage.replace(/\s*V$/i, "") : variant.voltage, locale);
  }
  if (row.specifications && typeof row.specifications === "object") {
    const specifications = row.specifications as Record<string, unknown>;
    if (specifications.capacityBtuH !== undefined) specifications.capacityBtuH = decimal(typeof specifications.capacityBtuH === "string"
      ? specifications.capacityBtuH.replace(/\s*BTU(?:\/h)?$/i, "") : specifications.capacityBtuH, locale);
  }
  return row;
}
