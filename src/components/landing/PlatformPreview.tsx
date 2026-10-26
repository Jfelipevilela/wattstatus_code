import { Bot, Building, FileBarChart, LayoutDashboard, Lightbulb, Plug } from "lucide-react";
import icon from "@/components/logo_wattstatus_icon.png";
import { HouseIllustration } from "./HouseIllustration";
import { useReveal } from "./motion";

// A drawn representation of the real app layout (same navigation, same
// panels). It carries no figures: every value slot is a neutral bar.
const NAV = [
  { label: "Visão geral", Icon: LayoutDashboard },
  { label: "Meus imóveis", Icon: Building },
  { label: "Relatórios", Icon: FileBarChart },
  { label: "Aparelhos", Icon: Plug },
  { label: "Dicas", Icon: Lightbulb },
];

const Bar = ({ w, className = "" }: { w: string; className?: string }) => <span className={`block h-2 rounded-full bg-[rgba(148,178,214,0.16)] ${className}`} style={{ width: w }} />;

function DesktopScreen() {
  const curve = "M0 70 C 30 60, 50 30, 80 38 S 130 72, 160 50 S 210 18, 240 30 S 290 64, 320 44";
  return (
    <div className="flex h-full text-[11px]">
      <aside className="hidden w-[150px] shrink-0 border-r border-[var(--l-line)] bg-[rgba(5,10,20,0.6)] p-3 sm:block">
        <div className="mb-4 flex items-center gap-2">
          <img src={icon} alt="" className="h-4 w-4" />
          <span className="font-semibold tracking-[0.12em] text-[var(--l-text)]">WATTSTATUS</span>
        </div>
        <ul className="space-y-1">
          {NAV.map(({ label, Icon }, index) => (
            <li key={label} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${index === 0 ? "bg-[rgba(56,214,245,0.1)] text-[var(--l-text)]" : "text-[var(--l-faint)]"}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </aside>
      <div className="grid flex-1 grid-cols-3 grid-rows-[auto_1fr] gap-2.5 p-3">
        {["Consumo do mês", "Custo estimado", "Aparelhos"].map((title) => (
          <div key={title} className="rounded-xl border border-[var(--l-line)] bg-[rgba(255,255,255,0.02)] p-2.5">
            <p className="text-[var(--l-faint)]">{title}</p>
            <Bar w="60%" className="mt-2 h-3 bg-[rgba(148,178,214,0.22)]" />
          </div>
        ))}
        <div className="col-span-2 rounded-xl border border-[var(--l-line)] bg-[rgba(255,255,255,0.02)] p-2.5">
          <p className="text-[var(--l-faint)]">Histórico de consumo</p>
          <svg viewBox="0 0 320 90" className="mt-2 h-[calc(100%-20px)] w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="pp-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#38d6f5" stopOpacity="0.35" />
                <stop offset="1" stopColor="#38d6f5" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${curve} L 320 90 L 0 90 Z`} fill="url(#pp-area)" />
            <path d={curve} fill="none" stroke="#38d6f5" strokeWidth="1.6" />
          </svg>
        </div>
        <div className="rounded-xl border border-[var(--l-line)] bg-[rgba(255,255,255,0.02)] p-2.5">
          <p className="text-[var(--l-faint)]">Living Energy 3D</p>
          <HouseIllustration className="mt-1 h-[calc(100%-20px)] w-full" />
        </div>
      </div>
    </div>
  );
}

function PhoneScreen() {
  return (
    <div className="flex h-full flex-col p-3 text-[11px]">
      <div className="flex items-center gap-2 border-b border-[var(--l-line)] pb-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[rgba(56,214,245,0.15)] text-[var(--l-cyan)]">
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="font-semibold">WattStatus AI</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-[rgba(56,214,245,0.14)] px-2.5 py-1.5">Como posso economizar?</div>
        <div className="max-w-[90%] space-y-1.5 rounded-xl rounded-bl-sm border border-[var(--l-line)] px-2.5 py-2">
          <Bar w="92%" />
          <Bar w="78%" />
          <Bar w="64%" />
        </div>
        <div className="max-w-[90%] rounded-xl border border-[var(--l-line)] p-2">
          <p className="text-[var(--l-faint)]">Plano de economia</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-[rgba(148,178,214,0.14)]"><div className="h-1.5 w-1/2 rounded-full bg-[var(--l-green)]" /></div>
        </div>
      </div>
      <div className="mt-auto rounded-full border border-[var(--l-line-strong)] px-3 py-1.5 text-[var(--l-faint)]">Pergunte sobre sua energia…</div>
    </div>
  );
}

export function PlatformPreview() {
  const head = useReveal<HTMLDivElement>();
  const stage = useReveal<HTMLDivElement>(0.15);
  const points = [
    { title: "Painel de visão geral", text: "Consumo, custo e aparelhos de cada imóvel em um só lugar." },
    { title: "Living Energy 3D", text: "A planta da sua casa em três dimensões, com aparelhos por ambiente." },
    { title: "WattStatus AI", text: "Perguntas em linguagem natural, respondidas com base nos seus dados." },
  ];
  return (
    <section id="visualizacao-3d" aria-labelledby="experiencia-title" className="relative scroll-mt-20 overflow-hidden border-y border-[var(--l-line)] bg-[var(--l-bg-2)] py-24 md:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(50%_60%_at_50%_0%,rgba(37,99,235,0.18),transparent)]" aria-hidden="true" />
      <div className="l-container relative">
        <div ref={head.ref} data-shown={head.shown} className="l-reveal mx-auto max-w-2xl text-center">
          <p className="l-eyebrow">Conheça a experiência</p>
          <h2 id="experiencia-title" className="mt-4 text-3xl font-semibold tracking-[-0.03em] md:text-5xl">Tecnologia que transforma dados em decisões.</h2>
        </div>

        <div ref={stage.ref} data-shown={stage.shown} className="l-reveal relative mx-auto mt-16 max-w-5xl pb-10 md:pb-0">
          <figure className="relative">
            <div className="rounded-[18px] border border-[var(--l-line-strong)] bg-[#0a1422] p-2 shadow-[0_40px_120px_-40px_rgba(37,99,235,0.55)]">
              <div className="mb-2 flex items-center gap-1.5 px-2 pt-1" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-[#2a3546]" />
                <span className="h-2 w-2 rounded-full bg-[#2a3546]" />
                <span className="h-2 w-2 rounded-full bg-[#2a3546]" />
              </div>
              <div className="aspect-[16/9] overflow-hidden rounded-xl border border-[var(--l-line)] bg-[var(--l-surface)]" aria-hidden="true">
                <DesktopScreen />
              </div>
            </div>
            <div className="absolute -bottom-10 right-3 hidden w-[30%] sm:block min-w-[150px] max-w-[230px] rounded-[28px] border border-[var(--l-line-strong)] bg-[#0a1422] p-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] md:-bottom-14 md:-right-8" aria-hidden="true">
              <div className="aspect-[9/17] overflow-hidden rounded-[22px] border border-[var(--l-line)] bg-[var(--l-surface)]">
                <PhoneScreen />
              </div>
            </div>
            <figcaption className="mt-4 text-xs text-[var(--l-faint)] md:max-w-[60%]">Representação ilustrativa das telas do WattStatus, sem dados reais. As informações variam conforme seus cadastros e medições.</figcaption>
          </figure>
        </div>

        <ul className="mx-auto mt-16 grid max-w-5xl gap-8 md:mt-24 md:grid-cols-3">
          {points.map((point, index) => (
            <li key={point.title} className="border-l border-[rgba(56,214,245,0.35)] pl-5">
              <p className="text-[11px] font-semibold tabular-nums tracking-[0.14em] text-[var(--l-cyan)]">0{index + 1}</p>
              <h3 className="mt-2 text-base font-semibold">{point.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--l-muted)]">{point.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
