import React from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import TipsTab from "@/components/tabs/TipsTab";
import { Lightbulb } from "lucide-react";

const Tips = () => {
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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-energy-green-light absolute" />
            </div>
            <span className="font-semibold">Dicas</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-green-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            <TipsTab energySavingTips={energySavingTips} />
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Tips;
