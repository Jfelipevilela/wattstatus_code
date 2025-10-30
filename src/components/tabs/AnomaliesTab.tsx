import React from "react";
import AnomalyDetection from "@/components/AnomalyDetection";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertTriangle, TrendingUp, Shield, Clock, Zap } from "lucide-react";

interface Anomaly {
  id: number;
  deviceName: string;
  anomalyScore: number;
  description: string;
  recommendation: string;
}

interface AnomaliesTabProps {
  anomalies: Anomaly[];
}

const AnomaliesTab: React.FC<AnomaliesTabProps> = ({ anomalies }) => {
  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Detecção de Anomalias
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Identificamos padrões incomuns no consumo dos seus aparelhos
        </p>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-green-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
              <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Sistema Seguro
              </p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                OK
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Última Verificação
              </p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                Agora
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-yellow-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Anomalias Hoje
              </p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {anomalies.length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {anomalies.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {anomalies.map((anomaly, index) => (
              <AnomalyDetection
                key={anomaly.id}
                deviceName={anomaly.deviceName}
                anomalyScore={anomaly.anomalyScore}
                description={anomaly.description}
                recommendation={anomaly.recommendation}
              />
            ))}
          </div>

          <Card className="p-6 hover:shadow-xl transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                Análise de Tendências
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    📊 Padrões Identificados
                  </h4>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• Consumo elevado em horários fora do padrão</li>
                    <li>• Variações significativas na potência</li>
                    <li>• Uso prolongado de aparelhos específicos</li>
                  </ul>
                </div>

                <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl">
                  <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                    💡 Recomendações
                  </h4>
                  <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    <li>• Configure timers automáticos</li>
                    <li>• Verifique manutenção preventiva</li>
                    <li>• Ajuste hábitos de uso</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Shield className="h-12 w-12 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
              Tudo em Ordem! 🎉
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Não detectamos nenhuma anomalia no consumo dos seus aparelhos. Seu
              sistema está funcionando normalmente.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                  100%
                </div>
                <div className="text-sm text-green-700 dark:text-green-300">
                  Eficiência
                </div>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  0
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  Alertas
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Educational Content */}
      <Card className="p-6 hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 bg-energy-blue-light/10 dark:bg-energy-blue-light/5 rounded-lg">
              <Zap className="h-5 w-5 text-energy-blue-dark dark:text-energy-blue-light" />
            </div>
            Como Funciona a Detecção de Anomalias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-white font-bold">1</span>
              </div>
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                Monitoramento
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Analisamos o consumo em tempo real comparando com padrões
                históricos.
              </p>
            </div>

            <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-xl">
              <div className="w-12 h-12 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-white font-bold">2</span>
              </div>
              <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Análise
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Utilizamos algoritmos inteligentes para identificar desvios do
                normal.
              </p>
            </div>

            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl">
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-white font-bold">3</span>
              </div>
              <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                Alerta
              </h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                Notificamos sobre anomalias e sugerimos ações corretivas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnomaliesTab;
