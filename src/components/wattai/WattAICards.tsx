import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { brl, formatMetric, SOURCE_LABEL, TOOL_LABEL, type EnergyDataSource, type UsageSimulation, type WattAIAction, type WattAICard, type WattAIResponse } from "@/lib/wattai";

export const SourceBadge = ({ source }: { source: EnergyDataSource }) => (
  <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {SOURCE_LABEL[source] ?? source}
  </span>
);

const QUALITY_DOT = { recent: "bg-primary", delayed: "bg-amber-500", missing: "bg-muted-foreground/40", disabled: "bg-muted-foreground/40", error: "bg-destructive" } as const;
const EFFORT_LABEL = { baixo: "baixo", medio: "médio", alto: "alto" } as const;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const kwh = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: value >= 10 ? 0 : 1 })} kWh`;

export function SimulationSummary({ simulation }: { simulation: UsageSimulation }) {
  const s = simulation.savings;
  const range = simulation.scenarios.length > 1 ? simulation.scenarios : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Por dia", s.dailyCost], ["Por mês", s.monthlyCost], ["Por ano", s.annualCost]].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-muted/60 px-2 py-2">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold tabular-nums">{brl(value as number)}</p>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Antes</dt><dd className="text-right tabular-nums">{kwh(simulation.before.kWh)} · {brl(simulation.before.cost)}</dd>
        <dt className="text-muted-foreground">Depois</dt><dd className="text-right tabular-nums">{kwh(simulation.after.kWh)} · {brl(simulation.after.cost)}</dd>
        <dt className="text-muted-foreground">Redução</dt><dd className="text-right tabular-nums">{kwh(s.monthlyKWh)}/mês · {pct(s.percent)}</dd>
      </dl>
      {range && (
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          {range.map((item) => (
            <div key={item.label} className="rounded-md border px-2 py-1.5">
              <p className="capitalize text-muted-foreground">{item.label}</p>
              <p className="font-medium tabular-nums">{brl(item.cost)}/mês</p>
            </div>
          ))}
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Premissas</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">{simulation.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
    </div>
  );
}

function Card({ card, onAsk }: { card: WattAICard; onAsk: (text: string) => void }) {
  switch (card.type) {
    case "ranking":
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-xs font-medium">{card.title}</p><SourceBadge source={card.source} /></div>
          <ol className="space-y-1.5">
            {card.items.map((item, index) => (
              <li key={item.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate"><span className="mr-1.5 text-muted-foreground">{index + 1}</span>{item.label}{item.sublabel && <span className="text-muted-foreground"> · {item.sublabel}</span>}</span>
                  <span className="shrink-0 tabular-nums">{brl(item.cost)}</span>
                </div>
                {item.share > 0 && <div className="h-1 rounded-full bg-muted"><div className="h-1 rounded-full bg-primary/70" style={{ width: `${Math.max(2, Math.min(100, item.share * 100))}%` }} /></div>}
              </li>
            ))}
          </ol>
        </div>
      );
    case "simulation":
      return "savings" in card.simulation ? <SimulationSummary simulation={card.simulation as UsageSimulation} /> : (
        <dl className="grid grid-cols-2 gap-1 text-xs">
          <dt className="text-muted-foreground">Economia por mês</dt><dd className="text-right tabular-nums">{brl(Number(card.simulation.monthlyCost ?? 0))}</dd>
          <dt className="text-muted-foreground">Economia por ano</dt><dd className="text-right tabular-nums">{brl(Number(card.simulation.annualCost ?? 0))}</dd>
        </dl>
      );
    case "budget": {
      const plan = card.plan;
      const ranged = plan.achievedConservative !== undefined && plan.achievedConservative < plan.achieved;
      return (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Atual estimado</span><span className="tabular-nums">{brl(plan.current)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Meta</span><span className="tabular-nums">{brl(plan.target)}</span></div>
          {plan.actions.length > 0 && (
            <ul className="space-y-1.5 border-t pt-2">
              {plan.actions.map((item) => (
                <li key={item.applianceId} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{item.applianceName}: {item.fromHours.toLocaleString("pt-BR")} h → {item.toHours.toLocaleString("pt-BR")} h/dia</span>
                    {item.effort && <span className="text-[10px] text-muted-foreground">Esforço {EFFORT_LABEL[item.effort]}{item.conservativeCost !== undefined && item.conservativeCost < item.monthlyCost ? ` · pode ser ${brl(item.conservativeCost)}` : ""}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-primary">−{brl(item.monthlyCost)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>Soma do plano</span>
            <span className="tabular-nums">{ranged ? `${brl(plan.achievedConservative!)} a ${brl(plan.achieved)}` : brl(plan.achieved)}</span>
          </div>
          <p className={plan.reachable ? "text-primary" : "text-muted-foreground"}>
            {plan.gap <= 0 ? "Já dentro da meta." : plan.reachable ? "Meta alcançável com o plano, no cenário do cadastro." : `Faltam ${brl(plan.remaining ?? Math.max(0, plan.gap - plan.achieved))} com as mudanças permitidas.`}
          </p>
          {plan.ideas && plan.ideas.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Fora da soma: {plan.ideas.map((idea) => `trocar ${idea.applianceName} (cerca de ${brl(idea.monthlyCost)}/mês, exige investimento)`).join("; ")}.</p>
          )}
        </div>
      );
    }
    case "investigation":
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium">Evidências encontradas</p>
          <ul className="space-y-1.5">
            {card.findings.slice(0, 4).map((finding) => (
              <li key={finding.id} className="flex gap-2 text-xs">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${finding.confidence === "alta" ? "bg-primary" : finding.confidence === "media" ? "bg-amber-500" : "bg-muted-foreground/50"}`} aria-hidden />
                <span>{finding.text} <span className="text-[10px] uppercase tracking-wide text-muted-foreground">· {SOURCE_LABEL[finding.evidence]}</span></span>
              </li>
            ))}
          </ul>
          {card.findings.length > 4 && (
            <details className="text-xs">
              <summary className="cursor-pointer select-none text-[11px] text-muted-foreground">Mais {card.findings.length - 4} evidência(s)</summary>
              <ul className="mt-1.5 space-y-1.5">
                {card.findings.slice(4).map((finding) => <li key={finding.id} className="text-muted-foreground">{finding.text} <span className="text-[10px] uppercase tracking-wide">· {SOURCE_LABEL[finding.evidence]}</span></li>)}
              </ul>
            </details>
          )}
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none">Como investiguei ({card.steps.filter((step) => step.ok).length} consultas)</summary>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              {card.steps.map((step) => <li key={step.tool}>{TOOL_LABEL[step.tool] ?? step.tool}{step.skipped ? ` — não executada (${step.skipped})` : ` — ${step.findings} achado(s)`}</li>)}
            </ol>
          </details>
        </div>
      );
    case "forecast":
      return card.forecast.cost === null ? null : (
        <div className="flex items-end justify-between rounded-lg bg-muted/60 px-3 py-2">
          <div>
            <p className="text-[11px] text-muted-foreground">Previsão do mês</p>
            <p className="text-lg font-semibold tabular-nums">{brl(card.forecast.cost, 0)}</p>
            {card.forecast.low !== null && card.forecast.high !== null && (
              <p className="text-[11px] text-muted-foreground tabular-nums">entre {brl(card.forecast.low, 0)} e {brl(card.forecast.high, 0)}</p>
            )}
          </div>
          <SourceBadge source={card.forecast.source} />
        </div>
      );
    case "recommendations":
      return (
        <ul className="space-y-2">
          {card.items.map((item) => (
            <li key={item.id} className="rounded-lg border px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium">{item.title}</p>
                {item.impactMonthly ? <span className="shrink-0 text-xs tabular-nums text-primary">−{brl(item.impactMonthly)}/mês</span> : null}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.reason}</p>
            </li>
          ))}
        </ul>
      );
    case "anomalies":
      return (
        <ul className="space-y-2">
          {card.items.map((item) => (
            <li key={item.id} className="flex gap-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              <span><span className="font-medium">{item.title}.</span> <span className="text-muted-foreground">{item.detail}</span></span>
            </li>
          ))}
        </ul>
      );
    case "trend": {
      const max = Math.max(1, ...card.points.map((point) => Math.max(point.estimatedKWh, point.measuredKWh ?? 0)));
      return (
        <div className="space-y-2">
          <p className="text-xs font-medium">{card.title}</p>
          <ul className="space-y-1.5" aria-label="Consumo por mês">
            {card.points.map((point) => (
              <li key={point.month} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">{point.month}</span>
                <span className="space-y-0.5">
                  <span className="block h-1.5 rounded-full bg-primary/70" style={{ width: `${Math.max(2, (point.estimatedKWh / max) * 100)}%` }} title="Estimado" />
                  {point.measuredKWh !== null && <span className="block h-1.5 rounded-full bg-[#2979FF]" style={{ width: `${Math.max(2, (point.measuredKWh / max) * 100)}%` }} title="Medido" />}
                </span>
                <span className="tabular-nums">{kwh(point.estimatedKWh)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground"><span className="mr-1 inline-block h-1.5 w-3 rounded-full bg-primary/70 align-middle" />Estimado <span className="ml-2 mr-1 inline-block h-1.5 w-3 rounded-full bg-[#2979FF] align-middle" />Medido</p>
        </div>
      );
    }
    case "comparison": {
      const max = Math.max(1, ...card.items.map((item) => item.value));
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-xs font-medium">{card.title}</p><SourceBadge source={card.source} /></div>
          {card.items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex justify-between text-xs"><span>{item.label}</span><span className="tabular-nums">{item.unit === "R$" ? brl(item.value) : `${item.value.toLocaleString("pt-BR")} ${item.unit}`}</span></div>
              <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      );
    }
    case "choices":
      return (
        <div className="flex flex-wrap gap-2">
          {card.items.map((item) => (
            <button key={item.id} type="button" onClick={() => onAsk(`${item.label}${item.sublabel ? ` do ${item.sublabel}` : ""}`)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
              {item.label}{item.sublabel && <span className="text-muted-foreground"> · {item.sublabel}</span>}
            </button>
          ))}
        </div>
      );
  }
}

export function WattAIMessageBody({ response, onAction, onAsk }: { response: WattAIResponse; onAction: (action: WattAIAction) => void; onAsk: (text: string) => void }) {
  const askActions = response.actions.filter((item) => item.type === "ask");
  const otherActions = response.actions.filter((item) => item.type !== "ask");
  const hasChoices = response.cards.some((card) => card.type === "choices");
  return (
    <div className="space-y-3">
      {response.metrics.length > 0 && !response.cards.some((card) => card.type === "simulation" || card.type === "forecast") && (
        <div className="grid grid-cols-2 gap-2">
          {response.metrics.slice(0, 4).map((metric) => (
            <div key={metric.label} className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="truncate text-[11px] text-muted-foreground">{metric.label}</p>
              <p className="text-sm font-semibold tabular-nums">{formatMetric(metric)}</p>
              <p className="text-[10px] text-muted-foreground">{SOURCE_LABEL[metric.source]}</p>
            </div>
          ))}
        </div>
      )}
      {response.dataQuality && response.dataQuality.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Atualização das medições">
          {response.dataQuality.map((item) => (
            <li key={item.applianceId} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
              title={item.lastReadingAt ? `Última leitura: ${new Date(item.lastReadingAt).toLocaleString("pt-BR")}` : undefined}>
              <span className={`h-1.5 w-1.5 rounded-full ${QUALITY_DOT[item.state]}`} aria-hidden />
              {item.name}: {item.label}{item.age && item.state !== "recent" ? ` (${item.age})` : ""}
            </li>
          ))}
        </ul>
      )}
      {response.cards.map((card, index) => (
        <div key={index} className="rounded-xl border bg-card p-3"><Card card={card} onAsk={onAsk} /></div>
      ))}
      {response.limitations.length > 0 && (
        <ul className="space-y-1">
          {response.limitations.map((item) => (
            <li key={item} className="flex gap-1.5 text-[11px] text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />{item}</li>
          ))}
        </ul>
      )}
      {otherActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {otherActions.map((action) => (
            <button key={`${action.type}:${action.label}`} type="button" onClick={() => onAction(action)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
              {action.label} <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          ))}
        </div>
      )}
      {(!hasChoices && askActions.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {askActions.map((action) => action.type === "ask" && (
            <button key={action.label} type="button" onClick={() => onAsk(action.message)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">{action.label}</button>
          ))}
        </div>
      )}
      {response.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {response.suggestions.map((item) => (
            <button key={item} type="button" onClick={() => onAsk(item)} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground">{item}</button>
          ))}
        </div>
      )}
    </div>
  );
}
