import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import ApplianceCalculator from "@/components/ApplianceCalculator";
import DeviceConfigurationPanel from "@/components/DeviceConfigurationPanel";
import AppliancePlacementFields, { type AppliancePlacement } from "@/components/AppliancePlacementFields";
import { apiRequest } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Place = { id: string; name: string; isPrimary?: boolean };

/** Loads the user's properties and the rooms of the selected one. The server re-validates ownership on save. */
function usePlacement(appliance: Appliance | null, open: boolean) {
  const [placement, setPlacement] = useState<AppliancePlacement>({ propertyId: "", roomId: "" });
  const [touched, setTouched] = useState(false);
  const [properties, setProperties] = useState<Place[]>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const cache = useRef<Place[] | null>(null);
  useEffect(() => {
    setPlacement({ propertyId: appliance?.propertyId || "", roomId: appliance?.roomId || "" });
    setTouched(false);
  }, [appliance?.id, appliance?.propertyId, appliance?.roomId]);
  useEffect(() => {
    if (!open || !appliance) return;
    const controller = new AbortController();
    setLoading(true); setError(null); setRooms([]);
    Promise.all([
      cache.current ? Promise.resolve({ properties: cache.current }) : apiRequest<{ properties: Place[] }>("/api/properties", { signal: controller.signal, skipErrorToast: true }),
      placement.propertyId ? apiRequest<{ rooms: Array<{ id: string; name: string }> }>(`/api/properties/${encodeURIComponent(placement.propertyId)}/rooms`, { signal: controller.signal, skipErrorToast: true }) : Promise.resolve({ rooms: [] }),
    ]).then(([places, layout]) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(places.properties) || !Array.isArray(layout.rooms)) throw new Error("Resposta de locais inválida");
      cache.current = places.properties; setProperties(places.properties); setRooms(layout.rooms);
    }).catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar imóveis e ambientes. A seleção atual foi mantida."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, appliance, placement.propertyId, retry]);
  const createRoom = async (propertyId: string, name: string) => {
    const { room } = await apiRequest<{ room: { id: string; name: string } }>(`/api/properties/${encodeURIComponent(propertyId)}/rooms`, { method: "POST", body: JSON.stringify({ name }), skipErrorToast: true });
    if (!room?.id) throw new Error("Resposta de ambiente inválida");
    setRooms(current => [...current, { id: room.id, name: room.name }]);
    setTouched(true);
    return room;
  };
  return { placement, touched, properties, rooms, loading, error, createRoom,
    change: (value: AppliancePlacement) => { setPlacement(value); setTouched(true); },
    retry: () => { cache.current = null; setRetry(value => value + 1); } };
}

export default function EditApplianceModal({
  appliance,
  isOpen,
  onClose,
  onSave,
}: {
  appliance: Appliance | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updated: ApplianceInput) => Promise<void> | void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const place = usePlacement(appliance, isOpen);
  const placementFields = <AppliancePlacementFields id={id} value={place.placement} properties={place.properties} rooms={place.rooms} loading={place.loading} error={place.error} onRetry={place.retry} onChange={place.change} onCreateRoom={place.createRoom} />;
  // Placement is sent only when the user changed it, so an edit never moves the appliance by accident.
  const save = async (input: ApplianceInput) => {
    if (!appliance) return;
    const moved = place.touched && place.placement.propertyId
      ? { propertyId: place.placement.propertyId, roomId: place.placement.roomId || null } : {};
    await onSave(appliance.id, { ...input, ...moved });
  };
  const catalogBased = Boolean(appliance && (appliance.catalogDeviceId || appliance.room !== undefined ||
    (appliance.energyProfile && appliance.energyProfile.method !== "POWER_TIME")));
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="appliance-flow-theme appliance-flow-dialog appliance-edit-dialog sm:max-w-5xl">
        <DialogHeader className="appliance-dialog-heading">
          <span className="appliance-heading-icon" aria-hidden="true"><Pencil className="size-5" /></span>
          <DialogTitle className="text-2xl font-bold tracking-tight">Editar aparelho</DialogTitle>
          <DialogDescription className="text-sm">
            {appliance ? <>Ajuste o uso de <strong className="font-semibold text-foreground">{appliance.name}</strong>. O histórico continua salvo.</> : "Ajuste o uso e salve as alterações."}
          </DialogDescription>
        </DialogHeader>
        <div className="appliance-workspace">
          {appliance && (catalogBased ? (
            <DeviceConfigurationPanel
              key={appliance.id}
              initialAppliance={appliance}
              placementFields={placementFields}
              onSaved={onClose}
              onBusyChange={setBusy}
              onAddAppliance={save}
            />
          ) : (
            <ApplianceCalculator
              key={appliance.id}
              initialAppliance={appliance}
              placementFields={placementFields}
              onSaved={onClose}
              onBusyChange={setBusy}
              onAddAppliance={save}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
