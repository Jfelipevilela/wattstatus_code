import { useEffect, useId, useRef, useState } from "react";
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
  const profile = normalizeEnergyProfile(initialAppliance?.energyProfile ||
    device?.energyProfile || { method: "POWER_TIME" as const });
  const [name, setName] = useState(
    initialAppliance?.name || device?.displayName || integration?.name || "",
  );
  const [power, setPower] = useState(
    String(
      initialAppliance?.power ??
        (profile.method === "POWER_TIME"
          ? (profile.typicalPowerW ?? integration?.power ?? "")
          : ""),
    ),
  );
  const [hours, setHours] = useState(String(initialAppliance?.usageHours ?? 4));
  const [days, setDays] = useState(String(initialAppliance?.days ?? 30));
  const [cycles, setCycles] = useState(
    String(initialAppliance?.cyclesPerMonth ?? 12),
  );
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
    power: profile.method === "POWER_TIME" ? Number(power) : 0,
    usageHours: Number(hours),
    days: Number(days),
    tariff,
    tariffValue: Number(rate),
    energyProfile: profile,
    cyclesPerMonth: profile.method === "PER_CYCLE" ? Number(cycles) : undefined,
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
    Number(hours) <= 24 &&
    (profile.method !== "POWER_TIME" ||
      (power !== "" && Number(power) > 0 && Number(power) <= 100000)) &&
    (profile.method !== "PER_CYCLE" ||
      (cycles !== "" &&
        Number.isInteger(Number(cycles)) &&
        Number(cycles) >= 0 &&
        Number(cycles) <= 1000));
  useEffect(() => {
    if (!valid) {
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
  }, [signature, valid]);
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
    initialAppliance ||
    (device
      ? { source: device.source, energyProfile: profile, power: Number(power) }
      : { integrationProvider: "smartthings" });
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
                    if (!candidate) setPower(String(integration.power ?? ""));
                    if (candidate?.energyProfile.method === "POWER_TIME") setPower(String(candidate.energyProfile.typicalPowerW ?? integration.power ?? ""));
                  }}>
                  <option value="">Nenhum destes / sem associação</option>
                  {matches.map(row => <option key={row.device.id} value={row.device.id}>{row.device.displayName} · {row.device.variant?.voltage || "tensão não informada"} · {row.confidence}</option>)}
                </select>
              </div>}
            </>}
            <p className="break-words font-medium">
              {device?.displayName ||
                integration?.name ||
                initialAppliance?.name}
            </p>
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
            {device?.source.metrics && <details className="text-xs"><summary>Origem dos valores energéticos</summary>
              <ul>{Object.entries(device.source.metrics).map(([metric, url]) => <li key={metric}>{metric}: <a href={url} target="_blank" rel="noreferrer">Consultar fonte desta métrica</a></li>)}</ul>
            </details>}
            {field("name", "Nome do aparelho", name, setName, {
              maxLength: 160,
            })}
            {profile.method === "POWER_TIME" && (
              <>
                {field("power", "Potência estimada (W)", power, setPower, {
                  type: "number",
                  min: 0.01,
                  max: 100000,
                  step: "any",
                })}
                <p className="text-xs text-muted-foreground">
                  Editável somente para o seu aparelho. Confira a etiqueta; a
                  biblioteca não será alterada.
                </p>
                {field("hours", "Horas por dia", hours, setHours, {
                  type: "number",
                  min: 0,
                  max: 24,
                  step: "any",
                })}
                {field("days", "Dias por mês", days, setDays, {
                  type: "number",
                  min: 1,
                  max: 31,
                  step: 1,
                })}
              </>
            )}
            {profile.method === "REFERENCE_PERIOD" && (
              <p className="rounded-md bg-muted p-3 text-sm">
                Referência de ensaio:{" "}
                {referenceLabel(profile)}. Não é
                escalada por horas ou dias; condições reais podem variar.
              </p>
            )}
            {profile.method === "PER_CYCLE" && (
              <>
                <p className="text-sm">
                  Referência: {formatNumber(profile.energyPerCycleKwh, 3)}{" "}
                  kWh/ciclo. Confira tensão e programa de lavagem do modelo.
                </p>
                {field("cycles", "Ciclos por mês", cycles, setCycles, {
                  type: "number",
                  min: 0,
                  max: 1000,
                  step: 1,
                })}
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
              {calculating ? (
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
