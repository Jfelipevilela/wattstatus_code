import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Radio,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";
import type { Appliance } from "@/hooks/useAppliances";
import { useAuth } from "@/hooks/useAuth";
import { useEnergyHistory } from "@/hooks/useEnergyHistory";
import { useProperties, usePropertyLayout } from "@/hooks/useProperties";
import { appliancePropertyId } from "@/lib/property-energy";
import { apiRequest } from "@/lib/api";
import { measuredByDevice, summarizeMeasured } from "@/lib/measured";
import {
  estimateAppliance,
  formatCurrency,
  formatDuration,
  formatNumber,
  getMonthlyEstimate,
} from "@/lib/energy";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { cn } from "@/lib/utils";

interface ReportsTabProps {
  appliances: Appliance[];
}

interface ReportRow {
  id: string;
  applianceName: string;
  power: number;
  usageHours: number;
  daysInMonth: number;
  tariff: string;
  tariffValue: number;
  consumption: number;
  cost: number;
}

type SortKey = "applianceName" | "consumption" | "cost";

const ReportsTab: React.FC<ReportsTabProps> = ({ appliances: allAppliances }) => {
  const { user, token } = useAuth();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [selectedAppliance, setSelectedAppliance] = useState("all");
  const [propertyId, setPropertyId] = useState("all");
  const [roomId, setRoomId] = useState("all");
  const { properties, primary } = useProperties();
  const { rooms } = usePropertyLayout(propertyId === "all" ? undefined : propertyId);
  const property = properties.find((item) => item.id === propertyId);
  const room = rooms.find((item) => item.id === roomId);
  // Scope chain: property > room > appliance. Each level narrows the previous.
  const appliances = allAppliances.filter(
    (item) =>
      (propertyId === "all" || appliancePropertyId(item, primary?.id ?? null) === propertyId) &&
      (roomId === "all" || (roomId === "none" ? !item.roomId : item.roomId === roomId)),
  );
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "cost", desc: true });
  const [exporting, setExporting] = useState(false);
  const generatedAt = useRef(new Date());

  const start = useMemo(() => new Date(period.year, period.month - 1, 1), [period]);
  const end = useMemo(() => new Date(period.year, period.month, 1), [period]);
  const measured = useEnergyHistory(start, end, selectedAppliance === "all" ? undefined : selectedAppliance);

  const recordReportEvent = (
    event: "generation_completed" | "export_started" | "export_completed" | "export_failed",
    fields: { itemCount?: number; durationMs?: number } = {},
  ) => {
    void apiRequest(
      "/api/reports/events",
      { method: "POST", body: JSON.stringify({ event, ...fields }), skipErrorToast: true },
      token || undefined,
    ).catch(() => undefined);
  };

  const daysInMonth = new Date(period.year, period.month, 0).getDate();
  const availableIds = new Set(getMonthlyEstimate(appliances, period.year, period.month).rows.map((row) => row.id));
  const rows: ReportRow[] = appliances
    .filter((appliance) => availableIds.has(appliance.id) && (selectedAppliance === "all" || appliance.id === selectedAppliance))
    .map((appliance) => {
      const { consumption, cost } = estimateAppliance(appliance, daysInMonth);
      return {
        id: appliance.id,
        applianceName: appliance.name,
        power: appliance.power,
        usageHours: appliance.usageHours,
        daysInMonth: Math.min(appliance.days, daysInMonth),
        tariff: appliance.tariff,
        tariffValue: consumption > 0 ? cost / consumption : 0,
        consumption,
        cost,
      };
    })
    .sort((a, b) => {
      const order =
        sort.key === "applianceName"
          ? a.applianceName.localeCompare(b.applianceName, "pt-BR")
          : a[sort.key] - b[sort.key];
      return sort.desc ? -order : order;
    });

  const totalConsumption = rows.reduce((sum, item) => sum + item.consumption, 0);
  const totalCost = rows.reduce((sum, item) => sum + item.cost, 0);
  // Measured readings follow where the appliance was when captured.
  const scopedIntervals = measured.intervals.filter(
    (item) =>
      (propertyId === "all" || item.propertyId === propertyId) &&
      (roomId === "all" || (roomId === "none" ? !item.roomId && !item.locationChanged : item.roomId === roomId)),
  );
  const measuredRows = measuredByDevice(scopedIntervals);
  const measuredTotals = summarizeMeasured(scopedIntervals);
  const hasMeasured = measuredRows.length > 0;
  const nameOf = (applianceId: string | null, deviceId: string) =>
    allAppliances.find((appliance) => appliance.id === applianceId)?.name || `Dispositivo ${deviceId}`;

  useEffect(() => {
    generatedAt.current = new Date();
    if (!measured.loading) recordReportEvent("generation_completed", { itemCount: rows.length + scopedIntervals.length });
    // Record once per finished period/filter load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured.loading, period, selectedAppliance]);

  const periodLabel = start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const isCurrent = period.year === now.getFullYear() && period.month === now.getMonth() + 1;
  const shift = (delta: number) => {
    const date = new Date(period.year, period.month - 1 + delta, 1);
    setPeriod({ year: date.getFullYear(), month: date.getMonth() + 1 });
  };
  const toggleSort = (key: SortKey) =>
    setSort((current) => ({ key, desc: current.key === key ? !current.desc : key !== "applianceName" }));

  const exportToPDF = async () => {
    if (measured.error || (rows.length === 0 && !hasMeasured) || exporting) return;
    setExporting(true);
    const startedAt = Date.now();
    const itemCount = rows.length + scopedIntervals.length;
    recordReportEvent("export_started", { itemCount });
    try {
      const { createReportPdf } = await import("@/lib/report-pdf");
      const month = String(period.month).padStart(2, "0");
      const pdf = createReportPdf({
        userName: user?.name || "Usuário",
        scope: scopeLabel,
        month,
        year: String(period.year),
        issuedAt: new Date().toLocaleString("pt-BR"),
        estimated: rows.map((item) => ({
          applianceName: item.applianceName,
          source: "Estimativa",
          tariffValue: item.tariffValue,
          consumptionKWh: item.consumption,
          cost: item.cost,
        })),
        measured: measuredRows.map((item) => ({
          applianceName: nameOf(item.applianceId, item.deviceId),
          source: "SmartThings",
          tariffValue: item.tariffValue,
          consumptionKWh: item.consumptionKWh,
          cost: item.cost,
        })),
      });
      pdf.save(`wattstatus_${month}_${period.year}.pdf`);
      recordReportEvent("export_completed", { itemCount, durationMs: Date.now() - startedAt });
      toast({ title: "PDF gerado", description: `Relatório de ${periodLabel} baixado.` });
    } catch {
      recordReportEvent("export_failed", { durationMs: Date.now() - startedAt });
      toast({ title: "Erro na exportação", description: "Não foi possível exportar o PDF.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const scopeLabel = [
    property?.name ?? (properties.length > 1 ? "Todos os imóveis" : null),
    roomId === "none" ? "Sem ambiente" : room?.name,
    selectedAppliance !== "all" ? allAppliances.find((item) => item.id === selectedAppliance)?.name : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const selectedName =
    selectedAppliance === "all" ? "Todos os aparelhos" : appliances.find((item) => item.id === selectedAppliance)?.name ?? "Aparelho";
  const canExport = !measured.loading && !measured.error && (rows.length > 0 || hasMeasured);
  const measuredShare = totalConsumption > 0 && hasMeasured ? (measuredTotals.consumptionKWh / totalConsumption) * 100 : null;

  const SortHeader = ({ label, column, align = "left" }: { label: string; column: SortKey; align?: "left" | "right" }) => (
    <th scope="col" aria-sort={sort.key === column ? (sort.desc ? "descending" : "ascending") : "none"} className={cn("px-4 py-3 font-medium", align === "right" && "text-right")}>
      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.key === column && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-energy-green-light/10 px-3 py-1 text-xs font-medium text-energy-700 dark:text-energy-400">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Relatório mensal
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Relatórios</h1>
          <p className="mt-2 text-muted-foreground">Estimado e medido lado a lado, pronto para exportar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Período" className="flex items-center rounded-full border bg-card p-1 shadow-sm">
            <button type="button" aria-label="Mês anterior" onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9.5rem] text-center text-sm font-semibold capitalize" aria-live="polite">
              {periodLabel}
            </span>
            <button type="button" aria-label="Próximo mês" onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {!isCurrent && (
            <Button variant="ghost" className="h-11 rounded-full" onClick={() => setPeriod({ year: now.getFullYear(), month: now.getMonth() + 1 })}>
              Mês atual
            </Button>
          )}
          {properties.length > 0 && (
            <select
              aria-label="Imóvel"
              value={propertyId}
              onChange={(event) => {
                setPropertyId(event.target.value);
                setRoomId("all");
                setSelectedAppliance("all");
              }}
              className="h-11 max-w-[12rem] rounded-full border bg-card px-4 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Todos os imóveis</option>
              {properties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          {propertyId !== "all" && (
            <select
              aria-label="Ambiente"
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value);
                setSelectedAppliance("all");
              }}
              className="h-11 max-w-[12rem] rounded-full border bg-card px-4 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Todos os ambientes</option>
              {rooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
              <option value="none">Sem ambiente</option>
            </select>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-11 max-w-[14rem] items-center gap-2 rounded-full border bg-card px-4 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="truncate">{selectedName}</span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuItem onSelect={() => setSelectedAppliance("all")}>Todos os aparelhos</DropdownMenuItem>
              {appliances.map((appliance) => (
                <DropdownMenuItem key={appliance.id} onSelect={() => setSelectedAppliance(appliance.id)}>
                  {appliance.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={exportToPDF} disabled={!canExport || exporting} className="h-11 rounded-full px-5">
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar PDF
          </Button>
        </div>
      </header>

      <article className="overflow-hidden rounded-[32px] border bg-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 p-6 text-white sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-energy-green-light/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4 text-sm text-white/60">
            <div>
              <p className="font-semibold text-white">WattStatus · Relatório de energia</p>
              <p className="mt-1">
                {user?.name || "Usuário"} · <span className="capitalize">{periodLabel}</span> · {scopeLabel || selectedName}
              </p>
            </div>
            <p className="text-xs">Emitido em {generatedAt.current.toLocaleString("pt-BR")}</p>
          </div>
          <dl className="relative mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-white/50">
                <Calculator className="h-3.5 w-3.5" aria-hidden="true" /> Estimado
              </dt>
              <dd className="mt-2 text-4xl font-bold tabular-nums">{formatCurrency(totalCost)}</dd>
              <dd className="text-sm text-white/60">{formatNumber(totalConsumption, 1)} kWh</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-white/50">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Medido
              </dt>
              {measured.loading ? (
                <dd className="mt-2 flex items-center gap-2 text-white/60">
                  <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
                </dd>
              ) : hasMeasured ? (
                <>
                  <dd className="mt-2 text-4xl font-bold tabular-nums">
                    {measuredTotals.costComplete ? formatCurrency(measuredTotals.knownCost) : "—"}
                  </dd>
                  <dd className="text-sm text-white/60">{formatNumber(measuredTotals.consumptionKWh, 1)} kWh</dd>
                </>
              ) : (
                <>
                  <dd className="mt-2 text-2xl font-semibold text-white/80">Sem medição</dd>
                  <dd className="text-sm text-white/50">Nada substituído por estimativa</dd>
                </>
              )}
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-white/50">Aparelhos</dt>
              <dd className="mt-2 text-4xl font-bold tabular-nums">{rows.length}</dd>
              <dd className="text-sm text-white/60">{measuredRows.length} com medição</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-white/50">Média diária</dt>
              <dd className="mt-2 text-4xl font-bold tabular-nums">{formatCurrency(totalCost / daysInMonth)}</dd>
              <dd className="text-sm text-white/60">{formatNumber(totalConsumption / daysInMonth, 1)} kWh/dia</dd>
            </div>
          </dl>
          {measuredShare !== null && (
            <div className="relative mt-8">
              <div className="flex justify-between text-xs text-white/60">
                <span>Medido vs. estimado</span>
                <span className="font-semibold text-white">{formatNumber(measuredShare, 0)}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" role="presentation">
                <div className="h-full rounded-full bg-gradient-to-r from-energy-blue-light to-energy-teal" style={{ width: `${Math.min(measuredShare, 100)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-white/50">A medição pode cobrir só parte do mês e só os aparelhos conectados.</p>
            </div>
          )}
        </div>

        <section aria-labelledby="estimated-title" className="p-4 sm:p-6">
          <h2 id="estimated-title" className="flex items-center gap-2 px-2 text-lg font-semibold">
            <Calculator className="h-4 w-4 text-energy-green-light" aria-hidden="true" /> Consumo estimado
          </h2>
          {rows.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum aparelho cadastrado até o fim de {periodLabel}. Escolha outro mês ou aparelho.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <SortHeader label="Aparelho" column="applianceName" />
                    <th scope="col" className="px-4 py-3 font-medium">Uso</th>
                    <th scope="col" className="px-4 py-3 font-medium">Tarifa</th>
                    <SortHeader label="kWh" column="consumption" align="right" />
                    <SortHeader label="Custo" column="cost" align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((item) => {
                    const { icon: Icon, tone, bar } = applianceVisual(item.applianceName);
                    const share = totalCost > 0 ? (item.cost / totalCost) * 100 : 0;
                    return (
                      <tr key={item.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{item.applianceName}</p>
                              <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-muted" role="presentation">
                                <div className={cn("h-full rounded-full", bar)} style={{ width: `${share}%` }} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatNumber(item.power, 0)} W · {formatDuration(item.usageHours)}/dia · {item.daysInMonth} dias
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.tariff} · {formatCurrency(item.tariffValue)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatNumber(item.consumption, 1)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatCurrency(item.cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="px-4 py-3" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(totalConsumption, 1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totalCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="measured-title" className="border-t p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 px-2">
            <h2 id="measured-title" className="flex items-center gap-2 text-lg font-semibold">
              <Radio className="h-4 w-4 text-energy-blue-light" aria-hidden="true" /> Consumo medido
            </h2>
            {measured.error && (
              <Button variant="outline" size="sm" className="rounded-full" onClick={measured.refresh}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Tentar de novo
              </Button>
            )}
          </div>
          {measured.error ? (
            <p role="alert" className="mt-4 rounded-2xl border border-destructive/40 p-4 text-sm">
              Não foi possível consultar as medições: {measured.error}. A exportação fica bloqueada até carregar.
            </p>
          ) : measured.loading ? (
            <p className="mt-4 flex items-center gap-2 px-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Consultando medições…
            </p>
          ) : !hasMeasured ? (
            <p className="mt-4 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Sem medições suficientes em {periodLabel}. Nenhum valor medido foi substituído por estimativa.
            </p>
          ) : (
            <ul className="mt-4 divide-y rounded-2xl border">
              {measuredRows.map((item) => (
                <li key={`${item.deviceId}-${item.tariffValue}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{nameOf(item.applianceId, item.deviceId)}</span>
                    <span className="text-xs text-muted-foreground">
                      SmartThings · {item.tariffValue === null ? "tarifa indisponível" : `${formatCurrency(item.tariffValue)}/kWh`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{item.cost === null ? "—" : formatCurrency(item.cost)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(item.consumptionKWh, 2)} kWh</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="border-t bg-muted/30 px-6 py-4 text-xs text-muted-foreground">
          Estimativas usam potência, uso e tarifa cadastrados hoje; mudar o cadastro altera meses anteriores. Medições vêm
          dos intervalos salvos da SmartThings: períodos sem coleta não significam consumo zero.
        </footer>
      </article>
    </div>
  );
};

export default ReportsTab;
