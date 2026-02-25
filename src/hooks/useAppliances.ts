import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";

export interface Appliance {
  id: string;
  name: string;
  power: number;
  status: "critical" | "normal" | "warning";
  usageHours: number;
  days: number;
  monthlyCost: number;
  monthlyConsumption: number;
  tariff: string;
  createdAt: string;
  measuredConsumptionKWh?: number | null;
  integrationProvider?: string | null;
  integrationDeviceId?: string | null;
}

export interface ApplianceInput {
  name: string;
  power: number;
  usageHours: number;
  days: number;
  tariff: string;
  measuredConsumptionKWh?: number;
  integrationProvider?: string;
  integrationDeviceId?: string;
  createdAt?: string;
}

export const useAppliances = () => {
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token, user } = useAuth();

  const fetchAppliances = useCallback(async () => {
    if (!user) {
      setAppliances([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ appliances: Appliance[] }>(
        "/api/appliances",
        { method: "GET" },
        token || undefined
      );
      setAppliances(data.appliances);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar aparelhos";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    fetchAppliances();
  }, [fetchAppliances]);

  const addAppliance = async (input: ApplianceInput) => {
    if (!user) throw new Error("N\u00e3o autenticado");
    const payload: ApplianceInput = {
      ...input,
      createdAt: input.createdAt || new Date().toISOString(),
    };
    const data = await apiRequest<{ appliance: Appliance }>(
      "/api/appliances",
      { method: "POST", body: JSON.stringify(payload) },
      token || undefined
    );
    setAppliances((prev) => [data.appliance, ...prev]);
    return data.appliance;
  };

  const updateAppliance = async (id: string, input: Partial<ApplianceInput>) => {
    if (!user) throw new Error("N\u00e3o autenticado");
    const data = await apiRequest<{ appliance: Appliance }>(
      `/api/appliances/${id}`,
      { method: "PUT", body: JSON.stringify(input) },
      token || undefined
    );
    setAppliances((prev) =>
      prev.map((appliance) =>
        appliance.id === id ? data.appliance : appliance
      )
    );
    return data.appliance;
  };

  const deleteAppliance = async (id: string) => {
    if (!user) throw new Error("N\u00e3o autenticado");
    await apiRequest(`/api/appliances/${id}`, { method: "DELETE" }, token || undefined);
    setAppliances((prev) => prev.filter((appliance) => appliance.id !== id));
  };

  return {
    appliances,
    loading,
    error,
    refetch: fetchAppliances,
    addAppliance,
    updateAppliance,
    deleteAppliance,
  };
};
