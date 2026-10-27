import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import type { SimulationCalculationResult, SimulationScenario } from "../../../backend/src/modules/simulations/simulations.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChartContainer } from "@/components/ui/chart";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { simulationUsageSummary } from "@/lib/simulation-item";

const kwh = (value: number | null) => value == null ? "Indisponível" : `${formatNumber(value)} kWh/mês`;
const money = (value: number | null) => value == null ? "Indisponível" : formatCurrency(value);
const chartConfig = { consumption: { label: "Consumo mensal (kWh)", color: "hsl(var(--primary))" } };

export default function SimulationResults({ result, scenario }: { result: SimulationCalculationResult; scenario: SimulationScenario }) {
  const partial = result.unavailableCount > 0;
  const ranked = result.items.filter((item) => item.available).sort((a, b) => (b.monthlyKwh ?? 0) - (a.monthlyKwh ?? 0));
  const major = ranked[0];
  const chartData = ranked.map((item, index) => ({ label: String(index + 1), name: item.name, consumption: item.monthlyKwh }));
  return (
    <section aria-label="Resultado da simulação" className="space-y-5" tabIndex={-1}>
      <div role="status" className="sr-only">Simulação calculada. {partial ? "Resultado incompleto." : "Resultado disponível."}</div>
      {partial && <Alert><AlertTitle>Total incompleto</AlertTitle><AlertDescription>
        {result.unavailableCount} item(ns) sem dados suficientes. Os valores abaixo são apenas o subtotal dos itens calculáveis; não representam o ambiente inteiro.
      </AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>{partial ? "Subtotal calculável" : "Consumo estimado"}</CardDescription>
          <CardTitle className="break-words text-2xl">{kwh(partial ? result.knownMonthlyKwh : result.monthlyKwh)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>{partial ? "Custo parcial estimado" : "Custo mensal estimado"}</CardDescription>
          <CardTitle className="break-words text-2xl">{money(partial ? result.knownMonthlyCost : result.monthlyCost)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Maior consumidor{partial ? " entre os calculáveis" : ""}</CardDescription>
          <CardTitle className="break-words text-base">{major ? `${major.name} · ${major.quantity} un.` : "Nenhum item calculável"}</CardTitle>
          {major && <CardDescription>{kwh(major.monthlyKwh)}</CardDescription>}</CardHeader></Card>
      </div>
      {result.baseline && <Card><CardHeader><CardTitle className="text-lg">Comparação com o ambiente cadastrado</CardTitle>
        <CardDescription>A base usa o uso e as tarifas cadastradas. O custo do cenário usa a tarifa desta simulação; a diferença pode incluir mudança de tarifa.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-sm text-muted-foreground">Base estimada atual</p><p>{kwh(result.baseline.monthlyKwh)}</p><p>{money(result.baseline.monthlyCost)}</p></div>
          <div><p className="text-sm text-muted-foreground">Variação mensal (cenário − base)</p><p>{kwh(result.comparison?.differenceKwh ?? null)}</p><p>{money(result.comparison?.differenceCost ?? null)}</p></div>
          <div><p className="text-sm text-muted-foreground">Variação de consumo</p><p>{result.comparison?.differencePercent == null ? "Percentual indisponível: base zero ou dados incompletos." : `${formatNumber(result.comparison.differencePercent)}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Projeção de uso, sem garantia de economia.</p></div>
        </CardContent></Card>}
      {ranked.length > 0 && <Card><CardHeader><CardTitle className="text-lg">Distribuição do consumo</CardTitle>
        <CardDescription>{partial ? "Consumo dos itens calculáveis; cenário incompleto." : "Consumo de cada item no mês."} A numeração corresponde à lista abaixo.</CardDescription></CardHeader>
        <CardContent><div aria-hidden="true"><ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={chartData} accessibilityLayer><CartesianGrid vertical={false} /><XAxis dataKey="label" /><YAxis width={55} />
            <Tooltip formatter={(value: number) => `${formatNumber(value)} kWh`} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? "Aparelho"} />
            <Bar dataKey="consumption" name="Consumo" fill="var(--color-consumption)" radius={4} />
          </BarChart>
        </ChartContainer></div></CardContent></Card>}
      <Card><CardHeader><CardTitle className="text-lg">Detalhamento por aparelho</CardTitle></CardHeader>
        <CardContent className="space-y-4">{result.items.map((item) => {
          const draft = scenario.items.find((entry) => entry.id === item.id);
          const rank = ranked.findIndex((entry) => entry.id === item.id);
          return <div key={item.id} className="rounded-lg border p-4">
            <h3 className="break-words font-medium">{rank >= 0 ? `${rank + 1}. ` : ""}{item.name} · {item.quantity} un.</h3>
            {item.available ? <>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-muted-foreground">Por unidade</dt><dd>{kwh(item.unitMonthlyKwh)}</dd></div>
                <div><dt className="text-muted-foreground">Todas as unidades</dt><dd>{kwh(item.monthlyKwh)}</dd></div>
                <div><dt className="text-muted-foreground">Custo mensal</dt><dd>{money(item.monthlyCost)}</dd></div>
                <div><dt className="text-muted-foreground">Participação</dt><dd>{item.sharePercent == null ? partial ? "Indisponível: cenário incompleto" : "Sem percentual (total zero)" : `${formatNumber(item.sharePercent)}%`}</dd></div>
              </dl>
              <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Como este item foi calculado</summary>
                <p className="mt-2">{draft ? simulationUsageSummary(draft) : "Perfil energético preservado na fonte."}</p>
                <p className="mt-1 text-muted-foreground">{item.method === "POWER_TIME" ? "Potência em watts × horas por dia × dias no mês ÷ 1.000. O motor inclui standby, quando habilitado, nas horas restantes dos dias informados."
                  : item.method === "PER_CYCLE" ? "Energia por ciclo × ciclos no mês. A frequência semanal usa 52 ÷ 12 semanas por mês. Um ciclo é um programa completo de funcionamento."
                    : "Consumo da referência de ensaio convertido para um mês pelo motor existente, sem multiplicação por horas ou dias. É uma média padrão, não uma medição da sua casa."}</p>
                <p className="mt-1 text-muted-foreground">O consumo unitário é multiplicado pela quantidade; o custo usa {formatCurrency(scenario.tariffPerKwh)}/kWh. Os totais usam valores sem arredondamento intermediário.</p>
              </details>
            </> : <p className="mt-2 text-sm text-muted-foreground">{item.reason || "Dados insuficientes. Edite o uso e informe a potência da etiqueta quando disponível."}</p>}
          </div>;
        })}</CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Estimativas não substituem a fatura. Impostos, bandeiras, condições reais e medições históricas podem diferir desta projeção.</p>
    </section>
  );
}
