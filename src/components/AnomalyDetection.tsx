
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, CheckCircle, AlertTriangle, Cpu } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AnomalyProps {
  deviceName: string;
  anomalyScore: number;
  description: string;
  recommendation: string;
}

const AnomalyDetection: React.FC<AnomalyProps> = ({
  deviceName,
  anomalyScore,
  description,
  recommendation,
}) => {
  // Determinando o status baseado no score de anomalia
  const getStatus = () => {
    if (anomalyScore < 30) return 'normal';
    if (anomalyScore < 70) return 'warning';
    return 'critical';
  };

  const status = getStatus();

  return (
    <Card className={cn(
      "h-full",
      status === 'normal' ? 'border-l-4 border-l-energy-green-light' : 
      status === 'warning' ? 'border-l-4 border-l-energy-yellow' : 
      'border-l-4 border-l-energy-red'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-energy-blue-light" />
            <CardTitle className="text-base">{deviceName}</CardTitle>
          </div>
          {status === 'normal' ? (
            <CheckCircle className="h-5 w-5 text-energy-green-light" />
          ) : status === 'warning' ? (
            <AlertTriangle className="h-5 w-5 text-energy-yellow" />
          ) : (
            <AlertCircle className="h-5 w-5 text-energy-red" />
          )}
        </div>
        <CardDescription>Análise de IA - Detecção de Anomalias</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">Nível de Anomalia</span>
              <span className={cn(
                "text-sm font-medium",
                status === 'normal' ? 'text-energy-green-dark' : 
                status === 'warning' ? 'text-energy-yellow' : 
                'text-energy-red'
              )}>
                {anomalyScore}%
              </span>
            </div>
            <Progress 
              value={anomalyScore} 
              className={cn(
                "h-2",
                status === 'normal' ? 'bg-muted' : 
                status === 'warning' ? 'bg-muted' : 
                'bg-muted'
              )}
            />
            <div 
              className={cn(
                "h-2 rounded-full absolute top-0 left-0",
                status === 'normal' ? 'bg-energy-green-light' : 
                status === 'warning' ? 'bg-energy-yellow' : 
                'bg-energy-red'
              )} 
              style={{ width: `${anomalyScore}%` }}
            />
          </div>
          
          <div className="text-sm">
            <p className="mb-1 font-medium">Observação:</p>
            <p className="text-muted-foreground mb-3">{description}</p>
            
            <p className="mb-1 font-medium">Recomendação:</p>
            <p className="text-muted-foreground">{recommendation}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AnomalyDetection;
