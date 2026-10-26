import type { CatalogDevice } from "../../backend/src/modules/catalog/catalog.types";

// Names reviewed against the exact manufacturer model and market. Never match by prefix.
const manufacturerDescriptions = [
  {
    brand: "SAMSUNG", model: "QN115QN90FF", region: "US",
    title: 'Smart TV Samsung Vision AI 115" Neo QLED 4K QN90F',
    url: "https://www.samsung.com/us/tvs/neo-qled/115-class-neo-qled-4k-tv-qn90f-sku-qn115qn90ffxza/",
  },
  {
    brand: "SAMSUNG", model: "QN115QN90FGXZD", region: "BR",
    title: 'Smart TV Samsung Vision AI 115" Neo QLED 4K QN90F',
    url: "https://www.samsung.com/br/tvs/qled-tv/qn90f-115-inch-neo-qled-4k-mini-led-smart-tv-qn115qn90fgxzd/",
  },
] as const;

const number = (value: number, digits = 2) => value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const positive = (value: unknown, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= maximum;
const label = (labels: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : undefined;
const technologyLabels: Record<string, string> = { "QD-LED (QLED)": "QLED", "OLED": "OLED", "LCD": "LCD", "TFT-LCD": "LCD" };
const installationLabels: Record<string, string> = { Window: "Instalação em janela", "Through the Wall": "Instalação através da parede" };
const refrigerationLabels: Record<string, string> = {
  "Upright Freezer": "Freezer vertical", "Chest Freezer": "Freezer horizontal",
  "Bottom Freezer": "Freezer na parte inferior", "Top Freezer": "Freezer na parte superior",
  "Side-by-Side": "Portas lado a lado", "All Refrigerator": "Sem freezer",
};

export function catalogPresentation(device: CatalogDevice): { title: string; details: string[]; manufacturerUrl?: string } {
  if (device.isGeneric) return { title: device.displayName, details: [] };
  const specifications = device.specifications || {};
  const details: string[] = [];
  const highlights: string[] = [];
  let kind = device.subcategory;
  const screen = specifications.screenSizeInches;
  if (positive(screen, 250)) {
    highlights.push(`${number(screen)}"`);
    details.push(`Tela visível: ${number(screen)} polegadas`);
  }
  const technology = typeof specifications.displayTechnology === "string" ? specifications.displayTechnology : "";
  const technologyLabel = label(technologyLabels, technology);
  if (technologyLabel) highlights.push(technologyLabel);
  if (technology) details.push(`Painel: ${technologyLabel || technology}`);
  const resolution = typeof specifications.nativeResolution === "string" ? specifications.nativeResolution : "";
  if (/^\d{2,5} × \d{2,5}$/.test(resolution)) {
    const format = ({ "3840 × 2160": "4K UHD", "7680 × 4320": "8K UHD", "1920 × 1080": "Full HD" } as Record<string, string>)[resolution];
    if (format) highlights.push(format);
    details.push(`Resolução: ${resolution} pixels`);
  }
  const capacity = specifications.capacityBtuH;
  if (positive(capacity, 10000000)) highlights.push(`${number(capacity, 0)} BTU/h`);
  const type = typeof specifications.productType === "string" ? specifications.productType : "";
  if (device.subcategory === "Ar-condicionado") {
    const installation = label(installationLabels, type);
    if (installation) details.push(installation);
    if (specifications.heatingMode === "Yes") details.push("Frio e aquecimento");
    if (specifications.heatingMode === "No") details.push("Somente frio");
    if (specifications.variableSpeedCompressor === "Yes") details.push("Compressor de velocidade variável");
  }
  if (["Geladeira", "Freezer"].includes(device.subcategory)) {
    const refrigeration = label(refrigerationLabels, type);
    if (device.subcategory === "Freezer" && refrigeration) kind = refrigeration;
    else if (refrigeration) details.push(refrigeration);
    const volume = specifications.volumeFt3;
    if (positive(volume, 100)) {
      const litres = Math.round(volume * 28.316846592);
      highlights.push(`aprox. ${number(litres, 0)} L`);
      details.push(`Volume declarado: ${number(volume)} pés³ (aprox. ${number(litres, 0)} L)`);
    }
    if (specifications.defrostType === "Automatic") details.push("Degelo automático");
    if (specifications.defrostType === "Manual") details.push("Degelo manual");
  }
  if (positive(device.variant?.voltage, 1000)) details.push(`Tensão: ${number(device.variant.voltage)} V`);
  const reviewed = manufacturerDescriptions.find(description => description.brand === device.brand?.trim().toUpperCase()
    && description.model === device.model?.trim().toUpperCase() && description.region === device.region);
  // Older catalogs retain their original names until descriptive data is available.
  const title = reviewed?.title || (highlights.length || kind !== device.subcategory
    ? [kind, device.brand, ...highlights].filter(Boolean).join(" ") : device.displayName);
  return { title, details, ...(reviewed ? { manufacturerUrl: reviewed.url } : {}) };
}
