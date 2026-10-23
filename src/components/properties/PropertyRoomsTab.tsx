import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogIcon,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { notifyError } from "@/lib/error-toast";
import type { usePropertyLayout } from "@/hooks/useProperties";
import type { EnergyBucket } from "@/lib/property-energy";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { inferRoomType, ROOM_TYPES, roomColor, type Floor, type Room } from "@/types/property";

const selectClass =
  "h-11 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  propertyId: string;
  floors: Floor[];
  rooms: Room[];
  energy: Map<string, EnergyBucket>;
  layout: ReturnType<typeof usePropertyLayout>;
}

export function AddRoomForm({
  floors,
  layout,
  defaultFloorId,
  onAdded,
}: {
  floors: Floor[];
  layout: Props["layout"];
  defaultFloorId?: string;
  onAdded?: (room: Room) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("living");
  const [typeTouched, setTypeTouched] = useState(false);
  const [floorId, setFloorId] = useState(defaultFloorId ?? "");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim() || ROOM_TYPES[type];
        const finalType = typeTouched ? type : inferRoomType(trimmed) ?? type;
        layout.addRoom.mutate(
          { name: trimmed, type: finalType, floorId: floorId || defaultFloorId || undefined },
          {
            onSuccess: (room) => {
              setName("");
              onAdded?.(room);
              toast({ title: "Ambiente criado", description: `${room.name} já aparece na planta.` });
            },
            onError: (err) => notifyError(err, { title: "Erro ao criar ambiente" }),
          },
        );
      }}
    >
      <label className="sr-only" htmlFor="room-type">Tipo do ambiente</label>
      <select id="room-type" className={selectClass} value={type} onChange={(event) => {
          setType(event.target.value);
          setTypeTouched(true);
        }}>
        {Object.entries(ROOM_TYPES).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="room-name">Nome do ambiente</label>
      <Input
        id="room-name"
        className="h-11 flex-1 rounded-xl"
        placeholder={`Nome (ex.: ${type === "bedroom" ? "Quarto do João" : `${ROOM_TYPES[type]} principal`})`}
        value={name}
        maxLength={80}
        onChange={(event) => {
          setName(event.target.value);
          const guess = inferRoomType(event.target.value);
          if (!typeTouched && guess) setType(guess);
        }}
      />
      {floors.length > 1 && (
        <>
          <label className="sr-only" htmlFor="room-floor">Pavimento</label>
          <select id="room-floor" className={selectClass} value={floorId} onChange={(event) => setFloorId(event.target.value)}>
            <option value="">{floors[0]?.name}</option>
            {floors.slice(1).map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </select>
        </>
      )}
      <Button type="submit" className="h-11 rounded-full" disabled={layout.addRoom.isPending}>
        <Plus className="mr-1 h-4 w-4" /> Adicionar
      </Button>
    </form>
  );
}

export function PropertyRoomsTab({ propertyId, floors, rooms, energy, layout }: Props) {
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const floorName = (floorId: string) => floors.find((floor) => floor.id === floorId)?.name ?? "";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Novo ambiente</h2>
        <AddRoomForm floors={floors} layout={layout} />
        <p className="mt-2 text-xs text-muted-foreground">
          Novos ambientes entram na planta numa posição livre; os já posicionados não se movem.
        </p>
      </section>

      {rooms.length === 0 ? (
        <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">
          Nenhum ambiente ainda. Comece pela sala ou pela cozinha.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const bucket = energy.get(room.id);
            return (
              <li key={room.id} className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-xl" style={{ background: roomColor(room) }} />
                  <div className="min-w-0 flex-1">
                    {editing?.id === room.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          layout.updateRoom.mutate(
                            { id: room.id, name: editing.name.trim() || room.name },
                            { onSuccess: () => setEditing(null), onError: (err) => notifyError(err, { title: "Erro ao renomear" }) },
                          );
                        }}
                      >
                        <Input
                          autoFocus
                          aria-label="Novo nome"
                          className="h-9 rounded-lg"
                          value={editing.name}
                          maxLength={80}
                          onChange={(event) => setEditing({ id: room.id, name: event.target.value })}
                          onBlur={() => setEditing(null)}
                          onKeyDown={(event) => event.key === "Escape" && setEditing(null)}
                        />
                      </form>
                    ) : (
                      <h3 className="truncate font-semibold">{room.name}</h3>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {ROOM_TYPES[room.type] ?? "Ambiente"}
                      {floors.length > 1 && ` · ${floorName(room.floorId)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Renomear ${room.name}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setEditing({ id: room.id, name: room.name })}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${room.name}`}
                    onClick={() => {
                      setMoveTo("");
                      setDeleting(room);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Estimado</dt>
                    <dd className="text-sm font-semibold tabular-nums">{formatCurrency(bucket?.estimatedCost ?? 0)}</dd>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">kWh/mês</dt>
                    <dd className="text-sm font-semibold tabular-nums">{formatNumber(bucket?.estimatedKWh ?? 0, 0)}</dd>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Aparelhos</dt>
                    <dd className="text-sm font-semibold tabular-nums">{bucket?.applianceCount ?? 0}</dd>
                  </div>
                </dl>
                <Link
                  to={`/imoveis/${propertyId}/ambientes/${room.id}`}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-energy-400"
                >
                  Detalhes <ArrowRight className="h-4 w-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogIcon tone="red"><Trash2 /></AlertDialogIcon>
            <AlertDialogTitle>Excluir {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os aparelhos e o histórico de medições são mantidos. Escolha para onde os aparelhos vão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="text-sm font-medium" htmlFor="room-delete-target">
            Mover aparelhos para
          </label>
          <select id="room-delete-target" className={selectClass} value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
            <option value="">Sem ambiente</option>
            {rooms
              .filter((room) => room.id !== deleting?.id)
              .map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
          </select>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleting &&
                layout.removeRoom.mutate(
                  { id: deleting.id, moveAppliancesTo: moveTo || null },
                  {
                    onSuccess: () => toast({ title: "Ambiente excluído", description: "Aparelhos e medições preservados." }),
                    onError: (err) => notifyError(err, { title: "Erro ao excluir ambiente" }),
                  },
                )
              }
            >
              Excluir ambiente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
