import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, TrendingUp, Zap } from "lucide-react";

interface ConsumptionCardProps {
  title: string;
  value: string;
  unit: string;
  trend: "up" | "down" | "neutral";
  percentage?: number;
  icon?: React.ReactNode;
}

const ConsumptionCard: React.FC<ConsumptionCardProps> = ({
  title,
  value,
  unit,
  trend,
  percentage = 0,
  icon = <Zap className="h-5 w-5" />,
}) => {
  return (
    <Card className="h-full  border border-energy-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-energy-600 dark:text-gray-400">
          {title}
        </CardTitle>
        <div className="p-2 rounded-full bg-muted/20">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-energy-800 dark:text-white">
          {value}{" "}
          <span className="text-sm font-normal text-energy-600 dark:text-gray-400">
            {unit}
          </span>
        </div>
        {trend !== "neutral" && (
          <div className="flex items-center gap-1 mt-2">
            {trend === "down" ? (
              <>
                <TrendingDown className="h-4 w-4 text-energy-green-dark" />
                <span className="text-xs text-energy-green-dark">
                  {percentage}% menor que o período anterior
                </span>
              </>
            ) : (
              <>
                <TrendingUp className="h-4 w-4 text-energy-red" />
                <span className="text-xs text-energy-red">
                  {percentage}% maior que o período anterior
                </span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConsumptionCard;
