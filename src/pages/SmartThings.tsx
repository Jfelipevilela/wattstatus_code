import React, { useState } from "react";
import {
  AppSidebar,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import SmartThingsPanel from "@/components/SmartThingsPanel";
import { PlugZap, LogOut } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { useSmartThingsToken } from "@/hooks/useSmartThingsToken";

const SmartThings = () => {
  const [tokenInput, setTokenInput] = useState("");
  const { saveToken, saving, revokeToken, revoking, hasToken } =
    useSmartThingsToken();

  const sendToken = async () => {
    if (!tokenInput) {
      toast({
        title: "Token obrigatorio",
        description: "Cole o token SmartThings para continuar.",
        variant: "destructive",
      });
      return;
    }
    try {
      await saveToken(tokenInput);
      setTokenInput("");
    } catch (err) {
      // toast handled in hook
    }
  };

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
            <span className="font-semibold">SmartThings</span>
          </div>
        </header>
        <div className="flex flex-col min-h-screen bg-background">
          <main className="flex-grow container mx-auto px-4 pt-6 pb-10">
            {!hasToken && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <Card className="lg:col-span-2 border border-border/60">
                  <CardHeader>
                    <CardTitle>Passo a passo para autorizar</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        Abra a URL oficial de autorizacao Samsung (abaixo) e
                        entre com sua conta.
                      </li>
                      <li>
                        Conceda todas as permissoes solicitadas e copie o token
                        de acesso gerado.
                      </li>
                      <li>
                        Volte para o WattStatus, cole o token no campo abaixo e
                        clique em Enviar para ativar.
                      </li>
                    </ol>
                    <Button
                      asChild
                      className="mt-2 bg-energy-green-light hover:bg-energy-green-dark text-white"
                    >
                      <a
                        href="https://account.samsung.com/iam/oauth2/authorize?client_id=4dt548jm01&redirect_uri=https%3A%2F%2Faccount.smartthings.com%2FssoCallback&response_type=code&scope=&state=ebdeb12ebe471a2df4b7823f728a36365a5e6e6f420f3dd6be08b7efc93cb71baHR0cHM6Ly9hY2NvdW50LnNtYXJ0dGhpbmdzLmNvbS90b2tlbnM=&locale=pt"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir autorizacao SmartThings
                      </a>
                    </Button>
                  </CardContent>
                </Card>
                <Card className="border border-border/60">
                  <CardHeader>
                    <CardTitle>Colar token</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Cole o token gerado no portal Samsung e clique em Enviar
                      para ativar a integracao.
                    </p>
                    <Input
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Cole aqui o token da Samsung"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={sendToken}
                        disabled={saving}
                        className="bg-energy-green-light hover:bg-energy-green-dark text-white"
                      >
                        {saving ? "Enviando..." : "Enviar token e ativar"}
                      </Button>
                      {/* <Button
                        variant="secondary"
                        onClick={revokeToken}
                        disabled={revoking}
                        className="gap-1"
                      >
                        <LogOut className="h-4 w-4" />
                        {revoking ? "Desconectando..." : "Deslogar SmartThings"}
                      </Button> */}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border border-border/60">
                  <CardHeader>
                    <CardTitle>Dicas</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Para que consumo/energia apareca, ligue o aparelho e
                      aguarde alguns segundos antes de atualizar.
                    </p>
                    <p>
                      Aparelhos importados recebem marcador de integracao,
                      preservando o vinculo com o SmartThings.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
            {hasToken ? <SmartThingsPanel /> : ""}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default SmartThings;
