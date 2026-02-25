import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Zap, Save, X, InfoIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "@/components/ui/use-toast";
import { Appliance, ApplianceInput } from "@/hooks/useAppliances";
import { notifyError } from "@/lib/error-toast";

// Tarifas por estado (valores aproximados em R$/kWh - 2024)
const STATE_TARIFFS = {
  AC: 0.89,
  AL: 0.78,
  AP: 0.85,
  AM: 0.82,
  BA: 0.75,
  CE: 0.71,
  DF: 0.79,
  ES: 0.73,
  GO: 0.76,
  MA: 0.69,
  MT: 0.74,
  MS: 0.72,
  MG: 0.77,
  PA: 0.81,
  PB: 0.7,
  PR: 0.78,
  PE: 0.72,
  PI: 0.68,
  RJ: 0.79,
  RN: 0.71,
  RS: 0.8,
  RO: 0.83,
  RR: 0.84,
  SC: 0.76,
  SP: 0.82,
  SE: 0.7,
  TO: 0.75,
};

// Definindo o schema de validação para o form
const applianceFormSchema = z.object({
  name: z.string().min(2, { message: "Nome deve ter pelo menos 2 caracteres" }),
  power: z.number().min(1, { message: "Potência deve ser maior que 0" }),
  usageHours: z
    .number()
    .min(0.1, { message: "Horas de uso deve ser maior que 0" }),
  days: z
    .number()
    .min(1, { message: "Dias por mês deve ser pelo menos 1" })
    .max(31),
  tariff: z.string().min(2, { message: "Selecione um estado" }),
});

type ApplianceFormValues = z.infer<typeof applianceFormSchema>;

interface EditApplianceModalProps {
  appliance: Appliance | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updated: ApplianceInput) => Promise<void> | void;
}

const EditApplianceModal: React.FC<EditApplianceModalProps> = ({
  appliance,
  isOpen,
  onClose,
  onSave,
}): JSX.Element => {
  const [calculatedCost, setCalculatedCost] = useState<number | null>(null);
  const [calculatedConsumption, setCalculatedConsumption] = useState<
    number | null
  >(null);

  const form = useForm<ApplianceFormValues>({
    resolver: zodResolver(applianceFormSchema),
    defaultValues: {
      name: "",
      power: 0,
      usageHours: 0,
      days: 30,
      tariff: "",
    },
  });

  // Update form when appliance changes
  useEffect(() => {
    if (appliance) {
      form.reset({
        name: appliance.name,
        power: appliance.power,
        usageHours: appliance.usageHours,
        days: appliance.days || 30,
        tariff: appliance.tariff || "SP",
      });
      // Calculate initial values
      calculateEnergyCost({
        name: appliance.name,
        power: appliance.power,
        usageHours: appliance.usageHours,
        days: appliance.days || 30,
        tariff: appliance.tariff || "SP",
      });
    }
  }, [appliance, form]);

  const calculateEnergyCost = (values: ApplianceFormValues) => {
    // Cálculo de consumo: Potência(W) * Horas * Dias / 1000 = kWh por mês
    const consumptionKWh =
      (values.power * values.usageHours * values.days) / 1000;

    // Cálculo de custo: Consumo(kWh) * Tarifa(R$/kWh) baseada no estado
    const tariff = STATE_TARIFFS[values.tariff as keyof typeof STATE_TARIFFS];
    if (!tariff) {
      // Use default tariff if state not selected
      const defaultTariff = 0.82; // SP tariff as default
      const cost = consumptionKWh * defaultTariff;
      setCalculatedConsumption(consumptionKWh);
      setCalculatedCost(cost);
      return { consumptionKWh, cost };
    }
    const cost = consumptionKWh * tariff;

    setCalculatedConsumption(consumptionKWh);
    setCalculatedCost(cost);

    return { consumptionKWh, cost };
  };

  const onSubmit = async (values: ApplianceFormValues) => {
    if (!appliance) return;

    try {
      await onSave(appliance.id, {
        name: values.name,
        power: values.power,
        usageHours: values.usageHours,
        days: values.days,
        tariff: values.tariff,
      });

      toast({
        title: "Aparelho atualizado com sucesso!",
        description: `${values.name} foi atualizado na sua lista.`,
      });

      onClose();
    } catch (err) {
      notifyError(err, {
        title: "Erro ao atualizar aparelho",
        fallbackMessage: "Não foi possível atualizar o aparelho.",
      });
    }
  };

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "days" && value.days > 31) {
        form.setValue("days", 31);
      }
      if (name === "usageHours" && value.usageHours > 24) {
        form.setValue("usageHours", 24);
      }
    });

    return () => subscription.unsubscribe();
  }, [form]);

  // Calculando em tempo real quando os valores mudam
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (form.formState.isValid) {
        const values = form.getValues();
        calculateEnergyCost({
          name: values.name,
          power: values.power,
          usageHours: values.usageHours,
          days: values.days,
          tariff: values.tariff,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [form.watch]);

  if (!isOpen || !appliance) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-energy-green-light" />
              Editar Aparelho
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do aparelho</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Ar-condicionado" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="power"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Potência (Watts)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Ex: 100"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value))
                        }
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="usageHours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Horas por dia</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ex: 5"
                          min="0.1"
                          step="0.1"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value))
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dias por mês</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ex: 30"
                          min="1"
                          max="31"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value))
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tariff"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione seu estado" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATE_TARIFFS).map(([code, rate]) => (
                            <SelectItem key={code} value={code}>
                              {code} - R$ {rate.toFixed(2)}/kWh
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />

              {calculatedConsumption !== null && calculatedCost !== null && (
                <div className="bg-energy-green-light/10 dark:bg-energy-green-light/5 p-4 rounded-md border border-energy-green-light/30 dark:border-energy-green-light/10 mt-4">
                  <h4 className="font-medium text-energy-green-dark dark:text-energy-green-light mb-2 flex items-center gap-2">
                    <InfoIcon className="h-4 w-4" />
                    Resultado do cálculo
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground dark:text-gray-400">
                        Consumo mensal:
                      </span>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {calculatedConsumption.toFixed(2)} kWh/mês
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground dark:text-gray-400">
                        Custo estimado:
                      </span>
                      <p className="font-medium text-energy-green-dark dark:text-energy-green-light">
                        R$ {calculatedCost.toFixed(2)}/mês
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 hover:bg-energy-red/10 text-black hover:text-energy-red dark:text-white dark:hover:text-energy-red"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-energy-green-light hover:bg-energy-green-dark text-white"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditApplianceModal;
