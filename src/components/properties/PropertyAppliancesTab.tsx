import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Appliance } from "@/hooks/useAppliances";
import { estimateAppliance, formatCurrency, formatNumber } from "@/lib/energy";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { cn } from "@/lib/utils";
import type { Property, Room } from "@/types/property";
import { ApplianceMoveSelect } from "./ApplianceMoveSelect";

interface Props {
  property: Property;
  properties: Property[];
  rooms: Room[];
  appliances: Appliance[];
  daysInMonth: number;
  busyId: string | null;
  onMove: (appliance: Appliance, target: { propertyId: string; roomId: string | null }) => void;
}

export function PropertyAppliancesTab({ property, properties, rooms, appliances, daysInMonth, busyId, onMove }: Props) {
  const groups = [
    ...rooms.map((room) => ({ key: room.id, title: room.name, items: appliances.filter((item) => item.roomId === room.id) })),
    {
      key: "none",
      title: "Sem ambiente",
      items: appliances.filter((item) => !item.roomId || !rooms.some((room) => room.id === item.roomId)),
    },
  ].filter((group) => group.items.length > 0);

  if (appliances.length === 0)
    return (
      <div className="rounded-3xl border border-dashed p-10 text-center">
        <p className="font-medium">Nenhum aparelho neste imóvel</p>
        <p className="mt-1 text-sm text-muted-foreground">Cadastre um aparelho ou mova um de outro imóvel.</p>
        <Link
          to={`/aparelhos?adicionar=1`}
          className="mt-4 inline-flex h-10 items-center gap-1 rounded-full bg-foreground px-4 text-sm font-medium text-background"
        >
          <Plus className="h-4 w-4" /> Cadastrar aparelho
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`}>
          <h2 id={`group-${group.key}`} className="mb-2 px-1 text-sm font-semibold">
            {group.title} <span className="font-normal text-muted-foreground">({group.items.length})</span>
          </h2>
          <ul className="divide-y overflow-hidden rounded-3xl border bg-card shadow-sm">
            {group.items.map((appliance) => {
              const { icon: Icon, tone } = applianceVisual(appliance.name);
              const { consumption, cost } = estimateAppliance(appliance, daysInMonth);
              return (
                <li key={appliance.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{appliance.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatNumber(appliance.power, 0)} W · {formatNumber(consumption, 1)} kWh · {formatCurrency(cost)}/mês
                    </p>
                  </div>
                  <ApplianceMoveSelect
                    appliance={appliance}
                    propertyId={property.id}
                    rooms={rooms}
                    properties={properties}
                    disabled={busyId === appliance.id}
                    onMove={(target) => onMove(appliance, target)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
