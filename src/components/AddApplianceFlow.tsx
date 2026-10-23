import { useEffect, useId, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api";
import { referenceLabel } from "../../backend/src/modules/catalog/reference";
import { formatNumber } from "@/lib/energy";
import ApplianceCalculator from "./ApplianceCalculator";
import DeviceConfigurationPanel, {
  type DiscoveredDevice,
} from "./DeviceConfigurationPanel";
import SmartDeviceDiscovery from "./SmartDeviceDiscovery";
import type {
  CatalogDevice,
  CatalogPage,
} from "../../backend/src/modules/catalog/catalog.types";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";

const categoryIcons = {
  lightbulb: Lightbulb,
  snowflake: Snowflake,
  cooking: CookingPot,
  washing: WashingMachine,
  tv: Tv,
  laptop: Laptop,
};
interface Props {
  onAddAppliance: (input: ApplianceInput) => Promise<Appliance | void>;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
}
export default function AddApplianceFlow({
  onAddAppliance,
  onSaved,
  onBusyChange,
}: Props) {
  const id = useId();
  const [mode, setMode] = useState<"library" | "smart" | "manual">("library");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CatalogPage | null>(null);
  const [selected, setSelected] = useState<CatalogDevice | null>(null);
  const [smart, setSmart] = useState<DiscoveredDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const changedBusy = (value: boolean) => {
    setBusy(value);
    onBusyChange(value);
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
  }, [mode, search, category, type, brand, page, retry]);
  const icons = { library: BookOpen, smart: Wifi, manual: Pencil };
  const selectClass =
    "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="min-w-0 space-y-5">
      <div
        role="group"
        aria-label="Como adicionar aparelho"
        className="grid gap-2 md:grid-cols-3"
      >
        {(
          [
            [
              "library",
              "Biblioteca de aparelhos",
              "Principal · encontre seu modelo",
            ],
            [
              "smart",
              "Conectar dispositivo inteligente",
              "Consulte sua conta SmartThings",
            ],
            [
              "manual",
              "Adicionar manualmente",
              "Não encontrou? Informe os dados",
            ],
          ] as const
        ).map(([value, title, subtitle]) => {
          const Icon = icons[value];
          return (
            <button
              key={value}
              type="button"
              disabled={busy}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`flex min-h-20 min-w-0 items-start gap-3 rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === value ? "border-primary bg-primary/10" : "bg-background hover:bg-muted"}`}
            >
              <Icon className="mt-1 h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {mode === value && <Check className="mr-1 inline h-4 w-4" />}
                  {title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {mode === "manual" ? (
        <ApplianceCalculator
          onAddAppliance={onAddAppliance}
          onSaved={onSaved}
          onBusyChange={changedBusy}
        />
      ) : (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]">
          <div className="min-w-0 space-y-4">
            {mode === "smart" ? (
              <SmartDeviceDiscovery onSelect={setSmart} />
            ) : (
              <>
                <h2 className="text-lg font-semibold">
                  Qual aparelho você possui?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Busque um modelo ou explore por categoria, tipo e marca. Você
                  não precisa conhecer os dados técnicos para começar.
                </p>
                <div className="space-y-2">
                  <Label htmlFor={`${id}-search`}>Buscar na biblioteca</Label>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="absolute left-3 top-3 h-5 w-5 text-muted-foreground"
                    />
                    <Input
                      id={`${id}-search`}
                      type="search"
                      maxLength={120}
                      placeholder="Busque por aparelho, marca ou modelo..."
                      value={search}
                      disabled={busy}
                      className="h-11 pl-10"
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
                <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-category`}>Categoria</Label>
                    <select
                      id={`${id}-category`}
                      className={selectClass}
                      value={category}
                      onChange={(event) => {
                        setCategory(event.target.value);
                        setBrand("");
                        setType("");
                        setPage(1);
                      }}
                    >
                      <option value="">Todas as categorias</option>
                      {data?.categories.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-type`}>Tipo de aparelho</Label>
                    <select
                      id={`${id}-type`}
                      className={selectClass}
                      value={type}
                      onChange={(event) => {
                        setType(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Todos os tipos</option>
                      {data?.subcategories.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${id}-brand`}>Marca</Label>
                    <select
                      id={`${id}-brand`}
                      className={selectClass}
                      value={brand}
                      onChange={(event) => {
                        setBrand(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Todas as marcas</option>
                      {data?.brands.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                </fieldset>
                {loading ? (
                  <p role="status">
                    {search ? "Pesquisando…" : "Carregando biblioteca…"}
                  </p>
                ) : error ? (
                  <div role="alert" className="space-y-3">
                    <p>{error}</p>
                    <Button
                      variant="outline"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : data?.devices.length ? (
                  <>
                    <p role="status" className="text-xs text-muted-foreground">
                      {data.total} resultado(s). Selecione um modelo para
                      configurar.
                    </p>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      {data.devices.map((device) => {
                        const category = data.categories.find(
                          (row) => row.id === device.category,
                        );
                        const Icon =
                          categoryIcons[
                            category?.icon as keyof typeof categoryIcons
                          ] || PlugZap;
                        return (
                          <Card
                            key={device.id}
                            className={`flex min-w-0 flex-col gap-3 p-4 ${selected?.id === device.id ? "border-primary" : ""}`}
                          >
                            <Icon
                              aria-hidden="true"
                              className="h-7 w-7 text-primary"
                            />
                            <h3 className="break-words text-sm font-semibold">
                              {device.displayName}
                            </h3>
                            <p className="break-words text-xs text-muted-foreground">
                              {device.brand || "Sem marca"} ·{" "}
                              {device.model || "Perfil genérico"}
                            </p>
                            <p className="text-xs">
                              {referenceLabel(device.energyProfile) || (device.energyProfile.method === "POWER_TIME"
                                ? device.energyProfile.typicalPowerW !==
                                  undefined
                                  ? `${device.energyProfile.typicalPowerW} W · valor típico estimado`
                                  : "Potência não informada; configure ao selecionar"
                                : device.energyProfile.method ===
                                    "REFERENCE_MONTHLY"
                                  ? `${formatNumber(device.energyProfile.referenceMonthlyKwh)} kWh/mês · ensaio`
                                  : device.energyProfile.method === "PER_CYCLE" ? `${formatNumber(device.energyProfile.energyPerCycleKwh, 3)} kWh/ciclo · ensaio` : "")}
                            </p>
                            <p className="text-xs text-muted-foreground">{device.source.type === "PBE" ? "PBE / Inmetro" : device.source.type === "ENERGY_STAR" ? "ENERGY STAR · mercado US" : device.source.type === "MANUFACTURER" ? "Fabricante" : "WattStatus · perfil genérico"}
                              {device.verified ? ` · Verificado em ${new Date(device.source.verifiedAt).getUTCFullYear()}` : " · Valor típico estimado"} · {device.region}</p>
                            <Button
                              className="mt-auto min-h-11"
                              disabled={busy}
                              variant={
                                selected?.id === device.id
                                  ? "default"
                                  : "outline"
                              }
                              aria-pressed={selected?.id === device.id}
                              aria-label={`Selecionar ${device.displayName}`}
                              onClick={() => setSelected(device)}
                            >
                              {selected?.id === device.id
                                ? "Selecionado ✓"
                                : "Selecionar"}
                            </Button>
                          </Card>
                        );
                      })}
                    </div>
                    {data.total > data.limit && (
                      <nav
                        aria-label="Paginação do catálogo"
                        className="flex items-center justify-center gap-3"
                      >
                        <Button
                          variant="outline"
                          disabled={page <= 1 || busy}
                          onClick={() => setPage((value) => value - 1)}
                        >
                          Anterior
                        </Button>
                        <span>
                          {page} / {Math.ceil(data.total / data.limit)}
                        </span>
                        <Button
                          variant="outline"
                          disabled={page * data.limit >= data.total || busy}
                          onClick={() => setPage((value) => value + 1)}
                        >
                          Próxima
                        </Button>
                      </nav>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border p-5">
                    <p role="status">Não encontramos esse aparelho.</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Tente outro termo ou use o cadastro manual. A biblioteca
                      inicial ainda é pequena.
                    </p>
                  </div>
                )}
                <Button
                  type="button"
                  variant="link"
                  disabled={busy}
                  onClick={() => setMode("manual")}
                >
                  Não encontrou? Adicionar manualmente
                </Button>
              </>
            )}
          </div>
          <div className="min-w-0 lg:sticky lg:top-0">
            {mode === "library" && selected ? (
              <DeviceConfigurationPanel
                key={selected.id}
                device={selected}
                onAddAppliance={onAddAppliance}
                onSaved={onSaved}
                onBusyChange={changedBusy}
              />
            ) : mode === "smart" && smart ? (
              <DeviceConfigurationPanel
                key={smart.id}
                integration={smart}
                onAddAppliance={onAddAppliance}
                onSaved={onSaved}
                onBusyChange={changedBusy}
              />
            ) : (
              <Card className="space-y-3 border-dashed p-6">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
                <h2 className="font-semibold">Configuração do aparelho</h2>
                <p className="text-sm text-muted-foreground">
                  Selecione{" "}
                  {mode === "library"
                    ? "um modelo na biblioteca"
                    : "um dispositivo conectado"}{" "}
                  para personalizar o uso e visualizar o consumo estimado.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
