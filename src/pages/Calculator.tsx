import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import CalculatorTab from "@/components/tabs/CalculatorTab";
import { Calculator } from "lucide-react";
import { useAppliances, ApplianceInput } from "@/hooks/useAppliances";
import { estimateAppliance } from "@/lib/energy";

const Calculadora = () => {
  const { appliances, addAppliance } = useAppliances();
  const householdCost = appliances.reduce((sum, appliance) => sum + estimateAppliance(appliance).cost, 0);

  async function handleAddAppliance(appliance: ApplianceInput): Promise<void> {
    await addAppliance(appliance);
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Calculator className="h-5 w-5 text-energy-green-light" aria-hidden="true" />
          <span className="font-semibold">Calculadora</span>
        </header>
        <div className="flex min-h-screen flex-col bg-background">
          <main className="container mx-auto min-w-0 max-w-7xl flex-grow px-4 py-6 sm:py-8">
            <CalculatorTab onAddAppliance={handleAddAppliance} householdCost={householdCost} />
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Calculadora;
