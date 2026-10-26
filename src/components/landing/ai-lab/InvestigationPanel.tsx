import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, MessageSquareText } from "lucide-react";
import { DATA_STATES, stateStyle } from "../dataStates";
import { NODE_ICONS } from "./nodeLook";
import { NODES, SCENARIOS, type Action, type NodeId, type Scenario, type ScenarioId } from "./scenarios";

const nodeLabel = (id: NodeId) => NODES.find((node) => node.id === id)!.label;

// A stage block: fully readable in the complete view; while exploring, later
// stages stay in place but recede, so nothing jumps when they arrive.
function Block({ index, stage, exploring, title, children, className = "" }: { index: number; stage: number; exploring: boolean; title: string; children: React.ReactNode; className?: string }) {
  const ahead = exploring && index > stage;
  const current = exploring && index === stage;
  return (
    <section
      aria-current={current ? "step" : undefined}
      className={`rounded-2xl border p-4 transition-[border-color,background-color,opacity] duration-500 md:p-5 ${current ? "border-[rgb(var(--l-accent-rgb)/0.5)] bg-[rgb(var(--l-elevated-rgb)/0.85)]" : "border-[var(--l-line)] bg-[rgb(var(--l-surface-rgb)/0.7)]"} ${ahead ? "opacity-40" : "opacity-100"} ${className}`}
    >
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--l-faint)]">
        <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] tabular-nums ${ahead ? "bg-[rgb(var(--l-line-rgb)/0.1)]" : "bg-[var(--l-accent-subtle)] text-[var(--l-accent)]"}`}>{index + 1}</span>
        {title}
      </h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ActionButton({ action, onNode, onScenario }: { action: Action; onNode: (id: NodeId) => void; onScenario: (id: ScenarioId) => void }) {
  const className = "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[rgb(var(--l-accent-rgb)/0.4)] px-4 text-[15px] font-semibold text-[var(--l-accent)] transition-colors hover:bg-[var(--l-accent-subtle)]";
  if (action.kind === "route") {
    return <Link to={action.to} className={className}>{action.label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>;
  }
  if (action.kind === "anchor") {
    return <a href={action.href} className={className}>{action.label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></a>;
  }
  const scenarioName = action.kind === "scenario" ? SCENARIOS.find((item) => item.id === action.scenario)!.tab : null;
  return (
    <button
      type="button"
      className={className}
      onClick={() => (action.kind === "node" ? onNode(action.node) : onScenario(action.scenario))}
      aria-label={action.kind === "scenario" ? `${action.label}: abrir a demonstração ${scenarioName}` : `${action.label}: ver ${nodeLabel(action.node)}`}
    >
      {action.label}
    </button>
  );
}

export function NodeDetail({ id, onClose }: { id: NodeId; onClose: () => void }) {
  const node = NODES.find((item) => item.id === id)!;
  const Icon = NODE_ICONS[id];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [id]);
  return (
    <div className="l-in rounded-2xl border border-[rgb(var(--l-accent-rgb)/0.45)] bg-[rgb(var(--l-elevated-rgb)/0.92)] p-5 md:p-6" style={{ animationDuration: "0.4s" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--l-accent-subtle)] text-[var(--l-accent)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <h4 ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">{node.label}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--l-line-strong)] px-3 text-sm font-semibold text-[var(--l-muted)] hover:text-[var(--l-text)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Visão geral
        </button>
      </div>
      <p className="mt-4 text-base leading-relaxed text-[var(--l-text)]">{node.detail}</p>
      {id === "quality" && (
        <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Estados dos dados">
          {DATA_STATES.map((state) => (
            <li key={state.key} className="flex items-center gap-3 rounded-xl border border-[var(--l-line)] bg-[rgb(var(--l-bg-rgb)/0.4)] px-3 py-2.5">
              <span className="h-7 w-7 shrink-0 rounded-md" style={stateStyle(state.key)} aria-hidden="true" />
              <span>
                <span className="block text-[15px] font-semibold">{state.label}</span>
                <span className="block text-[13px] text-[var(--l-muted)]">{state.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  scenario: Scenario;
  stage: number;
  exploring: boolean;
  onNode: (id: NodeId) => void;
  onScenario: (id: ScenarioId) => void;
}

export function InvestigationPanel({ scenario, stage, exploring, onNode, onScenario }: Props) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Block index={0} stage={stage} exploring={exploring} title="Pergunta" className="lg:col-span-2">
        <p className="flex items-start gap-3 text-lg font-semibold leading-snug md:text-xl">
          <MessageSquareText className="mt-1 h-5 w-5 shrink-0 text-[var(--l-accent)]" aria-hidden="true" />
          {scenario.question}
        </p>
      </Block>
      <Block index={1} stage={stage} exploring={exploring} title="Contexto disponível">
        <p className="text-[15px] text-[var(--l-muted)]">Informações do imóvel que participariam da análise:</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {scenario.contextNodes.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => onNode(id)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--l-line-strong)] px-3 text-sm font-medium hover:border-[rgb(var(--l-accent-rgb)/0.5)]">
                {nodeLabel(id)}
              </button>
            </li>
          ))}
        </ul>
      </Block>
      <Block index={2} stage={stage} exploring={exploring} title="Evidências e limitações">
        <ul className="space-y-3">
          {scenario.evidence.map((item) => (
            <li key={item.node} className="text-[15px] leading-snug">
              <span className="font-semibold">{nodeLabel(item.node)}:</span> <span className="text-[var(--l-text)]">{item.need}</span>
              <span className="mt-1 flex items-start gap-1.5 text-sm text-[var(--l-muted)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--l-warning)]" aria-hidden="true" />
                <span><span className="sr-only">Limitação: </span>{item.limitation}</span>
              </span>
            </li>
          ))}
        </ul>
      </Block>
      <Block index={3} stage={stage} exploring={exploring} title="Explicação">
        <p className="text-base leading-relaxed text-[var(--l-text)]">{scenario.explanation}</p>
      </Block>
      <Block index={4} stage={stage} exploring={exploring} title="Possíveis ações">
        <div className="flex flex-wrap gap-2">
          {scenario.actions.map((action) => (
            <ActionButton key={action.label} action={action} onNode={onNode} onScenario={onScenario} />
          ))}
        </div>
      </Block>
    </div>
  );
}
