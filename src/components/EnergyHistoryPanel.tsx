import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Appliance } from "@/hooks/useAppliances";
import { useEnergyHistory } from "@/hooks/useEnergyHistory";
import { localMonthKey, measuredByMonth, summarizeMeasured } from "@/lib/measured";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const EnergyHistoryPanel = ({ year, month, appliances }: { year: number; month: number; appliances: Appliance[] }) => {
  const { intervals, loading, error, refresh } = useEnergyHistory(
    new Date(year, month - 6, 1), new Date(year, month, 1)
  );
  const selected = `${year}-${String(month).padStart(2, "0")}`;
  const current = intervals.filter((row) => localMonthKey(row.endAt) === selected);
  const totals = summarizeMeasured(current);
  const daily = new Map<string, number>();
  const devices = new Map<string, number>();
  for (const row of current) {
    const day = new Date(row.endAt).toLocaleDateString("pt-BR");
    daily.set(day, (daily.get(day) ?? 0) + row.consumptionKWh);
    const name = appliances.find((item) => item.id === row.applianceId)?.name || `Dispositivo ${row.deviceId}`;
    devices.set(name, (devices.get(name) ?? 0) + row.consumptionKWh);
  }
  const monthly = measuredByMonth(intervals);
  const previousDate = new Date(year, month - 2, 1);
  const previousKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
  const previous = monthly.find((row) => row.month === previousKey);
  return <Card>
    <CardHeader>
      <CardTitle>Consumo medido por SmartThings</CardTitle>
      <CardDescription>Diferença entre leituras acumuladas do medidor. Leituras ocorrem quando o status do dispositivo é consultado. Intervalos sem duas leituras não aparecem.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {loading && <p role="status">Carregando medições…</p>}
      {error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={refresh}>Tentar novamente</Button></div>}
      {!loading && !error && current.length === 0 && <p>Sem medições suficientes neste mês. Estimativas aparecem separadamente abaixo.</p>}
      {!loading && !error && current.length > 0 && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <p><strong>{formatNumber(totals.consumptionKWh)} kWh</strong><br />Medido neste mês</p>
          <p><strong>{totals.costComplete ? formatCurrency(totals.knownCost) : "Tarifa indisponível"}</strong><br />Custo calculado com tarifa registrada</p>
          <p><strong>{previous ? `${formatNumber(previous.consumptionKWh)} kWh` : "Sem dados"}</strong><br />Mês anterior</p>
        </div>
        <div className="h-56" aria-label="Consumo medido por dia">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={[...daily].map(([day, consumptionKWh]) => ({ day, consumptionKWh }))}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis unit=" kWh" /><Tooltip formatter={(value: number) => `${formatNumber(value)} kWh`} /><Bar dataKey="consumptionKWh" fill="#22c55e" name="Medido" />
          </BarChart></ResponsiveContainer>
        </div>
        <div><h3 className="font-medium">Por aparelho</h3><ul>{[...devices].sort((a,b) => b[1]-a[1]).map(([name, kwh]) => <li key={name}>{name}: {formatNumber(kwh)} kWh</li>)}</ul></div>
      </>}
      {monthly.length > 0 && <div><h3 className="font-medium">Evolução mensal medida</h3><ul>{monthly.map((item) => <li key={item.month}>{item.month}: {formatNumber(item.consumptionKWh)} kWh</li>)}</ul></div>}
    </CardContent>
  </Card>;
};
