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
} from "lucide-react";
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

  React.useEffect(() => {
    // Recalculate monthly cost when power or usageHours change
    const consumption = (editPower * editUsageHours * 30) / 1000; // kWh per month
    const cost = consumption * TARIFF;
    setEditMonthlyCost(parseFloat(cost.toFixed(2)));
  }, [editPower, editUsageHours]);

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
          <TabsList className="grid grid-cols-5 mb-8">
            <TabsTrigger value="consumo">Consumo</TabsTrigger>
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
                      O consumo mensal em quilowatt-hora (kWh) é calculado pela fórmula:
                    </p>
                    <p className="bg-slate-100 p-2 rounded mt-1 font-mono text-xs">
                      Consumo = (Potência × Horas de uso × Dias) ÷ 1000
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-1">Custo Mensal (R$)</h4>
                    <p className="text-muted-foreground">
                      O custo mensal é calculado multiplicando o consumo pela tarifa de energia:
                    </p>
                    <p className="bg-slate-100 p-2 rounded mt-1 font-mono text-xs">
                      Custo = Consumo (kWh) × Tarifa (R$/kWh)
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-1">Exemplo:</h4>
                    <p className="text-muted-foreground">
                      Para um ar-condicionado de 1400W, utilizado 6 horas por dia, durante 30 dias:
                    </p>
                    <p className="bg-slate-100 p-2 rounded mt-1 font-mono text-xs">
                      Consumo = (1400 × 6 × 30) ÷ 1000 = 252 kWh/mês<br/>
                      Custo = 252 × 0,75 = R$ 189,00/mês
                    </p>
                  </div>
                  
                  <div className="p-3 bg-energy-green-light/10 rounded-md border border-energy-green-light/20">
                    <p className="text-energy-green-dark text-xs">
                      <strong>Nota:</strong> Utilizamos a tarifa média de R$ 0,75 por kWh. As tarifas reais 
                      variam conforme a localidade e a distribuidora de energia.
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
            <h2 className="text-2xl font-bold mb-4">Detecção de Anomalias</h2>
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
            </div>
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
