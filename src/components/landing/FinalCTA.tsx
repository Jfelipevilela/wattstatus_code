import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "./motion";

export function FinalCTA() {
  const { ref, shown } = useReveal<HTMLDivElement>(0.3);
  return (
    <section aria-labelledby="cta-title" className="relative pb-24 md:pb-28">
      <div className="l-container">
        <div ref={ref} data-shown={shown} className="l-reveal grid gap-8 border-t border-[var(--l-line-strong)] pt-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-12 md:pt-16">
          <div>
            <p className="mb-7 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--l-faint)]">O próximo passo</p>
            <h2 id="cta-title" className="max-w-[18ch] text-[2.3rem] font-semibold leading-[1.05] tracking-[-0.04em] md:text-[clamp(3rem,4.5vw,5rem)]">
              Sua energia tem uma história. Comece a <span className="l-accent-text whitespace-nowrap">entendê-la.</span>
            </h2>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-[var(--l-muted)] md:text-lg">Conheça uma maneira mais visual e inteligente de acompanhar o consumo da sua casa.</p>
          </div>
          <Link to="/signup" className="l-btn l-btn-primary group w-fit !min-h-[56px] !px-8 !text-base md:mb-2">
            Criar minha conta
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
