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
  const [checking, setChecking] = useState(true);
  const [method, setMethod] = useState<"pat" | "oauth" | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const res = await apiRequest<{
          hasToken: boolean;
          method?: "pat" | "oauth" | null;
          oauthAvailable?: boolean;
        }>(
          "/api/integrations/smartthings/token",
          { method: "GET" },
          token || undefined
        );
        
        setHasToken(Boolean(res.hasToken));
        setMethod(res.method ?? null);
        setOauthAvailable(res.oauthAvailable === true);
      } catch {
        setHasToken(false);
      } finally {
        setChecking(false);
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
      setMethod("pat");
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

  // Sends the browser to the Samsung login. The account comes back through
  // /integracoes/smartthings/callback.
  const startOAuth = async () => {
    setRedirecting(true);
    try {
      const { url } = await apiRequest<{ url: string }>(
        "/api/integrations/smartthings/oauth/start",
        { method: "GET" },
        token || undefined
      );
      window.location.assign(url);
    } catch (err) {
      setRedirecting(false);
      notifyError(err, {
        title: "Erro ao abrir login Samsung",
        fallbackMessage: "Não foi possível iniciar o login Samsung.",
      });
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
      setMethod(null);
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
    checking,
    method,
    oauthAvailable,
    startOAuth,
    redirecting,
    saveToken,
    saving,
    revokeToken,
    revoking,
  };
};
