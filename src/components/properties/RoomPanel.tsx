import { Link } from "react-router-dom";
import { ArrowRight, Plus, Radio, X } from "lucide-react";
import type { Appliance } from "@/hooks/useAppliances";
import type { EnergyBucket } from "@/lib/property-energy";
import { estimateAppliance, formatCurrency, formatNumber } from "@/lib/energy";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { cn } from "@/lib/utils";
import { ROOM_TYPES, roomColor, type Property, type Room } from "@/types/property";
import { ApplianceMoveSelect } from "./ApplianceMoveSelect";

interface Props {
  property: Property;
  properties: Property[];
  room: Room;
  rooms: Room[];
  bucket: EnergyBucket | undefined;
  appliances: Appliance[];
  unassigned: Appliance[];
  highlightedApplianceId: string | null;
  daysInMonth: number;
  busy: boolean;
  onMove: (appliance: Appliance, target: { propertyId: string; roomId: string | null }) => void;
  onClose: () => void;
}

export function RoomPanel({
  property,
  properties,
  room,
  rooms,
  bucket,
  appliances,
  unassigned,
  highlightedApplianceId,
  daysInMonth,
  busy,
  onMove,
  onClose,
}: Props) {
  const ranked = [...appliances]
    .map((appliance) => ({ appliance, ...estimateAppliance(appliance, daysInMonth) }))
    .sort((a, b) => b.cost - a.cost);
  return (
    <section aria-labelledby="room-panel-title" className="flex h-full flex-col">
      <header className="flex items-start gap-3 border-b p-5">
        <span aria-hidden="true" className="mt-1 h-10 w-10 shrink-0 rounded-xl" style={{ background: roomColor(room) }} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{ROOM_TYPES[room.type] ?? "Ambiente"}</p>
          <h2 id="room-panel-title" className="truncate text-xl font-semibold">
            {room.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes do ambiente"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">Estimado/mês</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(bucket?.estimatedCost ?? 0)}</dd>
            <dd className="text-xs text-muted-foreground tabular-nums">{formatNumber(bucket?.estimatedKWh ?? 0, 1)} kWh</dd>
          </div>
          <div className="rounded-2xl bg-muted/60 p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Radio className="h-3 w-3" aria-hidden="true" /> Medido no mês
            </dt>
            {bucket && bucket.measuredIntervals > 0 ? (
              <>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {bucket.measuredCostIncomplete ? "—" : formatCurrency(bucket.measuredCost)}
                </dd>
                <dd className="text-xs text-muted-foreground tabular-nums">{formatNumber(bucket.measuredKWh, 2)} kWh</dd>
              </>
            ) : (
              <dd className="mt-1 text-sm font-medium text-muted-foreground">Sem medição</dd>
            )}
          </div>
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Aparelhos <span className="font-normal text-muted-foreground">({appliances.length})</span>
          </h3>
          {ranked.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum aparelho neste ambiente ainda.
            </p>
          ) : (
            <ul className="space-y-2">
              {ranked.map(({ appliance, cost, consumption }) => {
                const { icon: Icon, tone } = applianceVisual(appliance.name);
                return (
                  <li
                    key={appliance.id}
                    className={cn(
                      "rounded-2xl border p-3 transition-colors",
                      appliance.id === highlightedApplianceId && "border-energy-green-light bg-energy-green-light/5",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{appliance.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatCurrency(cost)} · {formatNumber(consumption, 1)} kWh
                          {appliance.integrationProvider && " · medidor"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <ApplianceMoveSelect
                        appliance={appliance}
                        propertyId={property.id}
                        rooms={rooms}
                        properties={properties}
                        disabled={busy}
                        onMove={(target) => onMove(appliance, target)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {unassigned.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Trazer para cá</h3>
            <ul className="flex flex-wrap gap-2">
              {unassigned.map((appliance) => (
                <li key={appliance.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onMove(appliance, { propertyId: property.id, roomId: room.id })}
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" /> {appliance.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <footer className="border-t p-4">
        <Link
          to={`/imoveis/${property.id}/ambientes/${room.id}`}
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background hover:opacity-90"
        >
          Ver detalhes do ambiente <ArrowRight className="h-4 w-4" />
        </Link>
      </footer>
    </section>
  );
}
