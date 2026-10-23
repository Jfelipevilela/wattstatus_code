import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import AnomaliesTab from "@/components/tabs/AnomaliesTab";

const Anomalies = () => (
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <span className="font-semibold">Anomalias</span>
      </header>
      <main className="container mx-auto px-4 py-6">
        <AnomaliesTab />
      </main>
    </SidebarInset>
  </SidebarProvider>
);

export default Anomalies;
