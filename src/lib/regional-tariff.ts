import { STATE_TARIFFS } from "./energy";

type Point = number[];
type Polygon = Point[][];
interface Boundaries {
  features: Array<{ properties: { codarea: string }; geometry: { type: string; coordinates: Polygon | Polygon[] } }>;
}
export interface RegionalTariff { state: string; region: string; rate: number }
const STATES: Record<string, string> = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA",
  31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
};
const REGIONS: Record<string, string> = { 1: "Norte", 2: "Nordeste", 3: "Sudeste", 4: "Sul", 5: "Centro-Oeste" };

const inRing = (x: number, y: number, ring: Point[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPolygon = (x: number, y: number, polygon: Polygon) => polygon.length > 0
  && inRing(x, y, polygon[0]) && !polygon.slice(1).some((hole) => inRing(x, y, hole));

/** IBGE boundaries are static public data; the user's coordinates stay in this function. */
export function identifyState(latitude: number, longitude: number, data: Boundaries): string | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
  for (const feature of data.features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates as Polygon]
      : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates as Polygon[] : [];
    if (polygons.some((polygon) => inPolygon(longitude, latitude, polygon))) return STATES[feature.properties.codarea];
  }
}

export async function locateRegionalTariff(deps: {
  geolocation?: Pick<Geolocation, "getCurrentPosition">;
  fetch: typeof fetch;
}): Promise<RegionalTariff> {
  if (!deps.geolocation) throw new Error("Localização indisponível neste navegador. Escolha o estado e a tarifa manualmente.");
  const point = await new Promise<GeolocationPosition>((resolve, reject) => {
    deps.geolocation.getCurrentPosition(resolve, (error) => reject(new Error(error.code === 1
      ? "Localização não autorizada. Você pode informar a tarifa manualmente."
      : "Não foi possível identificar sua região. Informe a tarifa manualmente.")),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
  if (!Number.isFinite(point.coords.accuracy) || point.coords.accuracy > 50000) {
    throw new Error("Localização pouco precisa para sugerir um estado. Escolha a tarifa manualmente.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    // Constant same-origin URL, without coordinates, credentials or third-party geocoding.
    const response = await deps.fetch("/geography/br-uf.json", { signal: controller.signal, credentials: "omit" });
    if (!response.ok) throw new Error("Não foi possível carregar a referência da região. Informe a tarifa manualmente.");
    const data: Boundaries = await response.json();
    if (!Array.isArray(data.features) || data.features.length !== 27) throw new Error("Referência de região indisponível.");
    const state = identifyState(point.coords.latitude, point.coords.longitude, data);
    if (!state || STATE_TARIFFS[state] === undefined) throw new Error("Não foi identificado um estado no Brasil. Informe sua tarifa manualmente.");
    const code = Object.keys(STATES).find((id) => STATES[id] === state)!;
    return { state, region: REGIONS[code[0]], rate: STATE_TARIFFS[state] };
  } finally { clearTimeout(timeout); }
}
