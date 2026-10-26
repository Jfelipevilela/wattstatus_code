import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "./motion";

export function FinalCTA() {
  const { ref, shown } = useReveal<HTMLDivElement>(0.3);
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden py-28 md:py-40">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_55%_at_50%_100%,rgba(37,99,235,0.28),transparent_75%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[rgba(56,214,245,0.6)] to-transparent" aria-hidden="true" />
      <div ref={ref} data-shown={shown} className="l-reveal l-container relative text-center">
        <h2 id="cta-title" className="mx-auto max-w-3xl text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.035em] md:text-6xl">
          Sua energia tem uma história. <span className="l-gradient-text">Comece a entendê-la.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--l-muted)] md:text-lg">Conheça uma maneira mais visual e inteligente de acompanhar o consumo da sua casa.</p>
        <Link to="/signup" className="l-btn l-btn-primary group mt-10 !min-h-[54px] !px-7 !text-base">
          Criar minha conta
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
