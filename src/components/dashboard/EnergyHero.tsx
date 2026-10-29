import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  Crown,
  Gauge,
  Minus,
  Radio,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { cn } from "@/lib/utils";
import type { DataStatus, EstimateRow, MeasuredSummary } from "./summary";

interface Props {
  periodLabel: string;
  days: number;
  consumption: number;
  cost: number;
  costIncomplete: boolean;
  change: number | null;
  previousLabel: string;
  topConsumer?: EstimateRow;
  topConsumerCostKnown: boolean;
  applianceCount: number;
  measured: MeasuredSummary | null;
  measuredLoading: boolean;
  measuredError: string | null;
  status: DataStatus;
}

const statusCopy: Record<DataStatus, { label: string; tone: string }> = {
  estimated: {
    label: "Somente estimativa",
    tone: "bg-muted text-foreground ring-border",
  },
  measured: {
    label: "Estimado + leituras",
    tone: "bg-primary/10 text-primary ring-primary/20",
  },
  incomplete: {
    label: "Medição incompleta",
    tone: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  },
  stale: {
    label: "Leituras desatualizadas",
    tone: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  },
};

function Trend({ change, previousLabel }: { change: number | null; previousLabel: string }) {
  if (change === null)
    return (
      <span className="text-sm text-muted-foreground">
        Sem base de comparação com {previousLabel}
      </span>
    );
  const flat = Math.abs(change) < 0.5;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
          flat
            ? "bg-muted text-foreground"
            : change > 0
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {flat ? "estável" : `${change > 0 ? "+" : ""}${formatNumber(change, 1)}%`}
      </span>
      vs. projeção de {previousLabel}
    </span>
  );
}

export function EnergyHero({
  periodLabel,
  days,
  consumption,
  cost,
  costIncomplete,
  change,
  previousLabel,
  topConsumer,
  topConsumerCostKnown,
  applianceCount,
  measured,
  measuredLoading,
  measuredError,
  status,
}: Props) {
  const share =
    topConsumer && consumption > 0 ? (topConsumer.consumo / consumption) * 100 : 0;
  return (
    <section
      aria-labelledby="hero-title"
      className="overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm"
    >
      <div className="grid gap-px bg-border lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6 bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="hero-title"
              className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-muted-foreground"
            >
              <Calculator className="h-4 w-4" aria-hidden="true" />
              Consumo estimado · <span>{periodLabel}</span>
            </h2>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                statusCopy[status].tone,
              )}
            >
              {measuredLoading ? "Verificando medições" : measuredError ? "Medições indisponíveis" : statusCopy[status].label}
            </span>
          </div>
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
                {formatNumber(consumption, 1)}
              </span>
              <span className="text-xl font-medium text-muted-foreground">kWh</span>
            </p>
            <div className="mt-3">
              <Trend change={change} previousLabel={previousLabel} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {costIncomplete ? cost === 0 ? "Custo indisponível" : "Custo parcial" : "Custo estimado"}
              </dt>
              <dd className={cn("mt-1 font-semibold tabular-nums", costIncomplete && cost === 0 ? "text-lg" : "text-2xl")}>
                {costIncomplete && cost === 0 ? "Tarifa ausente" : formatCurrency(cost)}
              </dd>
              {costIncomplete && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Falta tarifa para parte do consumo.</p>}
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Média diária
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatNumber(consumption / days, 1)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">kWh</span>
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Aparelhos no período
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {applianceCount}
              </dd>
            </div>
          </dl>
        </div>
        <div className="grid gap-px bg-border">
          <div className="space-y-3 bg-card p-6 sm:p-8">
            <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
              <Radio className="h-4 w-4" aria-hidden="true" />
              Medido pelos dispositivos
            </h3>
            {measuredLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Consultando medições…
              </p>
            ) : measuredError ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Medições indisponíveis agora. A estimativa segue válida.
              </p>
            ) : measured ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">
                    {formatNumber(measured.consumptionKWh, 1)}
                  </span>
                  <span className="text-muted-foreground">kWh</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {measured.costComplete
                    ? `${formatCurrency(measured.knownCost)} com a tarifa registrada`
                    : "Custo indisponível: falta tarifa em parte das leituras"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Última leitura: {new Date(measured.lastReadingAt).toLocaleString("pt-BR")}. Total apenas dos intervalos coletados.
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold">Sem medição</p>
                <p className="text-sm text-muted-foreground">
                  Nenhuma leitura real neste mês. Os valores ao lado são
                  estimativas.
                </p>
              </>
            )}
          </div>
          {applianceCount > 1 && <div className="space-y-3 bg-card p-6 sm:p-8">
            <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
              <Crown className="h-4 w-4" aria-hidden="true" />
              Maior consumidor
            </h3>
            {topConsumer ? (
              <>
                <p className="truncate text-xl font-semibold" title={topConsumer.name}>
                  {topConsumer.name}
                </p>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(share, 100)}%` }}
                  />
                </div>
                <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatNumber(share, 0)}% do total
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    {topConsumerCostKnown ? formatCurrency(topConsumer.custo) : "Tarifa ausente"}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sem aparelhos no período.</p>
            )}
          </div>}
        </div>
      </div>
    </section>
  );
}
