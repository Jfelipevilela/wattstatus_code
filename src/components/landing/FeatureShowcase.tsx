import { useState } from "react";
import { ArrowUpRight, Box, Home, MessageSquareText, Plug, Target, Wallet } from "lucide-react";
import { FEATURES } from "./content";
import { Chapter } from "./Chapter";
import { DATA_STATES, stateStyle, type DataState } from "./dataStates";
import { HouseIllustration } from "./HouseIllustration";
import { useReveal } from "./motion";

const LINKS = { "3d": "#visualizacao-3d", costs: "#visualizacao-3d", ai: "#wattstatus-ai", plan: "#como-funciona" } as const;
const ICONS = { "3d": Box, costs: Wallet, ai: MessageSquareText, plan: Target } as const;

function Card({ id, index, className, children, wide = false }: { id: (typeof FEATURES)[number]["id"]; index: number; className?: string; children?: React.ReactNode; wide?: boolean }) {
  const { ref, shown } = useReveal<HTMLLIElement>(0.15);
  const feature = FEATURES.find((item) => item.id === id)!;
  const Icon = ICONS[id];
  return (
    <li ref={ref} data-shown={shown} className={`l-reveal ${className ?? ""}`} style={{ ["--d" as string]: `${index * 90}ms` }}>
      <div className={`l-card group flex h-full flex-col overflow-hidden p-6 md:p-8 ${wide ? "lg:flex-row lg:gap-8" : ""}`}>
        <div className={wide ? "lg:w-[40%] lg:shrink-0" : ""}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--l-accent-subtle)] text-[var(--l-accent)] ring-1 ring-[rgb(var(--l-accent-rgb)/0.2)]">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em] md:text-2xl">{feature.title}</h3>
          <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-[var(--l-muted)]">{feature.text}</p>
          <a href={LINKS[id]} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--l-accent)] hover:text-[var(--l-accent-hover)]">
            Saiba mais <span className="sr-only">sobre {feature.title}</span>
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
        </div>
        {children}
      </div>
    </li>
  );
}

// Property → rooms → appliances: the real data model behind the 3D view.
function Hierarchy() {
  const rows = [
    { Icon: Home, label: "Imóvel", depth: 0 },
    { Icon: Box, label: "Sala de estar", depth: 1 },
    { Icon: Plug, label: "Televisão", depth: 2 },
    { Icon: Plug, label: "Ar-condicionado", depth: 2 },
    { Icon: Box, label: "Cozinha", depth: 1 },
    { Icon: Plug, label: "Geladeira", depth: 2 },
  ];
  return (
    <div className="relative mt-8 min-h-[240px] flex-1 sm:min-h-[300px] lg:mt-0" aria-hidden="true">
      <HouseIllustration tight className="absolute bottom-[-6%] right-[-6%] hidden h-[105%] w-[92%] transition-transform duration-700 group-hover:scale-[1.03] sm:block" />
      <ul className="relative w-full space-y-1.5 text-[13px] sm:w-[190px]">
        {rows.map(({ Icon, label, depth }) => (
          <li key={label} className="flex items-center gap-2 rounded-lg border border-[var(--l-line)] bg-[rgb(var(--l-bg-rgb)/0.7)] px-2.5 py-1.5 backdrop-blur-sm" style={{ marginLeft: depth * 14 }}>
            <Icon className={`h-3.5 w-3.5 ${depth === 2 ? "text-[var(--l-amber)]" : "text-[var(--l-accent)]"}`} />
            <span className={depth === 0 ? "font-semibold" : "text-[var(--l-muted)]"}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatesChart() {
  const bars: Array<[DataState, number]> = [["measured", 0.62], ["measured", 0.78], ["estimated", 0.55], ["partial", 0.9], ["measured", 0.7], ["nodata", 0.45], ["estimated", 0.66]];
  return (
    <div className="mt-8 flex flex-1 flex-col justify-end">
      <span className="l-chip w-fit">Exemplo ilustrativo · sem valores</span>
      <div className="mt-4 flex h-32 items-end gap-2" aria-hidden="true">
        {bars.map(([state, value], index) => (
          <div key={index} className="flex h-full flex-1 items-end">
            <div className="w-full rounded-md transition-transform duration-500 group-hover:scale-y-[1.04]" style={{ height: `${value * 100}%`, transformOrigin: "bottom", ...stateStyle(state) }} />
          </div>
        ))}
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2" aria-label="Legenda dos tipos de dado">
        {DATA_STATES.map((state) => (
          <li key={state.key} className="l-legend" title={state.hint}><span className="l-swatch" style={stateStyle(state.key)} aria-hidden="true" />{state.label}</li>
        ))}
      </ul>
    </div>
  );
}

function Prompts() {
  const prompts = ["Por que meu consumo mudou este mês?", "Quais aparelhos merecem atenção?", "O que muda se eu usar menos o ar-condicionado?"];
  return (
    <ul className="mt-8 flex flex-1 flex-col justify-end gap-2.5" aria-label="Exemplos de perguntas">
      {prompts.map((prompt) => (
        <li key={prompt} className="flex items-center gap-3 rounded-2xl border border-[var(--l-line)] bg-[rgb(var(--l-bg-rgb)/0.35)] px-4 py-3 text-[14px] transition-colors duration-300 group-hover:border-[rgb(var(--l-accent-rgb)/0.25)]">
          <MessageSquareText className="h-4 w-4 shrink-0 text-[var(--l-accent)]" aria-hidden="true" />
          {prompt}
        </li>
      ))}
    </ul>
  );
}

// A real control: drag to see a habit change against a plan goal. Hours of
// use only; no kWh or money is invented.
function PlanSimulator() {
  const [hours, setHours] = useState(6);
  const goal = 4;
  const within = hours <= goal;
  return (
    <div className="mt-8 flex flex-1 flex-col justify-center lg:mt-0">
      <div className="rounded-2xl border border-[var(--l-line)] bg-[rgb(var(--l-bg-rgb)/0.35)] p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Simular hábito · ar-condicionado</p>
          <span className="l-chip">Exemplo</span>
        </div>
        <label htmlFor="plan-hours" className="mt-4 flex items-baseline justify-between text-sm text-[var(--l-muted)]">
          Horas de uso por dia
          <output htmlFor="plan-hours" className="text-2xl font-semibold tabular-nums text-[var(--l-text)]">{hours} h</output>
        </label>
        <input id="plan-hours" type="range" min={1} max={10} value={hours} onChange={(event) => setHours(Number(event.target.value))} className="mt-3 w-full accent-[var(--l-accent)]" />
        <div className="relative mt-4 h-2.5 rounded-full bg-[rgb(var(--l-line-rgb)/0.12)]" aria-hidden="true">
          <div className="h-2.5 rounded-full transition-all duration-300" style={{ width: `${hours * 10}%`, background: within ? "var(--l-accent)" : "var(--l-amber)" }} />
          <div className="absolute -top-1.5 h-5 w-0.5 rounded bg-[var(--l-text)]" style={{ left: `${goal * 10}%` }} />
        </div>
        <p className="mt-3 text-[13px] text-[var(--l-muted)]" aria-live="polite">
          {within ? "Dentro da meta de uso definida no plano." : `${hours - goal} h acima da meta de uso definida no plano.`}
        </p>
      </div>
    </div>
  );
}

export function FeatureShowcase() {
  const head = useReveal<HTMLDivElement>();
  return (
    <section id="recursos" aria-labelledby="recursos-title" className="relative scroll-mt-20 py-24 md:py-36">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(50%_60%_at_15%_0%,rgb(var(--l-forest-rgb)/0.35),transparent)]" aria-hidden="true" />
      <div className="l-container relative">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal grid gap-6 md:grid-cols-[1fr_0.8fr] md:items-end">
          <div>
            <Chapter index={2} label="Exploração" />
            <h2 id="recursos-title" className="mt-6 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.035em] md:text-[3.4rem]">Uma visão completa da sua energia.</h2>
          </div>
          <p className="text-base leading-relaxed text-[var(--l-muted)] md:text-lg">Descubra como seus aparelhos influenciam o consumo, organize sua casa e transforme informações em decisões melhores.</p>
        </div>

        <ul className="mt-14 grid gap-4 md:grid-cols-12 md:gap-5">
          <Card id="3d" index={0} className="md:col-span-12 lg:col-span-7" wide>
            <Hierarchy />
          </Card>
          <Card id="costs" index={1} className="md:col-span-6 lg:col-span-5">
            <StatesChart />
          </Card>
          <Card id="ai" index={2} className="md:col-span-6 lg:col-span-5">
            <Prompts />
          </Card>
          <Card id="plan" index={3} className="md:col-span-12 lg:col-span-7" wide>
            <PlanSimulator />
          </Card>
        </ul>
      </div>
    </section>
  );
}
