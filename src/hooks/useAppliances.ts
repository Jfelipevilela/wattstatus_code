import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  tariffValue?: number;
  createdAt: string;
  measuredConsumptionKWh?: number | null;
  integrationProvider?: string | null;
  integrationDeviceId?: string | null;
  propertyId?: string | null;
  roomId?: string | null;
}

export interface ApplianceInput {
  name: string;
  power: number;
  usageHours: number;
  days: number;
  tariff: string;
  tariffValue?: number;
  measuredConsumptionKWh?: number;
  integrationProvider?: string;
  integrationDeviceId?: string;
  createdAt?: string;
  propertyId?: string | null;
  roomId?: string | null;
}

// Keyed by user so a cached list can never be served to another account.
export const applianceKeys = {
  all: ["appliances"] as const,
  list: (userId: string) => ["appliances", userId] as const,
};

// One shared, cached list for every page and panel. Mutations write the
// server's answer into the cache; room and property totals are derived from it.
export const useAppliances = () => {
  const { token, user } = useAuth();
  const client = useQueryClient();
  const key = applianceKeys.list(user?.id ?? "anonymous");
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(user),
    queryFn: ({ signal }) =>
      apiRequest<{ appliances: Appliance[] }>("/api/appliances", { method: "GET", signal }, token || undefined)
        .then((data) => data.appliances),
  });
  const appliances = useMemo(() => (user ? query.data ?? [] : []), [user, query.data]);
  const lastUpdated = useMemo(() => (query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null), [query.dataUpdatedAt]);

  const write = (update: (previous: Appliance[]) => Appliance[]) => {
    client.setQueryData<Appliance[]>(key, (previous) => update(previous ?? []));
  };

  const addAppliance = async (input: ApplianceInput) => {
    if (!user) throw new Error("Não autenticado");
    const payload: ApplianceInput = {
      ...input,
      createdAt: input.createdAt || new Date().toISOString(),
    };
    const data = await apiRequest<{ appliance: Appliance }>(
      "/api/appliances",
      { method: "POST", body: JSON.stringify(payload) },
      token || undefined
    );
    write((prev) => [data.appliance, ...prev.filter((appliance) => appliance.id !== data.appliance.id)]);
    return data.appliance;
  };

  const updateAppliance = async (id: string, input: Partial<ApplianceInput>) => {
    if (!user) throw new Error("Não autenticado");
    const data = await apiRequest<{ appliance: Appliance }>(
      `/api/appliances/${id}`,
      { method: "PUT", body: JSON.stringify(input) },
      token || undefined
    );
    write((prev) => prev.map((appliance) => (appliance.id === id ? data.appliance : appliance)));
    return data.appliance;
  };

  const deleteAppliance = async (id: string) => {
    if (!user) throw new Error("Não autenticado");
    await apiRequest(`/api/appliances/${id}`, { method: "DELETE" }, token || undefined);
    write((prev) => prev.filter((appliance) => appliance.id !== id));
  };

  return {
    appliances,
    // Only the first load blocks; background refreshes keep showing the list.
    loading: Boolean(user) && query.isPending,
    error: query.error ? query.error.message || "Erro ao carregar aparelhos" : null,
    refetch: async () => { await query.refetch(); },
    lastUpdated,
    addAppliance,
    updateAppliance,
    deleteAppliance,
  };
};
