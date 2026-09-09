import { Edit, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  estimateAppliance,
  formatCurrency,
  formatDuration,
  formatNumber,
} from "@/lib/energy";
import type { Appliance } from "@/hooks/useAppliances";

type Props = Pick<
  Appliance,
  | "name"
  | "power"
  | "status"
  | "usageHours"
  | "monthlyCost"
  | "monthlyConsumption"
  | "tariff"
> &
  Partial<Appliance> & { onEdit?: () => void; onDelete?: () => void };
export default function ApplianceCard({
  onEdit,
  onDelete,
  ...appliance
}: Props) {
  const estimate = estimateAppliance({
    ...appliance,
    days: appliance.days || 30,
  } as Appliance);
  const items = [
    ["Potência", `${formatNumber(appliance.power, 0)} W`],
    ["Uso diário", formatDuration(appliance.usageHours)],
    ["Consumo estimado/mês", `${formatNumber(estimate.consumption)} kWh`],
    ["Custo estimado/mês", formatCurrency(estimate.cost)],
    ["Dias de uso/mês", String(appliance.days || 30)],
    ["Estado da tarifa", appliance.tariff],
  ];
  return (
    <Card className="h-full min-w-0 border-l-4 border-l-energy-green-light">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="break-words text-base">
            {appliance.name}
          </CardTitle>
          <div className="flex shrink-0">
            {onEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11"
                aria-label={`Editar ${appliance.name}`}
                onClick={onEdit}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11 text-destructive"
                aria-label={`Excluir ${appliance.name}`}
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {appliance.integrationProvider
            ? `Integração: ${appliance.integrationProvider}`
            : "Cadastro manual"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {items.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {appliance.measuredConsumptionKWh > 0 && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">
              Medido pelo dispositivo:{" "}
              {formatNumber(appliance.measuredConsumptionKWh)} kWh
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Leitura importada. Período e horário da medição não informados;
              não representa necessariamente o consumo do mês.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
