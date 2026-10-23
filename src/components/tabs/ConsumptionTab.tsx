import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  Legend,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/energy";

interface Props {
  totalConsumption: number;
  totalCost: number;
  consumptionData: Array<{
    id?: string;
    name: string;
    consumo: number;
    custo: number;
  }>;
  selectedMonth: number;
  selectedYear?: number;
  historicalData?: Array<{ month: string; consumption: number; cost: number }>;
  consumptionDifference?: number;
  consumptionPercent?: string;
  setSelectedMonth?: (month: number) => void;
}
const colors = [
  "#15803d",
  "#0369a1",
  "#a16207",
  "#7e22ce",
  "#be123c",
  "#0f766e",
];
export default function ConsumptionTab({
  totalConsumption,
  totalCost,
  consumptionData,
  selectedMonth,
  selectedYear = new Date().getFullYear(),
  historicalData = [],
}: Props) {
  const days = new Date(selectedYear, selectedMonth, 0).getDate();
  const sorted = [...consumptionData].sort((a, b) => b.consumo - a.consumo);
  const distribution = sorted
    .slice(0, 5)
    .map((row) => ({ name: row.name, consumo: row.consumo }));
  if (sorted.length > 5)
    distribution.push({
      name: "Outros aparelhos",
      consumo: sorted.slice(5).reduce((sum, row) => sum + row.consumo, 0),
    });
  const biggestCost = [...consumptionData].sort((a, b) => b.custo - a.custo)[0];
  const cards = [
    {
      title: "Consumo estimado",
      value: `${formatNumber(totalConsumption, 1)} kWh`,
      help: "No mês selecionado",
    },
    {
      title: "Custo estimado",
      value: formatCurrency(totalCost),
      help: "Com a tarifa de referência cadastrada",
    },
    {
      title: "Média diária estimada",
      value: `${formatNumber(totalConsumption / days, 1)} kWh`,
      help: `Distribuída pelos ${days} dias do mês`,
    },
    {
      title: "Maior gasto estimado",
      value: biggestCost?.name || "Sem aparelhos",
      help: biggestCost
        ? `${formatCurrency(biggestCost.custo)} no mês`
        : "Cadastre um aparelho para começar",
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="break-words text-2xl font-bold">{card.value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{card.help}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">
              Consumo estimado por aparelho
            </CardTitle>
            <CardDescription>
              Os maiores consumos aparecem primeiro, em kWh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                consumo: { label: "Estimativa (kWh)", color: "#15803d" },
              }}
              className="h-72 w-full"
            >
              <BarChart accessibilityLayer data={sorted}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  tickFormatter={(value: string) =>
                    value.length > 12 ? `${value.slice(0, 12)}…` : value
                  }
                />
                <YAxis
                  tickFormatter={(value: number) => formatNumber(value, 0)}
                  width={45}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _, item) => (
                        <span>
                          {item.payload.name}: {formatNumber(Number(value))} kWh
                          · {formatCurrency(item.payload.custo)}
                        </span>
                      )}
                    />
                  }
                />
                <Bar dataKey="consumo" fill="#15803d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">
              Participação no consumo estimado
            </CardTitle>
            <CardDescription>
              Cinco maiores consumidores e o total dos demais aparelhos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {totalConsumption > 0 ? (
              <ChartContainer
                config={{ consumo: { label: "Estimativa (kWh)" } }}
                className="h-72 w-full"
              >
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="consumo"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="65%"
                  >
                    {distribution.map((row, index) => (
                      <Cell
                        key={`${row.name}-${index}`}
                        fill={colors[index % colors.length]}
                      />
                    ))}
                  </Pie>
                  <Legend />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, _, item) => (
                          <span>
                            {item.payload.name}: {formatNumber(Number(value))}{" "}
                            kWh (
                            {formatNumber(
                              (Number(value) / totalConsumption) * 100,
                              1,
                            )}
                            %)
                          </span>
                        )}
                      />
                    }
                  />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="py-12 text-center text-muted-foreground">
                Sem consumo estimado para distribuir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {historicalData.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">
              Estimativas dos últimos seis meses
            </CardTitle>
            <CardDescription>
              Projeções com os dados atuais dos aparelhos, até o mês
              selecionado. Não são medições históricas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                consumption: {
                  label: "Consumo estimado (kWh)",
                  color: "#0369a1",
                },
              }}
              className="h-64 w-full"
            >
              <LineChart accessibilityLayer data={historicalData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" />
                <YAxis
                  width={45}
                  tickFormatter={(value: number) => formatNumber(value, 0)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        `${formatNumber(Number(value))} kWh`
                      }
                    />
                  }
                />
                <Line
                  dataKey="consumption"
                  type="monotone"
                  stroke="#0369a1"
                  strokeWidth={2}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
