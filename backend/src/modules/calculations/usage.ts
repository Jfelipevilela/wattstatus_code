// Pure arithmetic shared by API and UI; no locale, network or persistence here.
export const cyclesInMonth = (monthly?: number, weekly?: number) => weekly == null ? (monthly ?? 0) : weekly * 52 / 12;
export const powerTimeKWh = (powerW: number, hours: number, days: number, standbyW = 0) =>
  (powerW * hours + standbyW * Math.max(0, 24 - hours)) * days / 1000;
