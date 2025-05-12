
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, PlusCircle, AlertCircle, InfoIcon } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from '@/components/ui/use-toast';

// Tarifa média por kWh em Reais (pode ser ajustada por estado futuramente)
const ENERGIA_TARIFA_KWH = 0.75;

// Definindo o schema de validação para o form
const applianceFormSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
  power: z.number().min(1, { message: 'Potência deve ser maior que 0' }),
  usageHours: z.number().min(0.1, { message: 'Horas de uso deve ser maior que 0' }),
  days: z.number().min(1, { message: 'Dias por mês deve ser pelo menos 1' }).max(31),
});

type ApplianceFormValues = z.infer<typeof applianceFormSchema>;

interface ApplianceCalculatorProps {
  onAddAppliance: (appliance: {
    id: number;
    name: string;
    power: number;
    status: 'normal' | 'warning' | 'critical';
    usageHours: number;
    monthlyCost: number;
  }) => void;
}

const ApplianceCalculator: React.FC<ApplianceCalculatorProps> = ({ onAddAppliance }) => {
  const [calculatedCost, setCalculatedCost] = useState<number | null>(null);
  const [calculatedConsumption, setCalculatedConsumption] = useState<number | null>(null);
  
  const form = useForm<ApplianceFormValues>({
    resolver: zodResolver(applianceFormSchema),
    defaultValues: {
      name: '',
      power: 0,
      usageHours: 0,
      days: 30,
    },
  });

  const calculateEnergyCost = (values: ApplianceFormValues) => {
    // Cálculo de consumo: Potência(W) * Horas * Dias / 1000 = kWh por mês
    const consumptionKWh = (values.power * values.usageHours * values.days) / 1000;
    
    // Cálculo de custo: Consumo(kWh) * Tarifa(R$/kWh)
    const cost = consumptionKWh * ENERGIA_TARIFA_KWH;
    
    setCalculatedConsumption(consumptionKWh);
    setCalculatedCost(cost);
    
    return { consumptionKWh, cost };
  };

  const onSubmit = (values: ApplianceFormValues) => {
    const { consumptionKWh, cost } = calculateEnergyCost(values);
    
    // Determinando o status do aparelho com base no consumo
    let status: 'normal' | 'warning' | 'critical' = 'normal';
    if (consumptionKWh > 100) {
      status = 'critical';
    } else if (consumptionKWh > 50) {
      status = 'warning';
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
    });
    
    // Mostrando toast de sucesso
    toast({
      title: "Aparelho adicionado com sucesso!",
      description: `${values.name} foi adicionado à sua lista.`,
    });
    
    // Resetando o formulário
    form.reset({
      name: '',
      power: 0,
      usageHours: 0,
      days: 30,
    });
    
    // Limpando resultados
    setCalculatedCost(null);
    setCalculatedConsumption(null);
  };
  
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
        });
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form.watch]);

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
                    <Input placeholder="Ex: Geladeira, TV, Ar-condicionado" {...field} />
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
                      onChange={(e) => field.onChange(parseFloat(e.target.value))}
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
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
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
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            
            {(calculatedConsumption !== null && calculatedCost !== null) && (
              <div className="bg-energy-green-light/10 p-4 rounded-md border border-energy-green-light/30 mt-4">
                <h4 className="font-medium text-energy-green-dark mb-2 flex items-center gap-2">
                  <InfoIcon className="h-4 w-4" />
                  Resultado do cálculo
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Consumo mensal:</span>
                    <p className="font-medium">{calculatedConsumption.toFixed(2)} kWh/mês</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Custo estimado:</span>
                    <p className="font-medium text-energy-green-dark">R$ {calculatedCost.toFixed(2)}/mês</p>
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
