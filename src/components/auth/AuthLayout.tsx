import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "@/components/logo_wattstatus_icon.png";
import "@/components/landing/landing.css";
import "./auth.css";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-experience">
      <div className="auth-shell">
        <header className="auth-header">
          <Link to="/" className="auth-brand" aria-label="WattStatus — página inicial">
            <img src={Logo} alt="" width="40" height="40" />
            <span>WattStatus</span>
          </Link>
          <Link to="/" className="auth-back"><ArrowLeft size={17} aria-hidden="true" /> Voltar ao início</Link>
        </header>

        <div className="auth-grid">
          <aside className="auth-story" aria-label="Sobre o WattStatus">
            <div className="auth-story-copy">
              <p className="auth-eyebrow"><span aria-hidden="true" /> ENERGIA COM MAIS CLAREZA</p>
              <h2>Entenda sua energia.<br /><em>Escolha com consciência.</em></h2>
              <p className="auth-story-lead">Organize seus aparelhos, acompanhe estimativas de consumo e explore seus dados em um só lugar.</p>
              <Link className="auth-story-link" to="/sobre">Conheça o WattStatus <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="auth-architecture" aria-hidden="true">
              <div className="auth-architecture-frame"><div className="auth-architecture-roof" /><div className="auth-architecture-window" /></div>
              <span>Uma visão mais clara começa em casa.</span>
            </div>
          </aside>

          <main className="auth-main">
            <div className="auth-form-wrap">
              <div className="auth-intro">
                <p className="auth-mobile-eyebrow">ENERGIA COM MAIS CLAREZA</p>
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
              {children}
              <div className="auth-footer">{footer}</div>
            </div>
          </main>
        </div>
        <div className="auth-bottom"><span>© {new Date().getFullYear()} WattStatus</span><span>Consumo com contexto.</span></div>
      </div>
    </div>
  );
}
