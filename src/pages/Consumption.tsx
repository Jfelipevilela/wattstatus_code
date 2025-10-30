import React, { useState, useEffect } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import ConsumptionTab from "@/components/tabs/ConsumptionTab";
import { BarChart3, Icon } from "lucide-react";
import { useAppliances } from "@/hooks/useAppliances";

const Consumption = () => {
  const { appliances } = useAppliances();
  const [selectedMonth, setSelectedMonth] = useState<number>(1);

  // Filter appliances by selected month
  const filteredAppliances = appliances.filter((appliance) => {
    const createdDate = new Date(appliance.createdAt);
    const applianceMonth = createdDate.getMonth() + 1;
    return applianceMonth === selectedMonth;
  });

  const daysInSelectedMonth = new Date(
    new Date().getFullYear(),
    selectedMonth,
    0
  ).getDate();

  const totalConsumption = filteredAppliances.reduce(
    (total, appliance) =>
      total +
      (appliance.power * appliance.usageHours * daysInSelectedMonth) / 1000,
    0
  );
  const totalCost = filteredAppliances.reduce(
    (total, appliance) =>
      total +
      (appliance.power * appliance.usageHours * daysInSelectedMonth * 0.75) /
        1000,
    0
  );
  const consumptionDifference = totalConsumption - 250; // vs average
  const consumptionPercent = Math.abs(
    (consumptionDifference / 250) * 100
  ).toFixed(0);
  const consumptionData = filteredAppliances.map((appliance) => ({
    name: appliance.name,
    consumo:
      (appliance.power * appliance.usageHours * daysInSelectedMonth) / 1000,
    custo:
      (appliance.power * appliance.usageHours * daysInSelectedMonth * 0.75) /
      1000,
    media: 0,
  }));

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              {/* <div className="w-4 h-4 bg-white rounded-sm" /> */}
              <BarChart3 className="w-5 h-5 text-energy-green-light absolute" />
            </div>
            <span className="font-semibold">Dashboard</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-green-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            <ConsumptionTab
              totalConsumption={totalConsumption}
              totalCost={totalCost}
              consumptionDifference={consumptionDifference}
              consumptionPercent={consumptionPercent}
              consumptionData={consumptionData}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
            />
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Consumption;
