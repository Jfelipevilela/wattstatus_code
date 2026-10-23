import type { Appliance } from "@/hooks/useAppliances";
import type { Property, Room } from "@/types/property";

const NONE = "__none__";

interface Props {
  appliance: Appliance;
  propertyId: string;
  rooms: Room[];
  properties: Property[];
  disabled?: boolean;
  onMove: (target: { propertyId: string; roomId: string | null }) => void;
}

// One select for both moves: another room here, "Sem ambiente", or another property.
export function ApplianceMoveSelect({ appliance, propertyId, rooms, properties, disabled, onMove }: Props) {
  const value = appliance.roomId && rooms.some((room) => room.id === appliance.roomId) ? appliance.roomId : NONE;
  return (
    <select
      aria-label={`Local de ${appliance.name}`}
      disabled={disabled}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (next.startsWith("property:")) onMove({ propertyId: next.slice(9), roomId: null });
        else onMove({ propertyId, roomId: next === NONE ? null : next });
      }}
      className="h-9 max-w-[12rem] rounded-full border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <optgroup label="Neste imóvel">
        <option value={NONE}>Sem ambiente</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name}
          </option>
        ))}
      </optgroup>
      {properties.some((item) => item.id !== propertyId) && (
        <optgroup label="Mover para outro imóvel">
          {properties
            .filter((item) => item.id !== propertyId)
            .map((item) => (
              <option key={item.id} value={`property:${item.id}`}>
                {item.name}
              </option>
            ))}
        </optgroup>
      )}
    </select>
  );
}
