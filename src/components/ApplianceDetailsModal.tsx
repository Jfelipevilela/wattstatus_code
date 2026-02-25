import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Zap, InfoIcon } from "lucide-react";
import { Appliance } from "@/hooks/useAppliances";

interface ApplianceDetailsModalProps {
  appliance: Appliance | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (appliance: Appliance) => void;
}

const ApplianceDetailsModal: React.FC<ApplianceDetailsModalProps> = ({
  appliance,
  isOpen,
  onClose,
  onEdit,
}): JSX.Element => {
  if (!isOpen || !appliance) return null;

  // Calcular consumo mensal em kWh
  const monthlyConsumption =
    (appliance.power * appliance.usageHours * (appliance.days || 30)) / 1000;

  // Obter tarifa baseada no estado
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

  const tariffValue =
    STATE_TARIFFS[appliance.tariff as keyof typeof STATE_TARIFFS] || 0.82;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-90 flex items-center justify-center z-50 animate-fade-in">
      <Card className="w-full max-w-md mx-4 animate-slide-in-up">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-energy-green-light" />
              Detalhes do Aparelho
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {appliance.name}
            </h3>
          </div>

          <div className="bg-energy-green-light/10 dark:bg-energy-green-light/5 p-4 rounded-md border border-energy-green-light/30 dark:border-energy-green-light/10">
            <h4 className="font-medium text-energy-green-dark dark:text-energy-green-light mb-3 flex items-center gap-2">
              <InfoIcon className="h-4 w-4" />
              Informações Técnicas
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground dark:text-gray-400">
                  Potência:
                </span>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {appliance.power} W
                </p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-gray-400">
                  Uso diário:
                </span>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {appliance.usageHours} horas
                </p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-gray-400">
                  Consumo mensal:
                </span>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {monthlyConsumption.toFixed(2)} kWh
                </p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-gray-400">
                  Custo mensal:
                </span>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  R$ {appliance.monthlyCost.toFixed(2)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-gray-400">
                  Estado/Tarifa:
                </span>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {appliance.tariff} - R$ {tariffValue.toFixed(2)}/kWh
                </p>
              </div>
              <div>
                <span className="text-muted-foreground dark:text-gray-400">
                  Status:
                </span>
                <p
                  className={`font-medium ${
                    appliance.status === "normal"
                      ? "text-energy-green-dark dark:text-energy-green-light"
                      : appliance.status === "warning"
                      ? "text-orange-400 dark:text-orange-400"
                      : "text-energy-red dark:text-red-400"
                  }`}
                >
                  {appliance.status === "normal"
                    ? "Normal"
                    : appliance.status === "warning"
                    ? "Atenção"
                    : "Crítico"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 space-x-2">
            <Button
              onClick={() => onEdit(appliance)}
              className="bg-energy-yellow  hover:bg-energy-yellow text-white transition-all duration-200 transform hover:scale-105"
            >
              Editar
            </Button>
            <Button
              onClick={onClose}
              className="bg-energy-green-light hover:bg-energy-green-dark text-white transition-all duration-200 transform hover:scale-105"
            >
              Fechar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApplianceDetailsModal;
