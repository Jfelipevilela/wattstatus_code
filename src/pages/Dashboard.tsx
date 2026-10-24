import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CalendarX,
  ChevronDown,
  Info,
  PlugZap,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/DataState";
import { SummarySkeleton } from "@/components/dashboard/SummarySkeleton";
import IntegrationUsage from "@/components/IntegrationUsage";
import { SummaryHeader } from "@/components/dashboard/SummaryHeader";
import { EnergyHero } from "@/components/dashboard/EnergyHero";
import { EnergyInsights, type Insight } from "@/components/dashboard/EnergyInsights";
import { AIInsights } from "@/components/wattai/AIInsights";
import {
  ConsumptionTrendChart,
  type TrendPoint,
} from "@/components/dashboard/ConsumptionTrendChart";
import { ConsumptionDistribution } from "@/components/dashboard/ConsumptionDistribution";
import { ApplianceRanking } from "@/components/dashboard/ApplianceRanking";
import { MeasuredDetails } from "@/components/dashboard/MeasuredDetails";
import { SummaryEmptyState } from "@/components/dashboard/SummaryEmptyState";
import {
  monthKey,
  percentChange,
  summarizeMonth,
  type DataStatus,
} from "@/components/dashboard/summary";
import { useAppliances } from "@/hooks/useAppliances";
import { useProperties } from "@/hooks/useProperties";
import { appliancePropertyId } from "@/lib/property-energy";
import { PropertyScopeBar } from "@/components/dashboard/PropertyScopeBar";
import { useEnergyHistory } from "@/hooks/useEnergyHistory";
import { measuredByMonth } from "@/lib/measured";
import {
  getMonthlyEstimate,
  getEstimateHistory,
  formatCurrency,
  formatNumber,
} from "@/lib/energy";

const monthName = (year: number, month: number, format: "long" | "short" = "long") =>
  new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: format,
    ...(format === "long" ? { year: "numeric" } : {}),
  });

export default function Dashboard() {
  const { appliances: allAppliances, loading, error, refetch, lastUpdated } = useAppliances();
  const { properties, primary } = useProperties();
  const now = new Date();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(
    searchParams.get("periodo") ?? "",
  );
  const selectedYear = periodMatch ? Number(periodMatch[1]) : now.getFullYear();
  const selectedMonth = periodMatch ? Number(periodMatch[2]) : now.getMonth() + 1;
  const setPeriod = (year: number, month: number) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (year === now.getFullYear() && month === now.getMonth() + 1)
          next.delete("periodo");
        else next.set("periodo", monthKey(year, month));
        return next;
      },
      { replace: true },
    );
  // One extra day on each side so a property in another time zone still gets
  // its whole months; readings are filed by month key afterwards.
  const historyStart = useMemo(
    () => new Date(selectedYear, selectedMonth - 6, 0),
    [selectedYear, selectedMonth],
  );
  const historyEnd = useMemo(
    () => new Date(selectedYear, selectedMonth, 2),
    [selectedYear, selectedMonth],
  );
  const energy = useEnergyHistory(historyStart, historyEnd);

  // Scope: all properties or one. Legacy appliances count in the primary one.
  const scopeId = properties.some((item) => item.id === searchParams.get("imovel")) ? searchParams.get("imovel") : null;
  const scopeProperty = properties.find((item) => item.id === scopeId) ?? null;
  const setScope = (id: string | null) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (id) next.set("imovel", id);
        else next.delete("imovel");
        return next;
      },
      { replace: true },
    );
  const appliances = scopeId
    ? allAppliances.filter((item) => appliancePropertyId(item, primary?.id ?? null) === scopeId)
    : allAppliances;
  // A single property is read in its own time zone; "all" uses the browser's.
  const timeZone = scopeProperty?.timezone ?? null;
  const scopedIntervals = scopeId ? energy.intervals.filter((item) => item.propertyId === scopeId) : energy.intervals;
  const estimate = getMonthlyEstimate(appliances, selectedYear, selectedMonth);
  const history = getEstimateHistory(appliances, selectedYear, selectedMonth);
  const measured = summarizeMonth(
    scopedIntervals,
    appliances,
    selectedYear,
    selectedMonth,
    timeZone,
  );
  const measuredMonths = new Map(
    measuredByMonth(scopedIntervals, timeZone).map((row) => [row.month, row.consumptionKWh]),
  );
  const trend: TrendPoint[] = history.map((point, index) => {
    const date = new Date(selectedYear, selectedMonth - 6 + index, 1);
    return {
      label: point.month,
      estimated: point.consumption,
      measured:
        measuredMonths.get(monthKey(date.getFullYear(), date.getMonth() + 1)) ??
        null,
    };
  });

  const years = Array.from(
    new Set([
      now.getFullYear(),
      selectedYear,
      ...appliances
        .map((appliance) => new Date(appliance.createdAt).getFullYear())
        .filter(Number.isFinite),
    ]),
  );
  const firstYear = Math.min(now.getFullYear() - 5, ...years);
  const lastYear = Math.max(now.getFullYear() + 1, ...years);
  const yearOptions = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => lastYear - index,
  );
  const periodLabel = monthName(selectedYear, selectedMonth);
  const previousDate = new Date(selectedYear, selectedMonth - 2, 1);
  const previousLabel = monthName(
    previousDate.getFullYear(),
    previousDate.getMonth() + 1,
    "short",
  ).replace(".", "");
  const previousEstimate = history[history.length - 2]?.consumption ?? 0;
  const change = percentChange(estimate.consumption, previousEstimate);
  const topConsumer = [...estimate.rows].sort((a, b) => b.consumo - a.consumo)[0];
  const imported = appliances.filter(
    (appliance) => (appliance.measuredConsumptionKWh ?? 0) > 0,
  );
  const integrated = appliances.filter((appliance) => appliance.integrationDeviceId);
  const missingDates = appliances.filter(
    (appliance) => !Number.isFinite(new Date(appliance.createdAt).getTime()),
  ).length;
  const monthsWithoutReading =
    measuredMonths.size > 0
      ? trend.filter((point) => point.measured === null).length
      : 0;
  const status: DataStatus = !measured
    ? "estimated"
    : measured.longGaps > 0 || !measured.costComplete || monthsWithoutReading > 0
      ? "incomplete"
      : "measured";
  const isCurrentMonth =
    selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const resetPeriod = () => {
    setPeriod(now.getFullYear(), now.getMonth() + 1);
  };

  const insights: Insight[] = [];
  if (topConsumer && estimate.consumption > 0) {
    const appliance = appliances.find((item) => item.id === topConsumer.id);
    const share = (topConsumer.consumo / estimate.consumption) * 100;
    const rate = topConsumer.consumo > 0 ? topConsumer.custo / topConsumer.consumo : 0;
    const hourSaving =
      appliance && appliance.usageHours >= 1
        ? ((appliance.power * Math.min(appliance.days, estimate.days)) / 1000) * rate
        : 0;
    insights.push({
      id: "top",
      icon: Zap,
      tone: "neutral",
      title: `${topConsumer.name} responde por ${formatNumber(share, 0)}% do consumo`,
      body:
        hourSaving > 0
          ? `Usar 1 h a menos por dia economizaria cerca de ${formatCurrency(hourSaving)} no mês (estimativa).`
          : "É o primeiro lugar para buscar economia.",
    });
  }
  if (change !== null && Math.abs(change) >= 0.5) {
    insights.push({
      id: "change",
      icon: change > 0 ? TrendingUp : TrendingDown,
      tone: change > 0 ? "warning" : "positive",
      title: `Projeção ${change > 0 ? "subiu" : "caiu"} ${formatNumber(Math.abs(change), 1)}% vs. ${previousLabel}`,
      body: "Reflete aparelhos cadastrados e dias do mês, não leituras reais.",
    });
  }
  if (measured) {
    const measuredNames = new Set(measured.byAppliance.keys());
    const comparable = estimate.rows
      .filter((row) => measuredNames.has(row.name))
      .reduce((sum, row) => sum + row.consumo, 0);
    const measuredComparable = [...measured.byAppliance]
      .filter(([name]) => estimate.rows.some((row) => row.name === name))
      .reduce((sum, [, value]) => sum + value, 0);
    const diff = percentChange(measuredComparable, comparable);
    if (diff !== null)
      insights.push({
        id: "accuracy",
        icon: Info,
        tone: "neutral",
        title: `Medido está ${formatNumber(Math.abs(diff), 0)}% ${diff >= 0 ? "acima" : "abaixo"} do estimado`,
        body: "Comparação só entre aparelhos com medição neste mês. Ajuste o tempo de uso para aproximar a estimativa.",
        action: { label: "Revisar aparelhos", to: "/aparelhos" },
      });
  } else if (integrated.length > 0) {
    insights.push({
      id: "no-reading",
      icon: AlertTriangle,
      tone: "warning",
      title: "Sem leituras neste mês",
      body: `${integrated.length} aparelho(s) integrado(s), mas nenhuma medição foi registrada no período.`,
      action: { label: "Ver integrações", to: "/apps" },
    });
  } else if (appliances.length > 0) {
    insights.push({
      id: "connect",
      icon: PlugZap,
      tone: "neutral",
      title: "Tudo aqui é estimativa",
      body: "Conecte um medidor SmartThings para ver o consumo real ao lado da projeção.",
      action: { label: "Conectar", to: "/apps" },
    });
  }
  if ((measured?.longGaps ?? 0) > 0 || monthsWithoutReading > 0) {
    insights.push({
      id: "gaps",
      icon: CalendarX,
      tone: "warning",
      title: "Há lacunas no histórico medido",
      body: [
        monthsWithoutReading > 0 && `${monthsWithoutReading} de 6 meses sem leitura.`,
        (measured?.longGaps ?? 0) > 0 &&
          `${measured!.longGaps} intervalo(s) acima de 2 h neste mês.`,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  if (missingDates > 0) {
    insights.push({
      id: "dates",
      icon: AlertTriangle,
      tone: "warning",
      title: `${missingDates} aparelho(s) fora do cálculo`,
      body: "Sem data de cadastro válida, não entram na estimativa por período.",
      action: { label: "Corrigir", to: "/aparelhos" },
    });
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Zap className="h-5 w-5 text-energy-green-light" />
          <span className="font-semibold">Visão geral</span>
        </header>
        <main className="container mx-auto min-w-0 max-w-7xl space-y-8 px-4 py-6 sm:py-8">
          {properties.length > 1 && (
            <PropertyScopeBar
              properties={properties}
              scopeId={scopeId}
              onChange={setScope}
              appliances={allAppliances}
              primaryId={primary?.id ?? null}
              year={selectedYear}
              month={selectedMonth}
            />
          )}
          <SummaryHeader
            month={selectedMonth}
            year={selectedYear}
            years={yearOptions}
            periodLabel={periodLabel}
            scopeLabel={properties.length > 1 ? scopeProperty?.name ?? "todos os imóveis" : undefined}
            isCurrentMonth={isCurrentMonth}
            refreshing={loading || energy.loading}
            onChange={setPeriod}
            onReset={resetPeriod}
            onRefresh={() => {
              refetch();
              energy.refresh();
            }}
          />
          {loading && allAppliances.length === 0 ? (
            <SummarySkeleton />
          ) : (
            <DataState loading={false} error={error} onRetry={refetch} />
          )}
          {!error && !(loading && allAppliances.length === 0) && (
            <>
              {allAppliances.length === 0 ? (
                <SummaryEmptyState />
              ) : estimate.rows.length === 0 ? (
                <section className="rounded-3xl border border-dashed bg-card p-8 text-center sm:p-12">
                  <h2 className="text-xl font-semibold">
                    Nenhum aparelho em <span className="capitalize">{periodLabel}</span>
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                    Seus aparelhos foram cadastrados depois deste mês. Escolha
                    outro período ou adicione um aparelho com data anterior.
                  </p>
                  <Button variant="outline" className="mt-6 h-11" onClick={resetPeriod}>
                    Voltar ao mês atual
                  </Button>
                </section>
              ) : (
                <>
                  <EnergyHero
                    periodLabel={periodLabel}
                    days={estimate.days}
                    consumption={estimate.consumption}
                    cost={estimate.cost}
                    change={change}
                    previousLabel={previousLabel}
                    topConsumer={topConsumer}
                    applianceCount={estimate.rows.length}
                    measured={measured}
                    measuredLoading={energy.loading}
                    measuredError={energy.error}
                    status={status}
                  />
                  <EnergyInsights insights={insights.slice(0, 4)} />
                  <AIInsights />
                  <div className="grid min-w-0 gap-6 lg:grid-cols-[1.6fr_1fr]">
                    <ConsumptionTrendChart data={trend} />
                    <ConsumptionDistribution
                      rows={estimate.rows}
                      total={estimate.consumption}
                    />
                  </div>
                  <ApplianceRanking
                    rows={estimate.rows}
                    appliances={appliances}
                    measuredByName={measured?.byAppliance ?? new Map()}
                    total={estimate.consumption}
                  />
                </>
              )}
              {appliances.length > 0 && (
                <MeasuredDetails measured={measured} imported={imported} />
              )}
              {appliances.length > 0 && (
                <details className="group rounded-2xl border bg-muted/30 p-5 text-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                    Como calculamos estes números
                    <ChevronDown
                      className="h-4 w-4 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="mt-3 space-y-2 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Estimado:</strong>{" "}
                      potência × horas de uso × dias de uso (limitados aos{" "}
                      {estimate.days} dias do mês), com a tarifa cadastrada.
                      Aparelhos cadastrados até o fim do período entram nos
                      meses seguintes.
                    </p>
                    <p>
                      <strong className="text-foreground">Medido:</strong>{" "}
                      diferença entre leituras acumuladas do medidor
                      SmartThings, registradas quando o dispositivo é
                      consultado. Leituras importadas não entram na estimativa.
                    </p>
                    <p>
                      Alterar ou excluir aparelhos muda as projeções de meses
                      anteriores.
                    </p>
                    {lastUpdated && (
                      <p className="text-xs">
                        Cadastro consultado em {lastUpdated.toLocaleString("pt-BR")}.
                        Este horário não é o da medição dos dispositivos.
                      </p>
                    )}
                  </div>
                </details>
              )}
              <IntegrationUsage appliances={appliances} />
            </>
          )}
          {!error && appliances.length > 0 && integrated.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Quer números reais?{" "}
              <Link to="/apps" className="font-medium text-primary underline-offset-4 hover:underline dark:text-energy-400">
                Conecte o SmartThings
              </Link>
            </p>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
