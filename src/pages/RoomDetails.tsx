import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Crown, Plug, Radio } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConsumptionTrendChart, type TrendPoint } from "@/components/dashboard/ConsumptionTrendChart";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { useProperties, usePropertyEnergy, usePropertyLayout } from "@/hooks/useProperties";
import { useAppliances } from "@/hooks/useAppliances";
import { appliancePropertyId } from "@/lib/property-energy";
import { measuredByMonth } from "@/lib/measured";
import { estimateAppliance, formatCurrency, formatNumber, getEstimateHistory } from "@/lib/energy";
import { cn } from "@/lib/utils";
import { ROOM_TYPES, roomColor } from "@/types/property";

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export default function RoomDetails() {
  const { id = "", roomId = "" } = useParams();
  const api = useProperties();
  const layout = usePropertyLayout(id);
  const { appliances, loading: appliancesLoading } = useAppliances();
  const now = useMemo(() => new Date(), []);
  const start = useMemo(() => new Date(now.getFullYear(), now.getMonth() - 5, 1), [now]);
  const end = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 1), [now]);
  const measured = usePropertyEnergy(id, start, end);

  const property = api.properties.find((item) => item.id === id);
  const room = layout.rooms.find((item) => item.id === roomId);
  const primaryId = api.primary?.id ?? null;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const roomAppliances = appliances.filter((item) => appliancePropertyId(item, primaryId) === id && item.roomId === roomId);
  const ranked = roomAppliances
    .map((appliance) => ({ appliance, ...estimateAppliance(appliance, days) }))
    .sort((a, b) => b.cost - a.cost);
  const estimatedCost = ranked.reduce((sum, row) => sum + row.cost, 0);
  const estimatedKWh = ranked.reduce((sum, row) => sum + row.consumption, 0);
  const roomIntervals = measured.intervals.filter((item) => item.roomId === roomId && !item.locationChanged);
  const monthly = new Map(measuredByMonth(roomIntervals).map((row) => [row.month, row.consumptionKWh]));
  const current = monthly.get(monthKey(now));
  const currentCost = roomIntervals
    .filter((item) => monthKey(new Date(item.endAt)) === monthKey(now))
    .reduce((sum, item) => (sum === null || item.cost === null ? null : sum + item.cost), 0 as number | null);
  const trend: TrendPoint[] = getEstimateHistory(roomAppliances, now.getFullYear(), now.getMonth() + 1).map((point, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { label: point.month, estimated: point.consumption, measured: monthly.get(monthKey(date)) ?? null };
  });
  const loading = api.loading || layout.loading || appliancesLoading;
  const max = ranked[0]?.cost ?? 0;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <nav aria-label="Trilha" className="flex min-w-0 items-center gap-2 text-sm">
            <Link to="/imoveis" className="text-muted-foreground hover:text-foreground">Meus imóveis</Link>
            <span className="text-muted-foreground">/</span>
            <Link to={`/imoveis/${id}`} className="truncate text-muted-foreground hover:text-foreground">{property?.name ?? "Imóvel"}</Link>
            <span className="text-muted-foreground">/</span>
            <span className="truncate font-semibold">{room?.name ?? "Ambiente"}</span>
          </nav>
        </header>
        <main className="container mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6">
          {loading ? (
            <Skeleton className="h-96 rounded-3xl" />
          ) : !property || !room ? (
            <section className="rounded-3xl border border-dashed p-12 text-center">
              <h1 className="text-xl font-semibold">Ambiente não encontrado</h1>
              <Button asChild className="mt-6 rounded-full">
                <Link to={property ? `/imoveis/${id}?aba=ambientes` : "/imoveis"}>Voltar</Link>
              </Button>
            </section>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1" role="navigation" aria-label="Outros ambientes">
                {layout.rooms.map((item) => (
                  <Link
                    key={item.id}
                    to={`/imoveis/${id}/ambientes/${item.id}`}
                    aria-current={item.id === roomId ? "page" : undefined}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                      item.id === roomId ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>

              <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-8">
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: `${roomColor(room)}55` }} />
                <Link to={`/imoveis/${id}`} className="relative inline-flex items-center gap-1 text-xs text-white/60 hover:text-white">
                  <ArrowLeft className="h-3.5 w-3.5" /> {property.name}
                </Link>
                <h1 className="relative mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{room.name}</h1>
                <p className="relative text-sm text-white/60">{ROOM_TYPES[room.type] ?? "Ambiente"}</p>
                <dl className="relative mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs uppercase tracking-widest text-white/50">Estimado/mês</dt>
                    <dd className="mt-1 text-4xl font-bold tabular-nums">{formatCurrency(estimatedCost)}</dd>
                    <dd className="text-sm text-white/60">{formatNumber(estimatedKWh, 1)} kWh</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs uppercase tracking-widest text-white/50">
                      <Radio className="h-3 w-3" aria-hidden="true" /> Medido no mês
                    </dt>
                    {current !== undefined ? (
                      <>
                        <dd className="mt-1 text-4xl font-bold tabular-nums">{currentCost === null ? "—" : formatCurrency(currentCost)}</dd>
                        <dd className="text-sm text-white/60">{formatNumber(current, 2)} kWh</dd>
                      </>
                    ) : (
                      <dd className="mt-1 text-2xl font-semibold text-white/80">Sem medição</dd>
                    )}
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs uppercase tracking-widest text-white/50">
                      <Plug className="h-3 w-3" aria-hidden="true" /> Aparelhos
                    </dt>
                    <dd className="mt-1 text-4xl font-bold tabular-nums">{roomAppliances.length}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-xs uppercase tracking-widest text-white/50">
                      <Crown className="h-3 w-3" aria-hidden="true" /> Maior consumidor
                    </dt>
                    <dd className="mt-1 truncate text-xl font-semibold">{ranked[0]?.appliance.name ?? "—"}</dd>
                  </div>
                </dl>
              </section>

              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <ConsumptionTrendChart data={trend} />
                <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
                  <h2 className="text-lg font-semibold">Aparelhos do ambiente</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Custo estimado no mês.</p>
                  {ranked.length === 0 ? (
                    <p className="mt-5 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Nenhum aparelho aqui. Associe pela planta ou pela aba Aparelhos do imóvel.
                    </p>
                  ) : (
                    <ol className="mt-4 space-y-3">
                      {ranked.map(({ appliance, cost, consumption }) => {
                        const { icon: Icon, tone, bar } = applianceVisual(appliance.name);
                        return (
                          <li key={appliance.id} className="flex items-center gap-3">
                            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex justify-between gap-2 text-sm">
                                <span className="truncate font-medium">{appliance.name}</span>
                                <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(cost)}</span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                                <div className={cn("h-full rounded-full", bar)} style={{ width: `${max > 0 ? (cost / max) * 100 : 0}%` }} />
                              </div>
                              <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                                {formatNumber(consumption, 1)} kWh · {appliance.integrationProvider ? "com medidor" : "estimado"}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              </div>
              <p className="text-xs text-muted-foreground">
                Barras medidas usam só leituras registradas enquanto o aparelho estava neste ambiente. A área estimada é uma projeção com o
                cadastro atual, não histórico.
              </p>
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
