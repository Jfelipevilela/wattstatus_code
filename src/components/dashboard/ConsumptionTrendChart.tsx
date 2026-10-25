import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatNumber } from "@/lib/energy";
import { Sparkles } from "lucide-react";
import { SectionCard } from "./SectionCard";

export interface TrendPoint {
  label: string;
  estimated: number;
  measured: number | null;
}

const config = {
  estimated: { label: "Estimado", color: "hsl(var(--primary))" },
  measured: { label: "Medido", color: "#2979FF" },
};

export function ConsumptionTrendChart({ data, onExplain }: { data: TrendPoint[]; onExplain?: () => void }) {
  const hasMeasured = data.some((point) => point.measured !== null);
  return (
    <SectionCard
      title="Evolução em 6 meses"
      aside={onExplain && (
        <button
          type="button"
          onClick={onExplain}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden /> Explicar este gráfico
        </button>
      )}
      description={
        hasMeasured
          ? "Projeção com os aparelhos atuais (área) e leituras reais (barras). Meses sem barra não têm medição."
          : "Projeção com os aparelhos atuais. Não é histórico medido: conecte um medidor para comparar."
      }
    >
      <ChartContainer config={config} className="h-72 w-full">
        <ComposedChart accessibilityLayer data={data} margin={{ left: 0, right: 8 }}>
          <defs>
            <linearGradient id="fill-estimated" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-estimated)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-estimated)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatNumber(value, 0)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <span className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">
                      {config[name as keyof typeof config]?.label ?? name}
                    </span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatNumber(Number(value), 1)} kWh
                    </span>
                  </span>
                )}
              />
            }
          />
          <Area
            dataKey="estimated"
            type="monotone"
            stroke="var(--color-estimated)"
            strokeWidth={2.5}
            fill="url(#fill-estimated)"
            dot={{ r: 3, fill: "var(--color-estimated)" }}
            activeDot={{ r: 5 }}
          />
          {hasMeasured && (
            <Bar
              dataKey="measured"
              fill="var(--color-measured)"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
          )}
          {hasMeasured && <ChartLegend content={<ChartLegendContent />} />}
        </ComposedChart>
      </ChartContainer>
    </SectionCard>
  );
}
