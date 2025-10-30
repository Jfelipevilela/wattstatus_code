import React from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import AnomaliesTab from "@/components/tabs/AnomaliesTab";

const Anomalies = () => {
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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-sm" />
            </div>
            <span className="font-semibold">Anomalias</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-green-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            <AnomaliesTab anomalies={anomalies} />
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Anomalies;
