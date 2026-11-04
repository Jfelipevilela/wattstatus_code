import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import RegionalTariffHint from "./RegionalTariffHint";
import { useRegionalTariffDefault } from "@/hooks/useRegionalTariff";
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import { STATE_TARIFFS, formatNumber, formatCurrency } from "@/lib/energy";
import ApplianceSetupSummary from "./ApplianceSetupSummary";
import { ApplianceQuantityContext } from "./appliance-quantity";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Informe um nome com pelo menos 2 caracteres.")
      .max(160, "Use no máximo 160 caracteres."),
    power: z
      .number({ invalid_type_error: "Informe a potência." })
      .finite()
      .positive("A potência deve ser maior que zero.")
      .max(100000, "A potência máxima é 100.000 W."),
    hours: z
      .number({ invalid_type_error: "Informe as horas." })
      .int()
      .min(0)
      .max(24, "O máximo é 24 horas por dia."),
    minutes: z
      .number({ invalid_type_error: "Informe os minutos." })
      .int()
      .min(0)
      .max(59, "Use de 0 a 59 minutos."),
    days: z
      .number({ invalid_type_error: "Informe os dias." })
      .int("Informe dias inteiros.")
      .min(1, "Informe pelo menos 1 dia.")
      .max(31, "O máximo é 31 dias."),
    tariff: z
      .string()
      .refine(
        (value) => Boolean(STATE_TARIFFS[value]),
        "Selecione seu estado.",
      ),
    tariffValue: z.number({ invalid_type_error: "Informe a tarifa em R$/kWh." }).finite().positive("A tarifa deve ser maior que zero."),
  })
  .refine(
    (value) =>
      value.hours * 60 + value.minutes > 0 &&
      value.hours * 60 + value.minutes <= 1440,
    {
      message: "Informe entre 1 minuto e 24 horas por dia.",
      path: ["minutes"],
    },
  );
type Values = z.infer<typeof schema>;
export type ManualApplianceDraft = Partial<Values>;
const models = [
  { name: "Geladeira", power: 150, hours: 24, minutes: 0, days: 30 },
  { name: "Ar-condicionado", power: 1400, hours: 6, minutes: 0, days: 30 },
  { name: 'TV LED 40"', power: 80, hours: 4, minutes: 0, days: 30 },
  { name: "Computador", power: 300, hours: 8, minutes: 0, days: 30 },
  { name: "Micro-ondas", power: 1200, hours: 0, minutes: 30, days: 30 },
  { name: "Máquina de lavar", power: 1000, hours: 1, minutes: 0, days: 30 },
  { name: "Chuveiro elétrico", power: 5500, hours: 0, minutes: 30, days: 30 },
  { name: "Ventilador", power: 60, hours: 8, minutes: 0, days: 30 },
];
interface Props {
  onAddAppliance: (input: ApplianceInput) => Promise<Appliance | void>;
  initialAppliance?: Appliance;
  onSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
  draft?: ManualApplianceDraft;
  onDraftChange?: (draft: ManualApplianceDraft) => void;
  placementFields?: ReactNode;
}
export default function ApplianceCalculator({
  onAddAppliance,
  initialAppliance,
  onSaved,
  onBusyChange,
  draft,
  onDraftChange,
  placementFields,
}: Props) {
  const { token } = useAuth();
  const { preferences, updatePreferences } = useUserPreferences();
  const contextQuantity = useContext(ApplianceQuantityContext);
  const quantity = initialAppliance ? 1 : contextQuantity;
  const id = useId();
  const tariffTouched = useRef(Boolean(initialAppliance || draft));
  const initialMinutes = Math.round((initialAppliance?.usageHours || 0) * 60);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialAppliance?.name || "",
      power: initialAppliance?.power,
      hours: Math.floor(initialMinutes / 60),
      minutes: initialMinutes % 60,
      days: initialAppliance?.days || 30,
      tariff: initialAppliance?.tariff || preferences.tariffState || "",
      tariffValue: initialAppliance
        ? initialAppliance.tariffValue || STATE_TARIFFS[initialAppliance.tariff]
        : preferences.tariffValue || undefined,
      ...draft,
    },
  });
  useEffect(() => {
    if (!tariffTouched.current && !initialAppliance && preferences.tariffState && !form.getValues("tariff")) {
      form.setValue("tariff", preferences.tariffState);
      if (preferences.tariffValue) form.setValue("tariffValue", preferences.tariffValue);
    }
  }, [initialAppliance, preferences.tariffState, preferences.tariffValue, form]);
  const applyRegionalTariff = (suggestion: { state: string; rate: number }) => {
    tariffTouched.current = true;
    form.setValue("tariff", suggestion.state, { shouldValidate: true });
    form.setValue("tariffValue", suggestion.rate, { shouldValidate: true });
  };
  useRegionalTariffDefault(applyRegionalTariff, () => !initialAppliance && !tariffTouched.current);
  const [result, setResult] = useState<{
    consumptionKWh: number;
    cost: number;
    signature: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"simulate" | "save" | null>(null);
  const busy = useRef(false);
  const values = form.watch();
  useEffect(() => { onDraftChange?.(values); }, [onDraftChange, values]);
  const signature = JSON.stringify(values);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    const parsed = schema.safeParse(JSON.parse(signature));
    if (!parsed.success) { setResult(null); setPreviewLoading(false); setPreviewError(null); return; }
    const controller = new AbortController();
    setPreviewLoading(true); setPreviewError(null);
    const timer = setTimeout(() => {
      const value = parsed.data;
      apiRequest<{ result: { consumptionKWh: number; cost: number } }>('/api/calculations/appliance', {
        method: 'POST', signal: controller.signal, skipErrorToast: true,
        body: JSON.stringify({ name: value.name, power: value.power, usageHours: value.hours + value.minutes / 60, days: value.days, tariff: value.tariff, tariffValue: value.tariffValue }),
      }, token || undefined).then(response => {
        if (!controller.signal.aborted) setResult({ ...response.result, signature });
      }).catch(failure => {
        if (!controller.signal.aborted) { setResult(null); setPreviewError(failure instanceof Error ? failure.message : 'Não foi possível calcular a prévia.'); }
      }).finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [signature, token]);
  const selectClass =
    "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const run = async (values: Values, simulate: boolean) => {
    if (busy.current) return;
    busy.current = true;
    onBusyChange?.(true);
    setAction(simulate ? "simulate" : "save");
    setError(null);
    const input: ApplianceInput = {
      name: values.name,
      power: values.power,
      usageHours: values.hours + values.minutes / 60,
      days: values.days,
      tariff: values.tariff,
      tariffValue: values.tariffValue,
    };
    try {
      if (simulate) {
        const response = await apiRequest<{
          result: { consumptionKWh: number; cost: number };
        }>(
          "/api/calculations/appliance",
          { method: "POST", body: JSON.stringify(input), skipErrorToast: true },
          token || undefined,
        );
        setResult({
          ...response.result,
          signature: JSON.stringify(form.getValues()),
        });
      } else {
        await onAddAppliance(input);
        await updatePreferences({ tariffState: values.tariff, tariffValue: values.tariffValue }).catch(() => undefined);
        toast({
          title: initialAppliance
            ? "Aparelho atualizado"
            : quantity > 1 ? `${quantity} aparelhos adicionados` : "Aparelho adicionado",
          description: quantity > 1 ? `${values.name} 1 a ${quantity} foram salvos na sua lista.` : `${values.name} foi salvo na sua lista.`,
        });
        if (onSaved) onSaved();
        else {
          form.reset({
            name: "",
            power: undefined,
            hours: 0,
            minutes: 0,
            days: 30,
            tariff: values.tariff,
            tariffValue: values.tariffValue,
          });
          setResult(null);
          form.setFocus("name");
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      busy.current = false;
      onBusyChange?.(false);
      setAction(null);
    }
  };
  const fieldError = (name: keyof Values) =>
    form.formState.errors[name] && (
      <p
        id={`${id}-${name}-error`}
        role="alert"
        className="text-sm text-destructive dark:text-red-400"
      >
        {form.formState.errors[name]?.message}
      </p>
    );
  const accessibility = (name: keyof Values) => ({
    id: `${id}-${name}`,
    "aria-invalid": Boolean(form.formState.errors[name]),
    "aria-describedby": `${id}-${name}-error${name === "power" ? ` ${id}-power-help` : ""}`,
  });
  return <Card className="appliance-flow-theme appliance-setup min-w-0">
    {!initialAppliance && <CardHeader className="pb-6"><CardTitle className="text-2xl">Cadastre com os dados da etiqueta</CardTitle><p className="mt-2 text-sm text-muted-foreground">Dê um nome ao aparelho e conte como ele faz parte da sua rotina.</p></CardHeader>}
    <CardContent>
      <form noValidate onSubmit={form.handleSubmit(values => run(values,false))}>
        <fieldset disabled={action !== null} className="appliance-setup-layout min-w-0">
          <div className="appliance-setup-fields">
            <section className="appliance-field-section"><h3>Identifique o aparelho</h3>
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-name`}>Nome do aparelho</Label><Input {...form.register('name')} {...accessibility('name')} placeholder="Ex.: Geladeira da cozinha" maxLength={160} />{fieldError('name')}</div>
              {placementFields}
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-power`}>Potência (W)</Label><Input {...form.register('power',{valueAsNumber:true})} {...accessibility('power')} type="number" inputMode="decimal" min="0" step="any" placeholder="Ex.: 150" />
                <p id={`${id}-power-help`} className="text-xs text-muted-foreground">Use os watts da etiqueta ou do manual. Potência (W) é diferente de consumo (kWh).</p>{fieldError('power')}</div>
              {!initialAppliance && <details className="appliance-origin"><summary>Precisa de um exemplo para começar?</summary><div><Label htmlFor={`${id}-model`}>Preencher com um aparelho comum</Label><select id={`${id}-model`} className={selectClass} defaultValue="" onChange={event => {
                const model = models[Number(event.target.value)]; if(model) form.reset({...model,tariff:form.getValues('tariff'),tariffValue:form.getValues('tariffValue')});setResult(null);event.target.value='';
              }}><option value="" disabled>Escolha um exemplo (opcional)</option>{models.map((model,index) => <option key={model.name} value={index}>{model.name}</option>)}</select><p className="text-xs text-muted-foreground">Valores de exemplo, não especificações oficiais. Ajuste conforme sua etiqueta. Aparelhos com ciclos podem variar a potência durante o uso.</p></div></details>}
            </section>
            <section className="appliance-field-section"><h3>Sua rotina de uso</h3>
              <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm font-medium">Tempo de uso por dia</legend><div className="grid grid-cols-2 gap-4">{(['hours','minutes'] as const).map(name => <div key={name} className="flex flex-col gap-2"><Label htmlFor={`${id}-${name}`}>{name === 'hours' ? 'Horas' : 'Minutos'}</Label><Input {...form.register(name,{valueAsNumber:true})} {...accessibility(name)} type="number" inputMode="numeric" min="0" max={name === 'hours' ? 24 : 59} placeholder={name === 'hours' ? 'Ex.: 6' : 'Ex.: 30'} />{fieldError(name)}</div>)}</div></fieldset>
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-days`}>Dias de uso por mês</Label><Input {...form.register('days',{valueAsNumber:true})} {...accessibility('days')} type="number" inputMode="numeric" min="1" max="31" placeholder="Ex.: 22" />{fieldError('days')}</div>
              <p className="text-xs text-muted-foreground">O cálculo combina potência, tempo diário e dias no mês. Use a média da sua rotina.</p>
            </section>
            <section className="appliance-field-section"><h3>Tarifa da sua conta</h3><div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-tariff`}>Estado</Label><select {...form.register('tariff',{onChange:event => {tariffTouched.current=true;const rate=STATE_TARIFFS[event.target.value];if(rate)form.setValue('tariffValue',rate,{shouldValidate:true});}})} {...accessibility('tariff')} className={selectClass}><option value="">Selecione seu estado</option>{Object.entries(STATE_TARIFFS).map(([state,rate]) => <option key={state} value={state}>{state} — referência: {formatCurrency(rate)}/kWh</option>)}</select>{fieldError('tariff')}</div>
              <div className="flex flex-col gap-2"><Label htmlFor={`${id}-tariffValue`}>Sua tarifa (R$/kWh)</Label><Input {...form.register('tariffValue',{valueAsNumber:true,onChange:()=>{tariffTouched.current=true;}})} {...accessibility('tariffValue')} type="number" inputMode="decimal" min="0.0001" step="any" placeholder="Ex.: 0,82" />{fieldError('tariffValue')}</div>
            </div><RegionalTariffHint onApply={applyRegionalTariff} /><p className="text-xs text-muted-foreground">Referências por estado, sem atualização em tempo real. Sua conta considera distribuidora, impostos e bandeiras.</p></section>
            {initialAppliance?.measuredConsumptionKWh > 0 && <p className="text-sm text-muted-foreground">A simulação usa potência e tempo de uso. A leitura importada do dispositivo será preservada ao salvar.</p>}
          </div>
          <ApplianceSetupSummary name={values.name || ''} kind="Potência × horas por dia × dias no mês." result={!previewLoading && result?.signature === signature ? result : null} loading={previewLoading || action === 'simulate'} editing={Boolean(initialAppliance)} error={error || previewError} tariff={Number(values.tariffValue)} assumptions={`${values.hours || 0} h e ${values.minutes || 0} min por dia, ${values.days || 0} dias no mês.`} source="Dados informados por você">
            <Button type="submit">{action === 'save' ? 'Salvando…' : initialAppliance ? 'Salvar alterações' : 'Adicionar aparelho'}</Button>
            {/* The preview updates on its own; manual recalculation is only offered while no current estimate is shown. */}
            {(result?.signature !== signature || previewError) && <Button type="button" variant="outline" onClick={form.handleSubmit(values => run(values,true))}>{action === 'simulate' ? 'Calculando…' : 'Recalcular estimativa'}</Button>}
            {result?.signature === signature && <p className="text-xs text-muted-foreground">Estimativa para {values.days} dias. A prévia não cadastra o aparelho.</p>}
          </ApplianceSetupSummary>
          <div className="appliance-mobile-save"><Button type="submit">{action === 'save' ? 'Salvando…' : initialAppliance ? 'Salvar alterações' : 'Adicionar aparelho'}</Button></div>
        </fieldset>
      </form>
    </CardContent>
  </Card>;
}
