import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import icon from "@/components/logo_wattstatus_icon.png";
import { useAuth } from "@/hooks/useAuth";
import { NAV_LINKS } from "./content";

export function LandingLogo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--l-surface)] ring-1 ring-[var(--l-line-strong)]">
        <img src={icon} alt="" width={20} height={20} className="h-5 w-5" />
      </span>
      <span className="text-[15px] font-semibold tracking-[0.14em] text-[var(--l-text)]">WATTSTATUS</span>
    </span>
  );
}

// Follow the page's section order, and clear the highlight above the first section.
const useActiveSection = () => {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const ids = NAV_LINKS.map((link) => link.href.slice(1));
    let frame = 0;
    const update = () => {
      frame = 0;
      const marker = Math.min(window.innerHeight * 0.38, 320);
      let current: string | null = null;
      for (const id of ids) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= marker) current = id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, []);
  return active;
};

export function LandingHeader() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useActiveSection();
  const toggle = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Any navigation closes the menu, including route links that keep this
  // page mounted during the transition and the browser's back button.
  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <header className="l-header l-in-fade fixed inset-x-0 top-0 z-50" data-scrolled={scrolled || open}>
      <div className="l-container flex h-16 items-center justify-between gap-6 md:h-[72px] lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link to="/" aria-label="WattStatus, página inicial" className="shrink-0 rounded-lg">
          <LandingLogo />
        </Link>

        <nav aria-label="Seções da página" className="hidden lg:block">
          <ul className="flex items-center gap-5 xl:gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="l-navlink" data-active={active === link.href.slice(1)} aria-current={active === link.href.slice(1) ? "location" : undefined}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center justify-self-end gap-2 lg:flex">
          {user ? (
            <Link to="/dashboard" className="l-btn l-btn-primary !min-h-[40px] !px-4 !text-sm">
              Ir para o painel <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link to="/login" className="l-navlink px-3">
                Entrar
              </Link>
              <Link to="/signup" className="l-btn l-btn-primary !min-h-[40px] !px-4 !text-sm">
                Começar agora
              </Link>
            </>
          )}
        </div>

        <button
          ref={toggle}
          type="button"
          className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--l-line-strong)] bg-[rgb(var(--l-surface-rgb)/0.45)] text-[var(--l-text)] lg:hidden"
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id="landing-mobile-menu" className="l-in-fade h-[calc(100dvh-64px)] overflow-y-auto border-t border-[var(--l-line)] bg-[var(--l-bg)] md:h-[calc(100dvh-72px)] lg:hidden">
          <nav aria-label="Seções da página" className="l-container flex flex-col pt-4">
            {NAV_LINKS.map((link, index) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="l-mobile-link l-in flex items-center gap-4 border-b border-[var(--l-line)] py-5 text-xl font-medium tracking-tight"
                data-active={active === link.href.slice(1)}
                aria-current={active === link.href.slice(1) ? "location" : undefined}
                style={{ animationDelay: `${60 + index * 50}ms` }}
              >
                <span className="w-7 shrink-0 text-xs font-semibold tabular-nums tracking-[0.12em] text-[var(--l-faint)]">{String(index + 1).padStart(2, "0")}</span>
                <span className="flex-1">{link.label}</span>
                <ArrowRight className="h-5 w-5 text-[var(--l-faint)]" aria-hidden="true" />
              </a>
            ))}
            <div className="mt-8 grid gap-3 pb-10">
              {user ? (
                <Link to="/dashboard" onClick={() => setOpen(false)} className="l-btn l-btn-primary w-full">Ir para o painel</Link>
              ) : (
                <>
                  <Link to="/signup" onClick={() => setOpen(false)} className="l-btn l-btn-primary w-full">Começar agora</Link>
                  <Link to="/login" onClick={() => setOpen(false)} className="l-btn l-btn-ghost w-full">Entrar</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
