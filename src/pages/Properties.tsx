import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building, DoorOpen, MapPin, Plug, Plus, Radio, Star, Building2 } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogIcon } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { DataState } from "@/components/DataState";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { PROPERTY_ICONS } from "@/components/properties/propertyVisual";
import { useProperties } from "@/hooks/useProperties";
import { useAppliances, type Appliance } from "@/hooks/useAppliances";
import { useEnergyHistory, type EnergyInterval } from "@/hooks/useEnergyHistory";
import { aggregatePropertyEnergy, daysInMonth } from "@/lib/property-energy";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { notifyError } from "@/lib/error-toast";
import { PROPERTY_TYPES, type Property } from "@/types/property";

function PropertyCard({
  property,
  primaryId,
  appliances,
  intervals,
  measuredLoading,
}: {
  property: Property;
  primaryId: string | null;
  appliances: Appliance[];
  intervals: EnergyInterval[];
  measuredLoading: boolean;
}) {
  const now = new Date();
  const energy = aggregatePropertyEnergy(property.id, primaryId, appliances, [], intervals, daysInMonth(now.getFullYear(), now.getMonth() + 1));
  const Icon = PROPERTY_ICONS[property.type];
  const accent = property.color || "#00C853";
  return (
    <Link
      to={`/imoveis/${property.id}`}
      className="group relative flex flex-col overflow-hidden rounded-[28px] border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative h-28 overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}0d)` }}>
        <svg aria-hidden="true" viewBox="0 0 200 100" className="absolute -bottom-2 right-4 h-28 opacity-80">
          <path d="M40 70 L100 40 L160 70 L100 100 Z" fill={accent} fillOpacity="0.25" />
          <path d="M40 70 L40 50 L100 20 L100 40 Z" fill={accent} fillOpacity="0.35" />
          <path d="M100 40 L100 20 L160 50 L160 70 Z" fill={accent} fillOpacity="0.5" />
          <path d="M70 55 L100 40 L130 55 L100 70 Z" fill="white" fillOpacity="0.5" />
        </svg>
        <span className="absolute left-5 top-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-foreground shadow-sm">
          <Icon className="h-5 w-5" style={{ color: accent }} aria-hidden="true" />
        </span>
        {property.isPrimary && (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-semibold shadow-sm">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" /> Principal
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="truncate text-lg font-semibold">{property.name}</h2>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          {[property.city, property.state].filter(Boolean).join(" · ") || "Local não informado"} · {PROPERTY_TYPES[property.type]}
        </p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(energy.total.estimatedCost)}</p>
            <p className="text-xs text-muted-foreground">{formatNumber(energy.total.estimatedKWh, 0)} kWh estimados/mês</p>
          </div>
          <div className="text-right text-xs">
            <p className="flex items-center justify-end gap-1 font-medium">
              <Radio className="h-3 w-3 text-energy-blue-light" aria-hidden="true" /> Medido
            </p>
            <p className="tabular-nums text-muted-foreground">
              {measuredLoading ? "…" : energy.total.measuredIntervals > 0 ? `${formatNumber(energy.total.measuredKWh, 1)} kWh` : "sem medição"}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
            <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <dt className="sr-only">Ambientes</dt>
            <dd>{property.roomCount ?? 0} ambientes</dd>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
            <Plug className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <dt className="sr-only">Aparelhos</dt>
            <dd>{energy.total.applianceCount} aparelhos</dd>
          </div>
        </dl>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-energy-400">
          Abrir imóvel <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export default function Properties() {
  const { properties, primary, loading, error, refetch, create } = useProperties();
  const { appliances } = useAppliances();
  const now = useMemo(() => new Date(), []);
  const start = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now]);
  const end = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 1), [now]);
  const measured = useEnergyHistory(start, end);
  const [creating, setCreating] = useState(false);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Building className="h-5 w-5 text-energy-green-light" aria-hidden="true" />
          <span className="font-semibold">Meus imóveis</span>
        </header>
        <main className="container mx-auto min-w-0 max-w-7xl space-y-8 px-4 py-6 sm:py-8">
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Living Energy</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Meus imóveis</h1>
              <p className="mt-2 max-w-xl text-muted-foreground">
                Cada imóvel com seus ambientes, aparelhos e consumo. Abra um para ver a planta em 3D.
              </p>
            </div>
            <Button className="h-11 rounded-full px-5" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Novo imóvel
            </Button>
          </section>

          {error ? (
            <DataState loading={false} error={error} onRetry={() => void refetch()} />
          ) : loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-80 rounded-[28px]" />
              ))}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {properties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  primaryId={primary?.id ?? null}
                  appliances={appliances}
                  intervals={measured.intervals}
                  measuredLoading={measured.loading}
                />
              ))}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <Plus className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="font-medium">Adicionar imóvel</span>
                <span className="max-w-[14rem] text-center text-xs">Casa de férias, apartamento, comércio…</span>
              </button>
            </div>
          )}
        </main>
      </SidebarInset>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogIcon><Building2 /></DialogIcon>
            <DialogTitle>Novo imóvel</DialogTitle>
            <DialogDescription>Depois você adiciona os ambientes e organiza os aparelhos.</DialogDescription>
          </DialogHeader>
          <PropertyForm
            submitting={create.isPending}
            submitLabel="Criar imóvel"
            onCancel={() => setCreating(false)}
            onSubmit={(input) =>
              create.mutate(input, {
                onSuccess: (property) => {
                  setCreating(false);
                  toast({ title: "Imóvel criado", description: `${property.name} está pronto para receber ambientes.` });
                },
                onError: (err) => notifyError(err, { title: "Erro ao criar imóvel" }),
              })
            }
          />
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
