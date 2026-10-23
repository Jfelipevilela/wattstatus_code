import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Building, Check, ChevronDown, Crown, DoorOpen, Loader2, MapPin, Pencil, Plug, Radio, X } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";
import { DataState } from "@/components/DataState";
import { FloorPlanViewer } from "@/components/floorplan/FloorPlanViewer";
import type { HeatMetric } from "@/components/floorplan/heat";
import { RoomPanel } from "@/components/properties/RoomPanel";
import { AddRoomForm, PropertyRoomsTab } from "@/components/properties/PropertyRoomsTab";
import { PropertyAppliancesTab } from "@/components/properties/PropertyAppliancesTab";
import { PropertyEnergyTab } from "@/components/properties/PropertyEnergyTab";
import { PropertySettingsTab } from "@/components/properties/PropertySettingsTab";
import { PROPERTY_ICONS } from "@/components/properties/propertyVisual";
import { useProperties, usePropertyEnergy, usePropertyLayout } from "@/hooks/useProperties";
import { useAppliances, type Appliance } from "@/hooks/useAppliances";
import { aggregatePropertyEnergy, appliancePropertyId, daysInMonth, UNASSIGNED } from "@/lib/property-energy";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { notifyError } from "@/lib/error-toast";
import { cn } from "@/lib/utils";
import { zonedMonthRange, zonedParts } from "@/lib/timezone";
import { PROPERTY_TYPES, type RoomLayout } from "@/types/property";

const TABS = [
  { value: "planta", label: "Planta" },
  { value: "ambientes", label: "Ambientes" },
  { value: "aparelhos", label: "Aparelhos" },
  { value: "consumo", label: "Consumo" },
  { value: "config", label: "Configurações" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const useDesktop = () => {
  const query = "(min-width: 1024px)";
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setDesktop(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return desktop;
};

export default function PropertyDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((item) => item.value === params.get("aba"))?.value ?? "planta") as Tab;
  const setTab = (value: Tab) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "planta") next.delete("aba");
      else next.set("aba", value);
      return next;
    }, { replace: true });

  const api = useProperties();
  const layout = usePropertyLayout(id);
  const { appliances, loading: appliancesLoading, updateAppliance } = useAppliances();
  const property = api.properties.find((item) => item.id === id) ?? null;
  const primaryId = api.primary?.id ?? null;

  // "This month" and its boundaries are the property's, in its own time zone.
  const timeZone = property?.timezone ?? null;
  const today = useMemo(() => zonedParts(new Date(), timeZone), [timeZone]);
  const { start, end } = useMemo(() => zonedMonthRange(today.year, today.month, timeZone), [today.year, today.month, timeZone]);
  const measured = usePropertyEnergy(id, start, end);
  const days = daysInMonth(today.year, today.month);
  const periodLabel = new Date(today.year, today.month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const ownAppliances = appliances.filter((item) => appliancePropertyId(item, primaryId) === id);
  const energy = aggregatePropertyEnergy(id, primaryId, appliances, layout.rooms, measured.intervals, days);

  const [floorId, setFloorId] = useState<string | null>(null);
  const activeFloor = layout.floors.find((floor) => floor.id === floorId) ?? layout.floors[0];
  const floorRooms = layout.rooms.filter((room) => room.floorId === activeFloor?.id);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [heat, setHeat] = useState<HeatMetric | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Map<string, RoomLayout>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const desktop = useDesktop();

  const roomsForPlan = floorRooms.map((room) => (draft.has(room.id) ? { ...room, layout: draft.get(room.id)! } : room));
  const appliancesByRoom = useMemo(() => {
    const map = new Map<string, Appliance[]>();
    for (const appliance of ownAppliances) {
      if (!appliance.roomId) continue;
      map.set(appliance.roomId, [...(map.get(appliance.roomId) ?? []), appliance]);
    }
    return map;
  }, [ownAppliances]);
  const selectedRoom = layout.rooms.find((room) => room.id === selectedRoomId) ?? null;
  const unassigned = ownAppliances.filter((item) => !item.roomId || !layout.rooms.some((room) => room.id === item.roomId));
  const topRoom = layout.rooms
    .map((room) => ({ room, bucket: energy.byRoom.get(room.id)! }))
    .filter((row) => row.bucket?.applianceCount > 0)
    .sort((a, b) => b.bucket.estimatedCost - a.bucket.estimatedCost)[0];

  const move = async (appliance: Appliance, target: { propertyId: string; roomId: string | null }) => {
    setBusyId(appliance.id);
    try {
      await updateAppliance(appliance.id, target);
      toast({
        title: "Aparelho movido",
        description:
          target.propertyId !== id
            ? `${appliance.name} foi para outro imóvel. O histórico medido continua no lugar original.`
            : `${appliance.name} agora está em ${layout.rooms.find((room) => room.id === target.roomId)?.name ?? "Sem ambiente"}.`,
      });
    } catch (err) {
      notifyError(err, { title: "Não foi possível mover" });
    } finally {
      setBusyId(null);
    }
  };

  const saveLayout = () =>
    layout.saveLayout.mutate(
      [...draft].map(([roomId, value]) => ({ id: roomId, layout: value })),
      {
        onSuccess: () => {
          setDraft(new Map());
          setEditing(false);
          toast({ title: "Planta salva" });
        },
        onError: (err) => notifyError(err, { title: "Erro ao salvar a planta" }),
      },
    );

  const loading = api.loading || layout.loading || appliancesLoading;
  const notFound = !api.loading && !property;
  const Icon = property ? PROPERTY_ICONS[property.type] : Building;

  const panel = selectedRoom && property && (
    <RoomPanel
      property={property}
      properties={api.properties}
      room={selectedRoom}
      rooms={layout.rooms}
      bucket={energy.byRoom.get(selectedRoom.id)}
      appliances={appliancesByRoom.get(selectedRoom.id) ?? []}
      unassigned={unassigned}
      highlightedApplianceId={highlighted}
      daysInMonth={days}
      busy={Boolean(busyId)}
      onMove={move}
      onClose={() => setSelectedRoomId(null)}
      hideClose={!desktop}
    />
  );

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <nav aria-label="Trilha" className="flex min-w-0 items-center gap-2 text-sm">
            <Link to="/imoveis" className="text-muted-foreground hover:text-foreground">
              Meus imóveis
            </Link>
            <span className="text-muted-foreground">/</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded-full px-2 py-1 font-semibold hover:bg-muted">
                <span className="truncate">{property?.name ?? "Imóvel"}</span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {api.properties.map((item) => (
                  <DropdownMenuItem key={item.id} onSelect={() => navigate(`/imoveis/${item.id}`)}>
                    <Check className={cn("mr-2 h-4 w-4", item.id === id ? "opacity-100" : "opacity-0")} />
                    {item.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </header>
        <main className="container mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6">
          {api.error || layout.error ? (
            <DataState loading={false} error={api.error ?? layout.error} onRetry={() => void layout.refetch()} />
          ) : notFound ? (
            <section className="rounded-3xl border border-dashed p-12 text-center">
              <h1 className="text-xl font-semibold">Imóvel não encontrado</h1>
              <p className="mt-2 text-muted-foreground">Ele pode ter sido excluído ou não pertence à sua conta.</p>
              <Button asChild className="mt-6 rounded-full">
                <Link to="/imoveis">Ver meus imóveis</Link>
              </Button>
            </section>
          ) : loading || !property ? (
            <div className="space-y-4">
              <Skeleton className="h-28 rounded-3xl" />
              <Skeleton className="h-[520px] rounded-3xl" />
            </div>
          ) : (
            <>
              <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-center gap-4">
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm"
                    style={{ background: `${property.color ?? "#00C853"}22`, color: property.color ?? "#00C853" }}
                  >
                    <Icon className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h1 className="truncate text-3xl font-bold tracking-tight">{property.name}</h1>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {[property.city, property.state].filter(Boolean).join(" · ") || "Local não informado"} · {PROPERTY_TYPES[property.type]}
                      {property.isPrimary && " · principal"}
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Estimado/mês</dt>
                    <dd className="text-2xl font-bold tabular-nums">{formatCurrency(energy.total.estimatedCost)}</dd>
                    <dd className="text-xs text-muted-foreground tabular-nums">{formatNumber(energy.total.estimatedKWh, 0)} kWh</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Radio className="h-3 w-3" aria-hidden="true" /> Medido no mês
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums">
                      {measured.loading ? (
                        <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted-foreground" />
                      ) : measured.error ? (
                        <span className="text-base font-medium text-destructive" title={measured.error}>
                          indisponível
                        </span>
                      ) : energy.total.measuredIntervals > 0 ? (
                        `${formatNumber(energy.total.measuredKWh, 1)} kWh`
                      ) : (
                        <span className="text-base font-medium text-muted-foreground">sem medição</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <DoorOpen className="h-3 w-3" aria-hidden="true" /> Ambientes · <Plug className="h-3 w-3" aria-hidden="true" /> aparelhos
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums">
                      {layout.rooms.length} · {ownAppliances.length}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Crown className="h-3 w-3" aria-hidden="true" /> Maior ambiente
                    </dt>
                    <dd className="truncate text-base font-semibold">{topRoom ? topRoom.room.name : "—"}</dd>
                    {topRoom && <dd className="text-xs text-muted-foreground tabular-nums">{formatCurrency(topRoom.bucket.estimatedCost)}/mês</dd>}
                  </div>
                </dl>
              </section>

              <div role="tablist" aria-label="Seções do imóvel" className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TABS.map((item) => (
                  <button
                    key={item.value}
                    role="tab"
                    type="button"
                    aria-selected={tab === item.value}
                    onClick={() => setTab(item.value)}
                    className={cn(
                      "-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                      tab === item.value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {tab === "planta" && (
                <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                  <section
                    aria-label="Planta do imóvel"
                    className="flex h-[min(78dvh,680px)] min-h-[460px] flex-col overflow-hidden rounded-[28px] border bg-gradient-to-b from-zinc-50 to-zinc-100 shadow-sm dark:from-zinc-900 dark:to-zinc-950"
                  >
                    {layout.floors.length > 1 && (
                      <div role="group" aria-label="Pavimento" className="flex gap-1 overflow-x-auto px-3 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {layout.floors.map((floor) => (
                          <button
                            key={floor.id}
                            type="button"
                            aria-pressed={floor.id === activeFloor?.id}
                            onClick={() => {
                              setFloorId(floor.id);
                              setSelectedRoomId(null);
                            }}
                            className={cn(
                              "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                              floor.id === activeFloor?.id ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {floor.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {layout.rooms.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
                        <DoorOpen className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                        <div>
                          <h2 className="text-lg font-semibold">Monte sua planta</h2>
                          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            Adicione ambientes e eles aparecem aqui automaticamente, prontos para ajustar.
                          </p>
                        </div>
                        <div className="w-full max-w-xl">
                          <AddRoomForm floors={layout.floors} layout={layout} defaultFloorId={activeFloor?.id} />
                        </div>
                      </div>
                    ) : (
                      <FloorPlanViewer
                        rooms={roomsForPlan}
                        appliancesByRoom={appliancesByRoom}
                        energy={energy.byRoom}
                        selectedRoomId={selectedRoomId}
                        onSelectRoom={(roomId) => {
                          setSelectedRoomId(roomId);
                          setHighlighted(null);
                        }}
                        onSelectAppliance={(appliance) => setHighlighted(appliance.id)}
                        heat={heat}
                        onHeatChange={setHeat}
                        editing={editing}
                        onLayoutChange={(roomId, value) => setDraft((current) => new Map(current).set(roomId, value))}
                        toolbar={
                          editing ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-full"
                                onClick={() => {
                                  setDraft(new Map());
                                  setEditing(false);
                                }}
                              >
                                <X className="mr-1 h-4 w-4" /> Cancelar
                              </Button>
                              <Button size="sm" className="rounded-full" disabled={draft.size === 0 || layout.saveLayout.isPending} onClick={saveLayout}>
                                <Check className="mr-1 h-4 w-4" /> Salvar planta
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" className="rounded-full bg-card" onClick={() => setEditing(true)}>
                              <Pencil className="mr-1 h-4 w-4" /> Editar planta
                            </Button>
                          )
                        }
                      />
                    )}
                    {editing && (
                      <p className="border-t bg-card px-4 py-2 text-xs text-muted-foreground">
                        Arraste um ambiente para mover e o canto verde para redimensionar. Teclado: setas movem, Shift + setas redimensionam.
                      </p>
                    )}
                  </section>

                  {desktop ? (
                    <aside className="hidden h-[min(78dvh,680px)] min-h-[460px] overflow-hidden rounded-[28px] border bg-card shadow-sm lg:block">
                      {panel || (
                        <div className="flex h-full flex-col p-5">
                          <h2 className="font-semibold">Ambientes</h2>
                          <p className="mt-1 text-sm text-muted-foreground">Toque num ambiente da planta ou escolha abaixo.</p>
                          <ul className="mt-4 flex-1 space-y-2 overflow-y-auto">
                            {layout.rooms.map((room) => {
                              const bucket = energy.byRoom.get(room.id);
                              return (
                                <li key={room.id}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (room.floorId !== activeFloor?.id) setFloorId(room.floorId);
                                      setSelectedRoomId(room.id);
                                    }}
                                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-left text-sm hover:bg-muted"
                                  >
                                    <span className="truncate font-medium">{room.name}</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(bucket?.estimatedCost ?? 0)}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                          {(energy.byRoom.get(UNASSIGNED)?.applianceCount ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setTab("aparelhos")}
                              className="mt-3 rounded-2xl border border-dashed px-4 py-3 text-left text-sm text-muted-foreground hover:bg-muted"
                            >
                              {energy.byRoom.get(UNASSIGNED)!.applianceCount} aparelho(s) sem ambiente · organizar →
                            </button>
                          )}
                        </div>
                      )}
                    </aside>
                  ) : (
                    <Sheet open={Boolean(selectedRoom)} onOpenChange={(open) => !open && setSelectedRoomId(null)}>
                      <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-[28px] p-0">
                        <SheetTitle className="sr-only">{selectedRoom?.name}</SheetTitle>
                        {panel}
                      </SheetContent>
                    </Sheet>
                  )}
                </div>
              )}

              {tab === "ambientes" && (
                <PropertyRoomsTab propertyId={id} floors={layout.floors} rooms={layout.rooms} energy={energy.byRoom} layout={layout} />
              )}
              {tab === "aparelhos" && (
                <PropertyAppliancesTab
                  property={property}
                  properties={api.properties}
                  rooms={layout.rooms}
                  appliances={ownAppliances}
                  daysInMonth={days}
                  busyId={busyId}
                  onMove={move}
                />
              )}
              {tab === "consumo" && (
                <PropertyEnergyTab
                  rooms={layout.rooms}
                  energy={energy}
                  unlocated={measured.unlocated}
                  periodLabel={periodLabel}
                  measuredError={measured.error}
                />
              )}
              {tab === "config" && (
                <PropertySettingsTab
                  property={property}
                  properties={api.properties}
                  floors={layout.floors}
                  rooms={layout.rooms}
                  applianceCount={ownAppliances.length}
                  api={api}
                  layout={layout}
                />
              )}
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
