import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, FileClock } from "lucide-react";
import { LandingLogo } from "@/components/landing/LandingHeader";
import "@/components/landing/landing.css";

type LegalStatusProps = { kind: "terms" | "privacy" };

export default function LegalStatus({ kind }: LegalStatusProps) {
  const terms = kind === "terms";
  const title = terms ? "Termos de uso" : "Política de privacidade";
  return (
    <div className="landing flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--l-accent)] focus:px-4 focus:py-2 focus:text-[var(--l-bg)]">Pular para o conteúdo</a>
      <header className="border-b border-[var(--l-line)]">
        <div className="l-container flex min-h-[76px] items-center justify-between gap-4">
          <Link to="/" aria-label="WattStatus, página inicial"><LandingLogo /></Link>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--l-muted)] hover:text-[var(--l-accent)]"><ArrowLeft size={16} aria-hidden="true" /> Início</Link>
        </div>
      </header>
      <main id="conteudo" className="l-container flex w-full flex-1 flex-col justify-center py-14 sm:py-24">
        <div className="max-w-3xl">
          <p className="l-eyebrow">DOCUMENTAÇÃO EM PREPARAÇÃO</p>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-.045em] text-[var(--l-text)] sm:text-6xl">{title}</h1>
          <div className="mt-9 border-l-2 border-[var(--l-accent)] bg-[var(--l-surface)] p-6 sm:p-8" role="status">
            <FileClock size={24} className="text-[var(--l-accent)]" aria-hidden="true" />
            <h2 className="mt-5 text-xl font-semibold text-[var(--l-text)]">Texto ainda não disponível</h2>
            <p className="mt-3 max-w-xl leading-7 text-[var(--l-muted)]">
              {terms
                ? "Os termos de uso aguardam elaboração e aprovação. Esta página não constitui um contrato nem apresenta condições definitivas."
                : "A política de privacidade aguarda elaboração e aprovação. Esta página não descreve de forma definitiva o tratamento de dados do WattStatus."}
            </p>
          </div>
          <p className="mt-7 max-w-xl text-sm leading-7 text-[var(--l-muted)]">O cadastro disponível nesta versão destina-se à homologação local. A publicação para usuários reais depende dos documentos aprovados e da revisão do aceite.</p>
          <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold">
            <Link to={terms ? "/privacidade" : "/termos"} className="inline-flex min-h-11 items-center gap-2 text-[var(--l-accent)] hover:underline">{terms ? "Estado da privacidade" : "Estado dos termos"} <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-[var(--l-text)] hover:underline">Voltar ao início</Link>
          </div>
        </div>
      </main>
      <footer className="border-t border-[var(--l-line)]"><div className="l-container py-6 text-xs text-[var(--l-faint)]">© {new Date().getFullYear()} WattStatus · Documentação pendente de aprovação</div></footer>
    </div>
  );
}
