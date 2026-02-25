import React from "react";
import { Link } from "react-router-dom";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PlugZap, Link as LinkIcon, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApps } from "@/hooks/useApps";
import { SiLg } from "react-icons/si";
import { SiSmartthings } from "react-icons/si";


const Apps = () => {
  const { available, addApp, removeApp, isActive } = useApps();

  const apps = [
    ...available.map((app) => ({
      name: app.name,
      description:
        app.id === "smartthings"
          ? "Importe dispositivos conectados e acompanhe consumo do pr\u00f3prio aparelho."
          : "Integre aparelhos LG ThinQ e visualize status em tempo real.",
      icon: app.id === "smartthings" ? SiSmartthings : SiLg,
      to: app.id === "smartthings" ? "/integracoes/smartthings" : null,
      status: app.id === "lg-thinq" ? "Em breve" : "Disponivel",
      id: app.id,
    })),
  ];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-energy-green-light rounded flex items-center justify-center">
              <PlugZap className="w-5 h-5 text-energy-green-light absolute " />
            </div>
            <span className="font-semibold">Apps & Integracoes</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-background">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {apps.map((app) => (
                <Card key={app.name} className="border border-border/60 hover:shadow-lg transition">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <app.icon className="h-5 w-5 text-energy-green-light" />
                        <CardTitle className="text-base">{app.name}</CardTitle>
                      </div>
                      <span className="text-xs text-muted-foreground">{app.status}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {app.description}
                  </CardContent>
                  <CardFooter>
                    {app.to ? (
                      isActive(app.id as any) ? (
                        <div className="flex gap-2">
                          <Button asChild size="sm" className="gap-2">
                            <Link to={app.to}>
                              <LinkIcon className="h-4 w-4" />
                              Abrir
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => removeApp(app.id as any)}
                          >
                            Remover
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => addApp(app.id as any)}>
                          Adicionar ao menu
                        </Button>
                      )
                    ) : (
                      <Button size="sm" variant="secondary" disabled>
                        Em breve
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Apps;
