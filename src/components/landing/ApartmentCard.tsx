import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BuildingUnit } from "./buildingDemo";

export function ApartmentCard({ unit, onClose, anchored = false }: { unit: BuildingUnit; onClose: () => void; anchored?: boolean }) {
  return <div data-apartment-card className="relative rounded-xl border border-white/15 bg-neutral-900/85 p-3 text-left font-normal text-white shadow-lg backdrop-blur-md" style={{ width: 212, maxWidth: "calc(100vw - 32px)" }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
    {anchored && <span aria-hidden="true" className="pointer-events-none absolute h-px bg-emerald-300/60" style={{ left: "var(--leader-x, 50%)", top: "var(--leader-y, 100%)", width: "var(--leader-length, 18px)", transform: "rotate(var(--leader-angle, 1.5708rad))", transformOrigin: "left center" }} />}
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">Apto {unit.id}</p>
      <Button type="button" variant="ghost" size="icon" aria-label="Fechar detalhes do apartamento" onClick={onClose} className="size-6 rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-emerald-300 [&_svg]:size-3.5"><X aria-hidden="true" /></Button>
    </div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs leading-4">
      <dt className="text-white/60">Aparelhos</dt><dd className="text-right tabular-nums">{unit.appliances}</dd>
      <dt className="text-white/60">Consumo</dt><dd className="text-right tabular-nums">{unit.energy} kWh/mês</dd>
      <dt className="text-white/60">Custo</dt><dd className="text-right tabular-nums">{(unit.energy * 0.89).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd>
      <dt className="text-white/60">Luzes</dt><dd className="flex items-center justify-end gap-1"><span className="size-1.5 rounded-full" style={{ background: unit.lit ? "var(--l-accent, #45e0a4)" : "#9b9b9b" }} aria-hidden="true" />{unit.lit ? "acesas" : "apagadas"}</dd>
    </dl>
    <p className="mt-2 text-[10px] leading-4 text-white/50">Dados demonstrativos</p>
  </div>;
}
