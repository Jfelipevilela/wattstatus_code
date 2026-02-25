import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
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
    color: "#2563eb",
  },
  media: {
    label: "Media regional",
    color: "#22c55e",
  },
} satisfies ChartConfig;

const ConsumptionChart: React.FC<ConsumptionChartProps> = ({ title, data }) => {
  return (
    <Card className="h-full bg-white dark:bg-black border border-energy-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-energy-800 dark:text-white">{title}</CardTitle>
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
            <defs>
              <linearGradient id="grad-consumo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-consumo)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-consumo)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="grad-media" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-media)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-media)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  formatter={(value, key) =>
                    key === "consumo" || key === "media"
                      ? `${Number(value).toFixed(2)} kWh`
                      : String(value)
                  }
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              dataKey="consumo"
              type="monotone"
              fill="url(#grad-consumo)"
              fillOpacity={1}
              stroke="var(--color-consumo)"
              strokeWidth={2.5}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
            <Area
              dataKey="media"
              type="monotone"
              fill="url(#grad-media)"
              fillOpacity={1}
              stroke="var(--color-media)"
              strokeDasharray="6 4"
              strokeWidth={2.5}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default ConsumptionChart;
