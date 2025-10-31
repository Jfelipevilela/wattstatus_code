import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, CircleAlert, CircleX, Edit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface ApplianceCardProps {
  name: string;
  power: number;
  status: "normal" | "warning" | "critical";
  usageHours: number;
  monthlyCost: number;
  monthlyConsumption: number;
  tariff: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ApplianceCard: React.FC<ApplianceCardProps> = ({
  name,
  power,
  status,
  usageHours,
  monthlyCost,
  monthlyConsumption,
  tariff,
  onEdit,
  onDelete,
}) => {
  return (
    <TooltipProvider>
      <Card
        className={cn(
          "h-full transition-all duration-300 border shadow-lg hover:shadow-xl",
          status === "normal"
            ? "border-l-4 border-l-energy-green-light"
            : status === "warning"
            ? "border-l-4 border-l-energy-orange"
            : "border-l-4 border-l-energy-red animate-border-pulse"
    
        )}
      >
        <CardHeader className="flex flex-row items-center  animate-fade-in justify-between pb-2">
          <CardTitle className="text-base text-black dark:text-white">
            {name}
          </CardTitle>
          <div className="flex items-center space-x-2">
            {status === "normal" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CheckCircle className="h-5 w-5 text-energy-green-light" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Status normal</p>
                </TooltipContent>
              </Tooltip>
            )}

            {status === "warning" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleAlert className="h-5 w-5 text-energy-orange" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Consumo acima do ideal</p>
                </TooltipContent>
              </Tooltip>
            )}

            {status === "critical" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleX className="h-5 w-5 text-energy-red" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Consumo crítico!</p>
                </TooltipContent>
              </Tooltip>
            )}

            {onEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Editar aparelho"
                    onClick={onEdit}
                    className="text-energy-600 dark:text-energy-white hover:text-energy-yellow dark:hover:text-energy-yellow"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Editar</p>
                </TooltipContent>
              </Tooltip>
            )}

            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Excluir aparelho"
                    onClick={onDelete}
                    className="text-energy-red hover:text-red-700"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Excluir</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground dark:text-gray-400">
                Potência:
              </p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {power} W
              </p>
            </div>
            <div>
              <p className="text-muted-foreground dark:text-gray-400">
                Uso diário:
              </p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {usageHours} horas
              </p>
            </div>
            <div>
              <p className="text-muted-foreground dark:text-gray-400">
                Consumo mensal:
              </p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {monthlyConsumption.toFixed(2)} kWh
              </p>
            </div>
            <div>
              <p className="text-muted-foreground dark:text-gray-400">
                Custo mensal:
              </p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                R$ {monthlyCost.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground dark:text-gray-400">
                Tarifa:
              </p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {tariff}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground dark:text-gray-400">
                Status:
              </p>
              <p
                className={cn(
                  "font-medium",
                  status === "normal"
                    ? "text-energy-green-dark dark:text-energy-green-light"
                    : status === "warning"
                    ? "text-orange-300 dark:text-orange-400"
                    : "text-energy-red dark:text-red-400"
                )}
              >
                {status === "normal"
                  ? "Normal"
                  : status === "warning"
                  ? "Atenção"
                  : "Crítico"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default ApplianceCard;
