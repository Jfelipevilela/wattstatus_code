import { Link } from "react-router-dom";
import { useState } from "react";
import type { Appliance } from "@/hooks/useAppliances";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, hasEstimatedTariff } from "@/lib/energy";
import { cn } from "@/lib/utils";
import { SectionCard } from "./SectionCard";
import type { EstimateRow } from "./summary";

interface Props {
  rows: EstimateRow[];
  appliances: Appliance[];
  measuredById: Map<string, number>;
  total: number;
}

export function ApplianceRanking({ rows, appliances, measuredById, total }: Props) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...rows].sort((a, b) => b.consumo - a.consumo);
  const max = sorted[0]?.consumo ?? 0;
  const visible = expanded ? sorted : sorted.slice(0, 5);
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
        {visible.map((row, index) => {
          const appliance = appliances.find((item) => item.id === row.id);
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
                    <Link to={appliance?.propertyId ? `/imoveis/${encodeURIComponent(appliance.propertyId)}?aba=aparelhos` : "/aparelhos"}
                      className="truncate font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`Ver ${row.name}`}>
                      {row.name}
                    </Link>
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
                    {appliance && !hasEstimatedTariff(appliance) && row.consumo > 0 ? "Tarifa ausente" : formatCurrency(row.custo)}
                    {total > 0 && ` · ${formatNumber((row.consumo / total) * 100, 0)}%`}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {sorted.length > 5 && (
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
          className="mt-4 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {expanded ? "Mostrar os 5 principais" : `Ver todos os ${sorted.length} aparelhos`}
        </button>
      )}
    </SectionCard>
  );
}
