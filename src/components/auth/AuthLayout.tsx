import { useEffect, useRef, type ReactNode } from "react";
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
  const visualRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const visual = visualRef.current;
    if (!visual) return;

    const motion = window.matchMedia("(min-width: 1101px) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;

    const reset = () => {
      cancelAnimationFrame(frame);
      visual.style.setProperty("--auth-shift-x", "0px");
      visual.style.setProperty("--auth-shift-y", "0px");
    };
    const move = (event: PointerEvent) => {
      if (!motion.matches) return;
      const bounds = visual.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 14;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 10;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        visual.style.setProperty("--auth-shift-x", `${x.toFixed(2)}px`);
        visual.style.setProperty("--auth-shift-y", `${y.toFixed(2)}px`);
      });
    };

    visual.addEventListener("pointermove", move);
    visual.addEventListener("pointerleave", reset);
    motion.addEventListener("change", reset);
    return () => {
      reset();
      visual.removeEventListener("pointermove", move);
      visual.removeEventListener("pointerleave", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);

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
          <aside className="auth-visual" aria-hidden="true" ref={visualRef}>
            <div className="auth-visual-glow" />
            <div className="auth-visual-floor" />
            <div className="auth-visual-image"><div className="auth-visual-house" /></div>
            <div className="auth-visual-caption">
              <span>A CASA WATTSTATUS</span>
              <p>{view === "login" ? "Sua casa, vista com mais clareza." : "Conheça a energia da sua casa."}</p>
            </div>
          </aside>
        </div>
        <div className="auth-bottom"><span>© {new Date().getFullYear()} WattStatus</span><span>Consumo com contexto.</span></div>
      </div>
    </div>
  );
}
