import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import icon from "@/components/logo_wattstatus_icon.png";
import { useAuth } from "@/hooks/useAuth";
import { NAV_LINKS } from "./content";

export function LandingLogo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-b from-[#1b3a5c] to-[#0d1d33] ring-1 ring-white/10">
        <img src={icon} alt="" width={20} height={20} className="h-5 w-5" />
      </span>
      <span className="text-[15px] font-semibold tracking-[0.14em] text-[var(--l-text)]">WATTSTATUS</span>
    </span>
  );
}

// Highlights the nav link of the section in view.
const useActiveSection = () => {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const ids = NAV_LINKS.map((link) => link.href.slice(1));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    ids.forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);
  return active;
};

export function LandingHeader() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useActiveSection();
  const toggle = useRef<HTMLButtonElement>(null);

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
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="l-header l-in-fade fixed inset-x-0 top-0 z-50" data-scrolled={scrolled || open}>
      <div className="l-container flex h-16 items-center justify-between gap-6 md:h-[72px]">
        <Link to="/" aria-label="WattStatus, página inicial" className="shrink-0 rounded-lg">
          <LandingLogo />
        </Link>

        <nav aria-label="Seções da página" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="l-navlink" data-active={active === link.href.slice(1)}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
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
          className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--l-line-strong)] text-[var(--l-text)] lg:hidden"
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id="landing-mobile-menu" className="l-in-fade h-[calc(100dvh-64px)] overflow-y-auto border-t border-[var(--l-line)] bg-[var(--l-bg)] lg:hidden">
          <nav aria-label="Seções da página" className="l-container flex flex-col pt-4">
            {NAV_LINKS.map((link, index) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="l-in flex items-center justify-between border-b border-[var(--l-line)] py-5 text-xl font-medium tracking-tight"
                style={{ animationDelay: `${60 + index * 50}ms` }}
              >
                {link.label}
                <ArrowRight className="h-5 w-5 text-[var(--l-faint)]" aria-hidden="true" />
              </a>
            ))}
            <div className="mt-8 grid gap-3 pb-10">
              {user ? (
                <Link to="/dashboard" className="l-btn l-btn-primary w-full">Ir para o painel</Link>
              ) : (
                <>
                  <Link to="/signup" className="l-btn l-btn-primary w-full">Começar agora</Link>
                  <Link to="/login" className="l-btn l-btn-ghost w-full">Entrar</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
