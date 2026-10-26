import { useEffect, useState } from "react";
import { Check, Database, GitCompare, Lightbulb, MessageSquareText, Play, Sparkles } from "lucide-react";
import { AI_EXAMPLE } from "./content";
import { Chapter } from "./Chapter";
import { useReducedMotion, useReveal } from "./motion";

// The illustrative investigation, step by step. Fixed copy: nothing is sent
// to the AI provider from the public page.
const STAGES = [
  { key: "question", label: "Pergunta", Icon: MessageSquareText },
  { key: "analysis", label: "Análise", Icon: GitCompare },
  { key: "evidence", label: "Evidências", Icon: Database },
  { key: "explanation", label: "Explicação", Icon: Sparkles },
  { key: "action", label: "Possível ação", Icon: Lightbulb },
] as const;

const EVIDENCE = [
  { title: "Histórico do imóvel", detail: "períodos comparados lado a lado" },
  { title: "Aparelhos cadastrados", detail: "potência e horas de uso informadas" },
  { title: "Qualidade dos dados", detail: "medido, estimado, parcial ou sem dados" },
];

const BENEFITS = [
  "Responde com base nos dados do seu imóvel",
  "Indica quando a informação é medida ou estimada",
  "Sugere simulações e planos de economia",
];

// The demo starts complete: every stage is readable without waiting for an
// animation. "Ver passo a passo" replays the investigation on request.
const FINAL = STAGES.length - 1;
const useStage = () => {
  const [stage, setStage] = useState(FINAL);
  const [typed, setTyped] = useState<number>(AI_EXAMPLE.answer.length);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!run) return;
    setStage(-1);
    setTyped(0);
    const timers = [200, 1100, 2000, 3000, 6200].map((delay, index) => window.setTimeout(() => setStage(index), delay));
    return () => timers.forEach(window.clearTimeout);
  }, [run]);
  useEffect(() => {
    if (stage < 3 || typed >= AI_EXAMPLE.answer.length) return;
    const id = window.setTimeout(() => setTyped((n) => Math.min(AI_EXAMPLE.answer.length, n + 3)), 16);
    return () => window.clearTimeout(id);
  }, [stage, typed]);
  const playing = stage < FINAL || typed < AI_EXAMPLE.answer.length;
  return { stage, typed, playing, replay: () => setRun((n) => n + 1) };
};

export function AIPresentation() {
  const head = useReveal<HTMLDivElement>();
  const demo = useReveal<HTMLDivElement>(0.3);
  const { stage, typed, playing, replay } = useStage();
  const reducedMotion = useReducedMotion();
  const done = typed >= AI_EXAMPLE.answer.length;

  return (
    <section id="wattstatus-ai" aria-labelledby="ai-title" className="relative scroll-mt-20 overflow-hidden bg-[#050f0c] py-24 md:py-36">
      {/* Its own atmosphere: a deep forest field with an emerald core. */}
      <div className="pointer-events-none absolute -left-40 top-10 h-[700px] w-[700px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--l-forest-rgb)/0.6),transparent)]" aria-hidden="true" />
      <div className="pointer-events-none absolute right-0 top-1/3 h-[500px] w-[500px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--l-amber-rgb)/0.06),transparent)]" aria-hidden="true" />

      <div className="l-container relative grid items-center gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal">
          <Chapter index={4} label="Inteligência" />
          <div className="mt-8 flex items-center gap-4">
            <div className="relative w-16 shrink-0" aria-hidden="true">
              <div className="l-orb l-orb-core w-full" />
              <div className="l-orb-ring" />
            </div>
            <p className="text-lg font-semibold tracking-tight">WattStatus AI</p>
          </div>
          <h2 id="ai-title" className="mt-6 l-h2 max-w-[13ch]">Uma inteligência que ajuda você a entender sua energia.</h2>
          <p className="mt-5 max-w-xl l-lead">
            Pergunte em linguagem natural. O WattStatus AI consulta os dados do seu imóvel, compara períodos e explica o que encontrou.
          </p>
          <ul className="mt-8 space-y-3">
            {BENEFITS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-base">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--l-accent-subtle)] text-[var(--l-accent)]"><Check className="h-3 w-3" aria-hidden="true" /></span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div ref={demo.ref} data-shown={demo.shown} className="l-reveal" style={{ ["--d" as string]: "120ms" }}>
          <div className="l-card overflow-hidden p-5 md:p-7">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--l-line)] pb-4">
              <span className="text-sm font-semibold">Investigação</span>
              <div className="flex items-center gap-2">
                {!reducedMotion && (
                  <button type="button" onClick={replay} disabled={playing} className="flex min-h-[36px] items-center gap-1.5 rounded-full border border-[rgb(var(--l-accent-rgb)/0.35)] px-3 text-sm font-semibold text-[var(--l-accent)] hover:bg-[var(--l-accent-subtle)] disabled:opacity-50">
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {playing ? "Reproduzindo…" : "Ver passo a passo"}
                  </button>
                )}
                <span className="l-chip">Exemplo ilustrativo</span>
              </div>
            </div>

            {/* Stepper: the connector sits behind the icon row, from the first
                centre to the last, so it never crosses labels or content. */}
            <div className="relative mt-6 rounded-2xl border border-[var(--l-line)] bg-[rgb(var(--l-bg-rgb)/0.35)] px-2 py-4">
              <div className="absolute left-[10%] right-[10%] top-[34px] h-px bg-[var(--l-line-strong)]" aria-hidden="true">
                <div className="h-px bg-[var(--l-accent)] transition-all duration-700" style={{ width: `${Math.max(0, stage) * 25}%` }} />
              </div>
              <ol className="relative grid grid-cols-5" aria-label="Etapas da investigação">
                {STAGES.map(({ key, label, Icon }, index) => {
                  const state = index < stage ? "done" : index === stage ? "now" : "next";
                  return (
                    <li key={key} className="flex flex-col items-center gap-2.5 px-1 text-center" aria-current={state === "now" ? "step" : undefined}>
                      <span className={`grid h-9 w-9 place-items-center rounded-full border bg-[var(--l-surface)] transition-all duration-500 ${state === "next" ? "border-[var(--l-line-strong)] text-[var(--l-faint)]" : state === "now" ? "border-[var(--l-accent)] text-[var(--l-accent)] shadow-[var(--l-glow)]" : "border-[rgb(var(--l-accent-rgb)/0.5)] text-[var(--l-accent)]"}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className={`text-xs leading-tight sm:text-sm ${state === "next" ? "text-[var(--l-faint)]" : "text-[var(--l-text)]"}`}>{label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="sr-only">
              <p>Pergunta: {AI_EXAMPLE.question}</p>
              <p>Resposta ilustrativa: {AI_EXAMPLE.answer}</p>
            </div>

            <div className="mt-7 min-h-[360px] space-y-5 sm:min-h-[320px]" aria-hidden="true">
              <div className={`ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-[rgb(var(--l-accent-rgb)/0.14)] px-4 py-3 text-base transition-all duration-500 ${stage < 0 ? "translate-y-2 opacity-0" : "opacity-100"}`}>
                {AI_EXAMPLE.question}
              </div>
              <div className={`grid gap-2 transition-all duration-500 sm:grid-cols-3 ${stage >= 2 ? "opacity-100" : stage === 1 ? "opacity-60" : "opacity-0"}`}>
                {EVIDENCE.map((item, index) => (
                  <div key={item.title} className="rounded-xl border border-[var(--l-line)] bg-[rgb(var(--l-bg-rgb)/0.4)] p-3 transition-all duration-500" style={{ transitionDelay: `${index * 120}ms`, transform: stage >= 2 ? "none" : "translateY(6px)" }}>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-[var(--l-muted)]">{item.detail}</p>
                    {stage === 1 && <span className="mt-2 block h-1 w-full overflow-hidden rounded bg-[rgb(var(--l-line-rgb)/0.12)]"><span className="block h-1 w-1/3 animate-pulse rounded bg-[var(--l-accent)]" /></span>}
                  </div>
                ))}
              </div>
              {stage >= 3 && (
                <div className="rounded-2xl rounded-bl-md border border-[var(--l-line)] bg-[rgb(var(--l-surface-rgb)/0.6)] px-4 py-3 text-base leading-relaxed text-[var(--l-text)]">
                  {AI_EXAMPLE.answer.slice(0, typed)}
                  {!done && <span className="l-caret" />}
                </div>
              )}
              {stage >= 4 && (
                <div className="l-in flex flex-wrap gap-2">
                  {["Comparar meses", "Simular uso do ar-condicionado", "Criar plano de economia"].map((action) => (
                    <span key={action} className="rounded-full border border-[rgb(var(--l-accent-rgb)/0.35)] px-3 py-1.5 text-sm text-[var(--l-accent)]">{action}</span>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-5 border-t border-[var(--l-line)] pt-4 text-sm leading-relaxed text-[var(--l-faint)]">
              Conversa demonstrativa. Na plataforma, as respostas dependem dos aparelhos cadastrados e das medições disponíveis.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
