import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { STEPS } from "./content";
import { Chapter } from "./Chapter";
import { useReveal } from "./motion";

// A calm section after the AI demo: a numbered line, no cards.
function Step({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const { ref, shown } = useReveal<HTMLLIElement>();
  return (
    <li ref={ref} data-shown={shown} className="l-reveal relative pl-14 md:pl-0 md:pt-16" style={{ ["--d" as string]: `${index * 140}ms` }}>
      <span className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border border-[rgb(var(--l-accent-rgb)/0.45)] bg-[var(--l-bg)] text-sm font-semibold tabular-nums text-[var(--l-accent)]">
        {index + 1}
      </span>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{step.title}</h3>
      <p className="mt-2 max-w-xs text-base leading-relaxed text-[var(--l-muted)]">{step.text}</p>
    </li>
  );
}

export function HowItWorks() {
  const head = useReveal<HTMLDivElement>();
  return (
    <section id="como-funciona" aria-labelledby="como-title" className="relative scroll-mt-20 py-20 md:py-24">
      <div className="l-container">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Chapter index={5} label="Ação" />
            <h2 id="como-title" className="mt-6 l-h2">Comece em três passos.</h2>
          </div>
          <Link to="/signup" className="l-btn l-btn-ghost w-fit">
            Cadastrar meu imóvel <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="relative mt-12">
          <div className="absolute bottom-2 left-5 top-2 w-px bg-gradient-to-b from-[rgb(var(--l-accent-rgb)/0.5)] to-[var(--l-line)] md:bottom-auto md:left-0 md:right-0 md:top-5 md:h-px md:w-auto md:bg-gradient-to-r" aria-hidden="true" />
          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-10">
            {STEPS.map((step, index) => (
              <Step key={step.title} step={step} index={index} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
