import { Crown } from "lucide-react";
import type { EnergyBucket } from "@/lib/property-energy";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { cn } from "@/lib/utils";
import { roomColor, type Room } from "@/types/property";

interface Props {
  rooms: Room[];
  energy: Map<string, EnergyBucket>;
  totalCost: number;
  onSelect: (room: Room) => void;
}

// Side panel with no room selected: every room with its estimated cost,
// consumption, appliance count and share of the property, biggest first.
export function RoomOverviewList({ rooms, energy, totalCost, onSelect }: Props) {
  const rows = rooms
    .map((room) => ({ room, bucket: energy.get(room.id) }))
    .sort((a, b) => (b.bucket?.estimatedCost ?? 0) - (a.bucket?.estimatedCost ?? 0));
  const topId = rows[0] && (rows[0].bucket?.estimatedCost ?? 0) > 0 ? rows[0].room.id : null;
  return (
    <ul className="space-y-2">
      {rows.map(({ room, bucket }) => {
        const cost = bucket?.estimatedCost ?? 0;
        const share = totalCost > 0 ? (cost / totalCost) * 100 : 0;
        const measured = bucket && bucket.measuredIntervals > 0;
        return (
          <li key={room.id}>
            <button
              type="button"
              onClick={() => onSelect(room)}
              className="w-full rounded-2xl bg-muted/50 px-4 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: roomColor(room) }} />
                <span className="min-w-0 flex-1 truncate font-medium">{room.name}</span>
                {room.id === topId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                    <Crown className="h-3 w-3" aria-hidden="true" /> maior
                  </span>
                )}
                <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(cost)}</span>
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
                <span>
                  {formatNumber(bucket?.estimatedKWh ?? 0, 0)} kWh · {bucket?.applianceCount ?? 0}{" "}
                  {(bucket?.applianceCount ?? 0) === 1 ? "aparelho" : "aparelhos"}
                  {measured && ` · medido ${formatNumber(bucket!.measuredKWh, 1)} kWh`}
                </span>
                <span>{formatNumber(share, 0)}%</span>
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted" role="presentation">
                <span className={cn("block h-full rounded-full bg-primary")} style={{ width: `${Math.min(share, 100)}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
