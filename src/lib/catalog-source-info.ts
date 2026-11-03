import type { CatalogSource, EnergyProfile } from "../../backend/src/modules/catalog/catalog.types";
import { normalizeEnergyProfile } from "../../backend/src/modules/catalog/reference";

const readableUrl = (reference: string) => {
  try {
    const url = new URL(reference);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    if (/\.(?:csv|json|xml|xlsx?|zip|pdf)(?:$|\/)/i.test(url.pathname) || /(?:export|download|attachment)/i.test(url.pathname + url.search)) return undefined;
    return url.href;
  } catch { return undefined; }
};

export function catalogSourceInfo(source: CatalogSource, profile: EnergyProfile) {
  const normalized = normalizeEnergyProfile(profile);
  const period = normalized.method === "REFERENCE_PERIOD" ? { YEAR: "anual", MONTH: "mensal", DAY: "diário" }[normalized.period] : undefined;
  const labels: Record<string, string> = {
    value: period ? `Consumo ${period} de referência` : "Consumo de referência",
    typicalPowerW: "Potência em funcionamento", standbyPowerW: "Potência em espera", energyPerCycleKwh: "Consumo por ciclo",
  };
  const metrics = Object.keys(source.metrics || {}).filter(key => Object.prototype.hasOwnProperty.call(labels, key)).map(key => labels[key]);
  let url = readableUrl(source.reference);
  if (source.type === "ENERGY_STAR") {
    // A human-readable dataset page replaces the CSV export used internally by the importer.
    const dataset = source.reference.match(/^https:\/\/data\.energystar\.gov\/api\/v3\/views\/([a-z0-9]{4}-[a-z0-9]{4})\/export\.csv(?:\?.*)?$/i);
    url = dataset ? `https://data.energystar.gov/d/${dataset[1]}` : url || "https://www.energystar.gov/productfinder/";
  } else if (source.type === "PBE") {
    url ||= "https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem/tabelas-de-eficiencia-energetica";
  } else if (source.type === "EPREL") url ||= "https://eprel.ec.europa.eu/";
  const entries = Object.entries(source.metrics || {}).filter(([key]) => Object.prototype.hasOwnProperty.call(labels, key)).map(([key, reference]) => {
    const dataset = reference.match(/^https:\/\/data\.energystar\.gov\/api\/v3\/views\/([a-z0-9]{4}-[a-z0-9]{4})\/export\.csv(?:\?.*)?$/i);
    const metricUrl = reference === source.reference ? url : dataset ? `https://data.energystar.gov/d/${dataset[1]}` : readableUrl(reference);
    return { label: labels[key], url: metricUrl, complementary: reference !== source.reference };
  });
  return { metrics, url, entries };
}
