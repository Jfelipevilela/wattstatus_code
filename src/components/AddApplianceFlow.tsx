import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import {
  BookOpen,
  Wifi,
  Pencil,
  Search,
  Check,
  Lightbulb,
  Snowflake,
  CookingPot,
  WashingMachine,
  Tv,
  Laptop,
  PlugZap,
  ArrowLeft,
  SlidersHorizontal,
  ShowerHead, Refrigerator, Microwave, Fan, Router, Gamepad2, Coffee, Flame, Droplets, Shirt, Wind, AirVent, Heater, Monitor, ChevronDown,
} from "lucide-react";
import AppliancePlacementFields, { type AppliancePlacement } from "./AppliancePlacementFields";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { normalizeEnergyProfile } from "../../backend/src/modules/catalog/reference";
import { formatNumber, formatCurrency } from "@/lib/energy";
import { catalogPresentation } from "@/lib/catalog-presentation";
import ApplianceCalculator, { type ManualApplianceDraft } from "./ApplianceCalculator";
import { ApplianceQuantityContext } from "./appliance-quantity";
import DeviceConfigurationPanel, {
  type DiscoveredDevice,
  type DeviceConfigurationDraft,
} from "./DeviceConfigurationPanel";
import SmartDeviceDiscovery from "./SmartDeviceDiscovery";
import CatalogPagination from "./CatalogPagination";
import type {
  CatalogDevice,
  CatalogPage,
} from "../../backend/src/modules/catalog/catalog.types";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";

const CatalogFilterSelect = lazy(() => import("./CatalogFilterSelect"));

const categoryIcons = {
  lightbulb: Lightbulb,
  snowflake: Snowflake,
  cooking: CookingPot,
  washing: WashingMachine,
  tv: Tv,
  laptop: Laptop,
};
// Icon by what the appliance is, so a shower never shows the climate snowflake.
const typicalIcon = (name: string) => {
  const text = name.toLowerCase();
  const rules: Array<[RegExp, typeof PlugZap]> = [[/chuveiro/, ShowerHead], [/geladeira|freezer/, Refrigerator], [/micro/, Microwave], [/ventilador/, Fan],
    [/roteador/, Router], [/videogame/, Gamepad2], [/cafeteira/, Coffee], [/forno|air fryer/, Flame], [/bomba|piscina/, Droplets], [/ferro/, Shirt],
    [/secador/, Wind], [/ar.condicionado/, AirVent], [/aquecedor/, Heater], [/l[aâ]mpada/, Lightbulb], [/lav(a|adora)|m[aá]quina de lavar/, WashingMachine],
    [/tv/, Tv], [/notebook/, Laptop], [/computador|monitor/, Monitor]];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || PlugZap;
};
// "Chuveiro elétrico 5.500 W" -> "Chuveiro elétrico 5.500 W"; drops "— perfil genérico" and "— 45 kWh por mês" tails.
const typicalLabel = (name: string) => name.replace(/\s+[—–-]\s+.*$/, '').trim();
const TYPICAL_PREVIEW = 10;
// Biggest weights in a Brazilian electricity bill come first; the rest stays alphabetical.
const TYPICAL_ORDER = [/chuveiro/, /geladeira/, /ar.condicionado/, /l[aâ]mpada led/, /tv/, /m[aá]quina de lavar/, /freezer/, /ferro/, /micro/, /ventilador/];
const typicalRank = (name: string) => { const index = TYPICAL_ORDER.findIndex(pattern => pattern.test(name.toLowerCase())); return index < 0 ? TYPICAL_ORDER.length : index; };
interface RegistrationProps {
  onAddAppliance: (input: ApplianceInput) => Promise<Appliance | void>;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSelectCatalog?: never;
  disabled?: boolean;
}
interface CatalogSelectionProps {
  onSelectCatalog: (device: CatalogDevice) => void;
  disabled?: boolean;
  onAddAppliance?: never;
  onSaved?: never;
  onBusyChange?: never;
  onDirtyChange?: never;
}
type Props = RegistrationProps | CatalogSelectionProps;
export default function AddApplianceFlow({
  onAddAppliance,
  onSaved,
  onBusyChange,
  onSelectCatalog,
  onDirtyChange,
  disabled = false,
}: Props) {
  const id = useId();
  const [selectedMode, setMode] = useState<"library" | "smart" | "manual">("library");
  const catalogOnly = Boolean(onSelectCatalog);
  const mode = catalogOnly ? "library" : selectedMode;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<CatalogPage | null>(null);
  const [selected, setSelected] = useState<CatalogDevice | null>(null);
  const [smart, setSmart] = useState<DiscoveredDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [internalBusy, setBusy] = useState(false);
  const drafts = useRef(new Map<string, DeviceConfigurationDraft>());
  const manualDraft = useRef<ManualApplianceDraft>();
  const [savedInfo, setSavedInfo] = useState<{ name: string; consumption?: number | null; cost?: number | null; location?: string; count?: number } | null>(null);
  const lastSaved = useRef<{ name: string; consumption?: number | null; cost?: number | null; location?: string; count?: number } | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const busy = disabled || internalBusy;
  const configurationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const returning = useRef(false);
  const lastSelection = useRef<HTMLButtonElement | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pageNavigation = useRef(false);
  const configuring = !catalogOnly && (mode === "library" ? selected !== null : mode === "smart" && smart !== null);
  const [placement, setPlacement] = useState<AppliancePlacement>({ propertyId: '', roomId: '' });
  const [properties, setProperties] = useState<Array<{ id: string; name: string; isPrimary?: boolean }>>([]);
  const propertiesCache = useRef<typeof properties | null>(null);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [placesRetry, setPlacesRetry] = useState(0);
  const needsPlacement = !catalogOnly && (configuring || mode === 'manual');
  useEffect(() => {
    if (!needsPlacement) return;
    const controller = new AbortController();
    setPlacesLoading(true); setPlacesError(null); setRooms([]);
    Promise.all([
      propertiesCache.current ? Promise.resolve({ properties: propertiesCache.current }) : apiRequest<{ properties: typeof properties }>('/api/properties', { signal: controller.signal, skipErrorToast: true }),
      placement.propertyId ? apiRequest<{ rooms: typeof rooms }>(`/api/properties/${encodeURIComponent(placement.propertyId)}/rooms`, { signal: controller.signal, skipErrorToast: true }) : Promise.resolve({ rooms: [] }),
    ]).then(([places, layout]) => {
      if (!controller.signal.aborted) {
        if (!Array.isArray(places.properties) || !Array.isArray(layout.rooms)) throw new Error("Resposta de locais inválida");
        propertiesCache.current = places.properties;
        setProperties(places.properties); setRooms(layout.rooms);
        // Preselect the primary property so rooms are available without an extra step.
        const primary = places.properties.find(item => item.isPrimary) || (places.properties.length === 1 ? places.properties[0] : undefined);
        if (!placement.propertyId && primary) setPlacement(current => current.propertyId ? current : { propertyId: primary.id, roomId: '' });
      }
    }).catch(() => { if (!controller.signal.aborted) setPlacesError('Não foi possível carregar imóveis e ambientes. A seleção foi mantida.'); })
      .finally(() => { if (!controller.signal.aborted) setPlacesLoading(false); });
    return () => controller.abort();
  }, [needsPlacement, placement.propertyId, placesRetry]);
  const createRoom = async (propertyId: string, name: string) => {
    const { room } = await apiRequest<{ room: { id: string; name: string } }>(`/api/properties/${encodeURIComponent(propertyId)}/rooms`, { method: 'POST', body: JSON.stringify({ name }), skipErrorToast: true });
    if (!room?.id) throw new Error('Resposta de ambiente inválida');
    setRooms(current => [...current, { id: room.id, name: room.name }]);
    return room;
  };
  const roomName = rooms.find(room => room.id === placement.roomId)?.name;
  // Several identical units (e.g. six lamps) in one confirmation; connected devices stay individual.
  const [quantityText, setQuantityText] = useState("1");
  const quantityValue = Number(quantityText);
  const quantity = mode !== 'smart' && Number.isInteger(quantityValue) && quantityValue >= 1 && quantityValue <= 20 ? quantityValue : 1;
  const quantityInvalid = mode !== 'smart' && quantityText !== '' && quantity !== quantityValue;
  const quantityField = mode === 'smart' ? null : <div className="flex flex-col gap-2 sm:max-w-[12rem]">
    <Label htmlFor={`${id}-quantity`}>Quantidade de unidades</Label>
    <Input id={`${id}-quantity`} type="number" inputMode="numeric" min={1} max={20} step={1} value={quantityText} aria-invalid={quantityInvalid} aria-describedby={`${id}-quantity-help`} onChange={event => setQuantityText(event.target.value)} onBlur={() => { if (quantityInvalid || quantityText === '') setQuantityText(String(Math.min(20, Math.max(1, Math.round(quantityValue) || 1)))); }} />
    <p id={`${id}-quantity-help`} className={quantityInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{quantityInvalid ? 'Use um número inteiro de 1 a 20.' : 'Para aparelhos iguais, como várias lâmpadas. Cada unidade vira um item na lista.'}</p>
  </div>;
  const placementFields = <>{quantityField}<AppliancePlacementFields id={id} value={placement} onCreateRoom={createRoom} properties={properties} rooms={rooms} loading={placesLoading} error={placesError} onRetry={() => { propertiesCache.current = null; setPlacesRetry(value => value + 1); }} onChange={value => { setPlacement(value); onDirtyChange?.(true); }} /></>;
  useEffect(() => {
    if (savedInfo) successRef.current?.focus();
    else if (configuring) {
      configurationRef.current?.focus({ preventScroll: true });
      configurationRef.current?.scrollIntoView({ block: "start" });
    } else if (returning.current) {
      returning.current = false;
      const target = lastSelection.current?.isConnected ? lastSelection.current : searchRef.current || selectionRef.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center" });
    }
  }, [configuring, savedInfo]);
  useEffect(() => {
    if (pageNavigation.current && !loading && mode === "library") {
      pageNavigation.current = false;
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: "start" });
    }
  }, [loading, mode]);
  // Typical Brazilian household profiles (generic, no brand) as one-click starting points.
  const [typical, setTypical] = useState<CatalogDevice[]>([]);
  const [typicalExpanded, setTypicalExpanded] = useState(false);
  useEffect(() => {
    if (catalogOnly) return;
    const controller = new AbortController();
    apiRequest<CatalogPage>('/api/device-catalog?generic=true&page=1&limit=24', { signal: controller.signal, skipErrorToast: true })
      .then(value => { if (!controller.signal.aborted && Array.isArray(value?.devices)) setTypical(value.devices.filter(device => device.isGeneric || device.source.type === 'WATTSTATUS_GENERIC')
        .sort((a, b) => typicalRank(a.displayName) - typicalRank(b.displayName) || a.displayName.localeCompare(b.displayName, 'pt-BR'))); })
      .catch(() => { if (!controller.signal.aborted) setTypical([]); });
    return () => controller.abort();
  }, [catalogOnly]);
  const resetPage = () => { pageNavigation.current = false; setPage(1); };
  const changedBusy = (value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  };
  useEffect(() => {
    if (mode !== "library") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        const query = new URLSearchParams({ page: String(page), limit: "12" });
        if (search.trim()) query.set("search", search.trim());
        if (category) query.set("category", category);
        if (type) query.set("subcategory", type);
        if (brand) query.set("brand", brand);
        if (model.trim()) query.set("model", model.trim());
        if (region) query.set("region", region);
        apiRequest<CatalogPage>(`/api/device-catalog?${query}`, {
          signal: controller.signal,
          skipErrorToast: true,
        })
          .then((value) => {
            if (!controller.signal.aborted) setData(value);
          })
          .catch(() => {
            if (!controller.signal.aborted)
              setError("Não foi possível carregar o catálogo.");
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      search ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, search, category, type, brand, model, region, page, retry]);
  const saveAppliance = async (input: ApplianceInput) => {
    if (!onAddAppliance) return;
    const created = await onAddAppliance({ ...input, ...(quantity > 1 && !input.integrationProvider ? { quantity } : {}), ...(placement.propertyId ? { propertyId: placement.propertyId, roomId: placement.roomId || null } : {}) });
    const count = quantity > 1 && !input.integrationProvider ? quantity : 1;
    lastSaved.current = { count, name: count > 1 ? input.name : created && typeof created === "object" ? created.name : input.name,
      consumption: created && !input.monitoringOnly ? created.monthlyConsumption : undefined, cost: created && !input.monitoringOnly ? created.monthlyCost : undefined,
      location: [properties.find(item => item.id === (placement.propertyId || (created && created.propertyId)))?.name, rooms.find(item => item.id === placement.roomId)?.name].filter(Boolean).join(' · ') };
    return created;
  };
  const saved = () => { if (lastSaved.current) { setSavedInfo(lastSaved.current); onDirtyChange?.(false); } };
  const cacheKey = `${mode}:${selected?.id || smart?.id || ""}`;
  const icons = { library: BookOpen, smart: Wifi, manual: Pencil };
  const selectClass = "appliance-control";
  const clearFilters = () => { setSearch(""); setCategory(""); setType(""); setBrand(""); setModel(""); setRegion(""); resetPage(); };
  const activeFilters = [category, type, brand, model, region].filter(Boolean).length;
  if (savedInfo) return <div ref={successRef} tabIndex={-1} className="appliance-flow-theme appliance-success" role="status">
    <span className="appliance-success-icon"><Check className="size-8" aria-hidden="true" /></span>
    <h2 className="text-2xl font-semibold">{(savedInfo.count ?? 1) > 1 ? `${savedInfo.count} aparelhos adicionados` : 'Aparelho adicionado'}</h2>
    <p className="max-w-md text-sm text-muted-foreground">{(savedInfo.count ?? 1) > 1 ? <><strong className="text-foreground">{savedInfo.name} 1</strong> a <strong className="text-foreground">{savedInfo.name} {savedInfo.count}</strong> foram salvos na sua lista.</> : <><strong className="text-foreground">{savedInfo.name}</strong> foi salvo na sua lista.</>} Você pode editar os dados quando precisar.</p>
    {savedInfo.location && <p className="text-sm text-muted-foreground">{savedInfo.location}</p>}
    {typeof savedInfo.consumption === 'number' && Number.isFinite(savedInfo.consumption) && typeof savedInfo.cost === 'number' && Number.isFinite(savedInfo.cost) && <div className="appliance-success-energy"><strong>{formatNumber(savedInfo.consumption * (savedInfo.count ?? 1))} kWh/mês</strong><span>{formatCurrency(savedInfo.cost * (savedInfo.count ?? 1))}/mês estimados{(savedInfo.count ?? 1) > 1 ? ' no total' : ''}</span></div>}
    <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
      <Button type="button" variant="outline" disabled={busy} onClick={() => {
        drafts.current.delete(cacheKey); if (mode === "manual") manualDraft.current = undefined;
        lastSaved.current = null; setSavedInfo(null); setQuantityText('1'); setSelected(null); setSmart(null); setMode("library"); returning.current = true;
      }}>Adicionar outro</Button>
      <Button type="button" disabled={busy} onClick={onSaved}>Concluir</Button>
    </div>
  </div>;
  return <ApplianceQuantityContext.Provider value={quantity}><div className="appliance-flow-theme appliance-configurator" onChangeCapture={() => onDirtyChange?.(true)}>
    {!catalogOnly && <div className="appliance-flow-bar">
      <nav className="appliance-mode-switch" aria-label="Como adicionar aparelho">
        {([['library','Biblioteca'],['manual','Manual'],['smart','SmartThings']] as const).map(([value,title]) => {
          const Icon = icons[value];
          return <button type="button" key={value} disabled={busy} aria-pressed={mode === value} aria-label={value === 'library' ? 'Biblioteca de aparelhos' : value === 'manual' ? 'Adicionar manualmente' : 'Conectar dispositivo inteligente'} onClick={() => setMode(value)}>
            <Icon className="size-4 shrink-0" aria-hidden="true" />{title}
          </button>;
        })}
      </nav>
      <ol className="appliance-flow-progress" aria-label="Etapas do cadastro">
        <li aria-current={!configuring && mode !== 'manual' ? 'step' : undefined}><span className="appliance-step-mark">{!configuring && mode !== 'manual' ? 1 : <Check className="size-3" aria-hidden="true" />}</span>{mode === 'smart' ? 'Conectar' : mode === 'manual' ? 'Dados da etiqueta' : 'Escolher modelo'}</li>
        <li aria-hidden="true" className="appliance-step-line" />
        <li aria-current={configuring || mode === 'manual' ? 'step' : undefined}><span className="appliance-step-mark">2</span>Ajustar e adicionar</li>
      </ol>
    </div>}
    <div className="appliance-workspace">
    <div hidden={configuring}>
      <div ref={selectionRef} tabIndex={-1} aria-label="Selecionar aparelho" className="flex min-w-0 flex-col gap-6">
        {mode === 'manual' && onAddAppliance ? <ApplianceCalculator placementFields={placementFields} draft={manualDraft.current} onDraftChange={value => { manualDraft.current = value; }} onAddAppliance={saveAppliance} onSaved={saved} onBusyChange={changedBusy} />
          : mode === 'smart' ? <SmartDeviceDiscovery onSelect={device => { setSmart(device); onDirtyChange?.(true); }} /> : <>
            <div className="appliance-library-search">
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-search`} className="sr-only">Buscar na biblioteca</Label>
                <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2" aria-hidden="true" />
                  <Input ref={searchRef} id={`${id}-search`} type="search" maxLength={120} placeholder="Geladeira, ar-condicionado, Samsung, BD08NWES" value={search} disabled={busy}  onChange={event => { setSearch(event.target.value); resetPage(); }} />
                </div>
              </div>
            </div>
            {!catalogOnly && typical.length > 0 && !search.trim() && activeFilters === 0 && page === 1 && <section className="appliance-typical" aria-labelledby={`${id}-typical`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id={`${id}-typical`} className="text-base font-semibold">Comece por um aparelho típico</h2><p className="text-xs text-muted-foreground">Potência comum no Brasil. Você ajusta tudo na próxima etapa.</p></div>
              <div className="appliance-typical-grid" id={`${id}-typical-list`}>{(typicalExpanded ? typical : typical.slice(0, TYPICAL_PREVIEW)).map(device => {
                const energy = normalizeEnergyProfile(device.energyProfile);
                const Icon = typicalIcon(device.displayName);
                const label = typicalLabel(device.displayName).replace(/\s+[\d.,]+\s*W$/, '');
                return <button type="button" key={device.id} disabled={busy} aria-label={`Selecionar ${label}`} onClick={event => { lastSelection.current = event?.currentTarget ?? null; setSelected(device); onDirtyChange?.(true); }}>
                  <Icon className="size-5 shrink-0" aria-hidden="true" /><span className="min-w-0"><strong>{label}</strong><small>{energy.method === 'POWER_TIME' && energy.typicalPowerW !== undefined ? `${formatNumber(energy.typicalPowerW, 0)} W` : energy.method === 'REFERENCE_PERIOD' ? `${formatNumber(energy.value, 0)} kWh/${energy.period === 'YEAR' ? 'ano' : energy.period === 'DAY' ? 'dia' : 'mês'}` : energy.method === 'PER_CYCLE' ? `${formatNumber(energy.energyPerCycleKwh, 2)} kWh/ciclo` : 'Perfil típico'}</small></span>
                </button>;
              })}</div>
              {typical.length > TYPICAL_PREVIEW && <Button type="button" variant="ghost" className="h-10 self-start px-2 font-semibold text-[hsl(var(--flow-accent))]" aria-expanded={typicalExpanded} aria-controls={`${id}-typical-list`} onClick={() => setTypicalExpanded(value => !value)}>{typicalExpanded ? 'Mostrar menos' : `Ver todos os ${typical.length} aparelhos típicos`}<ChevronDown className={`ml-1 size-4 transition-transform ${typicalExpanded ? 'rotate-180' : ''}`} aria-hidden="true" /></Button>}
            </section>}
            <div className="appliance-filter-row">
            <details className="appliance-advanced-filters appliance-all-filters" onToggle={event => setFiltersOpen(event.currentTarget.open)}><summary><SlidersHorizontal className="size-4" aria-hidden="true" />Filtrar aparelhos{activeFilters > 0 && <span className="appliance-count" aria-label={`${activeFilters} filtros ativos`}>{activeFilters}</span>}</summary>
            <fieldset disabled={busy} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-3">
              <legend className="sr-only">Filtrar aparelhos</legend>
              <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={`${id}-category`}>Categoria</Label><Suspense fallback={<Skeleton className="h-12 w-full" />}>{filtersOpen && <CatalogFilterSelect id={`${id}-category`} label="Categoria" value={category} disabled={busy} options={[{ value: "", label: "Todas as opções" }, ...(data?.categories.map(row => ({ value: row.id, label: row.name })) || [])]} onChange={value => { setCategory(value); setType(''); setBrand(''); resetPage(); }} />}</Suspense></div>
              <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={`${id}-type`}>Tipo de aparelho</Label><Suspense fallback={<Skeleton className="h-12 w-full" />}>{filtersOpen && <CatalogFilterSelect id={`${id}-type`} label="Tipo de aparelho" value={type} disabled={busy} options={[{ value: "", label: "Todas as opções" }, ...(data?.subcategories.map(value => ({ value, label: value })) || [])]} onChange={value => { setType(value); resetPage(); }} />}</Suspense></div>
              <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={`${id}-brand`}>Marca</Label><Suspense fallback={<Skeleton className="h-12 w-full" />}>{filtersOpen && <CatalogFilterSelect id={`${id}-brand`} label="Marca" value={brand} disabled={busy} options={[{ value: "", label: "Todas as opções" }, ...(data?.brands.map(value => ({ value, label: value })) || [])]} onChange={value => { setBrand(value); resetPage(); }} />}</Suspense></div>
            </fieldset>
                <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2"><legend className="sr-only">Filtros adicionais</legend>
                  <div className="flex flex-col gap-2"><Label htmlFor={`${id}-region`}>Região do catálogo</Label><select id={`${id}-region`} className={selectClass} value={region} onChange={event => { setRegion(event.target.value); setBrand(''); setModel(''); resetPage(); }}><option value="BR">Brasil</option><option value="US">Estados Unidos</option><option value="EU">União Europeia</option><option value="">Todas as regiões</option></select></div>
                  <div className="flex flex-col gap-2"><Label htmlFor={`${id}-model`}>Modelo exato (opcional)</Label><Input id={`${id}-model`} value={model} placeholder="Ex.: RF29DB9950QDAZ" maxLength={300} onChange={event => { setModel(event.target.value); resetPage(); }} /></div>
                </fieldset>
            </details>
            <div className="appliance-filter-tools"><div className="appliance-active-filters">{[
              { value: category, label: data?.categories.find(item => item.id === category)?.name || category, clear: () => { setCategory(''); setType(''); setBrand(''); } },
              { value: type, label: type, clear: () => setType('') }, { value: brand, label: brand, clear: () => setBrand('') },
              { value: region, label: ({ BR: 'Brasil', US: 'Estados Unidos', EU: 'União Europeia' } as Record<string,string>)[region], clear: () => setRegion('') },
              { value: model, label: model, clear: () => setModel('') },
            ].filter(item => item.value).map((item,index) => <button key={index} type="button" disabled={busy} aria-label={`Remover filtro ${item.label}`} onClick={() => { item.clear(); resetPage(); }}>{item.label}<span aria-hidden="true">×</span></button>)}</div>
              {(activeFilters > 0 || search) && <Button type="button" variant="ghost" className="min-h-10" disabled={busy} onClick={clearFilters}>Limpar busca e filtros</Button>}
            </div>
            </div>
            {loading ? <div role="status" aria-label={search ? "Pesquisando…" : "Carregando biblioteca…"}><span className="sr-only">{search ? 'Pesquisando…' : 'Carregando biblioteca…'}</span><div className="appliance-results">{[0,1,2,3].map(value => <div className="appliance-device-card" key={value}><Skeleton className="size-10 rounded-xl" /><div className="flex flex-col gap-2"><Skeleton className="h-5 w-3/5" /><Skeleton className="h-4 w-2/5" /></div><Skeleton className="hidden h-6 w-24 sm:block" /><Skeleton className="h-10 w-32 rounded-xl" /></div>)}</div></div>
              : error ? <div role="alert" className="appliance-empty"><Search className="size-8" aria-hidden="true" /><h3 className="text-lg font-semibold">A biblioteca não carregou</h3><p className="text-sm text-muted-foreground">{error} Seus filtros foram mantidos.</p><Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div>
                : data?.devices.length ? <>
                  <div ref={resultsRef} tabIndex={-1} aria-label="Resultados da biblioteca" className="appliance-results-head"><p role="status" className="text-sm font-semibold">{data.total.toLocaleString('pt-BR')} {data.total === 1 ? 'aparelho encontrado' : 'aparelhos encontrados'}</p><p className="text-sm text-muted-foreground tabular-nums">Mostrando {(page - 1) * data.limit + 1} a {Math.min(page * data.limit, data.total)}</p></div>
                  <div className="appliance-results">{data.devices.map(device => {
                    const description = catalogPresentation(device);
                    const energy = normalizeEnergyProfile(device.energyProfile);
                    const categoryRow = data.categories.find(row => row.id === device.category);
                    const Icon = categoryIcons[categoryRow?.icon as keyof typeof categoryIcons] || PlugZap;
                    const sourceLabel = device.source.type === 'PBE' ? 'PBE / Inmetro' : device.source.type === 'ENERGY_STAR' ? 'ENERGY STAR' : device.source.type === 'EPREL' ? 'EPREL' : device.source.type === 'MANUFACTURER' ? 'Fabricante' : 'Perfil genérico';
                    return <article key={device.id} className="appliance-device-card">
                      <span className="appliance-device-icon"><Icon className="size-5" aria-hidden="true" /></span>
                      <div className="appliance-device-identity"><h3 className="break-words text-base font-semibold">{description.title}</h3><div className="appliance-device-meta"><span className="break-words">{device.model ? `${device.brand ? `${device.brand}, ` : ''}modelo ${device.model}` : 'Referência genérica, sem modelo específico'}</span><span>{categoryRow?.name || device.subcategory}</span><span className="appliance-source-tag">{sourceLabel} {device.region}</span></div></div>
                      <div className="appliance-device-metric"><p>{energy.method === "REFERENCE_PERIOD" ? `${formatNumber(energy.value)} kWh/${energy.period === "YEAR" ? "ano" : energy.period === "DAY" ? "dia" : "mês"}` : energy.method === "PER_CYCLE" ? `${formatNumber(energy.energyPerCycleKwh,3)} kWh/ciclo` : energy.method === "POWER_TIME" && energy.typicalPowerW !== undefined ? `${formatNumber(energy.typicalPowerW)} W` : "Potência a informar"}</p><p className="text-xs text-muted-foreground">{energy.method === "POWER_TIME" ? "Potência típica" : "Referência do catálogo"}</p></div>
                      <Button type="button" className="appliance-result-select" variant="outline" disabled={busy} aria-pressed={selected?.id === device.id} aria-label={`Selecionar ${description.title}${device.model ? `, modelo ${device.model}` : ''}`} onClick={(event) => { if (busy) return; lastSelection.current = event?.currentTarget ?? null; if (onSelectCatalog) onSelectCatalog(device); else { setSelected(device); onDirtyChange?.(true); } }}>
                        {catalogOnly ? 'Selecionar' : 'Configurar'}
                      </Button>
                    </article>;
                  })}</div>
                  {data.total > data.limit && <CatalogPagination page={page} totalPages={data.totalPages ?? Math.ceil(data.total / data.limit)} disabled={busy} onPageChange={value => {pageNavigation.current = true;setPage(value);}} />}
                </> : <div className="appliance-empty"><Search className="size-8" aria-hidden="true" /><h3 role="status" className="text-lg font-semibold">Nenhum aparelho com esses termos</h3><p className="text-sm text-muted-foreground">Tente outro nome ou amplie os filtros.{!catalogOnly && ' Você também pode informar os dados manualmente.'}</p><Button type="button" variant="outline" disabled={busy} onClick={clearFilters}>Limpar busca e filtros</Button></div>}
            {!catalogOnly && region !== 'BR' && !loading && !error && Boolean(data?.devices.some(device => device.region !== 'BR')) && <p className="text-xs text-muted-foreground">A maior parte dos modelos vem de bases internacionais, como o ENERGY STAR (EUA), com ensaios feitos em outras condições de clima e tensão. Para aparelhos vendidos só no Brasil, use um aparelho típico ou os dados da etiqueta.</p>}
            {!catalogOnly && <div className="appliance-library-footer"><p className="text-sm text-muted-foreground">Não achou seu modelo?</p><Button type="button" variant="link" className="h-auto px-0 font-semibold text-[hsl(var(--flow-accent))]" disabled={busy} onClick={() => setMode('manual')}>Cadastre com os dados da etiqueta</Button></div>}
          </>}
      </div>
    </div>
    {configuring && onAddAppliance && <div ref={configurationRef} tabIndex={-1} role="region" aria-label="Configurar aparelho selecionado" className="flex min-w-0 flex-col gap-4">
      <Button type="button" variant="ghost" className="-ml-3 self-start" disabled={busy} onClick={() => { returning.current = true; setSelected(null); setSmart(null); }}><ArrowLeft className="mr-2 size-4" aria-hidden="true" />Escolher outro aparelho</Button>
      <DeviceConfigurationPanel placementFields={placementFields} roomName={roomName} key={cacheKey} draft={drafts.current.get(cacheKey)} onDraftChange={value => { drafts.current.set(cacheKey,value); }} device={mode === 'library' ? selected || undefined : undefined} integration={mode === 'smart' ? smart || undefined : undefined} onAddAppliance={saveAppliance} onSaved={saved} onBusyChange={changedBusy} />
    </div>}
    </div>
  </div></ApplianceQuantityContext.Provider>;
}
