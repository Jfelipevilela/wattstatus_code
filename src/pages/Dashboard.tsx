import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ConsumptionCard from "@/components/ConsumptionCard";
import ConsumptionChart from "@/components/ConsumptionChart";
import ApplianceCard from "@/components/ApplianceCard";
import AnomalyDetection from "@/components/AnomalyDetection";
import EnergySavingTip from "@/components/EnergySavingTip";
import ApplianceCalculator from "@/components/ApplianceCalculator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Zap,
  DollarSign,
  Calendar,
  Leaf,
  Cpu,
  Lightbulb,
  Calculator,
  TrendingUp,
  TrendingDown,
  Target,
  Download,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
interface Appliance {
  id: number;
  name: string;
  power: number;
  status: "critical" | "normal" | "warning";
  usageHours: number;
  monthlyCost: number;
}

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

const energySavingTips = [
  {
    id: 1,
    title: "Otimize o uso do ar condicionado",
    description:
      "Manter a temperatura em 23°C pode reduzir significativamente o consumo sem afetar o conforto.",
    savingEstimate: "Até R$ 45,00/mês",
  },
  {
    id: 2,
    title: "Substitua lâmpadas por LED",
    description:
      "Lâmpadas LED usam até 85% menos energia que as incandescentes e duram muito mais.",
    savingEstimate: "Até R$ 20,00/mês",
  },
  {
    id: 3,
    title: "Desligue dispositivos em standby",
    description:
      "Aparelhos em modo de espera podem representar até 10% do consumo residencial.",
    savingEstimate: "Até R$ 30,00/mês",
  },
];

const Dashboard = () => {
  const [period, setPeriod] = useState("mensal");
  const [appliances, setAppliances] = useState<Appliance[]>(initialAppliances);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("current");

  // Modal state for editing
  const [editAppliance, setEditAppliance] = useState<Appliance | null>(null);
  const [editName, setEditName] = useState("");
  const [editPower, setEditPower] = useState(0);
  const [editUsageHours, setEditUsageHours] = useState(0);
  const [editMonthlyCost, setEditMonthlyCost] = useState(0);
  const [editStatus, setEditStatus] = useState<
    "critical" | "normal" | "warning"
  >("normal");

  // Modal state for deletion
  const [deleteAppliance, setDeleteAppliance] = useState<Appliance | null>(
    null
  );

  // Calculate total consumption and cost
  const totalConsumption = appliances.reduce(
    (total, appliance) =>
      total + (appliance.power * appliance.usageHours * 30) / 1000,
    0
  );

  const totalCost = appliances.reduce(
    (total, appliance) => total + appliance.monthlyCost,
    0
  );

  React.useEffect(() => {
    // Recalculate monthly cost when power or usageHours change
    const consumption = (editPower * editUsageHours * 30) / 1000; // kWh per month
    const cost = consumption * TARIFF;
    setEditMonthlyCost(parseFloat(cost.toFixed(2)));
  }, [editPower, editUsageHours]);

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
  const accumulatedSavings = energySavingTips.reduce((total, tip) => {
    const match = tip.savingEstimate.match(/R\$ (\d+),(\d+)/);
    return total + (match ? parseFloat(match[1] + "." + match[2]) : 0);
  }, 0);

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
    pdf.text(
      `Economias Potenciais: R$ ${accumulatedSavings.toFixed(2)}`,
      margin,
      yPosition
    );
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
    setEditAppliance(appliance);
    setEditName(appliance.name);
    setEditPower(appliance.power);
    setEditUsageHours(appliance.usageHours);
    setEditMonthlyCost(appliance.monthlyCost);
    setEditStatus(appliance.status);
  };

  const closeEditModal = () => {
    setEditAppliance(null);
  };

  const handleEditSave = () => {
    if (editAppliance) {
      const updatedAppliance: Appliance = {
        ...editAppliance,
        name: editName,
        power: editPower,
        usageHours: editUsageHours,
        monthlyCost: editMonthlyCost,
        status: editStatus,
      };
      setAppliances((prev) =>
        prev.map((appl) =>
          appl.id === updatedAppliance.id ? updatedAppliance : appl
        )
      );
      closeEditModal();
    }
  };

  const openDeleteModal = (appliance: Appliance) => {
    setDeleteAppliance(appliance);
  };

  const closeDeleteModal = () => {
    setDeleteAppliance(null);
  };

  const handleDeleteConfirm = () => {
    if (deleteAppliance) {
      setAppliances((prev) =>
        prev.filter((appl) => appl.id !== deleteAppliance.id)
      );
      closeDeleteModal();
    }
  };

  // Prepare dynamic consumption data for chart based on appliances
  const consumptionData = appliances.map((appliance) => ({
    name: appliance.name,
    consumo: (appliance.power * appliance.usageHours * 30) / 1000,
    media: 0,
  }));

  // Determine if consumption is above or below average
  const consumptionDifference = totalConsumption - AVERAGE_CONSUMPTION;
  const consumptionPercent = Math.abs(
    (consumptionDifference / AVERAGE_CONSUMPTION) * 100
  ).toFixed(0);
  const consumptionStatus = consumptionDifference < 0 ? "abaixo" : "acima";

  function handleAddAppliance(appliance: {
    id: number;
    name: string;
    power: number;
    status: "critical" | "normal" | "warning";
    usageHours: number;
    monthlyCost: number;
  }): void {
    setAppliances((prev) => [...prev, appliance]);
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />

      <main className="flex-grow container mx-auto px-4 pt-24 pb-10">
        <h1 className="text-3xl font-bold mb-6 text-energy-blue-dark">
          Dashboard de Energia
        </h1>

        <Tabs defaultValue="consumo" className="mb-8">
          <TabsList className="flex space-x-4 overflow-x-auto mb-8 md:grid md:grid-cols-6 md:space-x-0">
            <TabsTrigger value="consumo">Consumo</TabsTrigger>
            <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
            <TabsTrigger value="calculadora">Calculadora</TabsTrigger>
            <TabsTrigger value="aparelhos">Aparelhos</TabsTrigger>
            <TabsTrigger value="anomalias">Anomalias</TabsTrigger>
            <TabsTrigger value="dicas">Dicas de Economia</TabsTrigger>
          </TabsList>

          <TabsContent value="consumo" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <ConsumptionCard
                title="Consumo Atual"
                value={totalConsumption.toFixed(0)}
                unit="kWh/mês"
                trend={consumptionDifference < 0 ? "down" : "up"}
                percentage={parseInt(consumptionPercent)}
                icon={<Zap className="h-5 w-5 text-energy-green-light" />}
              />

              <ConsumptionCard
                title="Gasto Estimado"
                value={`R$ ${totalCost.toFixed(2)}`}
                unit="no mês"
                trend={consumptionDifference < 0 ? "down" : "up"}
                percentage={parseInt(consumptionPercent)}
                icon={
                  <DollarSign className="h-5 w-5 text-energy-green-light" />
                }
              />

              <ConsumptionCard
                title="Média Diária"
                value={(totalConsumption / 30).toFixed(1)}
                unit="kWh/dia"
                trend={consumptionDifference < 0 ? "down" : "up"}
                percentage={parseInt(consumptionPercent)}
                icon={<Calendar className="h-5 w-5 text-energy-yellow" />}
              />

              <ConsumptionCard
                title="Impacto Ambiental"
                value={(totalConsumption * 0.42).toFixed(0)}
                unit="kg CO₂"
                trend={consumptionDifference < 0 ? "down" : "up"}
                percentage={parseInt(consumptionPercent)}
                icon={<Leaf className="h-5 w-5 text-energy-green-dark" />}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsumptionChart
                title="Consumo Mensal (kWh)"
                data={consumptionData}
              />

              <div className="bg-white p-6 rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-4">
                  Análise de Consumo
                </h3>
                <p className="text-slate-600 mb-4">
                  Seu consumo está{" "}
                  <span className="text-energy-green-dark font-medium">
                    {consumptionPercent}% {consumptionStatus}
                  </span>{" "}
                  da média para residências do seu perfil em sua região.
                  Continue economizando!
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="indicadores" className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">
              Indicadores de Performance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="p-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-energy-green-light" />
                    Score de Eficiência
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-energy-green-dark">
                    {efficiencyScore.toFixed(0)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Baseado no consumo vs. média
                  </p>
                </CardContent>
              </Card>

              <Card className="p-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-energy-blue-light" />
                    Mês a Mês
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-3xl font-bold ${
                      monthOverMonthChange >= 0
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  >
                    {monthOverMonthChange >= 0 ? "+" : ""}
                    {monthOverMonthChange.toFixed(1)}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Comparado ao mês anterior
                  </p>
                </CardContent>
              </Card>

              <Card className="p-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-energy-yellow" />
                    Economias Potenciais
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-energy-green-dark">
                    R$ {accumulatedSavings.toFixed(2)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Seguindo todas as dicas
                  </p>
                </CardContent>
              </Card>

              <Card className="p-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-energy-green-light" />
                    Status Geral
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-xl font-bold ${
                      efficiencyScore > 70
                        ? "text-green-500"
                        : efficiencyScore > 40
                        ? "text-yellow-500"
                        : "text-red-500"
                    }`}
                  >
                    {efficiencyScore > 70
                      ? "Normal"
                      : efficiencyScore > 40
                      ? "Atenção"
                      : "Crítico"}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Baseado na eficiência atual
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-energy-blue-light" />
                    Histórico de Consumo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {historicalData.slice(-6).map((data, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center"
                      >
                        <span className="font-medium">{data.month}</span>
                        <div className="text-right">
                          <div className="font-semibold">
                            {data.consumption} kWh
                          </div>
                          <div className="text-sm text-muted-foreground">
                            R$ {data.cost.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="p-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5 text-energy-green-light" />
                    Ações Disponíveis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={saveCurrentMonthData} className="w-full">
                    Salvar Dados do Mês Atual
                  </Button>
                  <Button
                    onClick={exportData}
                    variant="outline"
                    className="w-full"
                  >
                    Exportar Relatório (PDF)
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    <p>
                      • Salve os dados mensalmente para acompanhar a evolução
                    </p>
                    <p>• Exporte para análise externa ou backup</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="calculadora" className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Calculadora de Energia</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ApplianceCalculator onAddAppliance={handleAddAppliance} />
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-energy-green-light" />
                    Como funcionam os cálculos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-medium mb-1">Consumo (kWh/mês)</h4>
                    <p className="text-muted-foreground">
                      O consumo mensal em quilowatt-hora (kWh) é calculado pela
                      fórmula:
                    </p>
                    <p className="bg-slate-100 p-2 rounded mt-1 font-mono text-xs">
                      Consumo = (Potência × Horas de uso × Dias) ÷ 1000
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-1">Custo Mensal (R$)</h4>
                    <p className="text-muted-foreground">
                      O custo mensal é calculado multiplicando o consumo pela
                      tarifa de energia:
                    </p>
                    <p className="bg-slate-100 p-2 rounded mt-1 font-mono text-xs">
                      Custo = Consumo (kWh) × Tarifa (R$/kWh)
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-1">Exemplo:</h4>
                    <p className="text-muted-foreground">
                      Para um ar-condicionado de 1400W, utilizado 6 horas por
                      dia, durante 30 dias:
                    </p>
                    <p className="bg-slate-100 p-2 rounded mt-1 font-mono text-xs">
                      Consumo = (1400 × 6 × 30) ÷ 1000 = 252 kWh/mês
                      <br />
                      Custo = 252 × 0,75 = R$ 189,00/mês
                    </p>
                  </div>

                  <div className="p-3 bg-energy-green-light/10 rounded-md border border-energy-green-light/20">
                    <p className="text-energy-green-dark text-xs">
                      <strong>Nota:</strong> Utilizamos a tarifa média de R$
                      0,75 por kWh. As tarifas brasileiras variam conforme a
                      localidade e a distribuidora de energia.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="aparelhos" className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Seus Aparelhos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {appliances.map((appliance) => (
                <ApplianceCard
                  key={appliance.id}
                  name={appliance.name}
                  power={appliance.power}
                  status={appliance.status}
                  usageHours={appliance.usageHours}
                  monthlyCost={appliance.monthlyCost}
                  onEdit={() => openEditModal(appliance)}
                  onDelete={() => openDeleteModal(appliance)}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="anomalias" className="space-y-6">
            {/* <h2 className="text-2xl font-bold mb-4">Detecção de Anomalias</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {anomalies.map((anomaly) => (
                <AnomalyDetection
                  key={anomaly.id}
                  deviceName={anomaly.deviceName}
                  anomalyScore={anomaly.anomalyScore}
                  description={anomaly.description}
                  recommendation={anomaly.recommendation}
                />
              ))}
            </div> */}
            <h3 style={{ opacity: "50%" }}>
              Estamos trabalhando nesta parte 🛠️
            </h3>
          </TabsContent>
          <TabsContent value="dicas" className="space-y-6">
            <h2 className="text-2xl font-bold mb-4">Dicas de Economia</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {energySavingTips.map((tip) => (
                <EnergySavingTip
                  key={tip.id}
                  title={tip.title}
                  description={tip.description}
                  savingEstimate={tip.savingEstimate}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog
          open={!!editAppliance}
          onOpenChange={(open) => !open && closeEditModal()}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Aparelho</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <label className="block">
                Nome:
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border rounded px-2 py-1"
                />
              </label>
              <label className="block">
                Potência (W):
                <input
                  type="number"
                  value={editPower}
                  onChange={(e) => setEditPower(Number(e.target.value))}
                  className="w-full border rounded px-2 py-1"
                />
              </label>
              <label className="block">
                Uso diário (horas):
                <input
                  type="number"
                  value={editUsageHours}
                  onChange={(e) => setEditUsageHours(Number(e.target.value))}
                  className="w-full border rounded px-2 py-1"
                />
              </label>
              <label className="block">
                Custo mensal (R$):
                <input
                  type="number"
                  value={editMonthlyCost}
                  readOnly
                  className="w-full border rounded px-2 py-1 bg-gray-100 cursor-not-allowed"
                />
              </label>
              <label className="block">
                Status:
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(
                      e.target.value as "critical" | "normal" | "warning"
                    )
                  }
                  className="w-full border rounded px-2 py-1"
                >
                  <option value="normal">Normal</option>
                  <option value="warning">Atenção</option>
                  <option value="critical">Crítico</option>
                </select>
              </label>
            </div>
            <DialogFooter>
              <button
                onClick={handleEditSave}
                className="bg-energy-green-light text-white px-4 py-2 rounded hover:bg-energy-green-dark"
              >
                Salvar
              </button>
              <button
                onClick={closeEditModal}
                className="ml-2 px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
              >
                Cancelar
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={!!deleteAppliance}
          onOpenChange={(open) => !open && closeDeleteModal()}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o aparelho{" "}
                <strong>{deleteAppliance?.name}</strong>? Esta ação é permanente
                e não pode ser desfeita.
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
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
