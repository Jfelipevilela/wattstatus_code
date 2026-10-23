import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PlugZap,
  Search,
  ArrowUpRight,
  Check,
  Clock,
  Loader2,
  ShieldCheck,
  Unplug,
  Sparkles,
  Activity,
  Gauge,
  Power,
  Bell,
  LogIn,
} from "lucide-react";
import { SiLg, SiSmartthings } from "react-icons/si";
import type { IconType } from "react-icons";
import { useApps } from "@/hooks/useApps";
import { useSmartThingsToken } from "@/hooks/useSmartThingsToken";
import { AvailableAppId } from "@/types/apps";
import { cn } from "@/lib/utils";

type ConnectionStatus = "connected" | "disconnected" | "checking" | "soon";
type Filter = "all" | "connected" | "available" | "soon";

interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

interface CatalogEntry {
  id: AvailableAppId;
  vendor: string;
  description: string;
  icon: IconType;
  brand: string;
  url: string;
  soon: boolean;
  features: Feature[];
}

// Conteúdo de vitrine de cada integração; status real vem dos hooks.
const CATALOG: Record<AvailableAppId, Omit<CatalogEntry, "id" | "url">> = {
  smartthings: {
    vendor: "Samsung",
    description:
      "Importe seus dispositivos SmartThings, veja o consumo de cada aparelho e controle-os direto do WattStatus.",
    icon: SiSmartthings,
    brand: "#15BFFF",
    soon: false,
    features: [
      { icon: Gauge, label: "Consumo por aparelho" },
      { icon: Power, label: "Liga/desliga remoto" },
      { icon: Activity, label: "Status em tempo real" },
    ],
  },
  "lg-thinq": {
    vendor: "LG",
    description:
      "Conecte eletrodomésticos LG ThinQ para acompanhar status e uso de energia em tempo real.",
    icon: SiLg,
    brand: "#A50034",
    soon: true,
    features: [
      { icon: Activity, label: "Status em tempo real" },
      { icon: Bell, label: "Alertas de uso" },
    ],
  },
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "connected", label: "Conectadas" },
  { value: "available", label: "Disponíveis" },
  { value: "soon", label: "Em breve" },
];

const STATUS_STYLES: Record<ConnectionStatus, { label: string; className: string; dot: string }> = {
  connected: {
    label: "Conectado",
    className: "bg-energy-green-light/10 text-energy-700 dark:text-energy-green-light ring-energy-green-light/30",
    dot: "bg-energy-green-light",
  },
  disconnected: {
    label: "Não conectado",
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20",
    dot: "bg-slate-400",
  },
  checking: {
    label: "Verificando",
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20",
    dot: "bg-slate-400 animate-pulse",
  },
  soon: {
    label: "Em breve",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30",
    dot: "bg-amber-500",
  },
};

function StatusPill({ status }: { status: ConnectionStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        style.className
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: Feature["icon"] }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/60 px-4 py-3 backdrop-blur">
      <div className="flex size-9 items-center justify-center rounded-lg bg-energy-green-light/10 text-energy-green-light">
        <Icon className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="text-xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

const Apps = () => {
  const navigate = useNavigate();
  const { available, addApp, removeApp, isActive } = useApps();
  const smartthings = useSmartThingsToken();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const entries = useMemo(
    () =>
      available.map((app) => {
        const meta = CATALOG[app.id];
        let status: ConnectionStatus = "disconnected";
        if (meta.soon) status = "soon";
        else if (app.id === "smartthings") {
          status = smartthings.checking ? "checking" : smartthings.hasToken ? "connected" : "disconnected";
        }
        return { ...meta, id: app.id, name: app.name, url: app.url, status, pinned: isActive(app.id) };
      }),
    [available, isActive, smartthings.checking, smartthings.hasToken]
  );

  const counts = {
    connected: entries.filter((e) => e.status === "connected").length,
    pinned: entries.filter((e) => e.pinned).length,
    available: entries.filter((e) => !e.soon).length,
  };

  const visible = entries.filter((e) => {
    const q = query.trim().toLowerCase();
    if (q && !`${e.name} ${e.vendor} ${e.description}`.toLowerCase().includes(q)) return false;
    if (filter === "connected") return e.status === "connected";
    if (filter === "available") return !e.soon && e.status !== "connected";
    if (filter === "soon") return e.soon;
    return true;
  });

  // Conectar já fixa o app no menu, para o usuário achar a integração depois.
  const handleConnect = (id: AvailableAppId, url: string) => {
    if (!isActive(id)) addApp(id);
    if (id === "smartthings" && smartthings.oauthAvailable) {
      void smartthings.startOAuth();
      return;
    }
    navigate(url);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <PlugZap className="h-5 w-5 text-energy-green-light" />
          <span className="font-semibold">Integrações</span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 pb-12 pt-6 md:px-6">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-energy-green-light/15 via-card to-card p-6 md:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-energy-green-light/20 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-energy-green-light/15 px-2.5 py-1 text-xs font-semibold text-energy-700 dark:text-energy-green-light">
                  <Sparkles className="size-3.5" />
                  Casa inteligente
                </span>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  Conecte seus aparelhos ao WattStatus
                </h1>
                <p className="text-sm text-muted-foreground md:text-base">
                  Traga dados reais de consumo das plataformas que você já usa e controle tudo em um só lugar.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 lg:w-[420px]">
                <StatCard label="Conectadas" value={smartthings.checking ? "–" : counts.connected} icon={Check} />
                <StatCard label="No menu" value={counts.pinned} icon={PlugZap} />
                <StatCard label="Disponíveis" value={counts.available} icon={Activity} />
              </div>
            </div>
          </section>

          {/* Filtros */}
          <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" aria-label="Filtrar integrações" className="inline-flex w-fit rounded-xl bg-muted p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                    filter === f.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar integração"
                aria-label="Buscar integração"
                className="pl-9"
              />
            </div>
          </section>

          {/* Catálogo */}
          {visible.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed py-16 text-center">
              <Search className="mb-3 size-8 text-muted-foreground" />
              <p className="font-semibold">Nenhuma integração encontrada</p>
              <p className="mt-1 text-sm text-muted-foreground">Tente outro termo ou filtro.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            </div>
          ) : (
            <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((app) => (
                <article
                  key={app.id}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300",
                    app.soon ? "opacity-80" : "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5",
                    app.status === "connected" && "border-energy-green-light/40"
                  )}
                >
                  {/* Faixa da marca */}
                  <div
                    className="relative h-20"
                    style={{ background: `linear-gradient(135deg, ${app.brand}33, ${app.brand}05)` }}
                  >
                    <div className="absolute right-4 top-4">
                      <StatusPill status={app.status} />
                    </div>
                    <div
                      className="absolute -bottom-6 left-5 flex size-14 items-center justify-center rounded-2xl text-2xl text-white shadow-lg ring-4 ring-card"
                      style={{ backgroundColor: app.brand }}
                    >
                      <app.icon />
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col px-5 pb-5 pt-9">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-lg font-semibold">{app.name}</h2>
                      <span className="text-xs text-muted-foreground">por {app.vendor}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{app.description}</p>

                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {app.features.map((f) => (
                        <li
                          key={f.label}
                          className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
                        >
                          <f.icon className="size-3.5" />
                          {f.label}
                        </li>
                      ))}
                    </ul>

                    {app.id === "smartthings" && app.status === "connected" && smartthings.method && (
                      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="size-3.5 text-energy-green-light" />
                        {smartthings.method === "oauth" ? "Conectado com conta Samsung" : "Conectado com token pessoal"}
                      </p>
                    )}

                    <div className="mt-auto pt-5">
                      {app.soon ? (
                        <Button variant="secondary" className="w-full gap-2" disabled>
                          <Clock className="size-4" />
                          Disponível em breve
                        </Button>
                      ) : app.status === "checking" ? (
                        <Skeleton className="h-10 w-full rounded-md" />
                      ) : app.status === "connected" ? (
                        <div className="flex gap-2">
                          <Button asChild className="flex-1 gap-2">
                            <Link to={app.url}>
                              Abrir
                              <ArrowUpRight className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Desconectar ${app.name}`}
                            title="Desconectar"
                            disabled={smartthings.revoking}
                            onClick={() => setConfirmDisconnect(true)}
                            className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                          >
                            {smartthings.revoking ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full gap-2 bg-energy-green-light text-energy-blue-dark hover:bg-energy-green-light/90"
                          disabled={smartthings.redirecting}
                          onClick={() => handleConnect(app.id, app.url)}
                        >
                          {smartthings.redirecting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <LogIn className="size-4" />
                          )}
                          {smartthings.oauthAvailable ? `Entrar com ${app.vendor}` : "Conectar"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {!app.soon && (
                    <label className="flex cursor-pointer items-center justify-between border-t bg-muted/40 px-5 py-3 text-sm">
                      <span className="text-muted-foreground">Mostrar no menu lateral</span>
                      <Switch
                        checked={app.pinned}
                        onCheckedChange={(on) => (on ? addApp(app.id) : removeApp(app.id))}
                        aria-label={`Mostrar ${app.name} no menu lateral`}
                      />
                    </label>
                  )}
                </article>
              ))}
            </section>
          )}

          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-4" />
            Suas credenciais ficam criptografadas no servidor e podem ser revogadas a qualquer momento.
          </p>
        </main>
      </SidebarInset>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar SmartThings?</AlertDialogTitle>
            <AlertDialogDescription>
              O WattStatus deixa de ler e controlar seus dispositivos SmartThings. Você pode conectar de novo quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => void smartthings.revokeToken()}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default Apps;
