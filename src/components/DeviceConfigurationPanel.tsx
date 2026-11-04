import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
import RegionalTariffHint from "./RegionalTariffHint";
import { useRegionalTariffDefault } from "@/hooks/useRegionalTariff";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import type { CatalogDevice } from "../../backend/src/modules/catalog/catalog.types";
import { normalizeEnergyProfile, referenceLabel } from "../../backend/src/modules/catalog/reference";
import { cyclesInMonth } from "../../backend/src/modules/calculations/usage";
import { selectEnergyMethod } from "../../backend/src/modules/calculations/decision";
import { toast } from "@/components/ui/use-toast";
import ApplianceSetupSummary from "./ApplianceSetupSummary";

export interface DeviceConfigurationDraft {
  name: string; power: string; timeUnit: "HOURS" | "MINUTES"; hours: string; days: string;
  cycles: string; cyclePeriod: "WEEK" | "MONTH"; technicalEdit: boolean; standbyEnabled: boolean;
  room: string; tariff: string; rate: string; estimateByUsage: boolean; monitoringOnly: boolean;
  matchedDevice?: CatalogDevice;
}

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
  draft?: DeviceConfigurationDraft;
  onDraftChange?: (draft: DeviceConfigurationDraft) => void;
  placementFields?: ReactNode;
}
export default function DeviceConfigurationPanel({
  device: suppliedDevice,
  integration,
  initialAppliance,
  onAddAppliance,
  onSaved,
  onBusyChange,
  draft,
  onDraftChange,
  placementFields,
}: Props) {
  const { preferences, updatePreferences } = useUserPreferences();
  const [matchedDevice, setMatchedDevice] = useState<CatalogDevice | undefined>(draft?.matchedDevice);
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
  const [estimateByUsage, setEstimateByUsage] = useState(draft?.estimateByUsage ?? (initialAppliance ? initialAppliance.estimateByUsage ?? false : canCustomize && hasDocumentedPower));
  const profile = estimateByUsage ? normalizeEnergyProfile(operatingProfile || { method: "POWER_TIME" }) : referenceProfile;
  const decision = selectEnergyMethod(profile, integration?.energyInterval);
  const [monitoringOnly, setMonitoringOnly] = useState(draft?.monitoringOnly ?? initialAppliance?.monitoringOnly ?? Boolean(integration &&
    (decision.method === "LIVE_MEASUREMENT" || integration.counterKWh !== undefined)));
  const [name, setName] = useState(
    draft?.name ?? (initialAppliance?.name || description?.title.slice(0, 160) || integration?.name || ""),
  );
  const [power, setPower] = useState(
    draft?.power ?? String(
      (initialAppliance?.power || undefined) ??
        (profile.method === "POWER_TIME" ? profile.typicalPowerW : operatingProfile?.method === "POWER_TIME" ? operatingProfile.typicalPowerW : undefined) ?? "",
    ),
  );
  const [timeUnit, setTimeUnit] = useState<"HOURS" | "MINUTES">(draft?.timeUnit ?? (device?.subcategory === "Micro-ondas" ? "MINUTES" : "HOURS"));
  const [hours, setHours] = useState(draft?.hours ?? String(device?.subcategory === "Micro-ondas" ? (initialAppliance?.usageHours ?? .25) * 60 : initialAppliance?.usageHours ?? 4));
  const [days, setDays] = useState(draft?.days ?? String(initialAppliance?.days ?? 30));
  const [cycles, setCycles] = useState(
    draft?.cycles ?? String(initialAppliance?.cyclesPerWeek ?? initialAppliance?.cyclesPerMonth ?? 4),
  );
  const [cyclePeriod, setCyclePeriod] = useState<"WEEK" | "MONTH">(draft?.cyclePeriod ?? (initialAppliance?.cyclesPerMonth != null && initialAppliance.cyclesPerWeek == null ? "MONTH" : "WEEK"));
  const [technicalEdit, setTechnicalEdit] = useState(draft?.technicalEdit ?? false);
  const [standbyEnabled, setStandbyEnabled] = useState(draft?.standbyEnabled ?? (initialAppliance ? initialAppliance.standbyEnabled ?? false : profile.method === "POWER_TIME" && profile.standbyPowerW !== undefined));
  const [room, setRoom] = useState(draft?.room ?? initialAppliance?.room ?? "");
  const [tariff, setTariff] = useState(
    draft?.tariff ?? initialAppliance?.tariff ?? preferences.tariffState ?? "",
  );
  const [rate, setRate] = useState(
    draft?.rate ?? String(initialAppliance?.tariffValue ?? preferences.tariffValue ?? ""),
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
  const tariffTouched = useRef(Boolean(initialAppliance || draft));
  useEffect(() => {
    onDraftChange?.({ name, power, timeUnit, hours, days, cycles, cyclePeriod, technicalEdit, standbyEnabled,
      room, tariff, rate, estimateByUsage, monitoringOnly, matchedDevice });
  }, [name, power, timeUnit, hours, days, cycles, cyclePeriod, technicalEdit, standbyEnabled, room, tariff, rate, estimateByUsage, monitoringOnly, matchedDevice, onDraftChange]);
  useEffect(() => {
    if (tariffTouched.current) return;
    if (!tariff && preferences.tariffState) setTariff(preferences.tariffState);
    if (!rate && preferences.tariffValue)
      setRate(String(preferences.tariffValue));
  }, [preferences.tariffState, preferences.tariffValue, tariff, rate]);
  const applyRegionalTariff = (suggestion: { state: string; rate: number }) => {
    tariffTouched.current = true; setTariff(suggestion.state); setRate(String(suggestion.rate));
  };
  useRegionalTariffDefault(applyRegionalTariff, () => !initialAppliance && !tariffTouched.current);
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
    <div className="flex flex-col gap-2">
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
  return <Card className="appliance-flow-theme appliance-setup min-w-0">
    <CardHeader className="pb-6"><CardTitle className="text-2xl">Ajuste o uso à sua rotina</CardTitle><p className="mt-2 text-sm text-muted-foreground">Confira o aparelho e preencha somente o que muda na sua casa.</p></CardHeader>
    <CardContent>
      <form onSubmit={save}>
        <fieldset disabled={saving} className="appliance-setup-layout min-w-0">
          <div className="appliance-setup-fields">
            <div className="appliance-selected-product"><p className="text-xs text-muted-foreground">Modelo selecionado</p><h3 className="break-words text-lg font-semibold">{description?.title || integration?.name || initialAppliance?.name}</h3>
              <p className="text-xs text-muted-foreground">{device?.brand ? `${device.brand} · ` : ''}{device?.model ? `Modelo: ${device.model} · ` : ''}{applianceSourceLabel(source)}</p>
            </div>
            {integration && <section className="appliance-field-section"><h3>Dispositivo conectado</h3><p className="text-xs text-muted-foreground">Samsung SmartThings. Nenhum modelo é associado automaticamente.</p>
              {integration.counterKWh === undefined && !integration.energyInterval && <p role="status" className="text-sm text-muted-foreground">Este dispositivo não forneceu uma medição de energia compatível. Para estimar o consumo, informe os dados da etiqueta e sua rotina de uso.</p>}
              {integration.power !== undefined && <p className="text-sm">Potência atual: {formatNumber(integration.power)} W (não é energia acumulada).</p>}
              {matchError && <p role="status" className="text-sm">Não foi possível procurar modelos. Você pode continuar sem associação.</p>}
              {matches.length > 0 && <div className="flex flex-col gap-2"><Label htmlFor={`${id}-match`}>Possíveis modelos: confira modelo, tensão e região</Label><select id={`${id}-match`} className="appliance-control" value={matchedDevice?.id || ''} onChange={event => {
                const candidate = matches.find(row => row.device.id === event.target.value)?.device; setMatchedDevice(candidate);
                if (!candidate) setPower('');
                if (candidate?.energyProfile.method === 'POWER_TIME') { setPower(String(candidate.energyProfile.typicalPowerW ?? '')); setStandbyEnabled(candidate.energyProfile.standbyPowerW !== undefined); }
              }}><option value="">Nenhum destes / sem associação</option>{matches.map(row => <option key={row.device.id} value={row.device.id}>{catalogPresentation(row.device).title} · Modelo: {row.device.model} · {row.device.variant?.voltage || 'tensão não informada'} · {row.confidence}</option>)}</select></div>}
            </section>}
            {decision.method === 'LIVE_MEASUREMENT' && <p className="rounded-lg bg-muted p-4 text-sm">Medição real prioritária · Samsung SmartThings: {formatNumber(decision.interval.kWh)} kWh no intervalo informado. A estimativa é separada e nunca é somada à medição.</p>}
            {(integration?.counterKWh !== undefined || decision.method === 'LIVE_MEASUREMENT' || initialAppliance?.monitoringOnly) && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={monitoringOnly} onChange={event => setMonitoringOnly(event.target.checked)} className="mt-1" />Usar somente monitoramento real, sem estimativa mensal</label>}
            <section className="appliance-field-section"><h3>Identifique o aparelho</h3>
              {field('name','Nome do aparelho',name,setName,{maxLength:160,placeholder:'Ex.: Ar-condicionado da sala'})}
              {placementFields || field('room','Ambiente (opcional)',room,setRoom,{required:false,maxLength:80,placeholder:'Ex.: Sala do RH'})}
            </section>
            {!monitoringOnly && <section className="appliance-field-section"><h3>Uso e consumo</h3>
              {canCustomize && <div className="flex flex-col gap-2"><Label htmlFor={`${id}-estimate`}>Como estimar o consumo</Label><select id={`${id}-estimate`} className="appliance-control" value={estimateByUsage ? 'USAGE' : 'REFERENCE'} onChange={event => {
                setEstimateByUsage(event.target.value === 'USAGE');setTechnicalEdit(false);setStandbyEnabled(event.target.value === 'USAGE' && operatingProfile?.method === 'POWER_TIME' && operatingProfile.standbyPowerW !== undefined);setError(null);
              }}><option value="USAGE">Calcular pelo meu uso</option><option value="REFERENCE">Usar referência de ensaio</option></select>
                <p className="text-sm text-muted-foreground">{estimateByUsage ? 'Ajuste a potência e o tempo para refletir seu uso.' : 'Referência média padronizada: horas e dias não alteram esse valor.'}</p>
                <details className="appliance-small-detail"><summary>Entenda a escolha do método</summary><p>{estimateByUsage
                  ? 'A estimativa usa potência elétrica × tempo de uso × dias. Informe a potência em watts da etiqueta se ela não estiver disponível; BTU/h não é potência elétrica. A referência original permanece preservada.'
                  : `${hasDocumentedPower ? '' : 'Não encontramos potência elétrica oficial em watts para este modelo. Sugerimos a referência de ensaio; você pode escolher Calcular pelo meu uso e informar os watts da etiqueta. '}É uma referência média padronizada de ensaio, usada apenas para comparação. O consumo real pode variar conforme o seu uso e as condições do aparelho.`}</p></details>
              </div>}
              {profile.method === 'POWER_TIME' && <>
                {decision.method === 'UNAVAILABLE' && !(Number(power) > 0) && <p className="text-sm text-muted-foreground">{referenceDevice && referenceProfile.method === 'POWER_TIME' && referenceProfile.typicalPowerW === undefined ? 'Não encontramos potência elétrica oficial nem referência de ensaio para este modelo. Informe os watts da etiqueta para calcular pelo tempo de uso.' : 'Informe a potência elétrica em watts para calcular pelo tempo de uso. Potência atual isolada não é uma medição de energia.'}</p>}
                {profile.typicalPowerW !== undefined && !technicalEdit ? <div className="rounded-lg bg-muted p-4"><p className="text-sm">Potência do modelo: <strong>{formatNumber(Number(power))} W</strong></p><button type="button" className="mt-2 text-xs text-primary underline underline-offset-4" onClick={() => setTechnicalEdit(true)}>Ajuste técnico opcional</button></div>
                  : field('power','Potência estimada (W)',power,setPower,{type:'number',min:.01,max:100000,step:'any',placeholder:'Ex.: 1200'})}
                <div className="flex flex-col gap-2"><Label htmlFor={`${id}-time-unit`}>Unidade de uso diário</Label><select id={`${id}-time-unit`} className="appliance-control" value={timeUnit} onChange={event => { const next = event.target.value as 'HOURS' | 'MINUTES';setHours(String(next === 'MINUTES' ? Number(hours) * 60 : Number(hours) / 60));setTimeUnit(next); }}><option value="HOURS">Horas</option><option value="MINUTES">Minutos</option></select></div>
                <div className="grid gap-4 sm:grid-cols-2">{field('hours',timeUnit === 'MINUTES' ? 'Minutos por dia' : 'Horas por dia',hours,setHours,{type:'number',min:0,max:timeUnit === 'MINUTES' ? 1440 : 24,step:'any',placeholder:timeUnit === 'MINUTES' ? 'Ex.: 30' : 'Ex.: 6'})}{field('days','Dias por mês',days,setDays,{type:'number',min:1,max:31,step:1,placeholder:'Ex.: 22'})}</div>
                {profile.standbyPowerW !== undefined && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={standbyEnabled} onChange={event => setStandbyEnabled(event.target.checked)} className="mt-1" />Fica em standby nas horas restantes do dia ({formatNumber(profile.standbyPowerW)} W)</label>}
              </>}
              {profile.method === 'REFERENCE_PERIOD' && <div className="rounded-lg bg-muted p-4 text-sm"><p className="font-medium">Referência de ensaio</p><p className="mt-2">{referenceLabel(profile)}. Não é escalada por horas ou dias; condições reais podem variar.</p>{profile.testBasis && <p className="mt-2 text-xs text-muted-foreground">{profile.testBasis}</p>}</div>}
              {profile.method === 'PER_CYCLE' && <>
                <p className="text-sm">Referência: <strong>{formatNumber(profile.energyPerCycleKwh,3)} kWh/ciclo</strong>.</p><p className="text-xs text-muted-foreground">Um ciclo é uma execução completa do programa, como uma lavagem. A frequência determina o consumo mensal.</p>
                <div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor={`${id}-cycle-period`}>Frequência de uso</Label><select id={`${id}-cycle-period`} className="appliance-control" value={cyclePeriod} onChange={event => {setCyclePeriod(event.target.value as 'WEEK' | 'MONTH');setCycles('');}}><option value="WEEK">Por semana</option><option value="MONTH">Por mês</option></select></div>
                  {field('cycles',cyclePeriod === 'WEEK' ? 'Ciclos por semana' : 'Ciclos por mês',cycles,setCycles,{type:'number',min:0,max:cyclePeriod === 'WEEK' ? 230 : 1000,step:1,placeholder:'Ex.: 4'})}</div>
                {cyclePeriod === 'WEEK' && <p className="text-xs text-muted-foreground">Média derivada: {formatNumber(cyclesInMonth(undefined,Number(cycles)))} ciclos/mês (semanas × 52 ÷ 12).</p>}
              </>}
            </section>}
            <section className="appliance-field-section"><h3>Tarifa da sua conta</h3><div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-state`}>Estado</Label><select id={`${id}-state`} className="appliance-control" value={tariff} required onChange={event => {tariffTouched.current=true;setTariff(event.target.value);setRate(String(STATE_TARIFFS[event.target.value] ?? ''));}}><option value="">Selecione seu estado</option>{Object.keys(STATE_TARIFFS).map(state => <option key={state} value={state}>{state}</option>)}</select></div>
              {field('rate','Sua tarifa (R$/kWh)',rate,value => {tariffTouched.current=true;setRate(value);},{type:'number',min:.0001,step:'any',placeholder:'Ex.: 0,82'})}
            </div><RegionalTariffHint onApply={applyRegionalTariff} /><p className="text-xs text-muted-foreground">A sugestão por estado é uma referência. Use a tarifa da sua conta para maior precisão.</p></section>
            <details className="appliance-origin"><summary>Especificações e origem dos dados</summary><div>
              {description && description.details.length > 0 && <ul className="flex flex-col gap-1 text-xs text-muted-foreground">{description.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}
              {description?.manufacturerUrl && <a className="text-xs text-primary underline underline-offset-4" href={description.manufacturerUrl} target="_blank" rel="noopener noreferrer">Ver produto no fabricante</a>}
              <p className="text-xs text-muted-foreground">Fonte: {applianceSourceLabel(source)}{device?.isGeneric ? ' · Valor típico estimado; confira a etiqueta.' : ''}</p>
              {device && <p className="text-xs text-muted-foreground">Região: {device.region} · Verificado em {new Date(device.source.verifiedAt).toLocaleDateString('pt-BR',{timeZone:'UTC'})}{!device.verified ? ' (perfil não oficial)' : ' (referência de ensaio, não medição da sua casa)'}</p>}
              {device?.energyProfile.method === 'POWER_TIME' && device.energyProfile.standbyPowerW !== undefined && <p className="text-xs">Standby: {formatNumber(device.energyProfile.standbyPowerW)} W. Não equivale à potência operacional.</p>}
              {device?.variant?.voltage && <p className="text-xs text-muted-foreground">Tensão informada na fonte: {device.variant.voltage} V. Confira a compatibilidade com sua instalação.</p>}
              {referenceSource && <CatalogReferenceDetails source={referenceSource} profile={referenceDevice?.energyProfile || referenceProfile} />}
              {integration?.counterKWh !== undefined && <p className="text-sm">Medição real disponível · Samsung SmartThings: contador acumulado de {formatNumber(integration.counterKWh)} kWh. Não equivale ao mês; os intervalos medidos continuam no histórico SmartThings.</p>}
              {integration?.energyInterval && <p className="text-sm">Medição real · Samsung SmartThings: {formatNumber(integration.energyInterval.kWh)} kWh no intervalo {new Date(integration.energyInterval.startAt).toLocaleString('pt-BR')} a {new Date(integration.energyInterval.endAt).toLocaleString('pt-BR')}. Não é consumo mensal estimado.</p>}
              <p className="text-xs text-muted-foreground">Ajustes técnicos valem somente para o seu aparelho. A biblioteca e sua referência original permanecem preservadas.</p>
            </div></details>
          </div>
          <ApplianceSetupSummary name={name} kind={monitoringOnly ? 'Acompanhe os intervalos medidos no histórico.' : profile.method === 'REFERENCE_PERIOD' ? 'Referência de ensaio, convertida para o mês.' : profile.method === 'PER_CYCLE' ? 'Energia por ciclo × frequência de uso.' : 'Potência × horas × dias, incluindo standby quando habilitado.'} result={!calculating && result?.signature === signature ? result : null} tariff={Number(rate)} source={device ? `${applianceSourceLabel(source)} · ${device.region}` : 'Dispositivo SmartThings'} assumptions={profile.method === 'POWER_TIME' ? `${formatNumber(Number(power))} W, ${hours} ${timeUnit === 'MINUTES' ? 'min' : 'h'} por dia, ${days} dias no mês.${standbyEnabled ? ' Inclui standby.' : ''}` : profile.method === 'PER_CYCLE' ? `${cycles} ciclos por ${cyclePeriod === 'WEEK' ? 'semana' : 'mês'}.` : 'Referência padronizada; horas e dias não alteram o valor.'} loading={calculating} monitoringOnly={monitoringOnly} editing={Boolean(initialAppliance)} error={error}>
            <Button type="submit" disabled={!valid || saving}>{saving ? 'Salvando…' : initialAppliance ? 'Salvar alterações' : 'Adicionar ao WattStatus'}</Button>
          </ApplianceSetupSummary>
          <div className="appliance-mobile-save"><Button type="submit" disabled={!valid || saving}>{saving ? 'Salvando…' : initialAppliance ? 'Salvar alterações' : 'Adicionar ao WattStatus'}</Button></div>
        </fieldset>
      </form>
    </CardContent>
  </Card>;
}
