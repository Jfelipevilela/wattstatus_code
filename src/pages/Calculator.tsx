import React, { useState, useEffect } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import CalculatorTab from "@/components/tabs/CalculatorTab";
import { Calculator } from "lucide-react";
import { useAppliances, Appliance } from "@/hooks/useAppliances";

const Calculadora = () => {
  const { addAppliance } = useAppliances();

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
              <Calculator className="w-5 h-5 text-energy-green-light absolute" />
            </div>
            <span className="font-semibold">Calculadora</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-background dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            <CalculatorTab onAddAppliance={handleAddAppliance} />
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Calculadora;
