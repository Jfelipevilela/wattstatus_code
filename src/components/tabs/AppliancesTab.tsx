import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  PlugZap,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import ApplianceCard from "@/components/ApplianceCard";
import AddApplianceFlow from "@/components/AddApplianceFlow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import {
  estimateAppliance,
  formatNumber,
  formatCurrency,
  normalizeSearch,
  applianceSourceLabel,
} from "@/lib/energy";
import { cn } from "@/lib/utils";
import { referenceLabel } from "../../../backend/src/modules/catalog/reference";

const PAGE_SIZE = 9;
const SOURCES = [
  { value: "all", label: "Todos" },
  { value: "manual", label: "Manuais" },
  { value: "catalog", label: "Biblioteca" },
  { value: "connected", label: "Conectados" },
] as const;
const SORTS = [
  { value: "cost", label: "Maior custo" },
  { value: "consumption", label: "Maior consumo" },
  { value: "name", label: "Nome (A–Z)" },
] as const;

interface Props {
  appliances: Appliance[];
  onEdit: (appliance: Appliance) => void;
  onDelete: (appliance: Appliance) => void;
  onAddAppliance: (appliance: ApplianceInput) => Promise<Appliance | void>;
  onNavigateToCalculator?: () => void;
  initialAddOpen?: boolean;
}

export default function AppliancesTab({
  appliances,
  onEdit,
  onDelete,
  onAddAppliance,
  initialAddOpen = false,
}: Props) {
  const [adding, setAdding] = useState(initialAddOpen);
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]["value"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("cost");
  const [currentPage, setCurrentPage] = useState(1);

  const estimates = appliances.map((appliance) => ({ appliance, ...estimateAppliance(appliance) }));
  const totalConsumption = estimates.reduce((sum, row) => sum + row.consumption, 0);
  const totalCost = estimates.reduce((sum, row) => sum + row.cost, 0);
  const byCost = [...estimates].sort((a, b) => b.cost - a.cost);
  const rankOf = new Map(byCost.map((row, index) => [row.appliance.id, index + 1]));
  const connectedCount = appliances.filter((item) => item.integrationProvider).length;
  const shareOf = (consumption: number) => (totalConsumption > 0 ? (consumption / totalConsumption) * 100 : 0);

  const filtered = estimates
    .filter(
      ({ appliance }) =>
        normalizeSearch(appliance.name).includes(normalizeSearch(search)) &&
        (source === "all" ||
          (source === "catalog"
            ? Boolean(appliance.catalogDeviceId)
            : source === "connected"
              ? Boolean(appliance.integrationProvider)
              : !appliance.integrationProvider && !appliance.catalogDeviceId)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.appliance.name.localeCompare(b.appliance.name, "pt-BR")
        : sort === "consumption"
          ? b.consumption - a.consumption
          : b.cost - a.cost,
    );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(currentPage, pages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtering = search !== "" || source !== "all";
  const clearFilters = () => {
    setSearch("");
    setSource("all");
    setCurrentPage(1);
  };

  const top = byCost.slice(0, 5);
  const others = byCost.slice(5).reduce((sum, row) => sum + row.cost, 0);
  const segments = [
    ...top.map((row) => ({ key: row.appliance.id, name: row.appliance.name, cost: row.cost, bar: applianceVisual(row.appliance.name).bar })),
    ...(others > 0 ? [{ key: "others", name: "Outros", cost: others, bar: "bg-muted-foreground/40" }] : []),
  ].filter((segment) => segment.cost > 0);

  const addDialog = (
    <Dialog open={adding} onOpenChange={(open) => !busy && setAdding(open)}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%_-_1rem)] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Adicionar aparelho</DialogTitle>
          <DialogDescription>Escolha um modelo ou preencha os dados do seu equipamento.</DialogDescription>
        </DialogHeader>
        <AddApplianceFlow onAddAppliance={onAddAppliance} onSaved={() => setAdding(false)} onBusyChange={setBusy} />
      </DialogContent>
    </Dialog>
  );

  if (appliances.length === 0)
    return (
      <>
        {addDialog}
        <section className="relative overflow-hidden rounded-[32px] border bg-card px-6 py-14 text-center shadow-sm sm:px-10">
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-energy-green-light/20 blur-3xl" />
          <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-energy-green-light to-energy-teal text-white shadow-lg">
            <PlugZap className="h-8 w-8" aria-hidden="true" />
          </span>
          <h1 className="relative mt-6 text-3xl font-bold tracking-tight">Sua casa, aparelho por aparelho</h1>
          <p className="relative mx-auto mt-3 max-w-md text-muted-foreground">
            Cadastre o primeiro equipamento e descubra quanto ele pesa na sua conta de luz em segundos.
          </p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button className="h-12 rounded-full px-6" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" /> Cadastrar aparelho
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-full px-6">
              <Link to="/integracoes/smartthings">
                <Radio className="mr-2 h-4 w-4" /> Importar do SmartThings
              </Link>
            </Button>
          </div>
        </section>
      </>
    );

  return (
    <div className="space-y-8">
      {addDialog}

      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-energy-green-light/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-10 h-64 w-64 rounded-full bg-energy-blue-light/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {appliances.length} {appliances.length === 1 ? "aparelho" : "aparelhos"} · {connectedCount} conectado
              {connectedCount === 1 ? "" : "s"}
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Seus aparelhos</h1>
            <p className="mt-2 max-w-md text-white/60">Veja quem pesa na conta e ajuste o uso para economizar.</p>
          </div>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/50">Custo estimado/mês</p>
              <p className="mt-1 text-4xl font-bold tabular-nums sm:text-5xl">{formatCurrency(totalCost)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-white/50">Consumo</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatNumber(totalConsumption, 0)} <span className="text-base font-normal text-white/60">kWh</span>
              </p>
            </div>
            <Button
              onClick={() => setAdding(true)}
              className="h-12 rounded-full bg-energy-green-light px-6 font-semibold text-zinc-950 hover:bg-energy-400"
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>

        {segments.length > 0 && (
          <div className="relative mt-8">
            <p className="mb-2 text-xs font-medium text-white/60">Para onde vai seu dinheiro</p>
            <div className="flex h-3 gap-1 overflow-hidden rounded-full" role="img" aria-label="Distribuição do custo por aparelho">
              {segments.map((segment) => (
                <div
                  key={segment.key}
                  className={cn("h-full rounded-full first:rounded-l-full", segment.bar)}
                  style={{ width: `${(segment.cost / totalCost) * 100}%` }}
                  title={`${segment.name}: ${formatCurrency(segment.cost)}`}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/70">
              {segments.map((segment) => (
                <li key={segment.key} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", segment.bar)} />
                  <span className="max-w-[10rem] truncate">{segment.name}</span>
                  <span className="font-semibold tabular-nums text-white">
                    {formatNumber((segment.cost / totalCost) * 100, 0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Buscar aparelho</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar aparelho…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCurrentPage(1);
            }}
            className="h-11 w-full rounded-full border bg-card pl-11 pr-4 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="flex items-center gap-2 overflow-x-auto">
          <div role="group" aria-label="Origem" className="flex shrink-0 rounded-full border bg-card p-1 shadow-sm">
            {SOURCES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={source === item.value}
                onClick={() => {
                  setSource(item.value);
                  setCurrentPage(1);
                }}
                className={cn(
                  "h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  source === item.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-11 shrink-0 items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" />
              {SORTS.find((item) => item.value === sort)?.label}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORTS.map((item) => (
                <DropdownMenuItem key={item.value} onSelect={() => setSort(item.value)}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div role="group" aria-label="Visualização" className="flex shrink-0 rounded-full border bg-card p-1 shadow-sm">
            {([
              ["cards", LayoutGrid, "Cartões"],
              ["list", List, "Lista"],
            ] as const).map(([mode, ModeIcon, text]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                aria-label={text}
                title={text}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  viewMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ModeIcon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground" role="status">
        <span>
          {filtered.length} de {appliances.length} aparelhos
        </span>
        {filtering && (
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <section className="rounded-3xl border border-dashed p-12 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 font-semibold">Nada por aqui</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tente outro nome ou mude o filtro de origem.</p>
          <Button variant="outline" className="mt-5 rounded-full" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </section>
      ) : viewMode === "cards" ? (
        <div className="grid gap-5 pt-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ appliance, consumption, cost }) => (
            <ApplianceCard
              key={appliance.id}
              appliance={appliance}
              consumption={consumption}
              cost={cost}
              share={shareOf(consumption)}
              rank={rankOf.get(appliance.id) ?? 0}
              onEdit={() => onEdit(appliance)}
              onDelete={() => onDelete(appliance)}
            />
          ))}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-3xl border bg-card shadow-sm">
          {visible.map(({ appliance, consumption, cost }) => {
            const { icon: Icon, tone, bar } = applianceVisual(appliance.name);
            const share = shareOf(consumption);
            return (
              <li key={appliance.id} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{appliance.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {applianceSourceLabel(appliance)} · {appliance.energyProfile?.method === "PER_CYCLE"
                      ? `${appliance.cyclesPerMonth ?? 0} ciclos/mês`
                      : appliance.energyProfile && referenceLabel(appliance.energyProfile)
                        ? referenceLabel(appliance.energyProfile)
                        : `${formatNumber(appliance.power, 0)} W`}
                  </p>
                </div>
                <div className="hidden w-40 md:block">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                    <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.min(share, 100)}%` }} />
                  </div>
                  <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">{formatNumber(share, 0)}% do total</p>
                </div>
                <div className="w-24 text-right">
                  <p className="font-semibold tabular-nums">{formatCurrency(cost)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatNumber(consumption, 1)} kWh</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Ações de ${appliance.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEdit(appliance)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDelete(appliance)} className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Paginação dos aparelhos" className="flex items-center justify-center gap-2">
          {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
            <button
              key={number}
              type="button"
              aria-current={number === page ? "page" : undefined}
              onClick={() => setCurrentPage(number)}
              className={cn(
                "h-10 min-w-10 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                number === page ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {number}
            </button>
          ))}
        </nav>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Valores estimados com potência, horas e dias de uso cadastrados. Leituras de medidor aparecem em cada aparelho.
      </p>
    </div>
  );
}
