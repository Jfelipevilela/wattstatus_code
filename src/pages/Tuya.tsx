import { Boxes, Loader2 } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import TuyaPanel from "@/components/tuya/TuyaPanel";
import { ConnectTuya } from "@/components/tuya/ConnectTuya";
import { useTuyaStatus } from "@/hooks/useTuyaStatus";

const Tuya = () => {
  const { checking, error, linked, projectConfigured, reload } = useTuyaStatus();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Boxes className="h-5 w-5 text-energy-green-light" aria-hidden="true" />
          <span className="font-semibold">Tuya / Smart Life</span>
        </header>
        <main className="container mx-auto min-w-0 max-w-7xl px-4 py-6 sm:py-8">
          {checking ? (
            <div role="status" className="flex items-center justify-center gap-3 p-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Verificando conexão…
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 p-4 text-sm">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                Tentar novamente
              </Button>
            </div>
          ) : linked ? (
            <TuyaPanel />
          ) : (
            <ConnectTuya projectConfigured={projectConfigured} />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Tuya;
