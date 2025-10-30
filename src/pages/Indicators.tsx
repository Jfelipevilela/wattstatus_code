import React, { useState, useEffect } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import IndicatorsTab from "@/components/tabs/IndicatorsTab";
import { TrendingUp } from "lucide-react";
import { useAppliances } from "@/hooks/useAppliances";

const Indicators = () => {
  const { appliances } = useAppliances();
  const totalConsumption = appliances.reduce(
    (total, appliance) =>
      total + (appliance.power * appliance.usageHours * 30) / 1000,
    0
  );
  const totalCost = appliances.reduce(
    (total, appliance) => total + appliance.monthlyCost,
    0
  );
  const [historicalData, setHistoricalData] = useState<any[]>([]);

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

  const exportData = async () => {
    // Same export logic as in Dashboard
    const jsPDF = (await import("jspdf")).default;
    const pdf = new jsPDF();
    // ... export logic ...
    pdf.save("wattstatus_relatorio.pdf");
  };

  // Calculate efficiency score (0-100 based on consumption vs average)
  const efficiencyScore = Math.max(
    0,
    Math.min(100, 100 - (totalConsumption / 250) * 50)
  );

  // Calculate accumulated savings (sum of tip estimates)
  const accumulatedSavings = 95; // Mock value

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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2 ">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-energy-green-light absolute" />
            </div>
            <span className="font-semibold">Indicadores</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-green-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            <IndicatorsTab
              efficiencyScore={efficiencyScore}
              monthOverMonthChange={monthOverMonthChange}
              accumulatedSavings={accumulatedSavings}
              historicalData={historicalData}
              saveCurrentMonthData={saveCurrentMonthData}
              exportData={exportData}
            />
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Indicators;
