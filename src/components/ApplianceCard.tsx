import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApplianceCardProps {
  name: string;
  power: number;
  status: 'normal' | 'warning' | 'critical';
  usageHours: number;
  monthlyCost: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ApplianceCard: React.FC<ApplianceCardProps> = ({
  name,
  power,
  status,
  usageHours,
  monthlyCost,
  onEdit,
  onDelete,
}) => {
  return (
    <Card className={cn(
      "h-full transition-all duration-300",
      status === 'normal' ? 'border-l-4 border-l-energy-green-light' : 
      status === 'warning' ? 'border-l-4 border-l-orange-300' : 
      'border-l-4 border-l-energy-red animate-pulse'
    )}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{name}</CardTitle>
        <div className="flex items-center space-x-2">
          {status === 'normal' ? (
            <CheckCircle className="h-5 w-5 text-energy-green-light" />
          ) : (
            <AlertTriangle className={cn(
              "h-5 w-5",
              status === 'warning' ? 'text-orange-300' : 'text-energy-red'
            )} />
          )}
          {onEdit && (
            <button
              aria-label="Editar aparelho"
              onClick={onEdit}
              className="text-energy-blue-light hover:text-energy-blue-dark"
            >
              <Edit className="h-5 w-5" />
            </button>
          )}
          {onDelete && (
            <button
              aria-label="Excluir aparelho"
              onClick={onDelete}
              className="text-energy-red hover:text-energy-red-dark"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
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
              status === 'warning' ? 'text-orange-300' : 
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
