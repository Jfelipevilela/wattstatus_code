
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApplianceCardProps {
  name: string;
  power: number;
  status: 'normal' | 'warning' | 'critical';
  usageHours: number;
  monthlyCost: number;
}

const ApplianceCard: React.FC<ApplianceCardProps> = ({
  name,
  power,
  status,
  usageHours,
  monthlyCost,
}) => {
  return (
    <Card className={cn(
      "h-full transition-all duration-300",
      status === 'normal' ? 'border-l-4 border-l-energy-green-light' : 
      status === 'warning' ? 'border-l-4 border-l-energy-yellow' : 
      'border-l-4 border-l-energy-red animate-pulse'
    )}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{name}</CardTitle>
        {status === 'normal' ? (
          <CheckCircle className="h-5 w-5 text-energy-green-light" />
        ) : (
          <AlertTriangle className={cn(
            "h-5 w-5",
            status === 'warning' ? 'text-energy-yellow' : 'text-energy-red'
          )} />
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Potência:</p>
            <p className="font-medium">{power} W</p>
          </div>
          <div>
            <p className="text-muted-foreground">Uso diário:</p>
            <p className="font-medium">{usageHours} horas</p>
          </div>
          <div>
            <p className="text-muted-foreground">Custo mensal:</p>
            <p className="font-medium">R$ {monthlyCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status:</p>
            <p className={cn(
              "font-medium",
              status === 'normal' ? 'text-energy-green-dark' : 
              status === 'warning' ? 'text-energy-yellow' : 
              'text-energy-red'
            )}>
              {status === 'normal' ? 'Normal' : 
               status === 'warning' ? 'Atenção' : 
               'Crítico'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ApplianceCard;
