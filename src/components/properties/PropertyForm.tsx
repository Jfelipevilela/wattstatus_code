import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATE_TARIFFS } from "@/lib/energy";
import { cn } from "@/lib/utils";
import type { PropertyInput } from "@/hooks/useProperties";
import { PROPERTY_TYPES, type Property, type PropertyType } from "@/types/property";
import { PROPERTY_COLORS, PROPERTY_ICONS } from "./propertyVisual";


const selectClass =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  initial?: Property | null;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (input: PropertyInput) => void;
  onCancel?: () => void;
}

export function PropertyForm({ initial, submitting, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("house");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [color, setColor] = useState(PROPERTY_COLORS[0]);
  const [tariff, setTariff] = useState("");

  useEffect(() => {
    setName(initial?.name ?? "");
    setType(initial?.type ?? "house");
    setCity(initial?.city ?? "");
    setState(initial?.state ?? initial?.tariffState ?? "");
    setColor(initial?.color ?? PROPERTY_COLORS[0]);
    setTariff(initial?.tariffValue ? String(initial.tariffValue) : "");
  }, [initial]);

  const tariffValue = tariff ? Number(tariff.replace(",", ".")) : null;
  const valid = name.trim().length >= 1 && (tariffValue === null || (tariffValue > 0 && tariffValue <= 10));

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSubmit({
          name: name.trim(),
          type,
          city: city.trim() || null,
          state: state || null,
          color,
          tariffState: state || null,
          tariffValue,
          timezone: initial?.timezone ?? "America/Sao_Paulo",
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Tipo</legend>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(PROPERTY_TYPES) as PropertyType[]).map((value) => {
            const Icon = PROPERTY_ICONS[value];
            return (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  type === value ? "border-energy-green-light bg-energy-green-light/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {PROPERTY_TYPES[value]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="property-name">Nome</Label>
        <Input id="property-name" className="h-11 rounded-xl" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casa de férias" maxLength={80} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div className="space-y-2">
          <Label htmlFor="property-city">Cidade (opcional)</Label>
          <Input id="property-city" className="h-11 rounded-xl" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="property-state">Estado</Label>
          <select id="property-state" className={selectClass} value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">—</option>
            {Object.keys(STATE_TARIFFS).map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="property-tariff">Tarifa padrão do imóvel (R$/kWh, opcional)</Label>
        <Input
          id="property-tariff"
          className="h-11 rounded-xl"
          inputMode="decimal"
          value={tariff}
          onChange={(e) => setTariff(e.target.value.replace(/[^\d.,]/g, ""))}
          placeholder={state ? `Referência ${state}: ${STATE_TARIFFS[state]}` : "Ex.: 0,82"}
          aria-describedby="property-tariff-help"
        />
        <p id="property-tariff-help" className="text-xs text-muted-foreground">
          Usada como sugestão ao cadastrar aparelhos aqui. Cada aparelho guarda a própria tarifa. Valores de referência não são a tarifa
          oficial vigente.
        </p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Cor de identificação</legend>
        <div className="flex gap-2">
          {PROPERTY_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Cor ${value}`}
              aria-pressed={color === value}
              onClick={() => setColor(value)}
              className={cn("h-9 w-9 rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none", color === value && "ring-2 ring-foreground")}
              style={{ background: value }}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" className="rounded-full" disabled={!valid || submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
