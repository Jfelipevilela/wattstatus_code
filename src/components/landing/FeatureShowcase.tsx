import { ArrowUpRight, Box, MessageSquareText, Target, Wallet } from "lucide-react";
import { FEATURES } from "./content";
import { HouseIllustration } from "./HouseIllustration";
import { useReveal } from "./motion";

const ICONS = { "3d": Box, costs: Wallet, ai: MessageSquareText, plan: Target } as const;
const LINKS = { "3d": "#visualizacao-3d", costs: "#visualizacao-3d", ai: "#wattstatus-ai", plan: "#como-funciona" } as const;

// Measured versus estimated: the visual language the product uses.
function MeasuredVsEstimated() {
  const bars = [0.55, 0.72, 0.48, 0.86, 0.64, 0.4, 0.7];
  return (
    <div className="mt-6" aria-hidden="true">
      <div className="flex h-28 items-end gap-2">
        {bars.map((value, index) => (
          <div key={index} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={`rounded-md transition-all duration-500 group-hover:opacity-100 ${index % 3 === 1 ? "border border-dashed border-[rgba(148,178,214,0.45)] bg-transparent opacity-80" : "bg-gradient-to-t from-[#1d4ed8] to-[#38d6f5] opacity-85"}`}
              style={{ height: `${value * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--l-muted)]">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#38d6f5]" />Medido por dispositivo</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[rgba(148,178,214,0.7)]" />Estimado pelo cadastro</span>
      </div>
    </div>
  );
}

function ChatSnippet() {
  return (
    <div className="mt-6 space-y-2.5 text-[13px]" aria-hidden="true">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[rgba(56,214,245,0.12)] px-3.5 py-2 text-[var(--l-text)]">Por que meu consumo mudou?</div>
      <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-[var(--l-line)] bg-[rgba(255,255,255,0.03)] px-3.5 py-2 text-[var(--l-muted)]">Vou comparar os períodos com os dados disponíveis…</div>
    </div>
  );
}

function PlanTrack() {
  const steps = ["Meta definida", "Simulação de hábitos", "Acompanhamento"];
  return (
    <ol className="mt-6 space-y-3" aria-hidden="true">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-3 text-[13px] text-[var(--l-muted)]">
          <span className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] ${index < 2 ? "border-[rgba(52,211,153,0.6)] text-[var(--l-green)]" : "border-[var(--l-line-strong)] text-[var(--l-faint)]"}`}>{index + 1}</span>
          {step}
          <span className="ml-auto h-px flex-1 bg-[var(--l-line)]" />
        </li>
      ))}
    </ol>
  );
}

function Module({ feature, index, className, children }: { feature: (typeof FEATURES)[number]; index: number; className?: string; children?: React.ReactNode }) {
  const { ref, shown } = useReveal<HTMLLIElement>();
  const Icon = ICONS[feature.id];
  return (
    <li ref={ref} data-shown={shown} className={`l-reveal ${className ?? ""}`} style={{ ["--d" as string]: `${index * 90}ms` }}>
      <a href={LINKS[feature.id]} className="l-panel group relative flex h-full flex-col overflow-hidden p-6 transition-colors duration-300 hover:border-[rgba(56,214,245,0.35)] md:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(56,214,245,0.14),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <div className="flex items-center justify-between">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--l-line-strong)] bg-[rgba(56,214,245,0.06)] text-[var(--l-cyan)]">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <ArrowUpRight className="h-4 w-4 text-[var(--l-faint)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--l-cyan)]" aria-hidden="true" />
        </div>
        <h3 className="mt-5 text-lg font-semibold tracking-tight md:text-xl">{feature.title}</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--l-muted)]">{feature.text}</p>
        {children}
      </a>
    </li>
  );
}

export function FeatureShowcase() {
  const head = useReveal<HTMLDivElement>();
  const [house, costs, ai, plan] = FEATURES;
  return (
    <section id="recursos" aria-labelledby="recursos-title" className="relative scroll-mt-20 py-24 md:py-32">
      <div className="l-container">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal max-w-2xl">
          <p className="l-eyebrow">Mais do que dados</p>
          <h2 id="recursos-title" className="mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Uma visão completa da sua energia.</h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--l-muted)] md:text-lg">Descubra como seus aparelhos influenciam o consumo, organize sua casa e transforme informações em decisões melhores.</p>
        </div>

        <ul className="mt-14 grid gap-4 md:grid-cols-6 md:gap-5">
          <Module feature={house} index={0} className="md:col-span-4">
            <div className="relative mt-2 flex flex-1 items-end justify-center">
              <HouseIllustration className="h-auto max-h-[300px] w-full max-w-[460px] opacity-95 transition-transform duration-700 group-hover:scale-[1.03]" />
            </div>
          </Module>
          <Module feature={costs} index={1} className="md:col-span-2">
            <MeasuredVsEstimated />
          </Module>
          <Module feature={ai} index={2} className="md:col-span-3">
            <ChatSnippet />
          </Module>
          <Module feature={plan} index={3} className="md:col-span-3">
            <PlanTrack />
          </Module>
        </ul>
      </div>
    </section>
  );
}
