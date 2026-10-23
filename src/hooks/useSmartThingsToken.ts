import { useAuth } from "./useAuth";
import { apiRequest } from "@/lib/api";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { notifyError } from "@/lib/error-toast";

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
      notifyError(err, {
        title: "Erro ao conectar SmartThings",
        fallbackMessage: "Erro ao salvar token.",
      });
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
      notifyError(err, {
        title: "Erro ao desconectar SmartThings",
        fallbackMessage: "Erro ao desconectar SmartThings.",
      });
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
