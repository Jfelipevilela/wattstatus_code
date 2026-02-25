import { useAuth } from "./useAuth";
import { apiRequest } from "@/lib/api";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";

export const useSmartThingsToken = () => {
  const { token, user } = useAuth();
  const [hasToken, setHasToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const res = await apiRequest<{ hasToken: boolean }>(
          "/api/integrations/smartthings/token",
          { method: "GET" },
          token || undefined
        );
        
        setHasToken(Boolean(res.hasToken));
      } catch {
        setHasToken(false);
      }
    };
    load();
  }, [token, user]);

  const saveToken = async (value: string) => {
    setSaving(true);

    try {
      await apiRequest(
        "/api/integrations/smartthings/token",
        { method: "POST", body: JSON.stringify({ token: value }) },
        token || undefined
      );
      setHasToken(true);
      toast({ title: "Token salvo", description: "Integração ativada." });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar token";
      toast({ title: "Erro", description: message, variant: "destructive" });
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const revokeToken = async () => {
    setRevoking(true);
    try {
      await apiRequest(
        "/api/integrations/smartthings/token",
        { method: "POST", body: JSON.stringify({ token: "" }) },
        token || undefined
      );
      setHasToken(false);
      toast({ title: "SmartThings desconectado", description: "Token removido." });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao desconectar SmartThings";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  };

  return {
    hasToken,
    saveToken,
    saving,
    revokeToken,
    revoking,
  };
};
