import { useId, useRef, useState } from "react";
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
import type { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import { STATE_TARIFFS, formatNumber, formatCurrency } from "@/lib/energy";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Informe um nome com pelo menos 2 caracteres."),
    power: z
      .number({ invalid_type_error: "Informe a potência." })
      .positive("A potência deve ser maior que zero."),
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
}
export default function ApplianceCalculator({
  onAddAppliance,
  initialAppliance,
  onSaved,
  onBusyChange,
}: Props) {
  const { token } = useAuth();
  const id = useId();
  const initialMinutes = Math.round((initialAppliance?.usageHours || 0) * 60);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialAppliance?.name || "",
      power: initialAppliance?.power,
      hours: Math.floor(initialMinutes / 60),
      minutes: initialMinutes % 60,
      days: initialAppliance?.days || 30,
      tariff: initialAppliance?.tariff || "",
    },
  });
  const [result, setResult] = useState<{
    consumptionKWh: number;
    cost: number;
    signature: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"simulate" | "save" | null>(null);
  const busy = useRef(false);
  const values = form.watch();
  const signature = JSON.stringify(values);
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
        toast({
          title: initialAppliance
            ? "Aparelho atualizado"
            : "Aparelho adicionado",
          description: `${values.name} foi salvo na sua lista.`,
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
  return (
    <Card className="min-w-0 border-l-4 border-l-energy-green-light">
      <CardHeader>
        <CardTitle className="text-lg">
          {initialAppliance
            ? "Dados do aparelho"
            : "Cadastrar ou simular aparelho"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => run(values, false))}
          className="space-y-4"
        >
          <fieldset disabled={action !== null} className="min-w-0 space-y-4">
            {!initialAppliance && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-model`}>
                  Preencher com um aparelho comum
                </Label>
                <select
                  id={`${id}-model`}
                  className={selectClass}
                  defaultValue=""
                  onChange={(event) => {
                    const model = models[Number(event.target.value)];
                    if (model)
                      form.reset({
                        ...model,
                        tariff: form.getValues("tariff"),
                      });
                    setResult(null);
                    event.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Escolha um modelo (opcional)
                  </option>
                  {models.map((model, index) => (
                    <option key={model.name} value={index}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Valores de exemplo. Ajuste conforme seu aparelho; equipamentos
                  com ciclos, como geladeiras, não consomem potência máxima o
                  tempo todo.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>Nome do aparelho</Label>
              <Input
                {...form.register("name")}
                {...accessibility("name")}
                placeholder="Ex.: Geladeira da cozinha"
                className="h-11"
              />
              {fieldError("name")}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-power`}>Potência (W)</Label>
              <Input
                {...form.register("power", { valueAsNumber: true })}
                {...accessibility("power")}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="Ex.: 150"
                className="h-11"
              />
              <p
                id={`${id}-power-help`}
                className="text-xs text-muted-foreground"
              >
                Procure o valor em W na etiqueta ou no manual do aparelho.
                Potência (W) é diferente de consumo (kWh).
              </p>
              {fieldError("power")}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Tempo de uso por dia
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {(["hours", "minutes"] as const).map((name) => (
                  <div key={name} className="space-y-2">
                    <Label htmlFor={`${id}-${name}`}>
                      {name === "hours" ? "Horas" : "Minutos"}
                    </Label>
                    <Input
                      {...form.register(name, { valueAsNumber: true })}
                      {...accessibility(name)}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={name === "hours" ? 24 : 59}
                      className="h-11"
                    />
                    {fieldError(name)}
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor={`${id}-days`}>Dias de uso por mês</Label>
              <Input
                {...form.register("days", { valueAsNumber: true })}
                {...accessibility("days")}
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                className="h-11"
              />
              {fieldError("days")}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-tariff`}>Estado</Label>
              <select
                {...form.register("tariff")}
                {...accessibility("tariff")}
                className={selectClass}
              >
                <option value="">Selecione seu estado</option>
                {Object.entries(STATE_TARIFFS).map(([state, rate]) => (
                  <option key={state} value={state}>
                    {state} — referência: {formatCurrency(rate)}/kWh
                  </option>
                ))}
              </select>
              {fieldError("tariff")}
              <p className="text-xs text-muted-foreground">
                Tarifas de referência, sem atualização em tempo real. O custo
                final depende da distribuidora, dos impostos e das bandeiras da
                sua conta.
              </p>
            </div>
            {initialAppliance?.measuredConsumptionKWh > 0 && (
              <p className="text-sm text-muted-foreground">
                A simulação usa potência e tempo de uso. A leitura importada do
                dispositivo será preservada ao salvar.
              </p>
            )}
            {result && result.signature === signature && (
              <div
                role="status"
                className="space-y-2 rounded-lg border bg-muted/40 p-4"
              >
                <p className="font-medium">Simulação mensal</p>
                <p>
                  {formatNumber(result.consumptionKWh)} kWh ·{" "}
                  <strong>{formatCurrency(result.cost)}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  Estimativa para {values.days} dias de uso. A simulação não
                  cadastra o aparelho.
                </p>
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 p-3 text-sm text-destructive dark:text-red-400"
              >
                {error} Seus dados foram mantidos; tente novamente.
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={form.handleSubmit((values) => run(values, true))}
              >
                {action === "simulate" ? "Calculando…" : "Simular sem salvar"}
              </Button>
              <Button type="submit" className="h-11 flex-1">
                {action === "save"
                  ? "Salvando…"
                  : initialAppliance
                    ? "Salvar alterações"
                    : "Adicionar aparelho"}
              </Button>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
