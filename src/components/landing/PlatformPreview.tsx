import { useEffect, useRef, useState } from "react";
import { Bot, Box, LayoutDashboard, Maximize2, Plug, X } from "lucide-react";
import { Chapter } from "./Chapter";
import { prefersReducedMotion, useReveal } from "./motion";

// Real screenshots of the app, taken from a disposable local account seeded
// with synthetic data (no production data, no admin account). Every value in
// them is a demonstration value, and the caption says so.
const VIEWS = [
  {
    id: "dashboard",
    label: "Visão geral",
    Icon: LayoutDashboard,
    src: "/landing/app-dashboard.webp",
    alt: "Tela Visão geral do WattStatus com consumo estimado, consumo medido pelos dispositivos, maior consumidor e análises do mês.",
    title: "Sua energia em resumo",
    points: ["Estimado e medido lado a lado, com a origem de cada número", "Maior consumidor do período", "Leituras que explicam o mês, como lacunas no histórico"],
  },
  {
    id: "property",
    label: "Living Energy 3D",
    Icon: Box,
    src: "/landing/app-property.webp",
    alt: "Planta 3D de um imóvel no WattStatus, com ambientes, aparelhos posicionados e consumo por ambiente.",
    title: "A planta do imóvel em 3D",
    points: ["Ambientes e aparelhos posicionados na planta", "Alternância entre energia estimada e medida", "Ranking dos ambientes por consumo"],
  },
  {
    id: "appliances",
    label: "Aparelhos",
    Icon: Plug,
    src: "/landing/app-appliances.webp",
    alt: "Tela de aparelhos do WattStatus com distribuição do custo estimado e cartões de cada aparelho.",
    title: "Quem pesa na conta",
    points: ["Distribuição do custo entre aparelhos", "Potência, horas de uso e dias por aparelho", "Aparelhos manuais e conectados no mesmo lugar"],
  },
  {
    id: "ai",
    label: "WattStatus AI",
    Icon: Bot,
    src: "/landing/app-ai.webp",
    alt: "Painel do WattStatus AI aberto sobre a Visão geral, com sugestões de perguntas sobre o consumo.",
    title: "Pergunte sobre o seu consumo",
    points: ["Atalhos para analisar a casa, comparar ambientes e prever a conta", "Respostas sobre o imóvel selecionado", "A IA não altera aparelhos"],
  },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

export function PlatformPreview() {
  const head = useReveal<HTMLDivElement>();
  const stage = useReveal<HTMLDivElement>(0.2);
  const [view, setView] = useState<ViewId>("dashboard");
  const [auto, setAuto] = useState(true);
  const hovering = useRef(false);
  const viewer = useRef<HTMLDialogElement>(null);
  const openViewer = () => {
    setAuto(false);
    viewer.current?.showModal();
  };

  // Cycle while in sight; stop for good after any manual choice, pause on
  // hover, never under reduced motion.
  useEffect(() => {
    if (!stage.shown || !auto || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      if (hovering.current) return;
      setView((current) => VIEWS[(VIEWS.findIndex((item) => item.id === current) + 1) % VIEWS.length].id);
    }, 6000);
    return () => window.clearInterval(id);
  }, [stage.shown, auto]);

  const active = VIEWS.find((item) => item.id === view)!;
  return (
    <section id="visualizacao-3d" aria-labelledby="experiencia-title" className="l-band relative scroll-mt-20 overflow-hidden py-20 md:py-28">
      <div className="l-container-wide relative">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal mx-auto max-w-3xl text-center">
          <div className="flex justify-center"><Chapter index={3} label="Compreensão" /></div>
          <h2 id="experiencia-title" className="l-h2 mt-6">Tecnologia que transforma dados em decisões.</h2>
          <p className="l-lead mx-auto mt-5 max-w-2xl">Telas reais do WattStatus. Explore as áreas principais da plataforma.</p>
        </div>

        <div role="tablist" aria-label="Telas da plataforma" className="mx-auto mt-8 flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-[var(--l-line)] bg-[rgb(var(--l-bg-rgb)/0.55)] p-1.5 [scrollbar-width:none] md:w-fit">
          {VIEWS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={id === view}
              aria-controls="platform-screen"
              onClick={() => {
                setAuto(false);
                setView(id);
              }}
              className={`flex min-h-[46px] shrink-0 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition-colors ${id === view ? "bg-[var(--l-accent)] text-[#052117]" : "text-[var(--l-muted)] hover:bg-[rgb(var(--l-line-rgb)/0.06)] hover:text-[var(--l-text)]"}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div
          ref={stage.ref}
          data-shown={stage.shown}
          className="l-reveal mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]"
          onMouseEnter={() => (hovering.current = true)}
          onMouseLeave={() => (hovering.current = false)}
        >
          <figure className="min-w-0">
            <div className="rounded-[22px] border border-[var(--l-line-strong)] bg-[var(--l-surface)] p-2 shadow-[0_60px_140px_-50px_rgb(0_0_0/0.95),0_0_100px_-40px_rgb(var(--l-accent-rgb)/0.3)] md:p-2.5">
              <div className="mb-2 flex items-center gap-1.5 px-2 pt-1" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--l-line-rgb)/0.25)]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--l-line-rgb)/0.25)]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--l-line-rgb)/0.25)]" />
              </div>
              <div id="platform-screen" role="tabpanel" aria-labelledby={`tab-${view}`} className="relative aspect-[16/10] overflow-hidden rounded-xl border border-[var(--l-line)] bg-[#0b0d10]">
                {VIEWS.map((item) => (
                  <img
                    key={item.id}
                    src={item.src}
                    alt={item.id === view ? item.alt : ""}
                    aria-hidden={item.id !== view}
                    width={1600}
                    height={1000}
                    loading="lazy"
                    decoding="async"
                    className={`absolute inset-0 h-full w-full object-cover object-left-top transition-opacity duration-700 ${item.id === view ? "opacity-100" : "opacity-0"}`}
                  />
                ))}
                <button
                  type="button"
                  onClick={openViewer}
                  className="absolute bottom-3 right-3 flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--l-line-strong)] bg-[rgb(var(--l-bg-rgb)/0.85)] px-3.5 text-sm font-semibold text-[var(--l-text)] backdrop-blur hover:border-[rgb(var(--l-accent-rgb)/0.5)]"
                >
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  Ampliar tela<span className="sr-only">: {active.label}</span>
                </button>
              </div>
            </div>
            {/* Full-size viewer. Native dialog: focus trap, Esc to close, and
                the image can be scrolled and pinch-zoomed on phones. */}
            <dialog
              ref={viewer}
              aria-label={`Captura ampliada: ${active.label}`}
              className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-[var(--l-bg)] p-0 text-[var(--l-text)] backdrop:bg-black/80"
              onClick={(event) => {
                if (event.target === event.currentTarget) viewer.current?.close();
              }}
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--l-line)] px-4 py-3">
                  <p className="text-sm font-semibold">{active.label} · <span className="font-normal text-[var(--l-faint)]">dados sintéticos de demonstração</span></p>
                  <button type="button" autoFocus onClick={() => viewer.current?.close()} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--l-line-strong)]" aria-label="Fechar captura ampliada">
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-3 md:grid md:place-items-center">
                  <img src={active.src} alt={active.alt} width={1600} height={1000} className="h-auto w-[1600px] max-w-none rounded-lg md:w-auto md:max-w-full" />
                </div>
              </div>
            </dialog>
            <figcaption className="mt-4 text-sm text-[var(--l-faint)]">Capturas reais da plataforma, feitas com uma conta de demonstração e dados sintéticos. Os valores exibidos são exemplos.</figcaption>
          </figure>

          <div key={view} className="l-in-fade lg:pt-14" aria-live={auto ? "off" : "polite"}>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--l-accent)]">{active.label}</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em] md:text-[1.75rem]">{active.title}</h3>
            <ul className="mt-6 space-y-4">
              {active.points.map((point) => (
                <li key={point} className="flex gap-3 text-base leading-relaxed text-[var(--l-muted)]">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--l-accent)]" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            {auto && (
              <p className="mt-8 hidden text-xs text-[var(--l-faint)] lg:block">As telas alternam sozinhas até você escolher uma.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
