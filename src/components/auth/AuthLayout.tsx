import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import Logo from "@/components/logo_wattstatus_icon.png";
import "@/components/landing/landing.css";
import "./auth.css";

interface AuthLayoutProps {
  view: "login" | "signup";
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthLayout({ view, title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-experience" data-view={view}>
      <div className="auth-shell">
        <header className="auth-header">
          <Link to="/" className="auth-brand" aria-label="WattStatus — página inicial">
            <span className="auth-brand-mark"><img src={Logo} alt="" width="22" height="22" /></span>
            <span>WATTSTATUS</span>
          </Link>
          <Link to="/" className="auth-back"><ArrowLeft size={17} aria-hidden="true" /> Voltar ao início</Link>
        </header>

        <div className="auth-stage">
          <main className="auth-main">
            <div className="auth-form-wrap">
              <div className="auth-intro">
                <p className="auth-eyebrow">{view === "login" ? "BEM-VINDO AO WATTSTATUS" : "SEU PRIMEIRO PASSO"}</p>
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
              {children}
              <div className="auth-footer">{footer}</div>
            </div>
          </main>
          <aside className="auth-visual" aria-label="Residência do WattStatus">
            <div className="auth-visual-top" aria-hidden="true"><span>W / S</span><span>ENERGIA EM CONTEXTO</span></div>
            <div className="auth-visual-bottom" aria-hidden="true">
              <span className="auth-visual-rule" />
              <p>{view === "login" ? "Sua casa, vista com mais clareza." : "Conheça a energia da sua casa."}</p>
              <span>01 / 01</span>
            </div>
          </aside>
        </div>
        <div className="auth-bottom"><span>© {new Date().getFullYear()} WattStatus</span><span>Consumo com contexto.</span></div>
      </div>
    </div>
  );
}
