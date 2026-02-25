import { useState, useEffect } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import ConsumptionTab from "@/components/tabs/ConsumptionTab";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import EditApplianceModal from "@/components/EditApplianceModal";
import { Zap } from "lucide-react";
import jsPDF from "jspdf";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppliances, Appliance, ApplianceInput } from "@/hooks/useAppliances";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const TARIFF = 0.75; // R$ per kWh
const AVERAGE_CONSUMPTION = 250; // example average consumption in kWh

const initialAppliances: Appliance[] = [
  // initial appliances can be uncommented or empty
];

const anomalies = [
  {
    id: 1,
    deviceName: "Geladeira",
    anomalyScore: 85,
    description: "Consumo acima do esperado para o período.",
    recommendation: "Verifique se a porta está fechando corretamente.",
  },
  {
    id: 2,
    deviceName: "Ar Condicionado",
    anomalyScore: 90,
    description: "Uso prolongado detectado.",
    recommendation: "Considere ajustar o timer para desligamento automático.",
  },
];

// const energySavingTips = [
//   {
//     id: 1,
//     title: "Otimize o uso do ar condicionado",
//     description:
//       "Manter a temperatura em 23°C pode reduzir significativamente o consumo sem afetar o conforto.",
//     savingEstimate: "Até R$ 45,00/mês",
//   },
//   {
//     id: 2,
//     title: "Substitua lâmpadas por LED",
//     description:
//       "Lâmpadas LED usam até 85% menos energia que as incandescentes e duram muito mais.",
//     savingEstimate: "Até R$ 20,00/mês",
//   },
//   {
//     id: 3,
//     title: "Desligue dispositivos em standby",
//     description:
//       "Aparelhos em modo de espera podem representar até 10% do consumo residencial.",
//     savingEstimate: "Até R$ 30,00/mês",
//   },
// ];

const Dashboard = () => {
  const { appliances, addAppliance, updateAppliance, deleteAppliance } =
    useAppliances();
  const [period, setPeriod] = useState("mensal");
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("current");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [smartUsage, setSmartUsage] = useState<{ name: string; minutes: number }[]>([]);
  const { token, user } = useAuth();
  const [dailyTrendData, setDailyTrendData] = useState<
    Array<{ day: string; values: Record<string, number> }>
  >([]);
  const [appUsage, setAppUsage] = useState<
    Array<{ provider: string; minutes: number; devices: number }>
  >([]);

  // Modal state for editing
  const [editingAppliance, setEditingAppliance] = useState<Appliance | null>(
    null
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Modal state for deletion
  const [deleteApplianceModal, setDeleteApplianceModal] =
    useState<Appliance | null>(null);

  // Calculate total consumption and cost based on selected month
  const getDaysInMonth = (
    month: number,
    year: number = new Date().getFullYear()
  ) => {
    return new Date(year, month, 0).getDate();
  };

  // Filter appliances by selected month
  const filteredAppliances = appliances.filter((appliance) => {
    const createdDate = new Date(appliance.createdAt);
    const applianceMonth = createdDate.getMonth() + 1;
    return applianceMonth === selectedMonth;
  });

  const daysInSelectedMonth = getDaysInMonth(selectedMonth);

  const totalConsumption = filteredAppliances.reduce(
    (total, appliance) => total + appliance.monthlyConsumption,
    0
  );

  const totalCost = filteredAppliances.reduce(
    (total, appliance) => total + appliance.monthlyCost,
    0
  );

  // Deriva historico basico a partir dos aparelhos persistidos no backend
  useEffect(() => {
    const now = new Date();
    const monthsBack = 6;
    const history: { month: string; consumption: number; cost: number }[] = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = date.toLocaleString("pt-BR", { month: "short" });
      const consumption = appliances.reduce(
        (sum, a) => sum + (a.monthlyConsumption || 0),
        0
      );
      const cost = appliances.reduce(
        (sum, a) => sum + (a.monthlyCost || 0),
        0
      );
      history.push({ month: label, consumption, cost });
    }
    setHistoricalData(history);
  }, [appliances]);

  // Carrega analytics persistidos (uso por app e tendencia diaria)
  useEffect(() => {
    if (!user) return;
    const loadAnalytics = async () => {
      try {
        const resp = await apiRequest<{
          dailyTrend: Array<{ day: string; values: Record<string, number> }>;
          appUsage: Array<{ provider: string; minutes: number; devices: number }>;
        }>("/api/analytics/usage", { method: "GET" }, token || undefined);
        setDailyTrendData(resp.dailyTrend || []);
        setAppUsage(resp.appUsage || []);
      } catch (err) {
        console.error("Erro ao carregar analytics do backend", err);
      }
    };
    loadAnalytics();
    const id = setInterval(loadAnalytics, 60000);
    return () => clearInterval(id);
  }, [token, user]);

  // Load SmartThings tempo de uso (persistido no backend)
  useEffect(() => {
    if (!user) return;
    const loadUsage = async () => {
      try {
        const resp = await apiRequest<{
          usage: Array<{
            deviceId: string;
            accumulatedMs: number;
            lastOn?: string | null;
            deviceName?: string | null;
          }>;
        }>("/api/integrations/smartthings/usage", { method: "GET" }, token || undefined);
        const now = Date.now();
        const data = resp.usage.map((entry) => {
          const total =
            (entry.accumulatedMs || 0) +
            (entry.lastOn ? now - new Date(entry.lastOn).getTime() : 0);
          const applianceName =
            entry.deviceName ||
            appliances.find((a) => a.integrationDeviceId === entry.deviceId)?.name ||
            `Dispositivo ${entry.deviceId.slice(0, 4)}`;
          return { name: applianceName, minutes: Math.floor(total / 60000) };
        });
        setSmartUsage(data);
      } catch (err) {
        console.error("Erro ao carregar tempo de uso SmartThings", err);
      }
    };
    loadUsage();
    const id = setInterval(loadUsage, 30000);
    return () => clearInterval(id);
  }, [appliances, token, user]);

  const usageChartData = smartUsage.map((item, idx) => ({
    ...item,
    color: idx === 0 ? "var(--chart-1)" : idx === 1 ? "var(--chart-2)" : "var(--chart-3, #0ea5e9)",
  }));
  const appUsageChartData = appUsage
    .map((item) => ({
      app:
        item.provider === "smartthings"
          ? "SmartThings"
          : item.provider === "lg-thinq"
          ? "LG ThinQ"
          : item.provider,
      minutes: item.minutes,
      hours: Number((item.minutes / 60).toFixed(1)),
      devices: item.devices,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  // Calculate efficiency score (0-100 based on consumption vs average)
  const efficiencyScore = Math.max(
    0,
    Math.min(100, 100 - (totalConsumption / AVERAGE_CONSUMPTION) * 50)
  );

  // Calculate accumulated savings (sum of tip estimates)
  // const accumulatedSavings = energySavingTips.reduce((total, tip) => {
  //   const match = tip.savingEstimate.match(/R\$ (\d+),(\d+)/);
  //   return total + (match ? parseFloat(match[1] + "." + match[2]) : 0);
  // }, 0);

  // Calculate previous month comparison
  const previousMonthConsumption =
    historicalData.length > 1
      ? historicalData[historicalData.length - 2].consumption
      : totalConsumption;
  const monthOverMonthChange =
    previousMonthConsumption === 0
      ? 0
      : ((totalConsumption - previousMonthConsumption) /
          previousMonthConsumption) *
        100;

  // Export data function
  const exportData = async () => {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    // Title
    pdf.setFontSize(20);
    pdf.text("Relatório de Consumo de Energia - WattStatus", margin, yPosition);
    yPosition += 20;

    // Date
    pdf.setFontSize(12);
    pdf.text(
      `Data: ${new Date().toLocaleDateString("pt-BR")}`,
      margin,
      yPosition
    );
    yPosition += 15;

    // Current Consumption
    pdf.setFontSize(16);
    pdf.text("Consumo Atual", margin, yPosition);
    yPosition += 10;
    pdf.setFontSize(12);
    pdf.text(
      `Consumo mensal: ${totalConsumption.toFixed(0)} kWh`,
      margin,
      yPosition
    );
    yPosition += 8;
    pdf.text(`Custo estimado: R$ ${totalCost.toFixed(2)}`, margin, yPosition);
    yPosition += 8;
    pdf.text(
      `Média diária: ${(totalConsumption / 30).toFixed(1)} kWh/dia`,
      margin,
      yPosition
    );
    yPosition += 8;
    pdf.text(
      `Impacto ambiental: ${(totalConsumption * 0.42).toFixed(0)} kg CO₂`,
      margin,
      yPosition
    );
    yPosition += 15;

    // Efficiency Score
    pdf.setFontSize(16);
    pdf.text("Indicadores de Performance", margin, yPosition);
    yPosition += 10;
    pdf.setFontSize(12);
    pdf.text(
      `Score de Eficiência: ${efficiencyScore.toFixed(0)}%`,
      margin,
      yPosition
    );
    yPosition += 8;
    pdf.text(
      `Mês a Mês: ${
        monthOverMonthChange >= 0 ? "+" : ""
      }${monthOverMonthChange.toFixed(1)}%`,
      margin,
      yPosition
    );
    yPosition += 8;
    // pdf.text(
    //   // `Economias Potenciais: R$ ${accumulatedSavings.toFixed(2)}`,
    //   margin,
    //   yPosition
    // );
    yPosition += 15;

    // Appliances
    if (appliances.length > 0) {
      pdf.setFontSize(16);
      pdf.text("Aparelhos Cadastrados", margin, yPosition);
      yPosition += 10;
      pdf.setFontSize(12);
      appliances.forEach((appliance) => {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(
          `${appliance.name}: ${appliance.power}W, ${
            appliance.usageHours
          }h/dia, R$ ${appliance.monthlyCost.toFixed(2)}/mês`,
          margin,
          yPosition
        );
        yPosition += 8;
      });
      yPosition += 10;
    }

    // Historical Data
    if (historicalData.length > 0) {
      pdf.setFontSize(16);
      pdf.text("Histórico de Consumo", margin, yPosition);
      yPosition += 10;
      pdf.setFontSize(12);
      historicalData.slice(-6).forEach((data) => {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(
          `${data.month}: ${data.consumption} kWh, R$ ${data.cost.toFixed(2)}`,
          margin,
          yPosition
        );
        yPosition += 8;
      });
    }

    // Save the PDF
    pdf.save("wattstatus_relatorio.pdf");
  };

  const openEditModal = (appliance: Appliance) => {
    setEditingAppliance(appliance);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditingAppliance(null);
    setIsEditModalOpen(false);
  };

  const handleSaveEditedAppliance = async (
    id: string,
    updates: ApplianceInput
  ) => {
    await updateAppliance(id, updates);
  };

  const openDeleteModal = (appliance: Appliance) => {
    setDeleteApplianceModal(appliance);
  };

  const closeDeleteModal = () => {
    setDeleteApplianceModal(null);
  };

  const handleDeleteConfirm = () => {
    if (deleteApplianceModal) {
      deleteAppliance(deleteApplianceModal.id);
      closeDeleteModal();
    }
  };

  // Prepare dynamic consumption data for chart based on appliances and selected month
  const consumptionData = filteredAppliances.map((appliance) => ({
    name: appliance.name,
    consumo: appliance.monthlyConsumption,
    custo: appliance.monthlyCost,
    media: 0,
  }));

  // Determine if consumption is above or below average
  const consumptionDifference = totalConsumption - AVERAGE_CONSUMPTION;
  const consumptionPercent = Math.abs(
    (consumptionDifference / AVERAGE_CONSUMPTION) * 100
  ).toFixed(0);
  const consumptionStatus = consumptionDifference < 0 ? "abaixo" : "acima";

  async function handleAddAppliance(appliance: ApplianceInput): Promise<void> {
    await addAppliance(appliance);
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">Dashboard</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-background dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            {/* Hero Section */}
            <div className="relative mb-8">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">
                  Dashboard de Energia
                </h1>
                <p className="text-gray-600 dark:text-gray-300">
                  Monitore seu consumo de energia em tempo real
                </p>
              </div>

              {/* Month Filter - Top Right */}
              <div className="mt-4 sm:absolute sm:top-0 sm:right-0 flex items-center gap-3 p-3 bg-white dark:bg-background rounded-lg shadow-sm border">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Filtrar por mês:
                </span>
                <Select
                  value={selectedMonth.toString()}
                  onValueChange={(value) => setSelectedMonth(parseInt(value))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
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
                    ].map((month) => (
                      <SelectItem
                        key={month.value}
                        value={month.value.toString()}
                      >
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs defaultValue="consumo" className="mb-8">
              <TabsContent value="consumo">
                <ConsumptionTab
                  totalConsumption={totalConsumption}
                  totalCost={totalCost}
                  consumptionDifference={consumptionDifference}
                  consumptionPercent={consumptionPercent}
                  consumptionData={consumptionData}
                  selectedMonth={selectedMonth}
                  setSelectedMonth={setSelectedMonth}
                  historicalData={historicalData}
                  dailyTrendData={dailyTrendData}
                />
              </TabsContent>
            </Tabs>
            {(appUsageChartData.length > 0 || smartUsage.length > 0) && (
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {appUsageChartData.length > 0 && (
                  <Card className="border border-border/60 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-energy-green-light" />
                        Tempo de uso por app (ultimos 7 dias)
                      </CardTitle>
                      <CardDescription>
                        Horas somadas por integracao com base no historico salvo no banco.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={{ hours: { label: "Horas", color: "var(--chart-1)" } }}
                        className="h-72"
                      >
                        <BarChart data={appUsageChartData}>
                          <CartesianGrid
                            vertical={false}
                            strokeDasharray="4 6"
                            stroke="#e5e7eb"
                          />
                          <XAxis dataKey="app" tickLine={false} axisLine={false} />
                          <YAxis tickLine={false} axisLine={false} />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) => `${value} h`}
                                hideLabel
                              />
                            }
                          />
                          <Bar
                            dataKey="hours"
                            fill="var(--chart-1, #22c55e)"
                            radius={[12, 12, 8, 8]}
                          />
                        </BarChart>
                      </ChartContainer>
                      <div className="mt-3 text-xs text-muted-foreground">
                        Inclui {appUsageChartData.reduce((sum, item) => sum + item.devices, 0)}{" "}
                        dispositivos conectados as integracoes ativas.
                      </div>
                    </CardContent>
                  </Card>
                )}
                {smartUsage.length > 0 && (
                  <Card className="border border-border/60 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-energy-blue-light" />
                        Tempo de uso por dispositivo (ao vivo)
                      </CardTitle>
                      <CardDescription>
                        Leituras em minutos, atualizadas continuamente.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={{ tempo: { label: "Tempo (min)", color: "#0ea5e9" } }}
                        className="h-72"
                      >
                        <BarChart data={usageChartData}>
                          <CartesianGrid
                            vertical={false}
                            strokeDasharray="4 6"
                            stroke="#e5e7eb"
                          />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis tickLine={false} axisLine={false} />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) => `${value} min`}
                                hideLabel
                              />
                            }
                          />
                          <Bar
                            dataKey="minutes"
                            fill="var(--chart-1, #0ea5e9)"
                            radius={[10, 10, 6, 6]}
                          />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </main>
        </div>

        <EditApplianceModal
          appliance={editingAppliance}
          isOpen={isEditModalOpen}
          onClose={closeEditModal}
          onSave={handleSaveEditedAppliance}
        />

        <AlertDialog
          open={!!deleteApplianceModal}
          onOpenChange={(open) => !open && closeDeleteModal()}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o aparelho{" "}
                <strong>{deleteApplianceModal?.name}</strong>? Esta ação é
                permanente e não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeDeleteModal}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-red-600 text-white"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Dashboard;
