import { SiSmartthings } from "react-icons/si";
import { Loader2 } from "lucide-react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import SmartThingsPanel from "@/components/SmartThingsPanel";
import { ConnectSmartThings } from "@/components/smartthings/ConnectSmartThings";
import { useSmartThingsToken } from "@/hooks/useSmartThingsToken";

const SmartThings = () => {
  const {
    saveToken,
    saving,
    revokeToken,
    revoking,
    hasToken,
    checking,
    oauthAvailable,
    startOAuth,
    redirecting,
  } = useSmartThingsToken();
  const oauth = { oauthAvailable, onOAuth: startOAuth, redirecting };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <SiSmartthings className="h-5 w-5 text-energy-green-light" aria-hidden="true" />
          <span className="font-semibold">SmartThings</span>
        </header>
        <main className="container mx-auto min-w-0 max-w-7xl px-4 py-6 sm:py-8">
          {checking ? (
            <div role="status" className="flex items-center justify-center gap-3 p-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Verificando conexão…
            </div>
          ) : hasToken ? (
            <SmartThingsPanel
              saveToken={saveToken}
              saving={saving}
              revokeToken={revokeToken}
              revoking={revoking}
              {...oauth}
            />
          ) : (
            <ConnectSmartThings saving={saving} onSave={saveToken} {...oauth} />
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default SmartThings;
