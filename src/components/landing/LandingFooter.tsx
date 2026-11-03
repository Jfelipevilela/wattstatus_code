import { Link } from "react-router-dom";
import { LandingLogo } from "./LandingHeader";
import { NAV_LINKS } from "./content";

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--l-line)] bg-[var(--l-bg)]">
      <div className="l-container grid gap-12 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:py-16">
        <div>
          <Link to="/" aria-label="WattStatus, página inicial" className="inline-block rounded-lg">
            <LandingLogo />
          </Link>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-[var(--l-muted)]">
            Monitoramento, visualização 3D e inteligência artificial para entender e planejar o consumo de energia da sua casa.
          </p>
        </div>
        <nav aria-label="Produto">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--l-faint)]">Produto</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]">{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Plataforma">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--l-faint)]">Plataforma</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/login" className="text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]">Entrar</Link></li>
            <li><Link to="/signup" className="text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]">Criar conta</Link></li>
            <li><Link to="/sobre" className="text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]">Sobre o WattStatus</Link></li>
            <li><Link to="/termos" className="text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]">Termos (pendentes)</Link></li>
            <li><Link to="/privacidade" className="text-[var(--l-muted)] transition-colors hover:text-[var(--l-text)]">Privacidade (pendente)</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-[var(--l-line)]">
        <div className="l-container flex flex-col gap-2 py-6 text-sm text-[var(--l-faint)] md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} WattStatus. Todos os direitos reservados.</p>
          <p>A casa e as telas desta página são demonstrativas e não representam dados reais.</p>
        </div>
      </div>
    </footer>
  );
}
