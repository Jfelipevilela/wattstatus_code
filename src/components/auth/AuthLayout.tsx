import React from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, Gauge, PlugZap } from "lucide-react";
import Logo from "@/components/logo_wattstatus_icon.png";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

const HIGHLIGHTS = [
  { icon: Gauge, title: "Consumo detalhado", text: "Veja quanto cada aparelho gasta, em kWh e em reais." },
  { icon: PlugZap, title: "Casa conectada", text: "Integre o SmartThings e controle seus dispositivos." },
  { icon: Activity, title: "Alertas de anomalia", text: "Saiba quando algo foge do padrão de consumo." },
];

// Barras ilustrativas do cartão de prévia (não são dados reais).
const PREVIEW_BARS = [38, 52, 44, 70, 58, 82, 64, 48, 76, 90, 66, 54];

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-energy-blue-dark text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-energy-green-light/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 size-96 rounded-full bg-energy-blue-light/15 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <Link to="/" className="relative flex w-fit items-center gap-3">
        <img src={Logo} alt="" className="size-10 object-contain drop-shadow-[0_0_12px_rgba(0,200,83,0.45)]" />
        <span className="text-xl font-bold tracking-tight">WattStatus</span>
      </Link>

      <div className="relative space-y-10">
        <div className="space-y-4">
          <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Entenda sua energia.{" "}
            <span className="bg-gradient-to-r from-energy-green-light to-emerald-300 bg-clip-text text-transparent">
              Gaste menos.
            </span>
          </h2>
          <p className="max-w-md text-white/60">
            Monitore o consumo da sua casa, compare períodos e receba dicas para economizar na conta de luz.
          </p>
        </div>

        {/* Cartão de prévia do dashboard */}
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-white/40">Consumo do mês</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                212 <span className="text-sm font-medium text-white/50">kWh</span>
              </p>
            </div>
            <span className="rounded-full bg-energy-green-light/15 px-2.5 py-1 text-xs font-semibold text-energy-green-light">
              −12% vs. mês anterior
            </span>
          </div>
          <div className="mt-5 flex h-20 items-end gap-1.5" aria-hidden>
            {PREVIEW_BARS.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-gradient-to-t from-energy-green-light/30 to-energy-green-light"
                style={{ height: `${h}%`, opacity: i === PREVIEW_BARS.length - 3 ? 1 : 0.55 }}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] text-white/35">Exemplo ilustrativo</p>
        </div>

        <ul className="grid max-w-md gap-4">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title} className="flex gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-energy-green-light">
                <h.icon className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{h.title}</p>
                <p className="text-sm text-white/50">{h.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/30">© {new Date().getFullYear()} WattStatus</p>
    </aside>
  );
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <main className="relative flex flex-col px-4 py-8 sm:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-energy-green-light/[0.07] to-transparent lg:hidden" />

        <div className="relative flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar ao início
          </Link>
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <img src={Logo} alt="" className="size-8 object-contain" />
            <span className="font-bold tracking-tight">WattStatus</span>
          </Link>
        </div>

        <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-8 space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
        </div>
      </main>
    </div>
  );
}
