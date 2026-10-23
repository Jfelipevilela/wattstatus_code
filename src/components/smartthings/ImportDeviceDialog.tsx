import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATE_TARIFFS, formatCurrency, formatNumber } from "@/lib/energy";
import { deviceKind, type DeviceKind, type OverviewItem } from "./types";

// Starting points only; the user confirms or edits them before importing.
const TYPICAL_POWER_W: Record<DeviceKind, number | null> = {
  climate: 1000,
  tv: 100,
  light: 10,
  plug: null,
  other: null,
};
const TYPICAL_HOURS: Record<DeviceKind, number> = { climate: 8, tv: 4, light: 6, plug: 4, other: 4 };

export interface ImportValues {
  name: string;
  power: number;
  usageHours: number;
  days: number;
  tariffState: string;
  tariffValue: number;
  measuredConsumptionKWh?: number;
}

interface Props {
  item: OverviewItem | null;
  defaultState?: string;
  defaultTariff?: number;
  importing: boolean;
  onCancel: () => void;
  onConfirm: (values: ImportValues) => void;
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ImportDeviceDialog({ item, defaultState, defaultTariff, importing, onCancel, onConfirm }: Props) {
  const [name, setName] = useState("");
  const [power, setPower] = useState("");
  const [hours, setHours] = useState("");
  const [days, setDays] = useState("30");
  const [state, setState] = useState("SP");
  const [tariff, setTariff] = useState("");

  const reported = item?.status?.state.powerW ?? null;
  const energy = item?.status?.state.energyKWh ?? null;

  useEffect(() => {
    if (!item) return;
    const kind = deviceKind(item.device.capabilities);
    const initialState = defaultState && STATE_TARIFFS[defaultState] ? defaultState : "SP";
    setName(item.device.name);
    setPower(String(reported && reported > 0 ? Math.round(reported) : TYPICAL_POWER_W[kind] ?? ""));
    setHours(String(TYPICAL_HOURS[kind]));
    setDays("30");
    setState(initialState);
    setTariff(String(defaultTariff ?? STATE_TARIFFS[initialState]));
  }, [item, reported, defaultState, defaultTariff]);

  const values = {
    power: Number(power),
    usageHours: Number(hours.replace(",", ".")),
    days: Number(days),
    tariffValue: Number(tariff.replace(",", ".")),
  };
  const valid =
    name.trim().length >= 2 &&
    values.power > 0 &&
    values.usageHours > 0 &&
    values.usageHours <= 24 &&
    Number.isInteger(values.days) &&
    values.days >= 1 &&
    values.days <= 31 &&
    values.tariffValue > 0;
  const monthlyKWh = valid ? (values.power * values.usageHours * values.days) / 1000 : null;

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar {item?.device.name}</DialogTitle>
          <DialogDescription>
            Confirme os dados de uso para estimar o consumo. O vínculo com o SmartThings fica salvo.
          </DialogDescription>
        </DialogHeader>
        <form
          id="import-device"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onConfirm({
              name: name.trim(),
              ...values,
              tariffState: state,
              measuredConsumptionKWh: energy !== null && energy > 0 ? energy : undefined,
            });
          }}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="import-name">Nome</Label>
            <Input id="import-name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-power">Potência (W)</Label>
            <Input
              id="import-power"
              className="h-11"
              inputMode="numeric"
              value={power}
              onChange={(e) => setPower(e.target.value.replace(/[^\d]/g, ""))}
              aria-describedby="import-power-help"
            />
            <p id="import-power-help" className="text-xs text-muted-foreground">
              {reported && reported > 0
                ? `Lida do dispositivo agora: ${formatNumber(reported, 0)} W.`
                : "O dispositivo não informou potência agora. Use o valor da etiqueta."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-hours">Horas de uso por dia</Label>
            <Input
              id="import-hours"
              className="h-11"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/[^\d.,]/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-days">Dias de uso no mês</Label>
            <Input
              id="import-days"
              className="h-11"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-state">Estado da tarifa</Label>
            <select
              id="import-state"
              className={selectClass}
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setTariff(String(STATE_TARIFFS[e.target.value]));
              }}
            >
              {Object.keys(STATE_TARIFFS).map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="import-tariff">Tarifa (R$/kWh)</Label>
            <Input
              id="import-tariff"
              className="h-11"
              inputMode="decimal"
              value={tariff}
              onChange={(e) => setTariff(e.target.value.replace(/[^\d.,]/g, ""))}
            />
          </div>
        </form>
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          {monthlyKWh !== null ? (
            <>
              Estimativa: <strong>{formatNumber(monthlyKWh, 1)} kWh</strong> ·{" "}
              <strong>{formatCurrency(monthlyKWh * values.tariffValue)}</strong> por mês
            </>
          ) : (
            "Preencha potência, horas (até 24), dias (1 a 31) e tarifa."
          )}
          {energy !== null && energy > 0 && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Leitura do medidor ({formatNumber(energy, 1)} kWh) também será salva.
            </span>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={importing}>
            Cancelar
          </Button>
          <Button type="submit" form="import-device" disabled={!valid || importing}>
            {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Importar aparelho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
