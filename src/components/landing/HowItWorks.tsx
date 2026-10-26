import { STEPS } from "./content";
import { useReveal } from "./motion";

// One small line drawing per step, in the same stroke language.
function StepArt({ index }: { index: number }) {
  const stroke = { fill: "none", stroke: "#38d6f5", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 160 100" className="h-24 w-full" aria-hidden="true">
      {index === 0 && (
        <g {...stroke}>
          <path d="M40 60 L80 38 L120 60 L80 82 Z" strokeOpacity="0.9" />
          <path d="M80 38 L80 60 M60 49 L100 71 M100 49 L60 71" strokeOpacity="0.35" />
          <path d="M40 60 L40 46 L80 24 L120 46 L120 60" strokeOpacity="0.55" />
        </g>
      )}
      {index === 1 && (
        <g {...stroke}>
          <path d="M20 70 C 45 70, 50 35, 75 40 S 105 70, 140 30" />
          <path className="l-flow" d="M20 78 L140 78" strokeOpacity="0.4" />
          <circle cx="140" cy="30" r="4" fill="#38d6f5" />
        </g>
      )}
      {index === 2 && (
        <g {...stroke}>
          <circle cx="80" cy="52" r="30" strokeOpacity="0.25" />
          <path d="M80 22 A30 30 0 1 1 52 63" stroke="#34d399" />
          <path d="M68 52 L77 61 L94 43" stroke="#34d399" />
        </g>
      )}
    </svg>
  );
}

function Step({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const { ref, shown } = useReveal<HTMLLIElement>();
  return (
    <li ref={ref} data-shown={shown} className="l-reveal relative" style={{ ["--d" as string]: `${index * 140}ms` }}>
      <div className="l-panel h-full p-6">
        <StepArt index={index} />
        <p className="mt-4 text-[11px] font-semibold tabular-nums tracking-[0.16em] text-[var(--l-cyan)]">ETAPA {index + 1}</p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--l-muted)]">{step.text}</p>
      </div>
    </li>
  );
}

export function HowItWorks() {
  const head = useReveal<HTMLDivElement>();
  return (
    <section id="como-funciona" aria-labelledby="como-title" className="relative scroll-mt-20 border-t border-[var(--l-line)] bg-[var(--l-bg-2)] py-24 md:py-32">
      <div className="l-container">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal max-w-2xl">
          <p className="l-eyebrow">Como funciona</p>
          <h2 id="como-title" className="mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Três passos para entender sua energia.</h2>
        </div>
        <div className="relative mt-14">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[60px] hidden h-px bg-gradient-to-r from-transparent via-[rgba(56,214,245,0.35)] to-transparent md:block" aria-hidden="true" />
          <ol className="relative grid gap-4 md:grid-cols-3 md:gap-5">
            {STEPS.map((step, index) => (
              <Step key={step.title} step={step} index={index} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
