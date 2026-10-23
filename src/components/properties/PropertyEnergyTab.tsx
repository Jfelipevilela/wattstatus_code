import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { UNASSIGNED, type PropertyEnergy } from "@/lib/property-energy";
import { formatCurrency, formatNumber } from "@/lib/energy";
import type { Room } from "@/types/property";

interface Props {
  rooms: Room[];
  energy: PropertyEnergy;
  unlocated: { count: number; consumptionKWh: number };
  periodLabel: string;
  measuredError?: string | null;
}

const config = {
  estimated: { label: "Estimado (kWh)", color: "hsl(var(--primary))" },
  measured: { label: "Medido (kWh)", color: "#2979FF" },
};

export function PropertyEnergyTab({ rooms, energy, unlocated, periodLabel, measuredError }: Props) {
  const rows = [
    ...rooms.map((room) => ({ key: room.id, name: room.name, bucket: energy.byRoom.get(room.id)! })),
    { key: UNASSIGNED, name: "Sem ambiente", bucket: energy.byRoom.get(UNASSIGNED)! },
  ]
    .filter((row) => row.bucket && (row.bucket.applianceCount > 0 || row.bucket.measuredIntervals > 0))
    .sort((a, b) => b.bucket.estimatedCost - a.bucket.estimatedCost);
  const chart = rows.map((row) => ({
    name: row.name,
    estimated: Number(row.bucket.estimatedKWh.toFixed(2)),
    // Null, not zero, where nothing was measured.
    measured: row.bucket.measuredIntervals > 0 ? Number(row.bucket.measuredKWh.toFixed(2)) : null,
  }));
  const total = energy.total;
  const roomsWithMeasure = rows.filter((row) => row.bucket.measuredIntervals > 0).length;

  return (
    <div className="space-y-6">
      {measuredError && (
        <p role="alert" className="rounded-2xl border border-destructive/40 p-4 text-sm">
          Não foi possível consultar as medições agora ({measuredError}). Os valores medidos abaixo estão incompletos; o estimado
          continua válido.
        </p>
      )}
      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Consumo por ambiente</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Estimado: mês de {periodLabel} com o cadastro atual. Medido: leituras SmartThings registradas no ambiente em que o aparelho estava.
        </p>
        {chart.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Sem aparelhos neste imóvel.</p>
        ) : (
          <ChartContainer config={config} className="mt-4 h-72 w-full">
            <BarChart data={chart} accessibilityLayer>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickFormatter={(value: string) => (value.length > 12 ? `${value.slice(0, 11)}…` : value)} />
              <YAxis width={44} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatNumber(value, 0)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="estimated" fill="var(--color-estimated)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              <Bar dataKey="measured" fill="var(--color-measured)" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ChartContainer>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">Ranking de ambientes</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="px-4 py-3 font-medium">Ambiente</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Aparelhos</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Estimado</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Medido</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.bucket.applianceCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(row.bucket.estimatedCost)}
                  <span className="block text-xs text-muted-foreground">{formatNumber(row.bucket.estimatedKWh, 1)} kWh</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.bucket.measuredIntervals > 0 ? (
                    <>
                      {row.bucket.measuredCostIncomplete ? "—" : formatCurrency(row.bucket.measuredCost)}
                      <span className="block text-xs text-muted-foreground">{formatNumber(row.bucket.measuredKWh, 2)} kWh</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">sem medição</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="px-4 py-3">Total do imóvel</td>
              <td className="px-4 py-3 text-right tabular-nums">{total.applianceCount}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(total.estimatedCost)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {total.measuredIntervals > 0 ? `${formatNumber(total.measuredKWh, 2)} kWh` : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <ul className="space-y-2 text-xs text-muted-foreground">
        <li>
          Cobertura de medição: {roomsWithMeasure} de {rows.length} ambientes com leitura no período. Medido e estimado não se somam nem se
          comparam diretamente.
        </li>
        {energy.unattributedMeasuredKWh > 0 && (
          <li>
            {formatNumber(energy.unattributedMeasuredKWh, 2)} kWh medidos entre leituras em que o aparelho mudou de ambiente: entram no total
            do imóvel, mas não em um ambiente.
          </li>
        )}
        {unlocated.count > 0 && (
          <li>
            {formatNumber(unlocated.consumptionKWh, 2)} kWh medidos antes do registro de localização não são atribuídos a imóvel ou
            ambiente.
          </li>
        )}
      </ul>
    </div>
  );
}
