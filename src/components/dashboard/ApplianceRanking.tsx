import { Link } from "react-router-dom";
import type { Appliance } from "@/hooks/useAppliances";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { cn } from "@/lib/utils";
import { SectionCard } from "./SectionCard";
import type { EstimateRow } from "./summary";

const statusLabel: Record<Appliance["status"], { label: string; dot: string }> = {
  normal: { label: "Normal", dot: "bg-energy-green-light" },
  warning: { label: "Atenção", dot: "bg-energy-yellow" },
  critical: { label: "Crítico", dot: "bg-energy-red" },
};

interface Props {
  rows: EstimateRow[];
  appliances: Appliance[];
  measuredById: Map<string, number>;
  total: number;
}

export function ApplianceRanking({ rows, appliances, measuredById, total }: Props) {
  const sorted = [...rows].sort((a, b) => b.consumo - a.consumo);
  const max = sorted[0]?.consumo ?? 0;
  return (
    <SectionCard
      title="Ranking de aparelhos"
      description="Do maior para o menor consumo estimado no mês."
      aside={
        <Link
          to="/aparelhos"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-energy-400"
        >
          Gerenciar aparelhos
        </Link>
      }
    >
      <ol className="-mx-2 divide-y">
        {sorted.map((row, index) => {
          const appliance = appliances.find((item) => item.id === row.id);
          const status = appliance ? statusLabel[appliance.status] : undefined;
          const measured = row.id ? measuredById.get(row.id) : undefined;
          return (
            <li key={row.id ?? row.name} className="rounded-xl px-2 py-3 transition-colors hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums",
                    index === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium" title={row.name}>
                      {row.name}
                    </span>
                    {status && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                        {status.label}
                      </span>
                    )}
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide">
                      Estimado
                    </Badge>
                    {measured !== undefined && (
                      <Badge className="h-5 border-transparent bg-energy-blue-light/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-energy-blue-light hover:bg-energy-blue-light/10">
                        Medido {formatNumber(measured, 1)} kWh
                      </Badge>
                    )}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: max > 0 ? `${(row.consumo / max) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">
                    {formatNumber(row.consumo, 1)} <span className="text-xs font-normal text-muted-foreground">kWh</span>
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(row.custo)}
                    {total > 0 && ` · ${formatNumber((row.consumo / total) * 100, 0)}%`}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}
