import { CalendarDays, Clock, MoreHorizontal, Pencil, Radio, Trash2, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDuration, formatNumber } from "@/lib/energy";
import { cn } from "@/lib/utils";
import type { Appliance } from "@/hooks/useAppliances";
import { applianceVisual, providerLabel } from "@/components/appliances/applianceVisual";

interface Props {
  appliance: Appliance;
  consumption: number;
  cost: number;
  share: number;
  rank: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function ApplianceCard({ appliance, consumption, cost, share, rank, onEdit, onDelete }: Props) {
  const { icon: Icon, tone, bar } = applianceVisual(appliance.name);
  const connected = Boolean(appliance.integrationProvider);
  const measured = (appliance.measuredConsumptionKWh ?? 0) > 0;
  return (
    <article className="group relative flex h-full min-w-0 flex-col rounded-3xl border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      {rank === 1 && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
          Maior gasto
        </span>
      )}
      <header className="flex items-start gap-3">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tone)}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold leading-tight" title={appliance.name}>
            {appliance.name}
          </h3>
          <span
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              connected
                ? "bg-energy-blue-light/10 text-energy-blue-light"
                : "bg-muted text-muted-foreground",
            )}
          >
            {connected && <Radio className="h-3 w-3" aria-hidden="true" />}
            {providerLabel(appliance.integrationProvider)}
          </span>
        </div>
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Ações de ${appliance.name}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{formatCurrency(cost)}</p>
          <p className="text-xs text-muted-foreground">estimado por mês</p>
        </div>
        <p className="text-right">
          <span className="block text-lg font-semibold tabular-nums">{formatNumber(consumption, 1)}</span>
          <span className="text-xs text-muted-foreground">kWh/mês</span>
        </p>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Participação no total</span>
          <span className="font-medium tabular-nums text-foreground">{formatNumber(share, 0)}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${Math.min(share, 100)}%` }} />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: Zap, label: "Potência", value: `${formatNumber(appliance.power, 0)} W` },
          { icon: Clock, label: "Uso/dia", value: formatDuration(appliance.usageHours) },
          { icon: CalendarDays, label: "Dias/mês", value: String(appliance.days || 30) },
        ].map(({ icon: StatIcon, label, value }) => (
          <div key={label} className="rounded-2xl bg-muted/50 px-2 py-2.5">
            <dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <StatIcon className="h-3 w-3" aria-hidden="true" />
              {label}
            </dt>
            <dd className="mt-0.5 truncate text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {measured && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl border border-energy-blue-light/20 bg-energy-blue-light/5 px-3 py-2 text-xs">
          <Radio className="h-3.5 w-3.5 shrink-0 text-energy-blue-light" aria-hidden="true" />
          <span>
            Medidor: <strong>{formatNumber(appliance.measuredConsumptionKWh!, 1)} kWh</strong>
            <span className="text-muted-foreground"> acumulados (sem período)</span>
          </span>
        </p>
      )}

      <footer className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
        <span>Tarifa {appliance.tariff}</span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="font-medium text-primary opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 dark:text-energy-400"
          >
            Ajustar uso →
          </button>
        )}
      </footer>
    </article>
  );
}
