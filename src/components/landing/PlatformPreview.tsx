import { useEffect, useRef, useState } from "react";
import { Bot, Box, Building, FileBarChart, LayoutDashboard, Lightbulb, Plug } from "lucide-react";
import icon from "@/components/logo_wattstatus_icon.png";
import { Chapter } from "./Chapter";
import { DATA_STATES, stateStyle, type DataState } from "./dataStates";
import { HouseIllustration } from "./HouseIllustration";
import { prefersReducedMotion, useReveal } from "./motion";

// A drawn representation of the real app: same navigation, same panels, same
// data-quality vocabulary. It carries no figures; value slots are bars.

const NAV = [
  { label: "Visão geral", Icon: LayoutDashboard },
  { label: "Meus imóveis", Icon: Building },
  { label: "Relatórios", Icon: FileBarChart },
  { label: "Aparelhos", Icon: Plug },
  { label: "Dicas", Icon: Lightbulb },
];

const VIEWS = [
  { id: "overview", label: "Visão geral", caption: "Consumo, custo e aparelhos de cada imóvel em um só lugar." },
  { id: "3d", label: "Living Energy 3D", caption: "A planta da sua casa em três dimensões, com aparelhos por ambiente." },
  { id: "devices", label: "Ambientes e aparelhos", caption: "Cada aparelho indica se o consumo é medido, estimado, parcial ou sem dados." },
  { id: "ai", label: "WattStatus AI", caption: "Perguntas em linguagem natural, respondidas com base nos seus dados." },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

const Bar = ({ w, className = "" }: { w: string; className?: string }) => <span className={`block h-2 rounded-full bg-[rgb(var(--l-line-rgb)/0.16)] ${className}`} style={{ width: w }} />;
const Panel = ({ title, className = "", children }: { title: string; className?: string; children?: React.ReactNode }) => (
  <div className={`rounded-xl border border-[var(--l-line)] bg-[rgb(var(--l-elevated-rgb)/0.35)] p-3 ${className}`}>
    <p className="text-[var(--l-faint)]">{title}</p>
    {children}
  </div>
);

function Overview() {
  const curve = "M0 70 C 30 60, 50 30, 80 38 S 130 72, 160 50 S 210 18, 240 30 S 290 64, 320 44";
  return (
    <div className="grid h-full grid-cols-3 grid-rows-[auto_1fr] gap-2.5">
      {["Consumo do mês", "Custo estimado", "Aparelhos"].map((title) => (
        <Panel key={title} title={title}><Bar w="60%" className="mt-2.5 h-3 bg-[rgb(var(--l-line-rgb)/0.22)]" /></Panel>
      ))}
      <Panel title="Histórico de consumo" className="col-span-2 flex flex-col">
        <svg viewBox="0 0 320 90" className="mt-2 w-full flex-1" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pp-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#45e0a4" stopOpacity="0.32" />
              <stop offset="1" stopColor="#45e0a4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${curve} L 320 90 L 0 90 Z`} fill="url(#pp-area)" />
          <path d={curve} fill="none" stroke="#45e0a4" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </Panel>
      <Panel title="Dicas" className="space-y-2">
        <Bar w="90%" className="mt-2" />
        <Bar w="70%" />
        <Bar w="80%" />
      </Panel>
    </div>
  );
}

function ThreeD() {
  const rooms = ["Sala de estar", "Cozinha", "Quarto", "Banheiro", "Escritório"];
  return (
    <div className="grid h-full grid-cols-[1fr_150px] gap-2.5">
      <Panel title="Living Energy 3D" className="flex flex-col">
        <HouseIllustration tight className="min-h-0 w-full flex-1" />
      </Panel>
      <Panel title="Ambientes" className="space-y-1.5">
        {rooms.map((room, index) => (
          <p key={room} className={`mt-1 rounded-md px-2 py-1 ${index === 1 ? "bg-[var(--l-accent-subtle)] text-[var(--l-text)]" : "text-[var(--l-muted)]"}`}>{room}</p>
        ))}
      </Panel>
    </div>
  );
}

function Devices() {
  const rows: Array<[string, string, DataState]> = [
    ["Geladeira", "Cozinha", "measured"],
    ["Ar-condicionado", "Quarto", "measured"],
    ["Chuveiro elétrico", "Banheiro", "estimated"],
    ["Televisão", "Sala de estar", "estimated"],
    ["Computador", "Escritório", "nodata"],
  ];
  const label = (state: DataState) => DATA_STATES.find((item) => item.key === state)!.label;
  return (
    <Panel title="Aparelhos" className="h-full">
      <ul className="mt-2 divide-y divide-[var(--l-line)]">
        {rows.map(([name, room, state]) => (
          <li key={name} className="flex items-center gap-3 py-2">
            <Plug className="h-3.5 w-3.5 text-[var(--l-amber)]" />
            <span className="flex-1 text-[var(--l-text)]">{name}<span className="ml-2 text-[var(--l-faint)]">{room}</span></span>
            <Bar w="18%" />
            <span className="flex w-[84px] items-center gap-1.5 text-[var(--l-muted)]"><span className="h-2.5 w-2.5 rounded-sm" style={stateStyle(state)} />{label(state)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Chat() {
  return (
    <Panel title="WattStatus AI" className="flex h-full flex-col">
      <div className="mt-3 space-y-2">
        <div className="ml-auto w-fit max-w-[70%] rounded-xl rounded-br-sm bg-[rgb(var(--l-accent-rgb)/0.14)] px-3 py-1.5 text-[var(--l-text)]">Como posso economizar?</div>
        <div className="max-w-[75%] space-y-1.5 rounded-xl rounded-bl-sm border border-[var(--l-line)] px-3 py-2.5">
          <Bar w="92%" />
          <Bar w="78%" />
          <Bar w="64%" />
        </div>
        <div className="max-w-[60%] rounded-xl border border-[var(--l-line)] p-2.5">
          <p className="text-[var(--l-faint)]">Plano de economia</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-[rgb(var(--l-line-rgb)/0.14)]"><div className="h-1.5 w-1/2 rounded-full bg-[var(--l-accent)]" /></div>
        </div>
      </div>
      <div className="mt-auto rounded-full border border-[var(--l-line-strong)] px-3 py-1.5 text-[var(--l-faint)]">Pergunte sobre sua energia…</div>
    </Panel>
  );
}

const SCREENS: Record<ViewId, () => JSX.Element> = { overview: Overview, "3d": ThreeD, devices: Devices, ai: Chat };

export function PlatformPreview() {
  const head = useReveal<HTMLDivElement>();
  const stage = useReveal<HTMLDivElement>(0.2);
  const [view, setView] = useState<ViewId>("overview");
  const touched = useRef(false);

  // Cycle through the views while in sight, until the visitor picks one.
  useEffect(() => {
    if (!stage.shown || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      if (touched.current) return;
      setView((current) => VIEWS[(VIEWS.findIndex((item) => item.id === current) + 1) % VIEWS.length].id);
    }, 4200);
    return () => window.clearInterval(id);
  }, [stage.shown]);

  const Screen = SCREENS[view];
  const active = VIEWS.find((item) => item.id === view)!;
  return (
    <section id="visualizacao-3d" aria-labelledby="experiencia-title" className="relative scroll-mt-20 overflow-hidden bg-[var(--l-bg-2)] py-24 md:py-36">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--l-line-strong)] to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-[38%] h-[620px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(var(--l-forest-rgb)/0.55),transparent)]" aria-hidden="true" />
      <div className="l-container relative">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal mx-auto max-w-3xl text-center">
          <div className="flex justify-center"><Chapter index={3} label="Compreensão" /></div>
          <h2 id="experiencia-title" className="mt-6 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.035em] md:text-[3.4rem]">Tecnologia que transforma dados em decisões.</h2>
        </div>

        <div role="tablist" aria-label="Telas da plataforma" className="mx-auto mt-10 flex max-w-full gap-1.5 overflow-x-auto rounded-2xl border border-[var(--l-line)] bg-[rgb(var(--l-surface-rgb)/0.6)] p-1.5 [scrollbar-width:none] md:w-fit">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={item.id === view}
              aria-controls="platform-screen"
              onClick={() => {
                touched.current = true;
                setView(item.id);
              }}
              className={`min-h-[40px] shrink-0 rounded-xl px-4 text-sm font-medium transition-colors ${item.id === view ? "bg-[var(--l-accent)] text-[#052117]" : "text-[var(--l-muted)] hover:text-[var(--l-text)]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div ref={stage.ref} data-shown={stage.shown} className="l-reveal relative mx-auto mt-8 max-w-5xl">
          <figure>
            <div className="rounded-[20px] border border-[var(--l-line-strong)] bg-[var(--l-surface)] p-2 shadow-[0_50px_120px_-40px_rgb(0_0_0/0.9),0_0_80px_-30px_rgb(var(--l-accent-rgb)/0.25)]">
              <div className="mb-2 flex items-center gap-1.5 px-2 pt-1" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-[rgb(var(--l-line-rgb)/0.25)]" />
                <span className="h-2 w-2 rounded-full bg-[rgb(var(--l-line-rgb)/0.25)]" />
                <span className="h-2 w-2 rounded-full bg-[rgb(var(--l-line-rgb)/0.25)]" />
              </div>
              <div id="platform-screen" role="tabpanel" aria-labelledby={`tab-${view}`} className="flex aspect-[16/10] overflow-hidden rounded-xl border border-[var(--l-line)] bg-[var(--l-bg)] text-[10px] sm:aspect-[16/9] sm:text-[11px]">
                <aside className="hidden w-[150px] shrink-0 border-r border-[var(--l-line)] bg-[rgb(var(--l-surface-rgb)/0.6)] p-3 sm:block" aria-hidden="true">
                  <div className="mb-4 flex items-center gap-2">
                    <img src={icon} alt="" className="h-4 w-4" />
                    <span className="font-semibold tracking-[0.12em]">WATTSTATUS</span>
                  </div>
                  <ul className="space-y-1">
                    {NAV.map(({ label, Icon }) => (
                      <li key={label} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${(view === "overview" && label === "Visão geral") || (view !== "overview" && view !== "ai" && label === "Meus imóveis") ? "bg-[var(--l-accent-subtle)] text-[var(--l-text)]" : "text-[var(--l-faint)]"}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </li>
                    ))}
                    <li className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${view === "ai" ? "bg-[var(--l-accent-subtle)] text-[var(--l-text)]" : "text-[var(--l-faint)]"}`}>
                      <Bot className="h-3.5 w-3.5" />
                      WattStatus AI
                    </li>
                  </ul>
                </aside>
                <div key={view} className="l-in-fade min-w-0 flex-1 p-3" style={{ animationDuration: "0.5s" }}>
                  <Screen />
                </div>
              </div>
            </div>
            <figcaption className="mt-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <span className="flex items-center gap-2 text-[15px] text-[var(--l-text)]"><Box className="h-4 w-4 text-[var(--l-accent)]" aria-hidden="true" />{active.caption}</span>
              <span className="text-xs text-[var(--l-faint)] md:max-w-[38%] md:text-right">Representação ilustrativa das telas do WattStatus, sem dados reais.</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
