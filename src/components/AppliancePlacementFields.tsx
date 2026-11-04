import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface AppliancePlacement {
  propertyId: string; roomId: string;
}
export default function AppliancePlacementFields({ id, value, onChange, properties, rooms, loading, error, onRetry }: {
  id: string; value: AppliancePlacement; onChange: (value: AppliancePlacement) => void;
  properties: Array<{ id: string; name: string; isPrimary?: boolean }>;
  rooms: Array<{ id: string; name: string }>; loading: boolean; error: string | null; onRetry: () => void;
}) {
  return <div className="flex flex-col gap-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={`${id}-property`}>Imóvel</Label>
        <select id={`${id}-property`} className="appliance-control" value={value.propertyId} disabled={loading} onChange={event => onChange({ propertyId: event.target.value, roomId: '' })}>
          <option value="">Imóvel principal (automático)</option>{properties.map(property => <option key={property.id} value={property.id}>{property.name}{property.isPrimary ? ' (principal)' : ''}</option>)}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={`${id}-room-id`}>Ambiente cadastrado</Label>
        <select id={`${id}-room-id`} className="appliance-control" value={value.roomId} disabled={loading || !value.propertyId || Boolean(error)} onChange={event => onChange({ ...value, roomId: event.target.value })}>
          <option value="">Sem ambiente</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </div>
    </div>
    {loading ? <p role="status" className="text-xs text-muted-foreground">Carregando locais…</p> : error ? <div role="alert" className="text-sm text-destructive">{error}<Button type="button" variant="link" onClick={onRetry}>Tentar novamente</Button></div> : <p className="text-xs text-muted-foreground">{value.propertyId ? rooms.length ? 'Organize o aparelho em um dos ambientes deste imóvel.' : 'Este imóvel ainda não tem ambientes cadastrados.' : 'Selecione um imóvel para escolher um ambiente. Sem seleção, o cadastro usa seu imóvel principal.'}</p>}
  </div>;
}
