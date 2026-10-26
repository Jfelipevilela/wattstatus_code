import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AI_EXAMPLE } from "./content";
import { prefersReducedMotion, useReveal } from "./motion";

// Plays the illustrative exchange once it scrolls into view. Nothing here is
// sent to the AI: the text is fixed copy.
const useScript = (run: boolean) => {
  const [step, setStep] = useState<"idle" | "question" | "thinking" | "answer">("idle");
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (prefersReducedMotion()) {
      setStep("answer");
      setTyped(AI_EXAMPLE.answer.length);
      return;
    }
    const timers = [window.setTimeout(() => setStep("question"), 200), window.setTimeout(() => setStep("thinking"), 900), window.setTimeout(() => setStep("answer"), 2100)];
    return () => timers.forEach(window.clearTimeout);
  }, [run]);
  useEffect(() => {
    if (step !== "answer" || typed >= AI_EXAMPLE.answer.length) return;
    const id = window.setTimeout(() => setTyped((n) => Math.min(AI_EXAMPLE.answer.length, n + 3)), 18);
    return () => window.clearTimeout(id);
  }, [step, typed]);
  return { step, typed };
};

export function AIPresentation() {
  const head = useReveal<HTMLDivElement>();
  const demo = useReveal<HTMLDivElement>(0.35);
  const { step, typed } = useScript(demo.shown);
  const done = typed >= AI_EXAMPLE.answer.length;

  return (
    <section id="wattstatus-ai" aria-labelledby="ai-title" className="relative scroll-mt-20 overflow-hidden py-24 md:py-32">
      <div className="l-container grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal">
          <div className="relative mx-auto mb-12 w-40 md:w-48 lg:mx-0" aria-hidden="true">
            <div className="l-orb l-orb-core w-full" />
            <div className="l-orb-ring" />
            <div className="l-orb-ring r2" />
          </div>
          <p className="l-eyebrow">WattStatus AI</p>
          <h2 id="ai-title" className="mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Uma inteligência que ajuda você a entender sua energia.</h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--l-muted)] md:text-lg">
            Pergunte em linguagem natural. O WattStatus AI consulta os dados do seu imóvel, compara períodos e explica o que encontrou, deixando claro quando uma informação é medida ou estimada.
          </p>
        </div>

        <div ref={demo.ref} data-shown={demo.shown} className="l-reveal" style={{ ["--d" as string]: "120ms" }}>
          <div className="l-panel relative overflow-hidden p-5 md:p-7">
            <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(56,214,245,0.16),transparent_70%)]" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-[var(--l-line)] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[rgba(56,214,245,0.14)] text-[var(--l-cyan)]">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold">WattStatus AI</span>
              </div>
              <span className="l-chip">Exemplo ilustrativo</span>
            </div>

            {/* Full text for assistive technology; the animation is visual only. */}
            <div className="sr-only">
              <p>Pergunta: {AI_EXAMPLE.question}</p>
              <p>Resposta: {AI_EXAMPLE.answer}</p>
            </div>

            <div className="min-h-[250px] space-y-4 pt-6 md:min-h-[230px]" aria-hidden="true">
              <div className={`ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-gradient-to-b from-[rgba(56,214,245,0.2)] to-[rgba(37,99,235,0.18)] px-4 py-3 text-[15px] transition-all duration-500 ${step === "idle" ? "translate-y-2 opacity-0" : "opacity-100"}`}>
                {AI_EXAMPLE.question}
              </div>
              {step === "thinking" && (
                <div className="l-in-fade flex w-fit items-center gap-1.5 rounded-2xl border border-[var(--l-line)] px-4 py-3.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--l-cyan)]" style={{ animationDelay: `${i * 160}ms` }} />
                  ))}
                </div>
              )}
              {step === "answer" && (
                <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-[var(--l-line)] bg-[rgba(255,255,255,0.025)] px-4 py-3 text-[15px] leading-relaxed text-[#cfdbe9]">
                  {AI_EXAMPLE.answer.slice(0, typed)}
                  {!done && <span className="l-caret" />}
                </div>
              )}
            </div>
            <p className="mt-5 border-t border-[var(--l-line)] pt-4 text-xs leading-relaxed text-[var(--l-faint)]">
              Conversa demonstrativa. Na plataforma, as respostas dependem dos aparelhos cadastrados e das medições disponíveis.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
