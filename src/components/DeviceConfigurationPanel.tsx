import { useEffect, useId, useRef, useState } from "react";
import { catalogPresentation } from "@/lib/catalog-presentation";
import CatalogReferenceDetails from "./CatalogReferenceDetails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import {
  applianceSourceLabel,
  formatCurrency,
  formatNumber,
  STATE_TARIFFS,
} from "@/lib/energy";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import type { CatalogDevice } from "../../backend/src/modules/catalog/catalog.types";
import { normalizeEnergyProfile, referenceLabel } from "../../backend/src/modules/catalog/reference";
import { cyclesInMonth } from "../../backend/src/modules/calculations/usage";
import { selectEnergyMethod } from "../../backend/src/modules/calculations/decision";
import { toast } from "@/components/ui/use-toast";

export interface DiscoveredDevice {
  id: string;
  name: string;
  brand: string;
  model?: string;
  capabilities?: string[];
  power?: number;
  counterKWh?: number;
  energyInterval?: { kWh: number; startAt: string; endAt: string };
}
interface Props {
  device?: CatalogDevice;
  integration?: DiscoveredDevice;
  initialAppliance?: Appliance;
  onAddAppliance: (input: ApplianceInput) => Promise<unknown>;
  onSaved: () => void;
  onBusyChange?: (busy: boolean) => void;
}
export default function DeviceConfigurationPanel({
  device: suppliedDevice,
  integration,
  initialAppliance,
  onAddAppliance,
  onSaved,
  onBusyChange,
}: Props) {
  const { preferences, updatePreferences } = useUserPreferences();
  const [matchedDevice, setMatchedDevice] = useState<CatalogDevice | undefined>();
  const [matches, setMatches] = useState<Array<{ device: CatalogDevice; confidence: string }>>([]);
  const [matchError, setMatchError] = useState(false);
  const device = suppliedDevice || matchedDevice;
  const description = device ? catalogPresentation(device) : undefined;
  useEffect(() => {
    if (!integration?.brand || !integration?.model || initialAppliance) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ brand: integration.brand, model: integration.model, region: "BR" });
    apiRequest<{ candidates: Array<{ device: CatalogDevice; confidence: string }> }>(`/api/device-catalog/match?${query}`, {
      signal: controller.signal, skipErrorToast: true,
    }).then(data => { if (!controller.signal.aborted) setMatches(data.candidates); })
      .catch(() => { if (!controller.signal.aborted) setMatchError(true); });
    return () => controller.abort();
  }, [integration?.id, integration?.brand, integration?.model, initialAppliance]);
  const id = useId();
  const savedProfile = normalizeEnergyProfile(initialAppliance?.energyProfile ||
    device?.energyProfile || { method: "POWER_TIME" as const });
  const referenceDevice = initialAppliance?.catalogSnapshot || device;
  const referenceProfile = initialAppliance?.estimateByUsage && referenceDevice
    ? normalizeEnergyProfile(referenceDevice.energyProfile) : savedProfile;
  const canCustomize = referenceProfile.method === "REFERENCE_PERIOD" && (!initialAppliance || Boolean(initialAppliance.catalogSnapshot));
  const operatingEntry = referenceDevice?.profiles?.find(entry => entry.profile.method === "POWER_TIME");
  const operatingProfile = operatingEntry?.profile;
  const documentedPower = operatingProfile?.method === "POWER_TIME" ? operatingProfile.typicalPowerW : undefined;
  const hasDocumentedPower = typeof documentedPower === "number" && Number.isFinite(documentedPower) && documentedPower > 0 && documentedPower <= 100000
    && referenceDevice?.verified === true && operatingEntry?.source.type !== "WATTSTATUS_GENERIC" && operatingEntry?.source.official !== false;
  const [estimateByUsage, setEstimateByUsage] = useState(initialAppliance ? initialAppliance.estimateByUsage ?? false : canCustomize && hasDocumentedPower);
  const profile = estimateByUsage ? normalizeEnergyProfile(operatingProfile || { method: "POWER_TIME" }) : referenceProfile;
  const decision = selectEnergyMethod(profile, integration?.energyInterval);
  const [monitoringOnly, setMonitoringOnly] = useState(initialAppliance?.monitoringOnly ?? Boolean(integration &&
    (decision.method === "LIVE_MEASUREMENT" || integration.counterKWh !== undefined)));
  const [name, setName] = useState(
    initialAppliance?.name || description?.title.slice(0, 160) || integration?.name || "",
  );
  const [power, setPower] = useState(
    String(
      (initialAppliance?.power || undefined) ??
        (profile.method === "POWER_TIME" ? profile.typicalPowerW : operatingProfile?.method === "POWER_TIME" ? operatingProfile.typicalPowerW : undefined) ?? "",
    ),
  );
  const [timeUnit, setTimeUnit] = useState<"HOURS" | "MINUTES">(device?.subcategory === "Micro-ondas" ? "MINUTES" : "HOURS");
  const [hours, setHours] = useState(String(device?.subcategory === "Micro-ondas" ? (initialAppliance?.usageHours ?? .25) * 60 : initialAppliance?.usageHours ?? 4));
  const [days, setDays] = useState(String(initialAppliance?.days ?? 30));
  const [cycles, setCycles] = useState(
    String(initialAppliance?.cyclesPerWeek ?? initialAppliance?.cyclesPerMonth ?? 4),
  );
  const [cyclePeriod, setCyclePeriod] = useState<"WEEK" | "MONTH">(initialAppliance?.cyclesPerMonth != null && initialAppliance.cyclesPerWeek == null ? "MONTH" : "WEEK");
  const [technicalEdit, setTechnicalEdit] = useState(false);
  const [standbyEnabled, setStandbyEnabled] = useState(initialAppliance ? initialAppliance.standbyEnabled ?? false : profile.method === "POWER_TIME" && profile.standbyPowerW !== undefined);
  const [room, setRoom] = useState(initialAppliance?.room || "");
  const [tariff, setTariff] = useState(
    initialAppliance?.tariff || preferences.tariffState || "",
  );
  const [rate, setRate] = useState(
    String(initialAppliance?.tariffValue ?? preferences.tariffValue ?? ""),
  );
  const [result, setResult] = useState<{
    consumptionKWh: number;
    cost: number;
    signature: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!tariff && preferences.tariffState) setTariff(preferences.tariffState);
    if (!rate && preferences.tariffValue)
      setRate(String(preferences.tariffValue));
  }, [preferences.tariffState, preferences.tariffValue, tariff, rate]);
  const input: ApplianceInput = {
    name: name.trim(),
    power: !monitoringOnly && profile.method === "POWER_TIME" ? Number(power) : 0,
    usageHours: monitoringOnly ? 0 : timeUnit === "MINUTES" ? Number(hours) / 60 : Number(hours),
    days: Number(days),
    tariff,
    tariffValue: Number(rate),
    energyProfile: profile,
    cyclesPerMonth: profile.method === "PER_CYCLE" && cyclePeriod === "MONTH" ? Number(cycles) : undefined,
    cyclesPerWeek: profile.method === "PER_CYCLE" && cyclePeriod === "WEEK" ? Number(cycles) : undefined,
    standbyEnabled,
    monitoringOnly,
    ...(canCustomize ? { estimateByUsage } : {}),
    room: room.trim(),
    catalogDeviceId: initialAppliance?.catalogDeviceId || device?.id,
    ...(integration
      ? {
          integrationProvider: "smartthings",
          integrationDeviceId: integration.id,
        }
      : {}),
  };
  const signature = JSON.stringify(input);
  const valid =
    name.trim().length >= 2 &&
    name.trim().length <= 160 &&
    room.length <= 80 &&
    tariff.length === 2 &&
    Number.isFinite(Number(rate)) &&
    Number(rate) > 0 &&
    days !== "" &&
    Number.isInteger(Number(days)) &&
    Number(days) >= 1 &&
    Number(days) <= 31 &&
    hours !== "" &&
    Number.isFinite(Number(hours)) &&
    Number(hours) >= 0 &&
    input.usageHours <= 24 &&
    (monitoringOnly || profile.method !== "POWER_TIME" ||
      (power !== "" && Number(power) > 0 && Number(power) <= 100000)) &&
    (monitoringOnly || profile.method !== "PER_CYCLE" ||
      (cycles !== "" &&
        Number.isInteger(Number(cycles)) &&
        Number(cycles) >= 0 &&
        Number(cycles) <= (cyclePeriod === "WEEK" ? 230 : 1000)));
  useEffect(() => {
    if (!valid || monitoringOnly) {
      setResult(null);
      setCalculating(false);
      return;
    }
    const controller = new AbortController();
    setCalculating(true);
    const timer = setTimeout(() => {
      apiRequest<{ result: { consumptionKWh: number; cost: number } }>(
        "/api/calculations/appliance",
        {
          method: "POST",
          body: signature,
          signal: controller.signal,
          skipErrorToast: true,
        },
      )
        .then(({ result: value }) => {
          if (!controller.signal.aborted) {
            setResult({ ...value, signature });
            setError(null);
          }
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setError(
              failure instanceof Error
                ? failure.message
                : "Não foi possível calcular.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setCalculating(false);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [signature, valid, monitoringOnly]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || lock.current) {
      setError(
        "Confira nome, uso, potência/ciclos e tarifa antes de continuar.",
      );
      return;
    }
    lock.current = true;
    setSaving(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await onAddAppliance(input);
      // Saving preferences must not turn an already-created appliance into a failed creation.
      await updatePreferences({
        tariffState: tariff,
        tariffValue: Number(rate),
      }).catch(() => undefined);
      toast({
        title: initialAppliance ? "Aparelho atualizado" : "Aparelho adicionado",
        description: `${input.name} foi salvo.`,
      });
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
      onBusyChange?.(false);
    }
  };
  const field = (
    key: string,
    label: string,
    value: string,
    change: (value: string) => void,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        value={value}
        onChange={(event) => change(event.target.value)}
        className="h-11"
        required
        {...props}
      />
    </div>
  );
  const source =
    (initialAppliance ? { ...initialAppliance, energyProfile: profile, power: Number(power), estimateByUsage } : undefined) ||
    (device
      ? { source: device.source, energyProfile: profile, power: Number(power), estimateByUsage }
      : { integrationProvider: "smartthings" });
  const referenceSource = referenceDevice?.source || initialAppliance?.source;
  return (
    <Card className="min-w-0 border-l-4 border-l-energy-green-light">
      <CardHeader>
        <CardTitle className="text-lg">Configuração do aparelho</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={saving} className="min-w-0 space-y-4">
            {integration && <>
              <p className="text-xs">Dispositivo conectado via Samsung SmartThings. Nenhum modelo é associado automaticamente.</p>
              {integration.power !== undefined && <p>Potência atual: {formatNumber(integration.power)} W (não é energia acumulada).</p>}
              {matchError && <p role="status">Não foi possível procurar modelos. Você pode continuar sem associação.</p>}
              {matches.length > 0 && <div className="space-y-2">
                <Label htmlFor={`${id}-match`}>Encontramos possíveis modelos: confirme modelo, tensão e região</Label>
                <select id={`${id}-match`} className="h-11 w-full rounded-md border bg-background px-2" value={matchedDevice?.id || ""}
                  onChange={event => {
                    const candidate = matches.find(row => row.device.id === event.target.value)?.device;
                    setMatchedDevice(candidate);
                    if (!candidate) setPower("");
                    if (candidate?.energyProfile.method === "POWER_TIME") {
                      setPower(String(candidate.energyProfile.typicalPowerW ?? ""));
                      setStandbyEnabled(candidate.energyProfile.standbyPowerW !== undefined);
                    }
                  }}>
                  <option value="">Nenhum destes / sem associação</option>
                  {matches.map(row => <option key={row.device.id} value={row.device.id}>{catalogPresentation(row.device).title} · Modelo: {row.device.model} · {row.device.variant?.voltage || "tensão não informada"} · {row.confidence}</option>)}
                </select>
              </div>}
            </>}
            <p className="break-words font-medium">
              {description?.title ||
                integration?.name ||
                initialAppliance?.name}
            </p>
            {device && <>
              <p className="break-words text-xs text-muted-foreground">{device.model ? `Modelo: ${device.model}` : "Perfil genérico"}</p>
              {description && description.details.length > 0 && <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {description.details.map(detail => <li key={detail}>{detail}</li>)}
              </ul>}
              {description?.manufacturerUrl && <a className="inline-block text-xs text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={description.manufacturerUrl} target="_blank" rel="noopener noreferrer">Ver produto no fabricante</a>}
            </>}
            {decision.method === "LIVE_MEASUREMENT" && <p className="rounded-md border border-green-500 p-3 text-sm">
              Medição real prioritária · Samsung SmartThings: {formatNumber(decision.interval.kWh)} kWh no intervalo informado abaixo.
              A referência do catálogo permanece apenas como estimativa separada, nunca somada à medição.
            </p>}
            {decision.method === "UNAVAILABLE" && !monitoringOnly && profile.method === "POWER_TIME" && !(Number(power) > 0) &&
              <p className="text-sm text-muted-foreground">{referenceDevice && referenceProfile.method === "POWER_TIME" && referenceProfile.typicalPowerW === undefined
                ? "Não encontramos potência elétrica oficial nem referência de ensaio para este modelo. Informe os watts da etiqueta para calcular pelo tempo de uso."
                : "Informe a potência elétrica em watts para calcular pelo tempo de uso. Potência atual isolada não é uma medição de energia."}</p>}
            {(integration?.counterKWh !== undefined || decision.method === "LIVE_MEASUREMENT" || initialAppliance?.monitoringOnly) &&
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={monitoringOnly} onChange={event => setMonitoringOnly(event.target.checked)} />
                Usar somente monitoramento real, sem estimativa mensal</label>}
            <p className="text-xs text-muted-foreground">
              Fonte: {applianceSourceLabel(source)}
              {device?.isGeneric
                ? " · Valor típico estimado; confira a etiqueta."
                : ""}
            </p>
            {device && (
              <p className="text-xs text-muted-foreground">
                Região: {device.region} · Verificado em{" "}
                {new Date(device.source.verifiedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                {!device.verified
                  ? " (perfil não oficial)"
                  : " (referência de ensaio, não medição da sua casa)"}
              </p>
            )}
            {device?.energyProfile.method === "POWER_TIME" && device.energyProfile.standbyPowerW !== undefined &&
              <p className="text-xs">Standby: {formatNumber(device.energyProfile.standbyPowerW)} W. Não equivale à potência operacional.</p>}
            {device?.variant?.voltage && <p className="text-xs text-muted-foreground">Tensão informada na fonte: {device.variant.voltage} V. Confira a compatibilidade com sua instalação.</p>}
            {referenceSource && <CatalogReferenceDetails source={referenceSource} profile={referenceDevice?.energyProfile || referenceProfile} />}
            {field("name", "Nome do aparelho", name, setName, {
              maxLength: 160,
            })}
            {!monitoringOnly && canCustomize && <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-estimate`}>Como estimar o consumo</Label>
              <select id={`${id}-estimate`} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={estimateByUsage ? "USAGE" : "REFERENCE"} onChange={event => {
                setEstimateByUsage(event.target.value === "USAGE");
                setTechnicalEdit(false);
                setStandbyEnabled(event.target.value === "USAGE" && operatingProfile?.method === "POWER_TIME" && operatingProfile.standbyPowerW !== undefined);
                setError(null);
              }}>
                <option value="USAGE">Calcular pelo meu uso</option>
                <option value="REFERENCE">Usar referência de ensaio</option>
              </select>
              <p className="text-xs text-muted-foreground">{estimateByUsage
                ? "A estimativa usa potência elétrica × tempo de uso × dias. Informe a potência em watts da etiqueta se ela não estiver disponível; BTU/h não é potência elétrica. A referência original permanece preservada."
                : `${hasDocumentedPower ? "" : "Não encontramos potência elétrica oficial em watts para este modelo. Sugerimos a referência de ensaio; você pode escolher ‘Calcular pelo meu uso’ e informar os watts da etiqueta. "}É uma referência média padronizada de ensaio, usada apenas para comparação. O consumo real pode variar conforme o seu uso e as condições do aparelho.`}</p>
            </div>}
            {!monitoringOnly && profile.method === "POWER_TIME" && (
              <>
                {profile.typicalPowerW !== undefined && !technicalEdit ? <div className="space-y-1">
                  <p className="text-sm">Potência do modelo: <strong>{formatNumber(Number(power))} W</strong></p>
                  <button type="button" className="text-xs underline" onClick={() => setTechnicalEdit(true)}>Ajuste técnico opcional</button>
                </div> : field("power", "Potência estimada (W)", power, setPower, {
                  type: "number",
                  min: 0.01,
                  max: 100000,
                  step: "any",
                })}
                <p className="text-xs text-muted-foreground">
                  Editável somente para o seu aparelho. Confira a etiqueta; a
                  biblioteca não será alterada.
                </p>
                <label className="block text-sm">Unidade de uso diário
                  <select className="ml-2 rounded border bg-background p-2" value={timeUnit} onChange={event => {
                    const next = event.target.value as "HOURS" | "MINUTES";
                    setHours(String(next === "MINUTES" ? Number(hours) * 60 : Number(hours) / 60)); setTimeUnit(next);
                  }}><option value="HOURS">Horas</option><option value="MINUTES">Minutos</option></select>
                </label>
                {field("hours", timeUnit === "MINUTES" ? "Minutos por dia" : "Horas por dia", hours, setHours, {
                  type: "number",
                  min: 0,
                  max: timeUnit === "MINUTES" ? 1440 : 24,
                  step: "any",
                })}
                {field("days", "Dias por mês", days, setDays, {
                  type: "number",
                  min: 1,
                  max: 31,
                  step: 1,
                })}
                {profile.standbyPowerW !== undefined && <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={standbyEnabled} onChange={event => setStandbyEnabled(event.target.checked)} />
                  Fica em standby nas horas restantes do dia ({formatNumber(profile.standbyPowerW)} W)
                </label>}
              </>
            )}
            {!monitoringOnly && profile.method === "REFERENCE_PERIOD" && (
              <p className="rounded-md bg-muted p-3 text-sm">
                Referência de ensaio:{" "}
                {referenceLabel(profile)}. Não é
                escalada por horas ou dias; condições reais podem variar.
                {profile.testBasis && <span className="mt-2 block">{profile.testBasis}</span>}
              </p>
            )}
            {!monitoringOnly && profile.method === "PER_CYCLE" && (
              <>
                <p className="text-sm">
                  Referência: {formatNumber(profile.energyPerCycleKwh, 3)}{" "}
                  kWh/ciclo. Confira tensão e programa de lavagem do modelo.
                </p>
                <p className="text-xs text-muted-foreground">Um ciclo é uma execução completa do programa, como uma lavagem; kWh/ciclo indica a energia medida ou estimada por execução.</p>
                <label className="block text-sm">Frequência de uso
                  <select className="ml-2 rounded border bg-background p-2" value={cyclePeriod} onChange={event => {
                    setCyclePeriod(event.target.value as "WEEK" | "MONTH"); setCycles("");
                  }}><option value="WEEK">Por semana</option><option value="MONTH">Por mês</option></select>
                </label>
                {field("cycles", cyclePeriod === "WEEK" ? "Ciclos por semana" : "Ciclos por mês", cycles, setCycles, {
                  type: "number",
                  min: 0,
                  max: cyclePeriod === "WEEK" ? 230 : 1000,
                  step: 1,
                })}
                {cyclePeriod === "WEEK" && <p className="text-xs text-muted-foreground">Média derivada: {formatNumber(cyclesInMonth(undefined, Number(cycles)))} ciclos/mês (semanas × 52 ÷ 12).</p>}
              </>
            )}
            {field("room", "Ambiente (opcional)", room, setRoom, {
              required: false,
              maxLength: 80,
              placeholder: "Ex.: Sala",
            })}
            <div className="space-y-2">
              <Label htmlFor={`${id}-state`}>Estado</Label>
              <select
                id={`${id}-state`}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={tariff}
                required
                onChange={(event) => {
                  setTariff(event.target.value);
                  setRate(String(STATE_TARIFFS[event.target.value] ?? ""));
                }}
              >
                <option value="">Selecione seu estado</option>
                {Object.keys(STATE_TARIFFS).map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>
            {field("rate", "Sua tarifa (R$/kWh)", rate, setRate, {
              type: "number",
              min: 0.0001,
              step: "any",
            })}
            <p className="text-xs text-muted-foreground">
              Use a tarifa da sua conta. O valor sugerido por estado é apenas
              referência.
            </p>
            {integration?.counterKWh !== undefined && (
              <p className="rounded-md border p-3 text-sm">
                Medição real disponível · Samsung SmartThings: contador acumulado de{" "}
                {formatNumber(integration.counterKWh)} kWh. Não equivale ao mês;
                os intervalos medidos continuam no histórico SmartThings e não
                são substituídos pela estimativa abaixo.
              </p>
            )}
            {integration?.energyInterval && <p className="rounded-md border p-3 text-sm">Medição real · Samsung SmartThings: {formatNumber(integration.energyInterval.kWh)} kWh
              no intervalo {new Date(integration.energyInterval.startAt).toLocaleString("pt-BR")} a {new Date(integration.energyInterval.endAt).toLocaleString("pt-BR")}. Não é consumo mensal estimado.</p>}
            <div
              role="status"
              aria-live="polite"
              className="rounded-md bg-muted/50 p-4 text-sm"
            >
              {monitoringOnly ? (
                "Sem estimativa mensal. Acompanhe os intervalos medidos no histórico SmartThings; contador acumulado isolado não determina o consumo do mês."
              ) : calculating ? (
                "Calculando estimativa…"
              ) : result?.signature === signature ? (
                <>
                  <p className="font-medium">
                    Consumo estimado: {formatNumber(result.consumptionKWh)}{" "}
                    kWh/mês
                  </p>
                  <p>Custo estimado: {formatCurrency(result.cost)}</p>
                </>
              ) : (
                "Preencha os dados de uso e tarifa para visualizar a estimativa."
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={!valid || saving}
              className="min-h-11 w-full"
            >
              {saving
                ? "Salvando…"
                : initialAppliance
                  ? "Salvar alterações"
                  : "Adicionar ao WattStatus"}
            </Button>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
