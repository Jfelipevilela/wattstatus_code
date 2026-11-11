import { BUILDING_UNITS } from "./buildingDemo";
import { ApartmentCard } from "./ApartmentCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Box, Image as ImageIcon, Minus, Plus, RotateCcw, X } from "lucide-react";
import { DEMO_ROOMS, HERO_HIGHLIGHTS, type DemoRoomId } from "./content";
import { HouseIllustration } from "./HouseIllustration";
import { supportsWebGL, useReducedMotion } from "./motion";
import { useLiteMode, writePref } from "./renderMode";

const HeroHouse3D = lazy(() => import("./HeroHouse3D"));

const useCompact = () => {
  const [compact, setCompact] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
};

const useWide = () => {
  const [wide, setWide] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
};

const ZOOM_STEPS = [1.25, 1, 0.82, 0.68];

// Catches a failed chunk download or a WebGL error inside the scene, so the
// hero falls back to the illustration instead of breaking the page.
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function BuildingIllustration() {
  return (
    <svg viewBox="0 0 520 460" aria-hidden="true" className="absolute inset-y-0 right-0 m-auto h-full w-full p-6 lg:w-[56%]">
      <path d="M80 360 280 290 450 355 250 435Z" fill="#777e85" />
      <path d="M145 110 275 65 275 345 145 390Z" fill="#aeb4ba" />
      <path d="M275 65 385 110 385 390 275 345Z" fill="#777e85" />
      <path d="M145 110 275 65 385 110 255 155Z" fill="#c9cdd1" />
      {[0, 1, 2, 3, 4].map((floor) => <g key={floor} transform={`translate(0 ${floor * 43})`}>
        <path d="M162 140 194 129 194 152 162 163Z M217 121 249 110 249 133 217 144Z" fill="#414b55" />
        <path d="M292 112 321 124 321 147 292 135Z M341 132 370 144 370 167 341 155Z" fill="#343d45" />
      </g>)}
      <path d="M213 330 249 318 249 354 213 367Z" fill="#343d45" />
    </svg>
  );
}

export function HouseStage({ experience, visible, onReadyChange }: { experience: "landing" | "login" | "signup"; visible: boolean; onReadyChange: (ready: boolean) => void }) {
  const auth = experience !== "landing";
  const [model, setModel] = useState<"house" | "building">("house");
  const building = !auth && model === "building";
  const modelLabel = building ? "Prédio demonstrativo" : "Casa demonstrativa";
  const reducedMotion = useReducedMotion();
  const compact = useCompact();
  const wide = useWide();
  const [webgl] = useState(supportsWebGL);
  const lite = useLiteMode();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const live = webgl && !lite && !failed;
  const [mount, setMount] = useState(false);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [selected, setSelected] = useState<DemoRoomId | null>(null);
  const [hovered, setHovered] = useState<DemoRoomId | null>(null);
  const [apartment, setApartment] = useState<number | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setApartment(null); };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest("canvas, [data-apartment-card], [data-apartment-picker]")) setApartment(null);
    };
    document.addEventListener("keydown", close, true);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", close, true); document.removeEventListener("pointerdown", outside); };
  }, []);
  const [zoomIndex, setZoomIndex] = useState(1);
  const room = DEMO_ROOMS.find((item) => item.id === selected) ?? null;

  useEffect(() => {
    onReadyChange(live && ready);
  }, [live, ready, onReadyChange]);
  useEffect(() => {
    if (auth) {
      setSelected(null);
      setHovered(null);
    }
  }, [auth]);

  // Start downloading the 3D chunk right after the first paint. Mounting
  // still waits for idle time; this only overlaps the download with it.
  useEffect(() => {
    if (!live) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void import("./HeroHouse3D"));
    });
    return () => cancelAnimationFrame(frame);
  }, [live]);

  // Load the 3D chunk after first paint so it never delays the headline.
  useEffect(() => {
    if (!live) {
      setMount(false);
      setReady(false);
      return;
    }
    // Measured against "after load + 1.2 s": waiting did not improve LCP
    // (the headline is bound by the web font) and delayed the live house by
    // ~0.4 s. The static poster covers the gap instead.
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(() => setMount(true), { timeout: 900 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = globalThis.setTimeout(() => setMount(true), 250);
    return () => globalThis.clearTimeout(handle);
  }, [live, attempt]);

  const switchTo3D = (on: boolean) => {
    writePref(on ? "on" : "off");
    if (on) {
      setFailed(false);
      setAttempt((n) => n + 1);
    }
  };

  // The persistent host follows the visible route slot and pauses off screen.
  useEffect(() => {
    const sync = () => setActive(visible && document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [visible]);

  return (
    <div className="relative flex h-full flex-col">
      <div data-building-stage className="relative min-h-0 flex-1" aria-label={`${modelLabel} em 3D`} role="group">
        {!auth && live && !building ? (
          // Static render of the same scene: the hero looks complete while
          // the 3D chunk loads, then the live canvas fades in on top.
          <picture>
            <source media="(max-width: 767px)" srcSet="/landing/hero-poster-mobile.webp" />
            <img
              src="/landing/hero-poster.webp"
              alt=""
              aria-hidden="true"
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover object-right transition-opacity duration-1000 ${ready ? "opacity-0" : "opacity-100"}`}
            />
          </picture>
        ) : !auth && !building ? (
          <HouseIllustration
            highlight={DEMO_ROOMS.findIndex((item) => item.id === selected)}
            onPick={(index) => setSelected(DEMO_ROOMS[index].id === selected ? null : DEMO_ROOMS[index].id)}
            className="absolute inset-y-0 right-0 m-auto h-full w-full max-w-[760px] object-contain p-6 lg:left-auto lg:w-[56%]"
          />
        ) : null}
        {building && !live && <div className="absolute inset-x-0 bottom-16 top-40 md:bottom-40 md:top-32"><BuildingIllustration /></div>}
        {live && mount && (
          <SceneBoundary key={attempt} onError={() => setFailed(true)}>
          <Suspense fallback={null}>
            <div className={`absolute ${building ? "inset-x-0 bottom-16 top-40 md:bottom-40 md:top-32" : "inset-0"} transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}>
              <HeroHouse3D
                apartment={apartment}
                onApartment={setApartment}
                model={building ? "building" : "house"}
                active={active}
                experience={experience}
                compact={compact}
                reducedMotion={reducedMotion}
                selected={auth || building ? null : selected}
                hovered={auth || building ? null : hovered}
                onHover={auth ? () => {} : setHovered}
                onSelect={auth ? () => {} : setSelected}
                zoom={auth ? experience === "login" ? 1.38 : 1.48 : ZOOM_STEPS[zoomIndex]}
                showMarkers={!auth && !building && !compact}
                shift={auth ? 0 : wide ? 0.25 : 0}
                onReady={() => {
                  performance.mark?.("hero-3d-ready");
                  setReady(true);
                }}
                onLost={() => setFailed(true)}
              />
            </div>
          </Suspense>
          </SceneBoundary>
        )}

        <p className="sr-only" role="status" aria-live="polite">{building && apartment !== null ? `Apartamento ${apartment} selecionado. Dados demonstrativos.` : ""}</p>
        {/* Keeps the headline legible when the house moves under it. */}
        {!auth && <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[50%] bg-gradient-to-r from-[var(--l-bg)] via-[rgb(var(--l-bg-rgb)/0.82)] to-transparent lg:block" aria-hidden="true" />}

        {!auth && <p className="l-in-fade pointer-events-none absolute right-3 top-28 text-xs text-[var(--l-faint)] md:right-6 md:top-4 lg:top-[88px]" style={{ animationDelay: "1.2s" }}>
          {modelLabel} · ilustração do produto
        </p>}

        {!auth && (
          <div className="absolute inset-x-3 top-2 flex flex-wrap items-center justify-end gap-2 md:inset-x-auto md:bottom-20 md:right-6 md:top-auto">
          <ToggleGroup type="single" value={model} aria-label="Modelo da ilustração" onValueChange={(value) => {
            if (value !== "house" && value !== "building") return;
            setModel(value); setSelected(null); setHovered(null); setApartment(null); setZoomIndex(1);
          }} className="rounded-full border border-[var(--l-line-strong)] bg-[var(--l-bg)] p-1">
            {([['house', 'Casa'], ['building', 'Prédio']] as const).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="min-h-11 min-w-20 rounded-lg px-4 text-sm font-semibold text-[var(--l-muted)] hover:bg-[var(--l-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--l-accent)] data-[state=on]:bg-[var(--l-accent)] data-[state=on]:text-[#06120e]">{label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        {building && <div data-apartment-picker className="max-w-full">
          <label className="sr-only" htmlFor="hero-apartment">Escolha um apartamento</label>
          <select id="hero-apartment" value={apartment ?? ""} onChange={e => setApartment(e.target.value ? Number(e.target.value) : null)} className="min-h-11 max-w-full rounded-full border border-[var(--l-line-strong)] bg-[rgb(var(--l-bg-rgb)/0.9)] px-4 text-sm text-[var(--l-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--l-accent)]">
            <option value="">Escolha um apartamento</option>
            {BUILDING_UNITS.map(unit => <option key={unit.id} value={unit.id}>Apartamento {unit.id}</option>)}
          </select>
          {!live && apartment !== null && <div className="mt-2"><ApartmentCard unit={BUILDING_UNITS.find(unit => unit.id === apartment)!} onClose={() => setApartment(null)} /></div>}
        </div>}
          </div>
        )}
        {!auth && ready && (
          <div className="absolute bottom-3 right-3 flex gap-1.5 md:bottom-6 md:right-6" role="toolbar" aria-label="Controles da visualização">
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--l-line-strong)] bg-[rgb(var(--l-bg-rgb)/0.7)] text-[var(--l-muted)] backdrop-blur hover:text-[var(--l-text)] disabled:opacity-40" aria-label="Aproximar" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--l-line-strong)] bg-[rgb(var(--l-bg-rgb)/0.7)] text-[var(--l-muted)] backdrop-blur hover:text-[var(--l-text)] disabled:opacity-40" aria-label="Afastar" disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--l-line-strong)] bg-[rgb(var(--l-bg-rgb)/0.7)] text-[var(--l-muted)] backdrop-blur hover:text-[var(--l-text)]" aria-label="Restaurar visualização" onClick={() => { setZoomIndex(1); setSelected(null); setApartment(null); }}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--l-line-strong)] bg-[rgb(var(--l-bg-rgb)/0.7)] text-[var(--l-muted)] backdrop-blur hover:text-[var(--l-text)]" aria-label="Usar modo leve, sem 3D" title="Modo leve" onClick={() => switchTo3D(false)}>
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Light mode or failure: say why there is no live scene, offer 3D. */}
        {!auth && !live && webgl && (
          <div className="absolute right-3 top-8 flex items-center gap-2 md:right-6 md:top-10 lg:top-[112px]" role="status">
            <span className="hidden text-xs text-[var(--l-faint)] sm:inline">
              {failed ? "Não foi possível carregar o 3D." : "Modo leve"}
            </span>
            <button type="button" onClick={() => switchTo3D(true)} className="flex min-h-[40px] items-center gap-2 rounded-xl border border-[var(--l-line-strong)] bg-[rgb(var(--l-bg-rgb)/0.7)] px-3 text-sm font-semibold text-[var(--l-text)] backdrop-blur hover:border-[rgb(var(--l-accent-rgb)/0.5)]">
              <Box className="h-4 w-4 text-[var(--l-accent)]" aria-hidden="true" />
              {failed ? "Tentar novamente" : "Ver em 3D"}
            </button>
          </div>
        )}

      </div>

      {/* Touch and keyboard friendly room picker; on desktop the markers live in the scene. */}
      {!auth && !building && (compact || !live) && (
        <div className={`l-container mt-3 ${live ? "md:hidden" : "lg:absolute lg:bottom-8 lg:right-0 lg:mt-0 lg:w-[56%] lg:max-w-none"}`}>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:flex-wrap lg:justify-center" role="group" aria-label="Escolha um ambiente">
            {DEMO_ROOMS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === selected}
                onClick={() => setSelected(item.id === selected ? null : item.id)}
                className={`min-h-[44px] shrink-0 rounded-full border px-4 text-[15px] transition-colors ${item.id === selected ? "border-[var(--l-accent)] bg-[rgb(var(--l-accent-rgb)/0.12)] text-[var(--l-text)]" : "border-[var(--l-line-strong)] text-[var(--l-muted)]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

        {!auth && <div aria-live="polite" className={`pointer-events-none mt-3 px-5 md:absolute md:left-6 md:mt-0 md:w-auto md:px-0 lg:left-auto ${live ? "md:bottom-6 lg:right-[170px]" : "md:bottom-24 lg:bottom-28 lg:right-10"}`}>
        {room && (
          <div key={room.id} className="l-in pointer-events-auto rounded-2xl md:max-w-[320px] border border-[rgb(var(--l-accent-rgb)/0.35)] bg-[rgb(var(--l-bg-rgb)/0.86)] p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md" style={{ animationDuration: "0.45s" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--l-accent)]">Ambiente</p>
                <p className="mt-1 text-base font-semibold">{room.label}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-[var(--l-muted)] hover:text-[var(--l-text)]" aria-label="Fechar detalhes do ambiente">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--l-muted)]">{room.description}</p>
            <p className="mt-3 border-t border-[var(--l-line)] pt-2.5 text-[13px] text-[var(--l-faint)]">Demonstração sem dados de consumo. Na sua conta, os valores vêm dos seus cadastros e medições.</p>
          </div>
        )}
      </div>}
    </div>
  );
}

export function HeroSection() {
  return (
    <section aria-labelledby="hero-title" className="l-hero-bg relative overflow-hidden pt-16 md:pt-[72px]">
      <div>
        <div className="l-container relative z-10 grid lg:pointer-events-none lg:min-h-[calc(min(100svh,960px)-72px)] lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:items-center">
          <div className="pb-6 pt-10 md:pt-16 lg:pointer-events-auto lg:py-20 lg:pr-4">
            <p className="l-eyebrow l-in" style={{ animationDelay: "120ms" }}>Seu imóvel. Mais inteligente.</p>
            <h1 id="hero-title" className="mt-5 text-[2.35rem] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[3.2rem] lg:text-[3.3rem] xl:text-[3.8rem] 2xl:text-[4.2rem]">
              {/* Critical text paints at once; only secondary elements animate. */}
              <span className="block">A nova forma de</span>
              <span className="l-accent-text block pb-[0.08em]">enxergar a energia</span>
              <span className="block">do seu imóvel.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-[16.5px] leading-relaxed text-[var(--l-muted)] md:text-lg">
              <span className="hidden sm:inline">O WattStatus reúne monitoramento energético, visualização 3D e inteligência artificial para ajudar você a entender seus aparelhos, acompanhar seus gastos e descobrir oportunidades de economia.</span>
              <span className="sm:hidden">Monitoramento energético, visualização 3D e inteligência artificial para entender seus aparelhos e descobrir oportunidades de economia.</span>
            </p>
            <div className="l-in mt-8 flex flex-col gap-3 sm:flex-row" style={{ animationDelay: "120ms" }}>
              <Link to="/signup" className="l-btn l-btn-primary group">
                Começar agora
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
              <a href="#recursos" className="l-btn l-btn-ghost">Conhecer os recursos</a>
            </div>
            <ul className="l-in mt-10 hidden max-w-[34rem] grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--l-line)] pt-6 sm:grid" style={{ animationDelay: "260ms" }} aria-label="Diferenciais">
              {HERO_HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[15px] text-[var(--l-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-accent)] shadow-[0_0_8px_var(--l-accent)]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden lg:block" aria-hidden="true" />
        </div>
      </div>

      {/* The house bleeds past the container on desktop. */}
      <div data-house-slot="landing" className="relative h-[min(64vh,500px)] sm:h-[540px] lg:absolute lg:bottom-0 lg:right-0 lg:top-0 lg:h-auto lg:w-full" />
      <div className="h-8 lg:hidden" aria-hidden="true" />
    </section>
  );
}
