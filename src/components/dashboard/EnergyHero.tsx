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
  change: number | null;
  previousLabel: string;
  topConsumer?: EstimateRow;
  applianceCount: number;
  measured: MeasuredSummary | null;
  measuredLoading: boolean;
  measuredError: string | null;
  status: DataStatus;
}

const statusCopy: Record<DataStatus, { label: string; tone: string }> = {
  estimated: {
    label: "Somente estimativa",
    tone: "bg-white/10 text-white ring-white/20",
  },
  measured: {
    label: "Estimado + medido",
    tone: "bg-energy-green-light/15 text-energy-300 ring-energy-green-light/30",
  },
  incomplete: {
    label: "Medição incompleta",
    tone: "bg-energy-yellow/15 text-energy-yellow ring-energy-yellow/30",
  },
};

function Trend({ change, previousLabel }: { change: number | null; previousLabel: string }) {
  if (change === null)
    return (
      <span className="text-sm text-white/60">
        Sem base de comparação com {previousLabel}
      </span>
    );
  const flat = Math.abs(change) < 0.5;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm text-white/70">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
          flat
            ? "bg-white/10 text-white"
            : change > 0
              ? "bg-energy-orange/20 text-orange-200"
              : "bg-energy-green-light/20 text-energy-300",
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
  change,
  previousLabel,
  topConsumer,
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
      className="relative overflow-hidden rounded-3xl bg-energy-blue-dark text-white shadow-xl ring-1 ring-white/5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-energy-green-light/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-energy-blue-light/20 blur-3xl"
      />
      <div className="relative grid gap-px bg-white/5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6 bg-energy-blue-dark/95 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              id="hero-title"
              className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-white/60"
            >
              <Calculator className="h-4 w-4" aria-hidden="true" />
              Consumo estimado · <span className="capitalize">{periodLabel}</span>
            </h2>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                statusCopy[status].tone,
              )}
            >
              {statusCopy[status].label}
            </span>
          </div>
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
                {formatNumber(consumption, 1)}
              </span>
              <span className="text-xl font-medium text-white/60">kWh</span>
            </p>
            <div className="mt-3">
              <Trend change={change} previousLabel={previousLabel} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/50">
                Custo estimado
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatCurrency(cost)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/50">
                Média diária
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatNumber(consumption / days, 1)}
                <span className="ml-1 text-sm font-normal text-white/60">kWh</span>
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs uppercase tracking-wide text-white/50">
                Aparelhos no período
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {applianceCount}
              </dd>
            </div>
          </dl>
        </div>
        <div className="grid gap-px bg-white/5">
          <div className="space-y-3 bg-energy-blue-dark/95 p-6 sm:p-8">
            <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-white/60">
              <Radio className="h-4 w-4" aria-hidden="true" />
              Medido pelos dispositivos
            </h3>
            {measuredLoading ? (
              <p role="status" className="text-sm text-white/60">
                Consultando medições…
              </p>
            ) : measuredError ? (
              <p className="text-sm text-orange-200">
                Medições indisponíveis agora. A estimativa segue válida.
              </p>
            ) : measured ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">
                    {formatNumber(measured.consumptionKWh, 1)}
                  </span>
                  <span className="text-white/60">kWh</span>
                </p>
                <p className="text-sm text-white/70">
                  {measured.costComplete
                    ? `${formatCurrency(measured.knownCost)} com a tarifa registrada`
                    : "Custo indisponível: falta tarifa em parte das leituras"}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold text-white/80">Sem medição</p>
                <p className="text-sm text-white/60">
                  Nenhuma leitura real neste mês. Os valores ao lado são
                  estimativas.
                </p>
              </>
            )}
          </div>
          <div className="space-y-3 bg-energy-blue-dark/95 p-6 sm:p-8">
            <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-white/60">
              <Crown className="h-4 w-4" aria-hidden="true" />
              Maior consumidor
            </h3>
            {topConsumer ? (
              <>
                <p className="truncate text-xl font-semibold" title={topConsumer.name}>
                  {topConsumer.name}
                </p>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-white/10"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-energy-green-light to-energy-teal"
                    style={{ width: `${Math.min(share, 100)}%` }}
                  />
                </div>
                <p className="flex flex-wrap gap-x-3 text-sm text-white/70">
                  <span className="inline-flex items-center gap-1">
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatNumber(share, 0)}% do total
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatCurrency(topConsumer.custo)}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-sm text-white/60">Sem aparelhos no período.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
