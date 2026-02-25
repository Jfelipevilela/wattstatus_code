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
  historicalData?: any[];
  dailyTrendData?: Array<{ day: string; values: Record<string, number> }>;
}

const ConsumptionTab: React.FC<ConsumptionTabProps> = ({
  totalConsumption,
  totalCost,
  consumptionDifference,
  consumptionPercent,
  consumptionData,
  selectedMonth,
  setSelectedMonth,
  historicalData = [],
  dailyTrendData = [],
}) => {
  const [activeAppliance, setActiveAppliance] = useState<string>(
    consumptionData.length > 0 ? consumptionData[0].name : ""
  );
  const daysInMonth = useMemo(() => {
    const year = new Date().getFullYear();
    return new Date(year, selectedMonth, 0).getDate();
  }, [selectedMonth]);

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

  const topAppliances = useMemo(() => filteredData.slice(0, 5), [filteredData]);

  const fallbackDailyTrend = useMemo(() => {
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    return days.map((day) => {
      const entry: Record<string, any> = { day: `Dia ${day}` };
      topAppliances.forEach((appliance) => {
        const daily = appliance.consumo / daysInMonth;
        entry[appliance.name] = Number(daily.toFixed(2));
      });
      return entry;
    });
  }, [daysInMonth, topAppliances]);

  const resolvedDailyTrend = useMemo(() => {
    if (dailyTrendData && dailyTrendData.length > 0) {
      const totals = new Map<string, number>();
      dailyTrendData.forEach((row) => {
        Object.entries(row.values || {}).forEach(([name, minutes]) => {
          totals.set(name, (totals.get(name) || 0) + Number(minutes || 0));
        });
      });
      const devices = Array.from(totals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);
      const rows = dailyTrendData.map((row) => {
        const formatted: Record<string, number | string> = {
          day: row.day.includes("-")
            ? row.day.split("-").reverse().join("/")
            : row.day,
        };
        devices.forEach((device) => {
          formatted[device] = Number((row.values || {})[device] || 0);
        });
        return formatted;
      });
      return { rows, devices };
    }
    return {
      rows: fallbackDailyTrend,
      devices: topAppliances.map((item) => item.name),
    };
  }, [dailyTrendData, fallbackDailyTrend, topAppliances]);

  const barColors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3, #22c55e)",
    "var(--chart-4, #eab308)",
    "var(--chart-5, #ef4444)",
  ];

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
              {totalConsumption.toFixed(1)}
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
              Consumo por Aparelho (kWh/mes)
            </CardTitle>
            <CardDescription>
              Consumo mensal por aparelho cadastrado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                consumo: {
                  label: "Consumo (kWh)",
                  color: "var(--chart-1)",
                },
              }}
            >
              <BarChart accessibilityLayer data={filteredData}>
                <defs>
                  <linearGradient id="bar-consumo" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.85}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-1)"
                      stopOpacity={0.25}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="4 6"
                  stroke="#e5e7eb"
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => value.slice(0, 10)}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.12 }}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _key, item) => {
                        const cost = (item?.payload?.custo as number) ?? 0;
                        return [
                          `${Number(value).toFixed(1)} kWh · R$ ${Number(
                            cost
                          ).toFixed(2)}`,
                          " ",
                          item?.payload?.name || "",
                        ];
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="consumo"
                  fill="url(#bar-consumo)"
                  radius={[12, 12, 8, 8]}
                  name="Consumo (kWh)"
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
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _key, item) => {
                        const pct =
                          totalConsumption > 0
                            ? `${(
                                (Number(value) / totalConsumption) *
                                100
                              ).toFixed(1)}%`
                            : "0%";
                        return [
                          `${Number(value).toFixed(1)} kWh • ${pct}`,
                          " ",
                          (item as any)?.name,
                        ];
                      }}
                    />
                  }
                />
                <Pie
                  data={consumptionData}
                  dataKey="consumo"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                  cornerRadius={6}
                  stroke="#0f172a"
                  strokeWidth={2}
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
                      fill={`hsl(${index * 45}, 70%, 55%)`}
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Daily Trend */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-yellow/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-energy-yellow" />
              </div>
              Tendencia diaria por aparelho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={resolvedDailyTrend.rows}>
                  <defs>
                    {resolvedDailyTrend.devices.map((_, idx) => (
                      <linearGradient
                        key={`grad-${idx}`}
                        id={`trend-${idx}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={barColors[idx % barColors.length]}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor={barColors[idx % barColors.length]}
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="4 6"
                    stroke="#e5e7eb"
                  />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value: number, key: string) => [
                      `${value.toFixed(dailyTrendData.length > 0 ? 0 : 2)} ${
                        dailyTrendData.length > 0 ? "min" : "kWh"
                      }`,
                      key,
                    ]}
                    cursor={{
                      stroke: "var(--chart-1)",
                      strokeWidth: 1,
                      opacity: 0.35,
                    }}
                  />
                  {resolvedDailyTrend.devices.map((name, idx) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={barColors[idx % barColors.length]}
                      fill={`url(#trend-${idx})`}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                {dailyTrendData.length > 0
                  ? "Minutos ligados por dia com base no historico salvo no banco."
                  : "Consumo medio diario estimado (kWh/dia) dos 5 aparelhos com maior consumo no mes."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Consumption History line simplified */}
        <Card className="p-6 hover:shadow-xl transition-all duration-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 bg-energy-blue-light/10 dark:bg-energy-blue-light/5 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-800 dark:text-energy-blue-light" />
              </div>
              Histórico de Consumo (últimos 6 meses)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={(historicalData || []).slice(-6)}
                  margin={{
                    top: 10,
                    right: 24,
                    left: 8,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="4 6"
                    stroke="#e5e7eb"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value.toFixed(1)} kWh`,
                      "Consumo",
                    ]}
                    labelFormatter={(label) => `${label}`}
                    cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="consumption"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ fill: "#2563eb", strokeWidth: 2, r: 5 }}
                    activeDot={{ r: 8, stroke: "#2563eb", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConsumptionTab;
