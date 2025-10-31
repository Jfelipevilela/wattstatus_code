import React, { useState, useEffect, useRef } from "react";
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
import { Zap, PlusCircle, AlertCircle, InfoIcon, Check } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

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

interface ApplianceCalculatorProps {
  onAddAppliance: (appliance: {
    id: number;
    name: string;
    power: number;
    status: "normal" | "warning" | "critical";
    usageHours: number;
    monthlyCost: number;
    monthlyConsumption: number;
    tariff: string;
    createdAt: string;
  }) => void;
}

const ApplianceCalculator: React.FC<ApplianceCalculatorProps> = ({
  onAddAppliance,
}) => {
  const [calculatedCost, setCalculatedCost] = useState<number | null>(null);
  const [calculatedConsumption, setCalculatedConsumption] = useState<
    number | null
  >(null);
  const [userState, setUserState] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commonDevices = [
    { name: "Geladeira", power: 150, usageHours: 24, days: 30 },
    { name: "Ar-condicionado", power: 1400, usageHours: 6, days: 30 },
    { name: 'TV LED 40"', power: 80, usageHours: 4, days: 30 },
    { name: "Computador", power: 300, usageHours: 8, days: 30 },
    { name: "Micro-ondas", power: 1200, usageHours: 0.5, days: 30 },
    { name: "Máquina de lavar", power: 1000, usageHours: 1, days: 30 },
    { name: "Chuveiro elétrico", power: 5500, usageHours: 0.5, days: 30 },
    { name: "Ventilador", power: 60, usageHours: 8, days: 30 },
  ];

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

  // Get user's location and set state
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          }
        );

        const { latitude, longitude } = position.coords;

        // Use a reverse geocoding service to get state from coordinates
        const response = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`
        );
        const data = await response.json();

        // Map Brazilian states to their codes
        const stateMapping: { [key: string]: string } = {
          Acre: "AC",
          Alagoas: "AL",
          Amapá: "AP",
          Amazonas: "AM",
          Bahia: "BA",
          Ceará: "CE",
          "Distrito Federal": "DF",
          "Espírito Santo": "ES",
          Goiás: "GO",
          Maranhão: "MA",
          "Mato Grosso": "MT",
          "Mato Grosso do Sul": "MS",
          "Minas Gerais": "MG",
          Pará: "PA",
          Paraíba: "PB",
          Paraná: "PR",
          Pernambuco: "PE",
          Piauí: "PI",
          "Rio de Janeiro": "RJ",
          "Rio Grande do Norte": "RN",
          "Rio Grande do Sul": "RS",
          Rondônia: "RO",
          Roraima: "RR",
          "Santa Catarina": "SC",
          "São Paulo": "SP",
          Sergipe: "SE",
          Tocantins: "TO",
        };

        const stateName =
          data.principalSubdivision ||
          data.localityInfo?.administrative?.[1]?.name;
        const stateCode = stateMapping[stateName] || "SP"; // Default to SP if not found

        setUserState(stateCode);
        form.setValue("tariff", stateCode);
      } catch (error) {
        console.log("Could not get user location, using default state");
        // Default to SP if geolocation fails
        setUserState("SP");
        form.setValue("tariff", "SP");
      }
    };

    getUserLocation();
  }, [form]);

  const calculateEnergyCost = (values: ApplianceFormValues) => {
    // Cálculo de consumo: Potência(W) * Horas * Dias / 1000 = kWh por mês
    const consumptionKWh =
      (values.power * values.usageHours * values.days) / 1000;

    // Cálculo de custo: Consumo(kWh) * Tarifa(R$/kWh) baseada no estado
    const tariff = STATE_TARIFFS[values.tariff as keyof typeof STATE_TARIFFS];
    if (!tariff) {
      throw new Error("Estado não selecionado ou tarifa não encontrada");
    }
    const cost = consumptionKWh * tariff;

    setCalculatedConsumption(consumptionKWh);
    setCalculatedCost(cost);

    return { consumptionKWh, cost };
  };

  const onSubmit = (values: ApplianceFormValues) => {
    const { consumptionKWh, cost } = calculateEnergyCost(values);

    // Determinando o status do aparelho com base no consumo
    let status: "normal" | "warning" | "critical" = "normal";
    if (consumptionKWh > 100) {
      status = "critical";
    } else if (consumptionKWh > 50) {
      status = "warning";
    }

    // Gerando um ID único para o aparelho
    const newId = Date.now();

    // Adicionando o aparelho usando a callback
    onAddAppliance({
      id: newId,
      name: values.name,
      power: values.power,
      status: status,
      usageHours: values.usageHours,
      monthlyCost: cost,
      monthlyConsumption: consumptionKWh,
      tariff: values.tariff,
      createdAt: new Date().toISOString(),
    });

    // Mostrando toast de sucesso
    toast({
      title: "Aparelho adicionado com sucesso!",
      description: `${values.name} foi adicionado à sua lista.`,
    });

    // Resetando o formulário
    form.reset({
      name: "",
      power: 0,
      usageHours: 0,
      days: 30,
      tariff: "",
    });

    // Limpando resultados
    setCalculatedCost(null);
    setCalculatedConsumption(null);
    setSearchTerm("");
    setIsOpen(false);
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
          // state: values.state,
          tariff: values.tariff,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [form.watch]);

  const filteredDevices = commonDevices.filter((device) =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectDevice = (device: (typeof commonDevices)[0]) => {
    form.setValue("name", device.name);
    form.setValue("power", device.power);
    form.setValue("usageHours", device.usageHours);
    form.setValue("days", device.days);
    setSearchTerm(device.name);
    setIsOpen(false);
  };

  return (
    <Card className="h-full border-l-4 border-l-energy-green-light">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-energy-green-light" />
          Calculadora de Consumo
        </CardTitle>
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
                    <div className="relative">
                      <Input
                        ref={inputRef}
                        placeholder="Digite o nome do aparelho..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          field.onChange(e.target.value);
                          setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        onBlur={() => {
                          // Delay closing to allow click on options
                          setTimeout(() => setIsOpen(false), 200);
                        }}
                        className="w-full"
                      />
                      {isOpen && filteredDevices.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-auto">
                          {filteredDevices.map((device, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                              onClick={() => selectDevice(device)}
                            >
                              <span className="text-sm">{device.name}</span>
                              <Check className="h-4 w-4 text-energy-green-light" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
                  <FormLabel>
                    Estado {userState && `(Detectado: ${userState})`}
                  </FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                      {field.value && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          Tarifa selecionada: {field.value} - R${" "}
                          {STATE_TARIFFS[
                            field.value as keyof typeof STATE_TARIFFS
                          ]?.toFixed(2)}
                          /kWh
                        </div>
                      )}
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

            <Button
              type="submit"
              className="w-full bg-energy-green-light hover:bg-energy-green-dark text-white"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Adicionar aparelho
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default ApplianceCalculator;
