import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Zap } from "lucide-react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DataState } from "@/components/DataState";
import ConsumptionTab from "@/components/tabs/ConsumptionTab";
import IntegrationUsage from "@/components/IntegrationUsage";
import { useAppliances } from "@/hooks/useAppliances";
import {
  getMonthlyEstimate,
  getEstimateHistory,
  formatNumber,
} from "@/lib/energy";

export default function Dashboard() {
  const { appliances, loading, error, refetch, lastUpdated } = useAppliances();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const estimate = getMonthlyEstimate(appliances, selectedYear, selectedMonth);
  const history = getEstimateHistory(appliances, selectedYear, selectedMonth);
  const years = Array.from(
    new Set([
      now.getFullYear(),
      selectedYear,
      ...appliances
        .map((appliance) => new Date(appliance.createdAt).getFullYear())
        .filter(Number.isFinite),
    ]),
  );
  const firstYear = Math.min(now.getFullYear() - 5, ...years);
  const lastYear = Math.max(now.getFullYear() + 1, ...years);
  const periodLabel = new Date(
    selectedYear,
    selectedMonth - 1,
    1,
  ).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const measured = appliances.filter(
    (appliance) => appliance.measuredConsumptionKWh > 0,
  );
  const missingDates = appliances.filter(
    (appliance) => !Number.isFinite(new Date(appliance.createdAt).getTime()),
  ).length;
  const selectClass =
    "h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Zap className="h-5 w-5 text-energy-green-light" />
          <span className="font-semibold">Visão geral</span>
        </header>
        <main className="container mx-auto min-w-0 space-y-6 px-4 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Sua energia em resumo</h1>
              <p className="mt-2 text-muted-foreground">
                Acompanhe estimativas de gastos e os dados disponíveis dos seus
                dispositivos.
              </p>
            </div>
            <Button asChild className="h-11 shrink-0">
              <Link to="/aparelhos?adicionar=1">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar aparelho
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dashboard-month">Mês da estimativa</Label>
              <select
                id="dashboard-month"
                className={selectClass}
                value={selectedMonth}
                onChange={(event) =>
                  setSelectedMonth(Number(event.target.value))
                }
              >
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index} value={index + 1}>
                    {new Date(2000, index, 1).toLocaleDateString("pt-BR", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dashboard-year">Ano</Label>
              <select
                id="dashboard-year"
                className={selectClass}
                value={selectedYear}
                onChange={(event) =>
                  setSelectedYear(Number(event.target.value))
                }
              >
                {Array.from(
                  { length: lastYear - firstYear + 1 },
                  (_, index) => lastYear - index,
                ).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setSelectedMonth(now.getMonth() + 1);
                setSelectedYear(now.getFullYear());
              }}
            >
              Mês atual
            </Button>
          </div>
          <DataState loading={loading} error={error} onRetry={refetch} />
          {!loading && !error && (
            <>
              {appliances.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Vamos começar?</CardTitle>
                    <CardDescription>
                      Cadastre seu primeiro aparelho para estimar o consumo ou
                      conecte uma integração para importar dispositivos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 sm:flex-row">
                    <Button asChild className="h-11">
                      <Link to="/aparelhos?adicionar=1">
                        Cadastrar primeiro aparelho
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11">
                      <Link to="/apps">Conectar integração</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                    <p className="font-medium">
                      Estimativa mensal · {periodLabel}
                    </p>
                    <p className="text-muted-foreground">
                      Usa a potência, o tempo de uso e a tarifa cadastrados
                      atualmente, para um mês completo. Os dias de uso são
                      limitados aos {estimate.days} dias deste mês. Aparelhos
                      cadastrados até o fim do período continuam nos meses
                      seguintes.
                    </p>
                    <p className="text-muted-foreground">
                      Alterações ou exclusões de aparelhos podem mudar projeções
                      de meses anteriores. Leituras importadas não entram nestas
                      estimativas.
                    </p>
                    {lastUpdated && (
                      <p className="text-xs text-muted-foreground">
                        Cadastro consultado em{" "}
                        {lastUpdated.toLocaleString("pt-BR")}. Este horário não
                        é o da medição dos dispositivos.
                      </p>
                    )}
                    {missingDates > 0 && (
                      <p>
                        {missingDates} aparelho(s) sem data válida não puderam
                        ser incluídos na estimativa por período.
                      </p>
                    )}
                  </div>
                  {estimate.rows.length > 0 ? (
                    <ConsumptionTab
                      totalConsumption={estimate.consumption}
                      totalCost={estimate.cost}
                      consumptionData={estimate.rows}
                      selectedMonth={selectedMonth}
                      selectedYear={selectedYear}
                      historicalData={history}
                    />
                  ) : (
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          Nenhum aparelho disponível neste período
                        </CardTitle>
                        <CardDescription>
                          Não há aparelhos com cadastro válido até o fim de{" "}
                          {periodLabel}. Selecione outro mês ou adicione um
                          aparelho.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedMonth(now.getMonth() + 1);
                            setSelectedYear(now.getFullYear());
                          }}
                        >
                          Voltar ao mês atual
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  {measured.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          Leituras importadas dos dispositivos
                        </CardTitle>
                        <CardDescription>
                          Valores medidos pelo dispositivo e salvos na
                          importação. O período e o horário de medição não foram
                          informados; estas leituras não seguem o filtro mensal
                          acima.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ul className="divide-y">
                          {measured.map((appliance) => (
                            <li
                              key={appliance.id}
                              className="flex flex-wrap justify-between gap-2 py-3"
                            >
                              <span>
                                {appliance.name}{" "}
                                <span className="text-xs text-muted-foreground">
                                  (
                                  {appliance.integrationProvider ||
                                    "Dispositivo"}
                                  )
                                </span>
                              </span>
                              <strong>
                                {formatNumber(
                                  appliance.measuredConsumptionKWh!,
                                )}{" "}
                                kWh
                              </strong>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
              <IntegrationUsage appliances={appliances} />
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
