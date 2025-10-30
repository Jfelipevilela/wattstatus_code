import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

interface ConsumptionChartProps {
  title: string;
  data: Array<{
    name: string;
    consumo: number;
    media: number;
  }>;
}

const chartConfig = {
  consumo: {
    label: "Seu consumo",
    color: "#2196F3",
  },
  media: {
    label: "Média regional",
    color: "#4CAF50",
  },
} satisfies ChartConfig;

const ConsumptionChart: React.FC<ConsumptionChartProps> = ({ title, data }) => {
  return (
    <Card className="h-full bg-white dark:bg-black border border-energy-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-energy-800 dark:text-white">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-80">
          <AreaChart
            data={data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" formatter={(value) => `${value} kWh`} />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="consumo"
              type="natural"
              fill="var(--color-consumo)"
              fillOpacity={0.4}
              stroke="var(--color-consumo)"
              stackId="a"
            />
            <Area
              dataKey="media"
              type="natural"
              fill="var(--color-media)"
              fillOpacity={0.4}
              stroke="var(--color-media)"
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default ConsumptionChart;
