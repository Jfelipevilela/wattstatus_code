import { useState } from "react";
import { Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface AppliancePlacement {
  propertyId: string; roomId: string;
}
export default function AppliancePlacementFields({ id, value, onChange, properties, rooms, loading, error, onRetry, onCreateRoom }: {
  id: string; value: AppliancePlacement; onChange: (value: AppliancePlacement) => void;
  properties: Array<{ id: string; name: string; isPrimary?: boolean }>;
  rooms: Array<{ id: string; name: string }>; loading: boolean; error: string | null; onRetry: () => void;
  /** Creates a room in the selected property and returns it. The server validates ownership. */
  onCreateRoom?: (propertyId: string, name: string) => Promise<{ id: string; name: string }>;
}) {
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const trimmed = roomName.trim();
  const createRoom = async () => {
    if (!onCreateRoom || !value.propertyId || trimmed.length < 2 || saving) return;
    setSaving(true); setCreateError(null);
    try {
      const room = await onCreateRoom(value.propertyId, trimmed.slice(0, 80));
      onChange({ ...value, roomId: room.id });
      setRoomName(""); setCreating(false);
    } catch {
      setCreateError("Não foi possível criar o ambiente. Confira o nome e tente novamente.");
    } finally { setSaving(false); }
  };
  return <div className="flex flex-col gap-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={`${id}-property`}>Imóvel</Label>
        <select id={`${id}-property`} className="appliance-control" value={value.propertyId} disabled={loading && !properties.length} onChange={event => { setCreating(false); onChange({ propertyId: event.target.value, roomId: '' }); }}>
          <option value="">Imóvel principal (automático)</option>{properties.map(property => <option key={property.id} value={property.id}>{property.name}{property.isPrimary ? ' (principal)' : ''}</option>)}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={`${id}-room-id`}>Ambiente cadastrado</Label>
        <select id={`${id}-room-id`} className="appliance-control" value={value.roomId} disabled={loading || !value.propertyId || Boolean(error)} onChange={event => onChange({ ...value, roomId: event.target.value })}>
          <option value="">Sem ambiente</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </div>
    </div>
    {creating && <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-new-room`}>Nome do novo ambiente</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={`${id}-new-room`} value={roomName} maxLength={80} placeholder="Ex.: Quarto do casal" autoFocus disabled={saving}
          onChange={event => setRoomName(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void createRoom(); } if (event.key === "Escape") { event.stopPropagation(); setCreating(false); } }} />
        <div className="flex gap-2">
          <Button type="button" className="h-12 flex-1 sm:flex-none" disabled={saving || trimmed.length < 2} onClick={() => void createRoom()}>{saving ? "Criando…" : "Criar ambiente"}</Button>
          <Button type="button" variant="ghost" className="h-12" disabled={saving} onClick={() => { setCreating(false); setCreateError(null); }}>Cancelar</Button>
        </div>
      </div>
      {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
    </div>}
    {loading ? <p role="status" className="text-xs text-muted-foreground">Carregando locais…</p>
      : error ? <div role="alert" className="text-sm text-destructive">{error}<Button type="button" variant="link" onClick={onRetry}>Tentar novamente</Button></div>
        : <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{value.propertyId ? rooms.length ? 'Organize o aparelho em um dos ambientes deste imóvel.' : 'Este imóvel ainda não tem ambientes. Crie o primeiro aqui.' : 'Selecione um imóvel para escolher um ambiente. Sem seleção, o cadastro usa seu imóvel principal.'}</p>
          {onCreateRoom && value.propertyId && !creating && <Button type="button" variant="ghost" className="h-10 px-2 font-semibold text-[hsl(var(--flow-accent))]" onClick={() => setCreating(true)}><Plus className="mr-1 size-4" aria-hidden="true" />Novo ambiente</Button>}
        </div>}
  </div>;
}
