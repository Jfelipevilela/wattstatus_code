import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Layers, Plus, Star, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { notifyError } from "@/lib/error-toast";
import type { useProperties, usePropertyLayout } from "@/hooks/useProperties";
import type { Floor, Property, Room } from "@/types/property";
import { PropertyForm } from "./PropertyForm";

const selectClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  property: Property;
  properties: Property[];
  floors: Floor[];
  rooms: Room[];
  applianceCount: number;
  api: ReturnType<typeof useProperties>;
  layout: ReturnType<typeof usePropertyLayout>;
}

export function PropertySettingsTab({ property, properties, floors, rooms, applianceCount, api, layout }: Props) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [floorName, setFloorName] = useState("");
  const others = properties.filter((item) => item.id !== property.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Dados do imóvel</h2>
        <PropertyForm
          initial={property}
          submitting={api.update.isPending}
          submitLabel="Salvar alterações"
          onSubmit={(input) =>
            api.update.mutate(
              { id: property.id, ...input },
              {
                onSuccess: () => toast({ title: "Imóvel atualizado" }),
                onError: (err) => notifyError(err, { title: "Erro ao salvar" }),
              },
            )
          }
        />
      </section>
      <div className="space-y-6">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <Layers className="h-4 w-4" aria-hidden="true" /> Pavimentos
          </h2>
          <ul className="mt-3 space-y-2">
            {floors.map((floor) => {
              const count = rooms.filter((room) => room.floorId === floor.id).length;
              return (
                <li key={floor.id} className="flex items-center justify-between rounded-2xl bg-muted/60 px-3 py-2 text-sm">
                  <span>
                    {floor.name} <span className="text-xs text-muted-foreground">· {count} ambientes</span>
                  </span>
                  {floors.length > 1 && count === 0 && (
                    <button
                      type="button"
                      aria-label={`Excluir ${floor.name}`}
                      onClick={() => layout.removeFloor.mutate(floor.id, { onError: (err) => notifyError(err, { title: "Erro" }) })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!floorName.trim()) return;
              layout.addFloor.mutate(
                { name: floorName.trim(), level: floors.length },
                { onSuccess: () => setFloorName(""), onError: (err) => notifyError(err, { title: "Erro ao criar pavimento" }) },
              );
            }}
          >
            <Input
              aria-label="Nome do pavimento"
              className="h-10 rounded-xl"
              placeholder="Ex.: Primeiro andar"
              value={floorName}
              maxLength={80}
              onChange={(event) => setFloorName(event.target.value)}
            />
            <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" aria-label="Adicionar pavimento">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </section>

        <section className="space-y-2 rounded-3xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Ações</h2>
          {!property.isPrimary && (
            <Button
              variant="outline"
              className="h-11 w-full justify-start rounded-xl"
              onClick={() => api.update.mutate({ id: property.id, isPrimary: true }, { onSuccess: () => toast({ title: "Imóvel principal definido" }) })}
            >
              <Star className="mr-2 h-4 w-4" /> Tornar principal
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 w-full justify-start rounded-xl"
            disabled={others.length === 0}
            onClick={() =>
              api.update.mutate(
                { id: property.id, archived: true },
                {
                  onSuccess: () => {
                    toast({ title: "Imóvel arquivado", description: "Os dados continuam salvos." });
                    navigate("/imoveis");
                  },
                  onError: (err) => notifyError(err, { title: "Não foi possível arquivar" }),
                },
              )
            }
          >
            <Archive className="mr-2 h-4 w-4" /> Arquivar
          </Button>
          <Button
            variant="outline"
            className="h-11 w-full justify-start rounded-xl text-destructive hover:text-destructive"
            disabled={others.length === 0}
            onClick={() => {
              setMoveTo(others[0]?.id ?? "");
              setDeleting(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Excluir imóvel
          </Button>
          {others.length === 0 && <p className="text-xs text-muted-foreground">Você precisa manter pelo menos um imóvel ativo.</p>}
        </section>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {property.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ambientes e planta serão removidos. {applianceCount > 0 ? `Os ${applianceCount} aparelhos e o histórico medido serão mantidos e movidos para o imóvel escolhido.` : "Não há aparelhos aqui."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {applianceCount > 0 && (
            <>
              <label htmlFor="property-delete-target" className="text-sm font-medium">
                Mover aparelhos para
              </label>
              <select id="property-delete-target" className={selectClass} value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
                {others.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                api.remove.mutate(
                  { id: property.id, moveAppliancesTo: applianceCount > 0 ? moveTo : undefined },
                  {
                    onSuccess: () => {
                      toast({ title: "Imóvel excluído" });
                      navigate("/imoveis");
                    },
                    onError: (err) => notifyError(err, { title: "Não foi possível excluir" }),
                  },
                )
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
