import React, { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Target,
  TrendingUp,
  DollarSign,
  Lightbulb,
  Download,
  BarChart3,
  Award,
  TrendingDown,
  RefreshCw,
  ArrowRightToLine,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface IndicatorsTabProps {
  efficiencyScore: number;
  monthOverMonthChange: number;
  accumulatedSavings: number;
  historicalData: any[];
  saveCurrentMonthData: () => void;
  exportData: () => void;
}

const IndicatorsTab: React.FC<IndicatorsTabProps> = ({
  efficiencyScore,
  monthOverMonthChange,
  accumulatedSavings,
  historicalData,
  saveCurrentMonthData,
  exportData,
}) => {
  // Auto-sync data on component mount and every 5 minutes
  useEffect(() => {
    // Initial sync
    saveCurrentMonthData();

    // Set up interval for auto-sync every 5 minutes (300000 ms)
    const interval = setInterval(() => {
      saveCurrentMonthData();
    }, 300000);

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, [saveCurrentMonthData]);

  return (
    <div className="space-y-8 ">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2 ">
          Indicadores de Performance
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Acompanhe suas métricas de eficiência energética
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 bg">
        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-green-light">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
                <Target className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
              </div>
              Score de Eficiência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-energy-green-dark mb-2">
              {efficiencyScore.toFixed(0)}%
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
              <div
                className="bg-gradient-to-r from-energy-green-light to-energy-green-dark h-2 rounded-full transition-all duration-1000"
                style={{ width: `${efficiencyScore}%` }}
              ></div>
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              Baseado no consumo vs. média
            </p>
          </CardContent>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-red">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-red/10 dark:bg-energy-red/5 rounded-lg">
                {monthOverMonthChange >= 0 ? (
                  <TrendingUp className="h-5 w-5 text-red-500 dark:text-red-400" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-green-500 dark:text-green-400" />
                )}
              </div>
              Mês a Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-4xl font-bold mb-2 ${
                monthOverMonthChange >= 0
                  ? "text-red-500 dark:text-red-400"
                  : "text-green-500 dark:text-green-400"
              }`}
            >
              {monthOverMonthChange >= 0 ? "+" : ""}
              {monthOverMonthChange.toFixed(1)}%
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              Comparado ao mês anterior
            </p>
          </CardContent>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-yellow">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-yellow/10 dark:bg-energy-yellow/5 rounded-lg">
                <DollarSign className="h-5 w-5 text-energy-yellow dark:text-energy-yellow" />
              </div>
              Economias Potenciais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-energy-green-dark dark:text-energy-green-light mb-2">
              R$ {accumulatedSavings.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              Seguindo todas as dicas
            </p>
          </CardContent>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-green-light">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
                <Lightbulb className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
              </div>
              Status Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold mb-2 ${
                efficiencyScore > 70
                  ? "text-green-600 dark:text-green-400"
                  : efficiencyScore > 40
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {efficiencyScore > 70 ? (
                <div className="flex items-center gap-2">
                  <Award className="h-6 w-6" />
                  Excelente
                </div>
              ) : efficiencyScore > 40 ? (
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-6 w-6" />
                  Atenção
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-6 w-6" />
                  Crítico
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              Baseado na eficiência atual
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Consumption Line Chart */}
        <Card className="p-6 hover:shadow-xl transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-blue-light/10 dark:bg-energy-blue-light/5 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-800 dark:text-energy-blue-light" />
              </div>
              Histórico de Consumo (kWh)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={historicalData.slice(-6)}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value} kWh`, "Consumo"]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="consumption"
                    stroke="#2196F3"
                    strokeWidth={3}
                    dot={{ fill: "#2196F3", strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: "#2196F3", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cost Line Chart */}
        <Card className="p-6 hover:shadow-xl transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
                <DollarSign className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
              </div>
              Histórico de Custo (R$)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={historicalData.slice(-6)}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [
                      `R$ ${value.toFixed(2)}`,
                      "Custo",
                    ]}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#4CAF50"
                    strokeWidth={3}
                    dot={{ fill: "#4CAF50", strokeWidth: 2, r: 6 }}
                    activeDot={{ r: 8, stroke: "#4CAF50", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-8">
        <Card className="p-6 hover:shadow-xl transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
                <Download className="h-5 w-5 text-energy-green-dark dark:text-energy-green-light" />
              </div>
              Ações Disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <Button
                onClick={saveCurrentMonthData}
                className="w-full h-14 bg-gradient-to-r from-energy-green-light to-energy-green-dark hover:from-energy-green-dark hover:to-energy-green-light transition-all duration-300 transform hover:scale-105"
              >
                <RefreshCw className="h-5 w-5 mr-3" />
                Sincronizar Dados
              </Button>
              <Button
                onClick={exportData}
                variant="outline"
                className="w-full h-14 border-2 border-energy-green-light text-energy-green-dark hover:bg-energy-green-light hover:text-white transition-all duration-300 transform hover:scale-105"
              >
                <Download className="h-5 w-5 mr-3" />
                Exportar Relatório (PDF)
              </Button>
            </div>

            <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 dark:from-slate-700 dark:to-slate-600 rounded-xl border border-blue-200 dark:border-slate-600">
              <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">
                💡 Dicas Úteis
              </h4>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <li>• Salve os dados mensalmente para acompanhar a evolução</li>
                <li>• Exporte para análise externa ou backup</li>
                <li>• Compare seu desempenho com metas personalizadas</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IndicatorsTab;
