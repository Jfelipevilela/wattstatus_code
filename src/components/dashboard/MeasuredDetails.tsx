import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { Appliance } from "@/hooks/useAppliances";
import { formatNumber } from "@/lib/energy";
import { SectionCard } from "./SectionCard";
import type { MeasuredSummary } from "./summary";

interface Props {
  measured: MeasuredSummary | null;
  imported: Appliance[];
}

export function MeasuredDetails({ measured, imported }: Props) {
  if (!measured && imported.length === 0) return null;
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[1.6fr_1fr]">
      {measured && (
        <SectionCard
          title="Consumo medido por dia"
          description="Energia registrada em intervalos pelo SmartThings. Dias sem barra não têm registros disponíveis."
          className={imported.length === 0 ? "lg:col-span-2" : undefined}
        >
          <ChartContainer
            config={{ consumptionKWh: { label: "Medido", color: "#2979FF" } }}
            className="h-60 w-full"
          >
            <BarChart accessibilityLayer data={measured.daily}>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                width={40}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatNumber(value, 1)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(day) => `Dia ${day}`}
                    formatter={(value) => `${formatNumber(Number(value))} kWh medidos`}
                  />
                }
              />
              <Bar dataKey="consumptionKWh" fill="var(--color-consumptionKWh)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
          <p className="mt-3 text-xs text-muted-foreground">
            {measured.intervals} intervalo(s) de leitura no mês
            {measured.longGaps > 0 &&
              ` · ${measured.longGaps} com mais de 2 h sem leitura (o total é real, a distribuição dentro da lacuna é desconhecida)`}
            .
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Última leitura: {new Date(measured.lastReadingAt).toLocaleString("pt-BR")}.</p>
        </SectionCard>
      )}
      {imported.length > 0 && (
        <SectionCard
          title="Leituras importadas"
          description="Valor salvo na importação do dispositivo. Sem data de medição, não segue o filtro mensal."
          className={!measured ? "lg:col-span-2" : undefined}
        >
          <ul className="divide-y text-sm">
            {imported.map((appliance) => (
              <li key={appliance.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{appliance.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {appliance.integrationProvider || "Dispositivo"}
                  </span>
                </span>
                <strong className="shrink-0 tabular-nums">
                  {formatNumber(appliance.measuredConsumptionKWh!)} kWh
                </strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
