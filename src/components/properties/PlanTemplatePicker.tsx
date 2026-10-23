import { useState } from "react";
import { Building2, Check, Home, LayoutTemplate, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { notifyError } from "@/lib/error-toast";
import { cn } from "@/lib/utils";
import type { usePropertyLayout } from "@/hooks/useProperties";
import type { Floor } from "@/types/property";
import { ROOM_PALETTE } from "@/components/floorplan/tokens";
import { PLAN_TEMPLATES, templateArea, type PlanTemplate } from "./planTemplates";

type Layout = ReturnType<typeof usePropertyLayout>;

// Mini top view of a template's ground floor.
function Preview({ template }: { template: PlanTemplate }) {
  const rooms = template.floors[0].rooms;
  const w = Math.max(...rooms.map((room) => room.layout.x + room.layout.width));
  const d = Math.max(...rooms.map((room) => room.layout.y + room.layout.depth));
  return (
    <svg viewBox={`-0.2 -0.2 ${w + 0.4} ${d + 0.4}`} className="h-24 w-full" aria-hidden="true">
      {rooms.map((room, index) => (
        <rect
          key={room.name}
          x={room.layout.x}
          y={room.layout.y}
          width={room.layout.width}
          height={room.layout.depth}
          rx={0.12}
          fill={ROOM_PALETTE[index % ROOM_PALETTE.length]}
          fillOpacity={0.55}
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={0.06}
        />
      ))}
    </svg>
  );
}

export function PlanTemplatePicker({
  layout,
  floors,
  activeFloor,
  trigger,
  onApplied,
}: {
  layout: Layout;
  floors: Floor[];
  activeFloor?: Floor;
  trigger: React.ReactNode;
  onApplied?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string>(PLAN_TEMPLATES[2].id);
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    const template = PLAN_TEMPLATES.find((item) => item.id === chosen);
    if (!template) return;
    setBusy(true);
    try {
      const known = [...floors];
      for (const floor of template.floors) {
        let target = floor.level === 0 ? (activeFloor ?? known.find((item) => item.level === 0) ?? known[0]) : known.find((item) => item.level === floor.level);
        if (!target) {
          target = await layout.addFloor.mutateAsync({ name: floor.name, level: floor.level });
          known.push(target);
        }
        // Next to whatever the floor already has, never on top of it.
        const existing = layout.rooms.filter((room) => room.floorId === target!.id && room.layout);
        const offset = existing.length ? Math.ceil(Math.max(...existing.map((room) => room.layout!.x + room.layout!.width)) + 1) : 0;
        for (const room of floor.rooms) {
          await layout.addRoom.mutateAsync({
            name: room.name,
            type: room.type,
            floorId: target.id,
            layout: { ...room.layout, x: room.layout.x + offset },
          });
        }
      }
      const count = template.floors.reduce((sum, floor) => sum + floor.rooms.length, 0);
      toast({ title: "Planta criada", description: `${template.name}: ${count} ambientes prontos para ajustar.` });
      setOpen(false);
      onApplied?.();
    } catch (error) {
      notifyError(error, { title: "Não foi possível criar toda a planta" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5" /> Começar com uma planta pronta
          </DialogTitle>
          <DialogDescription>
            Modelos das moradias mais comuns no Brasil. Os ambientes são criados já posicionados; depois é só ajustar em "Editar planta".
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Modelos de planta" className="grid gap-3 sm:grid-cols-2">
          {PLAN_TEMPLATES.map((template) => {
            const selected = template.id === chosen;
            const rooms = template.floors.reduce((sum, floor) => sum + floor.rooms.length, 0);
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChosen(template.id)}
                className={cn(
                  "relative flex flex-col gap-2 rounded-2xl border bg-card p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30",
                )}
              >
                {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" aria-hidden="true" />}
                <Preview template={template} />
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {template.kind === "house" ? <Home className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  {template.name}
                </span>
                <span className="text-xs text-muted-foreground">{template.description}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {rooms} ambientes · {Math.round(templateArea(template))} m²
                  {template.floors.length > 1 ? ` · ${template.floors.length} pavimentos` : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void apply()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar planta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
