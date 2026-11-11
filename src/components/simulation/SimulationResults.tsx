import type { SimulationCalculationResult, SimulationScenario } from "../../../backend/src/modules/simulations/simulations.types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { simulationUsageSummary } from "@/lib/simulation-item";

const kwh = (value: number | null) => value == null ? "Indisponível" : `${formatNumber(value)} kWh/mês`;
const money = (value: number | null) => value == null ? "Indisponível" : formatCurrency(value);

export default function SimulationResults({ result, scenario }: { result: SimulationCalculationResult; scenario: SimulationScenario }) {
  const partial = result.unavailableCount > 0;
  const ranked = result.items.filter((item) => item.available).sort((a, b) => (b.monthlyKwh ?? 0) - (a.monthlyKwh ?? 0));
  const chartTotal = partial ? result.knownMonthlyKwh : result.monthlyKwh ?? 0;
  return (
    <section aria-label="Resultado da simulação" className="sim-results" tabIndex={-1}>
      <div role="status" className="sr-only">Simulação calculada. {partial ? "Resultado incompleto." : "Resultado disponível."} {money(partial ? result.knownMonthlyCost : result.monthlyCost)} por mês. {kwh(partial ? result.knownMonthlyKwh : result.monthlyKwh)}.</div>
      {partial && <Alert><AlertTitle>Total incompleto</AlertTitle><AlertDescription>
        {result.unavailableCount} item(ns) sem dados suficientes. Os valores abaixo são apenas o subtotal dos itens calculáveis; não representam o ambiente inteiro.
      </AlertDescription></Alert>}
      <div className="sim-result-total"><p className="text-sm text-muted-foreground">{partial ? "Custo parcial estimado" : "Custo mensal estimado"}</p><p className="sim-money">{money(partial ? result.knownMonthlyCost : result.monthlyCost)}</p><p className="sim-energy">{kwh(partial ? result.knownMonthlyKwh : result.monthlyKwh)}</p></div>
      {result.baseline && <Card className="sim-result-card"><CardHeader><CardTitle className="text-lg">Comparação com o ambiente cadastrado</CardTitle>
        <CardDescription>A base usa o uso e as tarifas cadastradas. O custo do cenário usa a tarifa desta simulação; a diferença pode incluir mudança de tarifa.</CardDescription></CardHeader>
        <CardContent className="sim-comparison">
          <div><p className="text-sm text-muted-foreground">Base estimada atual</p><p>{kwh(result.baseline.monthlyKwh)}</p><p>{money(result.baseline.monthlyCost)}</p></div>
          <div><p className="text-sm text-muted-foreground">Variação mensal (cenário − base)</p><p>{kwh(result.comparison?.differenceKwh ?? null)}</p><p>{money(result.comparison?.differenceCost ?? null)}</p></div>
          <div><p className="text-sm text-muted-foreground">Variação de consumo</p><p>{result.comparison?.differencePercent == null ? "Percentual indisponível: base zero ou dados incompletos." : `${formatNumber(result.comparison.differencePercent)}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">Projeção de uso, sem garantia de economia.</p></div>
        </CardContent></Card>}
      {ranked.length > 0 && <section className="sim-ranking" aria-label="Participação dos aparelhos"><h3 className="font-semibold">Onde a energia é consumida</h3><p className="text-xs text-muted-foreground">{partial ? "Comparação entre itens calculáveis. Total incompleto." : "Participação no consumo mensal do cenário."}</p><ol className="sim-ranking-list">{ranked.map((item) => <li key={item.id}><div className="sim-rank-label"><span className="min-w-0 break-words font-medium">{item.name}</span><span className="shrink-0">{money(item.monthlyCost)}</span></div><div className="sim-rank-track" aria-hidden="true"><div className="sim-rank-fill" style={{ transform: `scaleX(${chartTotal > 0 ? (item.monthlyKwh ?? 0) / chartTotal : 0})` }} /></div><div className="sim-rank-label text-xs text-muted-foreground"><span>{kwh(item.monthlyKwh)} · {item.quantity} un.</span><span>{item.sharePercent == null ? "" : `${formatNumber(item.sharePercent)}%`}</span></div></li>)}</ol></section>}
      <details className="sim-details"><summary>Detalhamento e memória de cálculo</summary>
      <Card className="sim-result-card"><CardHeader><CardTitle className="text-lg">Detalhamento por aparelho</CardTitle></CardHeader>
        <CardContent className="space-y-4">{result.items.map((item) => {
          const draft = scenario.items.find((entry) => entry.id === item.id);
          const rank = ranked.findIndex((entry) => entry.id === item.id);
          return <div key={item.id} className="sim-detail-item border p-4">
            <h3 className="break-words font-medium">{rank >= 0 ? `${rank + 1}. ` : ""}{item.name} · {item.quantity} un.</h3>
            {item.available ? <>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Por unidade</dt><dd>{kwh(item.unitMonthlyKwh)}</dd></div>
                <div><dt className="text-muted-foreground">Todas as unidades</dt><dd>{kwh(item.monthlyKwh)}</dd></div>
                <div><dt className="text-muted-foreground">Custo mensal</dt><dd>{money(item.monthlyCost)}</dd></div>
                <div><dt className="text-muted-foreground">Participação</dt><dd>{item.sharePercent == null ? partial ? "Indisponível: cenário incompleto" : "Sem percentual (total zero)" : `${formatNumber(item.sharePercent)}%`}</dd></div>
              </dl>
              <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Como este item foi calculado</summary>
                <p className="mt-2">{draft ? simulationUsageSummary(draft) : "Perfil energético preservado na fonte."}</p>
                <p className="mt-1 text-muted-foreground">{item.method === "POWER_TIME" ? "Potência em watts × horas por dia × dias no mês ÷ 1.000. O motor inclui standby, quando habilitado, nas horas restantes dos dias informados."
                  : item.method === "PER_CYCLE" ? "Energia por ciclo × ciclos no mês. A frequência semanal usa 52 ÷ 12 semanas por mês. Um ciclo é um programa completo de funcionamento."
                    : "Consumo da referência de ensaio convertido para um mês pelo motor existente, sem multiplicação por horas ou dias. É uma média padrão, não uma medição do seu imóvel."}</p>
                <p className="mt-1 text-muted-foreground">O consumo unitário é multiplicado pela quantidade; o custo usa {formatCurrency(scenario.tariffPerKwh)}/kWh. Os totais usam valores sem arredondamento intermediário.</p>
              </details>
            </> : <p className="mt-2 text-sm text-muted-foreground">{item.reason || "Dados insuficientes. Edite o uso e informe a potência da etiqueta quando disponível."}</p>}
          </div>;
        })}</CardContent>
      </Card>
      </details>
      <p className="text-xs text-muted-foreground">Estimativas não substituem a fatura. Impostos, bandeiras, condições reais e medições históricas podem diferir desta projeção.</p>
    </section>
  );
}
