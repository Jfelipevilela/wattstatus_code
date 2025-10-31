import React, { useState, useMemo, useEffect } from "react";
import {
  Zap,
  DollarSign,
  Calendar,
  Leaf,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadialBarChart,
  RadialBar,
  Label,
  Sector,
} from "recharts";
import { PieSectorDataItem } from "recharts/types/polar/Pie";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface ConsumptionTabProps {
  totalConsumption: number;
  totalCost: number;
  consumptionDifference: number;
  consumptionPercent: string;
  consumptionData: any[];
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
}

const ConsumptionTab: React.FC<ConsumptionTabProps> = ({
  totalConsumption,
  totalCost,
  consumptionDifference,
  consumptionPercent,
  consumptionData,
  selectedMonth,
  setSelectedMonth,
}) => {
  const [activeAppliance, setActiveAppliance] = useState<string>(
    consumptionData.length > 0 ? consumptionData[0].name : ""
  );

  const months = [
    { value: 1, label: "Janeiro" },
    { value: 2, label: "Fevereiro" },
    { value: 3, label: "Março" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Maio" },
    { value: 6, label: "Junho" },
    { value: 7, label: "Julho" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Setembro" },
    { value: 10, label: "Outubro" },
    { value: 11, label: "Novembro" },
    { value: 12, label: "Dezembro" },
  ];

  // Use real appliance data without mock variations
  const filteredData = consumptionData.map((item, index) => ({
    ...item,
    fill: `hsl(${index * 45}, 70%, 50%)`,
  }));

  const activeIndex = useMemo(
    () => consumptionData.findIndex((item) => item.name === activeAppliance),
    [activeAppliance, consumptionData]
  );

  // Update activeAppliance when consumptionData changes
  useEffect(() => {
    if (
      consumptionData.length > 0 &&
      !consumptionData.some((item) => item.name === activeAppliance)
    ) {
      setActiveAppliance(consumptionData[0].name);
    }
  }, [consumptionData, activeAppliance]);

  return (
    <div className="space-y-8 ">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-orange">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-orange/10 dark:bg-orange/5 rounded-lg">
                <Zap className="h-5 w-5 text-energy-orange dark:text-energy-orange" />
              </div>
              Consumo Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-energy-green-dark mb-2">
              {totalConsumption}
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              kWh/mês
            </p>
          </CardContent>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-yellow">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-yellow/10 dark:bg-energy-yellow/5 rounded-lg">
                <DollarSign className="h-5 w-5 text-energy-yellow dark:text-energy-yellow" />
              </div>
              Gasto Estimado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-energy-yellow-dark dark:text-energy-yellow mb-2">
              R$ {totalCost.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              no mês
            </p>
          </CardContent>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-blue-light">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-blue-light/10 dark:bg-energy-blue-light/5 rounded-lg">
                <Calendar className="h-5 w-5 text-energy-blue-light dark:text-energy-blue-light" />
              </div>
              Média Diária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-energy-green-dark dark:text-energy-green-light mb-2">
              {(totalConsumption / 30).toFixed(1)}
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              kWh/dia
            </p>
          </CardContent>
        </Card>

        <Card className="p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-energy-green-light">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-3">
              <div className="p-2 bg-energy-green-light/10 dark:bg-energy-green-light/5 rounded-lg">
                <Leaf className="h-5 w-5 text-energy-green-light dark:text-energy-green-light" />
              </div>
              Impacto Ambiental
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-energy-green-dark dark:text-energy-green-light mb-2">
              {(totalConsumption * 0.42).toFixed(0)}
            </div>
            <p className="text-sm text-muted-foreground dark:text-gray-400">
              kg CO₂
            </p>
          </CardContent>
        </Card>
      </div>

      {/* New Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Redesigned Monthly Consumption Chart */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-blue-light/10 rounded-lg">
                <BarChart3 className="h-5 w-5 text-blue-800" />
              </div>
              Consumo por Aparelho (kWh/mês)
            </CardTitle>
            <CardDescription>
              Consumo mensal por aparelho cadastrado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                consumo: {
                  label: "Consumo (kWh):ㅤ",
                  color: "var(--chart-1)",
                },
                custo: {
                  label: "Custo (R$):ㅤ",
                  color: "var(--chart-2)",
                },
              }}
            >
              <BarChart accessibilityLayer data={filteredData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => value.slice(0, 10)}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Bar
                  dataKey="consumo"
                  fill="var(--chart-1)"
                  radius={8}
                  name="Consumo (kWh)"
                />
                <Bar
                  dataKey="custo"
                  fill="var(--chart-2)"
                  radius={8}
                  name="Custo (R$)"
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm">
            <div className="text-muted-foreground leading-none">
              Consumo mensal por aparelho -{" "}
              {months.find((m) => m.value === selectedMonth)?.label}
            </div>
          </CardFooter>
        </Card>

        {/* Interactive Pie Chart - Appliance Consumption */}
        <Card className="h-full">
          <CardHeader className="flex-row items-start space-y-0 pb-0">
            <div className="grid gap-1">
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 bg-energy-green-light/10 rounded-lg">
                  <PieChart className="h-5 w-5 text-energy-green-dark" />
                </div>
                Consumo por Aparelho
              </CardTitle>
              <CardDescription>
                Selecione um aparelho para ver detalhes
              </CardDescription>
            </div>
            <Select value={activeAppliance} onValueChange={setActiveAppliance}>
              <SelectTrigger
                className="ml-auto h-7 w-[180px] rounded-lg pl-2.5"
                aria-label="Selecione um aparelho"
              >
                <SelectValue placeholder="Selecione aparelho" />
              </SelectTrigger>
              <SelectContent align="end" className="rounded-xl">
                {consumptionData.map((item, index) => (
                  <SelectItem
                    key={item.name}
                    value={item.name}
                    className="rounded-lg [&_span]:flex"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="flex h-3 w-3 shrink-0 rounded-xs"
                        style={{
                          backgroundColor: `hsl(${index * 45}, 70%, 50%)`,
                        }}
                      />
                      {item.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="flex flex-1 justify-center pb-0">
            <ChartContainer
              config={{
                consumo: {
                  label: "Consumo (kWh)",
                },
              }}
              className="mx-auto aspect-square w-full max-w-[300px]"
            >
              <RechartsPieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                  data={consumptionData}
                  dataKey="consumo"
                  nameKey="name"
                  innerRadius={60}
                  strokeWidth={5}
                  activeIndex={activeIndex}
                  activeShape={({
                    outerRadius = 0,
                    ...props
                  }: PieSectorDataItem) => (
                    <g>
                      <Sector {...props} outerRadius={outerRadius + 10} />
                      <Sector
                        {...props}
                        outerRadius={outerRadius + 25}
                        innerRadius={outerRadius + 12}
                      />
                    </g>
                  )}
                >
                  {consumptionData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`hsl(${index * 45}, 70%, 50%)`}
                    />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        const activeItem = consumptionData[activeIndex];
                        if (!activeItem) return null;
                        const percentage =
                          totalConsumption > 0
                            ? (
                                (activeItem.consumo / totalConsumption) *
                                100
                              ).toFixed(1)
                            : "0.0";

                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-2xl font-bold"
                            >
                              {activeItem.consumo.toFixed(1)} kWh
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 20}
                              className="fill-muted-foreground text-sm"
                            >
                              {percentage}% do total
                            </tspan>
                          </text>
                        );
                      }
                    }}
                  />
                </Pie>
              </RechartsPieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Additional Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Area Chart - Trend Analysis */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-yellow/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-energy-yellow" />
              </div>
              Tendência de Consumo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={consumptionData}
                  margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value.toFixed(1)} kWh`,
                      "Consumo",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="consumo"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Radial Bar Chart - Efficiency Gauge */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-green-light/10 rounded-lg">
                <Activity className="h-5 w-5 text-energy-green-dark" />
              </div>
              Eficiência Energética
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="10%"
                  outerRadius="80%"
                  data={[
                    {
                      name: "Eficiência",
                      value: Math.min(100, (totalConsumption / 250) * 100),
                      fill:
                        totalConsumption < 200
                          ? "#00C49F"
                          : totalConsumption < 250
                          ? "#FFBB28"
                          : "#FF8042",
                    },
                  ]}
                >
                  <RadialBar dataKey="value" cornerRadius={10} />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value.toFixed(0)}%`,
                      "Eficiência",
                    ]}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="text-center mt-4">
                <p className="text-2xl font-bold text-energy-green-dark">
                  {Math.min(100, (totalConsumption / 250) * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-muted-foreground">
                  vs. Média Nacional
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analysis Card */}
        <div className="bg-background p-6 rounded-2xl shadow-lg border border-border">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-energy-green-light/10 rounded-xl">
              <Zap className="h-6 w-6 text-energy-green-dark" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Análise Inteligente
            </h3>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-energy-50 to-energy-100 dark:from-slate-700 dark:to-slate-600 rounded-xl border border-energy-200 dark:border-slate-600">
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                Seu consumo está{" "}
                <span
                  className={`font-semibold ${
                    consumptionDifference < 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {consumptionPercent}%{" "}
                  {consumptionDifference < 0 ? "abaixo" : "acima"}
                </span>{" "}
                da média para residências do seu perfil em sua região.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  {((totalConsumption / 250) * 100).toFixed(0)}%
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  vs. Média Nacional
                </div>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                  {((1 - totalConsumption / 250) * 100).toFixed(0)}%
                </div>
                <div className="text-sm text-green-700 dark:text-green-300">
                  Potencial de Economia
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsumptionTab;
