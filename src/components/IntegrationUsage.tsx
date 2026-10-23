import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
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
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/DataState";
import { useAuth } from "@/hooks/useAuth";
import type { Appliance } from "@/hooks/useAppliances";
import { apiRequest } from "@/lib/api";
import { formatNumber } from "@/lib/energy";

type Analytics = {
  dailyTrend: Array<{ day: string; values: Record<string, number> }>;
  appUsage: Array<{ provider: string; minutes: number; devices: number }>;
};
type Usage = {
  usage: Array<{
    deviceId: string;
    deviceName?: string;
    accumulatedMs: number;
    lastOn?: string | null;
    day?: string;
  }>;
};
const colors = ["#15803d", "#0369a1", "#a16207", "#7e22ce", "#be123c"];

export default function IntegrationUsage({
  appliances,
}: {
  appliances: Appliance[];
}) {
  const { token, user } = useAuth();
  const analytics = useQuery({
    queryKey: ["integration-analytics", user?.id],
    enabled: Boolean(user),
    retry: false,
    refetchInterval: 60000,
    queryFn: () =>
      apiRequest<Analytics>(
        "/api/analytics/usage",
        { skipErrorToast: true },
        token || undefined,
      ),
  });
  const usage = useQuery({
    queryKey: ["integration-usage", user?.id],
    enabled: Boolean(user),
    retry: false,
    refetchInterval: 30000,
    queryFn: () =>
      apiRequest<Usage>(
        "/api/integrations/smartthings/usage",
        { skipErrorToast: true },
        token || undefined,
      ),
  });
  const totals = new Map<string, number>();
  analytics.data?.dailyTrend.forEach((row) =>
    Object.entries(row.values).forEach(([name, minutes]) =>
      totals.set(name, (totals.get(name) || 0) + minutes),
    ),
  );
  const devices = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  const trend =
    analytics.data?.dailyTrend.map((row) => ({
      day: row.day.split("-").reverse().join("/"),
      ...Object.fromEntries(
        devices.map((name, index) => [`device${index}`, row.values[name] || 0]),
      ),
    })) || [];
  const providerData =
    analytics.data?.appUsage.map((item) => ({
      name:
        item.provider === "smartthings"
          ? "SmartThings"
          : item.provider === "lg-thinq"
            ? "LG ThinQ"
            : item.provider,
      hours: item.minutes / 60,
    })) || [];
  const deviceData =
    usage.data?.usage.map((entry) => ({
      name:
        entry.deviceName ||
        appliances.find(
          (appliance) => appliance.integrationDeviceId === entry.deviceId,
        )?.name ||
        `Dispositivo ${entry.deviceId.slice(0, 4)}`,
      // Display the recorded counter, without extrapolating a possibly stale lastOn timestamp.
      minutes: Math.max(0, entry.accumulatedMs || 0) / 60000,
    })) || [];
  return (
    <section className="space-y-4" aria-labelledby="integration-heading">
      <div>
        <h2 id="integration-heading" className="text-xl font-semibold">
          Dados das integrações
        </h2>
        <p className="text-sm text-muted-foreground">
          Tempo de uso registrado pelas integrações. Os períodos abaixo são
          independentes do filtro da estimativa mensal.
        </p>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">
              Tempo de uso por integração
            </CardTitle>
            <CardDescription>
              Histórico recente disponível, em horas. Consulta automática a cada
              minuto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataState
              loading={analytics.isPending}
              error={analytics.error?.message}
              onRetry={() => {
                void analytics.refetch();
              }}
            />
            {!analytics.isPending &&
              !analytics.isError &&
              (providerData.length ? (
                <>
                  <ChartContainer
                    config={{ hours: { label: "Horas", color: "#15803d" } }}
                    className="h-64 w-full"
                  >
                    <BarChart accessibilityLayer data={providerData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis
                        width={45}
                        tickFormatter={(value: number) =>
                          formatNumber(value, 0)
                        }
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) =>
                              `${formatNumber(Number(value))} h`
                            }
                          />
                        }
                      />
                      <Bar
                        dataKey="hours"
                        fill="#15803d"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Consultado em{" "}
                    {new Date(analytics.dataUpdatedAt).toLocaleString("pt-BR")}
                    {trend.length > 0 &&
                      ` · Registros de ${trend[0].day} a ${trend[trend.length - 1].day}`}
                    .
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ainda não há histórico de uso disponível.
                </p>
              ))}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">
              Tempo registrado por dispositivo
            </CardTitle>
            <CardDescription>
              Contadores de uso do SmartThings, em minutos. Consulta automática
              a cada 30 segundos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataState
              loading={usage.isPending}
              error={usage.error?.message}
              onRetry={() => {
                void usage.refetch();
              }}
            />
            {!usage.isPending &&
              !usage.isError &&
              (deviceData.length ? (
                <>
                  <ChartContainer
                    config={{ minutes: { label: "Minutos", color: "#0369a1" } }}
                    className="h-64 w-full"
                  >
                    <BarChart accessibilityLayer data={deviceData}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="name"
                        tickFormatter={(value: string) => value.slice(0, 12)}
                      />
                      <YAxis
                        width={45}
                        tickFormatter={(value: number) =>
                          formatNumber(value, 0)
                        }
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) =>
                              `${formatNumber(Number(value), 1)} min`
                            }
                          />
                        }
                      />
                      <Bar
                        dataKey="minutes"
                        fill="#0369a1"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Consultado em{" "}
                    {new Date(usage.dataUpdatedAt).toLocaleString("pt-BR")}.
                    Contadores salvos; não representam consumo em kWh.
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Nenhum registro de uso disponível. Conecte seus dispositivos
                    para começar.
                  </p>
                  <Button asChild variant="outline">
                    <Link to="/apps">Ver integrações</Link>
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
      {!analytics.isError && trend.length > 0 && devices.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg">Tempo de uso por dia</CardTitle>
            <CardDescription>
              Cinco dispositivos com maior tempo registrado no histórico
              disponível, em minutos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={Object.fromEntries(
                devices.map((name, index) => [
                  `device${index}`,
                  { label: name, color: colors[index] },
                ]),
              )}
              className="h-72 w-full"
            >
              <LineChart accessibilityLayer data={trend}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" />
                <YAxis width={45} />
                <Legend />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) =>
                        `${devices[Number(String(name).replace("device", ""))] || name}: ${formatNumber(Number(value), 0)} min`
                      }
                    />
                  }
                />
                {devices.map((name, index) => (
                  <Line
                    key={name}
                    name={name}
                    dataKey={`device${index}`}
                    stroke={colors[index]}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
