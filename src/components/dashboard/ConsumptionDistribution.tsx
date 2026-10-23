import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatNumber } from "@/lib/energy";
import { SectionCard } from "./SectionCard";
import type { EstimateRow } from "./summary";

const DISTRIBUTION_COLORS = [
  "#15803d",
  "#2979FF",
  "#14b8a6",
  "#FFC107",
  "#FF7043",
  "#94a3b8",
];

export function ConsumptionDistribution({
  rows,
  total,
}: {
  rows: EstimateRow[];
  total: number;
}) {
  const sorted = [...rows].sort((a, b) => b.consumo - a.consumo);
  const slices = sorted.slice(0, 5).map((row) => ({ name: row.name, value: row.consumo }));
  if (sorted.length > 5)
    slices.push({
      name: "Outros aparelhos",
      value: sorted.slice(5).reduce((sum, row) => sum + row.consumo, 0),
    });
  return (
    <SectionCard
      title="Para onde vai a energia"
      description="Participação estimada no consumo do mês."
    >
      {total > 0 ? (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,180px)_1fr] lg:grid-cols-1 xl:grid-cols-[minmax(0,180px)_1fr]">
          <div className="relative mx-auto aspect-square w-full max-w-[180px]">
            <ChartContainer config={{ value: { label: "kWh" } }} className="h-full w-full">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.name} fill={DISTRIBUTION_COLORS[index]} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                        <p className="font-medium">{payload[0].name}</p>
                        <p className="text-muted-foreground">
                          {formatNumber(Number(payload[0].value), 1)} kWh
                        </p>
                      </div>
                    ) : null
                  }
                />
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold tabular-nums">{formatNumber(total, 0)}</span>
              <span className="text-xs text-muted-foreground">kWh/mês</span>
            </div>
          </div>
          <ul className="space-y-2.5 text-sm">
            {slices.map((slice, index) => (
              <li key={slice.name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: DISTRIBUTION_COLORS[index] }}
                />
                <span className="min-w-0 flex-1 truncate" title={slice.name}>
                  {slice.name}
                </span>
                <span className="font-medium tabular-nums">
                  {formatNumber((slice.value / total) * 100, 0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Os aparelhos do período não têm consumo estimado. Revise potência e
          horas de uso.
        </p>
      )}
    </SectionCard>
  );
}
