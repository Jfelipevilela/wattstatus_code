import React from "react";
import ApplianceCalculator from "@/components/ApplianceCalculator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Calculator,
  Zap,
  DollarSign,
  TrendingUp,
  Lightbulb,
} from "lucide-react";

interface CalculatorTabProps {
  onAddAppliance: (appliance: {
    id: number;
    name: string;
    power: number;
    status: "critical" | "normal" | "warning";
    usageHours: number;
    monthlyCost: number;
    tariff: string;
  }) => void;
}

const CalculatorTab: React.FC<CalculatorTabProps> = ({ onAddAppliance }) => {
  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Calculadora de Energia
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Calcule o consumo e custo dos seus aparelhos elétricos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ApplianceCalculator onAddAppliance={onAddAppliance} />

        <div className="space-y-6">
          <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-green-light">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
                  <Calculator className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
                </div>
                Como funcionam os cálculos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200">
                    Consumo (kWh/mês)
                  </h4>
                </div>
                <p className="text-blue-700 dark:text-blue-300 text-sm mb-3">
                  O consumo mensal em quilowatt-hora (kWh) é calculado pela
                  fórmula:
                </p>
                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-blue-200 dark:border-blue-700 font-mono text-sm">
                  Consumo = (Potência × Horas de uso × Dias) ÷ 1000
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl">
                <div className="flex items-center gap-3 mb-2">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <h4 className="font-semibold text-green-800 dark:text-green-200">
                    Custo Mensal (R$)
                  </h4>
                </div>
                <p className="text-green-700 dark:text-green-300 text-sm mb-3">
                  O custo mensal é calculado multiplicando o consumo pela tarifa
                  de energia:
                </p>
                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-green-200 dark:border-green-700 font-mono text-sm">
                  Custo = Consumo (kWh) × Tarifa (R$/kWh)
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-xl border border-yellow-200 dark:border-yellow-700">
                <div className="flex items-center gap-3 mb-3">
                  <Lightbulb className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <h4 className="font-semibold text-yellow-800 dark:text-yellow-200">
                    Exemplo Prático
                  </h4>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-yellow-200 dark:border-yellow-700">
                  <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
                    Para um <strong>ar-condicionado de 1400W</strong>, utilizado{" "}
                    <strong>6 horas por dia</strong>, durante{" "}
                    <strong>30 dias</strong>:
                  </p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                      <div className="font-bold text-blue-600 dark:text-blue-400">
                        252 kWh/mês
                      </div>
                      <div className="text-blue-700 dark:text-blue-300">
                        Consumo mensal
                      </div>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                      <div className="font-bold text-green-600 dark:text-green-400">
                        R$ 206,64/mês
                      </div>
                      <div className="text-green-700 dark:text-green-300">
                        Custo estimado (SP)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-energy-green-light/10 to-energy-green-dark/10 dark:from-energy-green-light/5 dark:to-energy-green-dark/5 rounded-xl border border-energy-green-light/20 dark:border-energy-green-light/10">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
                  <h4 className="font-semibold text-energy-green-dark dark:text-energy-green-light">
                    Nota Importante
                  </h4>
                </div>
                <p className="text-energy-green-dark dark:text-energy-green-light text-sm">
                  As tarifas brasileiras variam conforme a localidade e a
                  distribuidora de energia. Consulte sua conta de luz para
                  valores exatos.
                </p>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default CalculatorTab;
