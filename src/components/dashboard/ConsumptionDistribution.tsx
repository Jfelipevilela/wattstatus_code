import { formatNumber } from "@/lib/energy";
import { SectionCard } from "./SectionCard";
import type { EstimateRow } from "./summary";

const colors = ["#15803d", "#2563eb", "#0d9488", "#b45309", "#be123c", "#64748b"];

export function ConsumptionDistribution({ rows, total }: { rows: EstimateRow[]; total: number }) {
  const sorted = [...rows].filter((row) => row.consumo > 0).sort((a, b) => b.consumo - a.consumo);
  const slices = sorted.slice(0, 5).map((row) => ({ id: row.id ?? row.name, name: row.name, value: row.consumo }));
  if (sorted.length > 5) slices.push({
    id: "other", name: "Outros aparelhos", value: sorted.slice(5).reduce((sum, row) => sum + row.consumo, 0),
  });

  return (
    <SectionCard title="Para onde vai a energia" description="Participação estimada no consumo do mês.">
      {total > 0 ? (
        <div className="space-y-5">
          <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label="Distribuição estimada do consumo entre aparelhos">
            {slices.map((slice, index) => (
              <span key={slice.id} style={{ width: `${(slice.value / total) * 100}%`, backgroundColor: colors[index] }}
                title={`${slice.name}: ${formatNumber((slice.value / total) * 100, 0)}%`} />
            ))}
          </div>
          <ul className="divide-y text-sm">
            {slices.map((slice, index) => (
              <li key={slice.id} className="flex items-center gap-3 py-2.5">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: colors[index] }} />
                <span className="min-w-0 flex-1 truncate" title={slice.name}>{slice.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(slice.value, 1)} kWh</span>
                <strong className="w-12 shrink-0 text-right tabular-nums">{formatNumber((slice.value / total) * 100, 0)}%</strong>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Total estimado: {formatNumber(total, 1)} kWh.</p>
        </div>
      ) : (
        <p className="py-8 text-sm text-muted-foreground">Sem consumo estimado neste período. Revise a potência e o tempo de uso dos aparelhos.</p>
      )}
    </SectionCard>
  );
}
