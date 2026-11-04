import { useId, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { SimulationItem, SimulationUsage } from "../../../backend/src/modules/simulations/simulations.types";
import { referenceLabel } from "../../../backend/src/modules/catalog/reference";
import { cyclesInMonth } from "../../../backend/src/modules/calculations/usage";
import CatalogReferenceDetails from "@/components/CatalogReferenceDetails";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogIcon, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { applianceSourceLabel, formatNumber } from "@/lib/energy";
import { effectiveSimulationProfile, simulationItemProfiles, simulationItemUsage } from "@/lib/simulation-item";

interface Props {
  item: SimulationItem;
  onSave: (quantity: number, usage: SimulationUsage) => void;
  onCancel: () => void;
}

const numeric = (value: string) => value.trim() === "" ? NaN : Number(value.replace(",", "."));
const positivePower = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100000;

export default function SimulationItemEditor({ item, onSave, onCancel }: Props) {
  const id = useId();
  const initial = simulationItemUsage(item);
  const profiles = simulationItemProfiles(item);
  const initialProfile = effectiveSimulationProfile(item);
  const knownPower = positivePower(initial.power) ? initial.power
    : profiles.referenceProfile ? profiles.documentedPower
    : initialProfile?.method === "POWER_TIME" ? initialProfile.typicalPowerW : undefined;
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [estimateByUsage, setEstimateByUsage] = useState(initial.estimateByUsage ?? false);
  const [power, setPower] = useState(positivePower(knownPower) ? String(knownPower) : "");
  const [timeUnit, setTimeUnit] = useState<"HOURS" | "MINUTES">(item.catalogSnapshot?.subcategory === "Micro-ondas" ? "MINUTES" : "HOURS");
  const [time, setTime] = useState(String((initial.usageHours ?? 4) * (timeUnit === "MINUTES" ? 60 : 1)));
  const [days, setDays] = useState(String(initial.days ?? 30));
  const [cyclePeriod, setCyclePeriod] = useState<"WEEK" | "MONTH">(initial.cyclesPerWeek != null ? "WEEK" : "MONTH");
  const [cycles, setCycles] = useState(String(initial.cyclesPerWeek ?? initial.cyclesPerMonth ?? 0));
  const [standbyEnabled, setStandbyEnabled] = useState(initial.standbyEnabled ?? false);
  const [submitted, setSubmitted] = useState(false);
  const profile = effectiveSimulationProfile(item, { estimateByUsage }) ?? { method: "POWER_TIME" as const };
  const hours = numeric(time) / (timeUnit === "MINUTES" ? 60 : 1);
  const errors: Record<string, string> = {};
  if (!Number.isInteger(numeric(quantity)) || numeric(quantity) < 1 || numeric(quantity) > 1000) errors.quantity = "Informe uma quantidade inteira entre 1 e 1.000.";
  if (profile.method === "POWER_TIME") {
    if (!positivePower(numeric(power))) errors.power = "Informe uma potência maior que zero e de até 100.000 W.";
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) errors.time = timeUnit === "MINUTES" ? "Informe entre 0 e 1.440 minutos por dia." : "Informe entre 0 e 24 horas por dia.";
    if (!Number.isInteger(numeric(days)) || numeric(days) < 1 || numeric(days) > 31) errors.days = "Informe entre 1 e 31 dias por mês.";
  }
  if (profile.method === "PER_CYCLE" && (!Number.isInteger(numeric(cycles)) || numeric(cycles) < 0 || numeric(cycles) > (cyclePeriod === "WEEK" ? 230 : 1000))) {
    errors.cycles = `Informe uma quantidade inteira entre 0 e ${cyclePeriod === "WEEK" ? "230" : "1.000"} ciclos.`;
  }
  const field = (key: string, label: string, value: string, onChange: (value: string) => void, bounds: { min: number; max: number; step: number | "any" }) => (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} type="number" inputMode={bounds.step === 1 ? "numeric" : "decimal"} value={value}
        min={bounds.min} max={bounds.max} step={bounds.step} required className="h-12 rounded-xl"
        aria-invalid={submitted && Boolean(errors[key])} aria-describedby={submitted && errors[key] ? `${id}-${key}-error` : undefined}
        onChange={(event) => onChange(event.target.value)} />
      {submitted && errors[key] && <p id={`${id}-${key}-error`} className="text-sm text-destructive">{errors[key]}</p>}
    </div>
  );
  const save = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    const usage: SimulationUsage = {
      ...(profiles.referenceProfile ? { estimateByUsage } : {}),
      ...(profile.method === "POWER_TIME" ? { power: numeric(power), usageHours: hours, days: numeric(days),
        standbyEnabled: profile.standbyPowerW !== undefined && standbyEnabled } : {}),
      ...(profile.method === "PER_CYCLE" ? cyclePeriod === "WEEK"
        ? { cyclesPerWeek: numeric(cycles) } : { cyclesPerMonth: numeric(cycles) } : {}),
    };
    onSave(numeric(quantity), usage);
  };
  const source = item.sourceDetails ?? item.catalogSnapshot?.source;
  const sourceLabel = source ? applianceSourceLabel({ source, energyProfile: profile, power: numeric(power), estimateByUsage: Boolean(profiles.referenceProfile && estimateByUsage) }) : "Dados informados pelo usuário";
  const referenceSource = item.catalogSnapshot?.source ?? source;
  const measurementDate = item.measurementContext && new Date(item.measurementContext.capturedAt);

  return <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
    <DialogContent className="appliance-flow-theme sim-editor sm:max-w-xl">
      <DialogHeader>
        <DialogIcon><Pencil /></DialogIcon>
        <DialogTitle>Editar uso no cenário</DialogTitle>
        <DialogDescription>{item.name}. As alterações ficam somente nesta simulação.</DialogDescription>
      </DialogHeader>
      <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-5">
        {field("quantity", "Quantidade", quantity, setQuantity, { min: 1, max: 1000, step: 1 })}
        {profiles.referenceProfile && item.canEstimateByUsage && <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-method`}>Como estimar o consumo</Label>
          <Select value={estimateByUsage ? "USAGE" : "REFERENCE"} onValueChange={(value) => {
            setEstimateByUsage(value === "USAGE");
            if (value === "USAGE" && !power && profiles.documentedPower) setPower(String(profiles.documentedPower));
          }}>
            <SelectTrigger id={`${id}-method`} className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="REFERENCE">Usar referência de ensaio</SelectItem>
              <SelectItem value="USAGE">Calcular pelo meu uso</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </div>}
        {profile.method === "REFERENCE_PERIOD" && <Alert>
          <AlertDescription className="flex flex-col gap-2">
            <p>{referenceLabel(profile)}</p>
            <p>A referência é padronizada e não é multiplicada por horas ou dias. A quantidade de aparelhos continua sendo aplicada.</p>
            {profile.testBasis && <p>{profile.testBasis}</p>}
          </AlertDescription>
        </Alert>}
        {profile.method === "POWER_TIME" && <>
          {!positivePower(knownPower) && <Alert><AlertDescription>Este aparelho não possui potência operacional suficiente para esta estimativa. Informe os watts da etiqueta somente para este cenário. BTU/h não é potência elétrica.</AlertDescription></Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("power", "Potência estimada (W)", power, setPower, { min: .01, max: 100000, step: "any" })}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-time-unit`}>Unidade de uso diário</Label>
              <Select value={timeUnit} onValueChange={(value) => {
                const next = value as "HOURS" | "MINUTES";
                if (next === timeUnit) return;
                if (time.trim() && Number.isFinite(numeric(time))) setTime(String(next === "MINUTES" ? numeric(time) * 60 : numeric(time) / 60));
                setTimeUnit(next);
              }}>
                <SelectTrigger id={`${id}-time-unit`} className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="HOURS">Horas</SelectItem><SelectItem value="MINUTES">Minutos</SelectItem></SelectGroup></SelectContent>
              </Select>
            </div>
            {field("time", timeUnit === "MINUTES" ? "Minutos por dia" : "Horas por dia", time, setTime, { min: 0, max: timeUnit === "MINUTES" ? 1440 : 24, step: "any" })}
            {field("days", "Dias por mês", days, setDays, { min: 1, max: 31, step: 1 })}
          </div>
          {profile.standbyPowerW !== undefined && <div className="flex items-start gap-2">
            <Checkbox id={`${id}-standby`} checked={standbyEnabled} onCheckedChange={(value) => setStandbyEnabled(value === true)} />
            <Label htmlFor={`${id}-standby`} className="text-sm leading-relaxed">Fica em standby nas horas restantes do dia ({formatNumber(profile.standbyPowerW)} W)</Label>
          </div>}
        </>}
        {profile.method === "PER_CYCLE" && <>
          <p className="text-sm text-muted-foreground">Referência: {formatNumber(profile.energyPerCycleKwh, 3)} kWh/ciclo. Um ciclo é uma execução completa do programa, como uma lavagem.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-cycle-period`}>Frequência de uso</Label>
              <Select value={cyclePeriod} onValueChange={(value) => { setCyclePeriod(value as "WEEK" | "MONTH"); setCycles(""); }}>
                <SelectTrigger id={`${id}-cycle-period`} className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value="WEEK">Por semana</SelectItem><SelectItem value="MONTH">Por mês</SelectItem></SelectGroup></SelectContent>
              </Select>
            </div>
            {field("cycles", cyclePeriod === "WEEK" ? "Ciclos por semana" : "Ciclos por mês", cycles, setCycles, { min: 0, max: cyclePeriod === "WEEK" ? 230 : 1000, step: 1 })}
          </div>
          {cyclePeriod === "WEEK" && Number.isFinite(numeric(cycles)) && <p className="text-xs text-muted-foreground">Média derivada: {formatNumber(cyclesInMonth(undefined, numeric(cycles)))} ciclos/mês (semanas × 52 ÷ 12).</p>}
        </>}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Origem dos dados</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-xs">
            <p>{sourceLabel}</p>
            {referenceSource && <CatalogReferenceDetails source={referenceSource} profile={profiles.referenceProfile ?? profile} />}
            {item.measurementContext && <p className="text-muted-foreground">
              {item.measurementContext.kind === "interval" && item.measurementContext.consumptionKWh !== undefined
                ? `Medição anterior de ${formatNumber(item.measurementContext.consumptionKWh)} kWh`
                : "Há histórico de medição deste aparelho"}
              {measurementDate && Number.isFinite(measurementDate.getTime()) ? `, registrado em ${measurementDate.toLocaleDateString("pt-BR")}` : ""}.
              {" "}Esse histórico é apenas contexto e não é uma previsão de consumo.
            </p>}
          </CardContent>
        </Card>
        {submitted && Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-destructive">Confira os campos indicados antes de aplicar ao cenário.</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit">Aplicar ao cenário</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
