import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useReveal } from "./motion";

export function FinalCTA() {
  const { ref, shown } = useReveal<HTMLDivElement>(0.3);
  return (
    <section aria-labelledby="cta-title" className="relative px-4 pb-20 md:px-8 md:pb-24">
      <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[32px] border border-[var(--l-line)] bg-[var(--l-surface)] px-6 py-16 md:py-20">
        {/* Forest light from below, a warm accent and a fine horizon line. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_50%_120%,rgb(var(--l-forest-rgb)/0.95),transparent_70%)]" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(30%_40%_at_80%_10%,rgb(var(--l-amber-rgb)/0.1),transparent_70%)]" aria-hidden="true" />
        <div className="l-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-[10%] bottom-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--l-accent-rgb)/0.7)] to-transparent" aria-hidden="true" />
        <div ref={ref} data-shown={shown} className="l-reveal relative text-center">
          <h2 id="cta-title" className="mx-auto max-w-3xl text-[2.1rem] font-semibold leading-[1.06] tracking-[-0.035em] md:text-[3.6rem]">
            Sua energia tem uma história. <span className="l-gradient-text">Comece a entendê-la.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--l-muted)] md:text-lg">Conheça uma maneira mais visual e inteligente de acompanhar o consumo da sua casa.</p>
          <Link to="/signup" className="l-btn l-btn-primary group mt-10 !min-h-[56px] !px-8 !text-base">
            Criar minha conta
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
