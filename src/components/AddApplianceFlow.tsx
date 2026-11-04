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
  ArrowRight,
  SlidersHorizontal,
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
  const [savedInfo, setSavedInfo] = useState<{ name: string; consumption?: number | null; cost?: number | null; location?: string } | null>(null);
  const lastSaved = useRef<{ name: string; consumption?: number | null; cost?: number | null; location?: string } | null>(null);
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
      }
    }).catch(() => { if (!controller.signal.aborted) setPlacesError('Não foi possível carregar imóveis e ambientes. A seleção foi mantida.'); })
      .finally(() => { if (!controller.signal.aborted) setPlacesLoading(false); });
    return () => controller.abort();
  }, [needsPlacement, placement.propertyId, placesRetry]);
  const placementFields = <AppliancePlacementFields id={id} value={placement} properties={properties} rooms={rooms} loading={placesLoading} error={placesError} onRetry={() => { propertiesCache.current = null; setPlacesRetry(value => value + 1); }} onChange={value => { setPlacement(value); onDirtyChange?.(true); }} />;
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
    const created = await onAddAppliance({ ...input, ...(placement.propertyId ? { propertyId: placement.propertyId, roomId: placement.roomId || null } : {}) });
    lastSaved.current = { name: created && typeof created === "object" ? created.name : input.name,
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
    <h2 className="text-2xl font-semibold">Aparelho adicionado</h2>
    <p className="max-w-md text-sm text-muted-foreground"><strong className="text-foreground">{savedInfo.name}</strong> foi salvo na sua lista. Você pode editar os dados quando precisar.</p>
    {savedInfo.location && <p className="text-sm text-muted-foreground">{savedInfo.location}</p>}
    {typeof savedInfo.consumption === 'number' && Number.isFinite(savedInfo.consumption) && typeof savedInfo.cost === 'number' && Number.isFinite(savedInfo.cost) && <div className="appliance-success-energy"><strong>{formatNumber(savedInfo.consumption)} kWh/mês</strong><span>{formatCurrency(savedInfo.cost)}/mês estimados</span></div>}
    <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
      <Button type="button" variant="outline" disabled={busy} onClick={() => {
        drafts.current.delete(cacheKey); if (mode === "manual") manualDraft.current = undefined;
        lastSaved.current = null; setSavedInfo(null); setSelected(null); setSmart(null); setMode("library"); returning.current = true;
      }}>Adicionar outro</Button>
      <Button type="button" disabled={busy} onClick={onSaved}>Concluir</Button>
    </div>
  </div>;
  return <div className="appliance-flow-theme appliance-configurator" onChangeCapture={() => onDirtyChange?.(true)}>
    {!catalogOnly && <nav className="appliance-mode-switch" aria-label="Como adicionar aparelho">
      <p className="appliance-nav-title">Como adicionar</p>
      {([['library','Biblioteca','Encontre seu modelo'],['manual','Cadastro manual','Use os dados da etiqueta'],['smart','SmartThings','Conecte sua conta']] as const).map(([value,title,description]) => {
        const Icon = icons[value];
        return <button type="button" key={value} disabled={busy} aria-pressed={mode === value} aria-label={value === 'library' ? 'Biblioteca de aparelhos' : value === 'manual' ? 'Adicionar manualmente' : 'Conectar dispositivo inteligente'} onClick={() => setMode(value)}>
          <Icon className="size-5 shrink-0" aria-hidden="true" /><span><strong>{title}</strong><small>{description}</small></span><span className="appliance-mode-dot" aria-hidden="true" />
        </button>;
      })}
      <div className="appliance-nav-note"><PlugZap className="size-5" aria-hidden="true" /><p>Da referência ao seu uso.</p><span>Escolha o aparelho e entenda seu consumo antes de adicionar.</span></div>
    </nav>}
    <div className="appliance-workspace">
    {!catalogOnly && <ol className="appliance-flow-progress" aria-label="Etapas do cadastro">
      <li aria-current={!configuring && mode !== 'manual' ? 'step' : undefined}><span />{mode === 'smart' ? 'Conectar dispositivo' : mode === 'manual' ? 'Cadastro manual' : 'Encontrar modelo'}</li>
      <li aria-hidden="true"><ArrowRight className="size-4" /></li><li aria-current={configuring || mode === 'manual' ? 'step' : undefined}><span />Configurar e adicionar</li>
    </ol>}
    <div hidden={configuring}>
      <div ref={selectionRef} tabIndex={-1} aria-label="Selecionar aparelho" className="flex min-w-0 flex-col gap-6">
        {mode === 'manual' && onAddAppliance ? <ApplianceCalculator placementFields={placementFields} draft={manualDraft.current} onDraftChange={value => { manualDraft.current = value; }} onAddAppliance={saveAppliance} onSaved={saved} onBusyChange={changedBusy} />
          : mode === 'smart' ? <SmartDeviceDiscovery onSelect={device => { setSmart(device); onDirtyChange?.(true); }} /> : <>
            <div className="appliance-library-search">
              <div><h2 className="text-2xl font-semibold">Encontre o seu modelo</h2><p className="mt-2 text-sm text-muted-foreground">Encontre o modelo e use a referência certa para estimar seu consumo.</p></div>
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-search`} className="sr-only">Buscar na biblioteca</Label>
                <div className="relative"><Search className="absolute left-4 top-4 size-5 text-muted-foreground" aria-hidden="true" />
                  <Input ref={searchRef} id={`${id}-search`} type="search" maxLength={120} placeholder="Busque por aparelho, marca ou modelo..." value={search} disabled={busy} className="h-14 pl-12 text-base" onChange={event => { setSearch(event.target.value); resetPage(); }} />
                </div>
              </div>
            </div>
            <details className="appliance-advanced-filters appliance-all-filters" onToggle={event => setFiltersOpen(event.currentTarget.open)}><summary><SlidersHorizontal className="size-4" aria-hidden="true" />Filtrar aparelhos{activeFilters > 0 && <span className="appliance-count">{activeFilters}</span>}</summary>
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
              {(activeFilters > 0 || search) && <Button type="button" variant="ghost" disabled={busy} onClick={clearFilters}>Limpar busca e filtros</Button>}
            </div>
            {loading ? <div role="status" aria-label={search ? "Pesquisando…" : "Carregando biblioteca…"}><span className="sr-only">{search ? 'Pesquisando…' : 'Carregando biblioteca…'}</span><div className="appliance-results">{[0,1,2].map(value => <div className="appliance-device-card" key={value}><Skeleton className="size-12 rounded-xl" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-12 w-full" /></div>)}</div></div>
              : error ? <div role="alert" className="appliance-empty"><Search className="size-8" aria-hidden="true" /><h3 className="text-lg font-semibold">A biblioteca não carregou</h3><p className="text-sm text-muted-foreground">{error} Seus filtros foram mantidos.</p><Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div>
                : data?.devices.length ? <>
                  <div ref={resultsRef} tabIndex={-1} aria-label="Resultados da biblioteca" className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm font-medium">{data.total.toLocaleString('pt-BR')} resultado(s)</p><p className="text-xs text-muted-foreground">Exibindo {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} · escolha o modelo abaixo</p></div>
                  <div className="appliance-results">{data.devices.map(device => {
                    const description = catalogPresentation(device);
                    const energy = normalizeEnergyProfile(device.energyProfile);
                    const categoryRow = data.categories.find(row => row.id === device.category);
                    const Icon = categoryIcons[categoryRow?.icon as keyof typeof categoryIcons] || PlugZap;
                    const sourceLabel = device.source.type === 'PBE' ? 'PBE / Inmetro' : device.source.type === 'ENERGY_STAR' ? 'ENERGY STAR' : device.source.type === 'EPREL' ? 'EPREL' : device.source.type === 'MANUFACTURER' ? 'Fabricante' : 'Perfil genérico';
                    return <article key={device.id} className="appliance-device-card">
                      <div className="appliance-device-leading"><span className="appliance-device-icon"><Icon className="size-6" aria-hidden="true" /></span><span className="appliance-source-tag">{sourceLabel} · {device.region}</span></div>
                      <div className="appliance-device-identity"><h3 className="break-words text-base font-semibold">{description.title}</h3><p className="mt-2 break-words text-xs text-muted-foreground">{device.model ? `${device.brand ? `${device.brand} · ` : ''}Modelo: ${device.model}` : 'Referência genérica, sem modelo específico'}</p><p className="mt-1 text-xs text-muted-foreground">{categoryRow?.name || device.subcategory}</p></div>
                      <div className="appliance-device-metric"><p className="text-xl font-semibold tabular-nums">{energy.method === "REFERENCE_PERIOD" ? `${formatNumber(energy.value)} kWh/${energy.period === "YEAR" ? "ano" : energy.period === "DAY" ? "dia" : "mês"}` : energy.method === "PER_CYCLE" ? `${formatNumber(energy.energyPerCycleKwh,3)} kWh/ciclo` : energy.method === "POWER_TIME" && energy.typicalPowerW !== undefined ? `${formatNumber(energy.typicalPowerW)} W` : "Potência a informar"}</p><p className="mt-1 text-xs text-muted-foreground">{energy.method === "POWER_TIME" ? "Potência típica estimada" : "Referência do catálogo"}</p></div>
                      <Button type="button" className="appliance-result-select" variant="outline" disabled={busy} aria-pressed={selected?.id === device.id} aria-label={`Selecionar ${description.title}${device.model ? `, modelo ${device.model}` : ''}`} onClick={(event) => { if (busy) return; lastSelection.current = event?.currentTarget ?? null; if (onSelectCatalog) onSelectCatalog(device); else { setSelected(device); onDirtyChange?.(true); } }}>
                        {catalogOnly ? 'Selecionar' : 'Configurar este modelo'}<ArrowRight className="ml-2 size-4" aria-hidden="true" />
                      </Button>
                    </article>;
                  })}</div>
                  {data.total > data.limit && <CatalogPagination page={page} totalPages={data.totalPages ?? Math.ceil(data.total / data.limit)} disabled={busy} onPageChange={value => {pageNavigation.current = true;setPage(value);}} />}
                </> : <div className="appliance-empty"><Search className="size-8" aria-hidden="true" /><h3 role="status" className="text-lg font-semibold">Não encontramos esse aparelho.</h3><p className="text-sm text-muted-foreground">Tente outro nome ou amplie os filtros.{!catalogOnly && ' Você também pode informar os dados manualmente.'}</p><Button type="button" variant="outline" disabled={busy} onClick={clearFilters}>Limpar busca e filtros</Button></div>}
            {!catalogOnly && <div className="appliance-library-footer"><p className="text-sm text-muted-foreground">Seu modelo não está aqui?</p><Button type="button" variant="link" disabled={busy} onClick={() => setMode('manual')}>Não encontrou? Adicionar manualmente</Button></div>}
          </>}
      </div>
    </div>
    {configuring && onAddAppliance && <div ref={configurationRef} tabIndex={-1} role="region" aria-label="Configurar aparelho selecionado" className="flex min-w-0 flex-col gap-4">
      <Button type="button" variant="ghost" className="self-start" disabled={busy} onClick={() => { returning.current = true; setSelected(null); setSmart(null); }}><ArrowLeft className="mr-2 size-4" aria-hidden="true" />Escolher outro aparelho</Button>
      <DeviceConfigurationPanel placementFields={placementFields} key={cacheKey} draft={drafts.current.get(cacheKey)} onDraftChange={value => { drafts.current.set(cacheKey,value); }} device={mode === 'library' ? selected || undefined : undefined} integration={mode === 'smart' ? smart || undefined : undefined} onAddAppliance={saveAppliance} onSaved={saved} onBusyChange={changedBusy} />
    </div>}
    </div>
  </div>;
}
