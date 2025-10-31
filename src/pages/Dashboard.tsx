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
import { useAppliances, Appliance } from "@/hooks/useAppliances";

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

  // Load historical data from localStorage on component mount
  useEffect(() => {
    const storedData = localStorage.getItem("wattstatus_historical_data");
    if (storedData) {
      setHistoricalData(JSON.parse(storedData));
    } else {
      // Initialize with some sample historical data
      const sampleData = [
        { month: "Jan", consumption: 220, cost: 165 },
        { month: "Fev", consumption: 240, cost: 180 },
        { month: "Mar", consumption: 260, cost: 195 },
        { month: "Abr", consumption: 250, cost: 187.5 },
        { month: "Mai", consumption: 230, cost: 172.5 },
        { month: "Jun", consumption: 0, cost: 0 },
      ];
      setHistoricalData(sampleData);
      localStorage.setItem(
        "wattstatus_historical_data",
        JSON.stringify(sampleData)
      );
    }
  }, []);

  // Save current month data to localStorage
  const saveCurrentMonthData = () => {
    const currentMonth = new Date().toLocaleString("pt-BR", { month: "short" });
    const newData = {
      month: currentMonth,
      consumption: totalConsumption,
      cost: totalCost,
    };
    const updatedData = [
      ...historicalData.filter((d) => d.month !== currentMonth),
      newData,
    ];
    setHistoricalData(updatedData);
    localStorage.setItem(
      "wattstatus_historical_data",
      JSON.stringify(updatedData)
    );
  };

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

  const handleSaveEditedAppliance = (updatedAppliance: Appliance) => {
    updateAppliance(updatedAppliance);
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

  function handleAddAppliance(appliance: Appliance): void {
    addAppliance(appliance);
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
              <div className="absolute top-0 right-0 flex items-center gap-3 p-3  dark:bg-background rounded-lg shadow-sm border">
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
                />
              </TabsContent>
            </Tabs>
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
