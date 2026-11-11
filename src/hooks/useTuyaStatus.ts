import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";

export interface TuyaStatus {
  // The server has Tuya project keys. Without them nothing can be linked.
  projectConfigured: boolean;
  // This user has a Smart Life account linked on the server.
  linked: boolean;
  method: "server-link" | null;
}

// Link state only: keys and the Tuya account id never reach the browser.
export const useTuyaStatus = () => {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<TuyaStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const data = await apiRequest<TuyaStatus>(
        "/api/integrations/tuya/status",
        { method: "GET", skipErrorToast: true },
        token || undefined,
      );
      setStatus(data);
      setError(null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Não foi possível verificar a conexão Tuya.");
    } finally {
      setChecking(false);
    }
  }, [token, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    checking,
    error,
    projectConfigured: status?.projectConfigured === true,
    linked: status?.linked === true,
    method: status?.method ?? null,
    reload: load,
  };
};
