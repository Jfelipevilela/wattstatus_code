import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { apiRequest } from "@/lib/api";

export interface EnergyInterval {
  applianceId: string | null;
  provider: string;
  deviceId: string;
  startAt: string;
  endAt: string;
  consumptionKWh: number;
  cost: number | null;
  tariffValue: number | null;
  source: "iot";
  readingType: "interval";
  // Location at capture time; null on readings taken before it was recorded.
  propertyId?: string | null;
  roomId?: string | null;
  locationChanged?: boolean;
}

export const useEnergyHistory = (start: Date, end: Date, applianceId?: string) => {
  const { user, token } = useAuth();
  const [intervals, setIntervals] = useState<EnergyInterval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const refresh = useCallback(async () => {
    if (!user) { setIntervals([]); return; }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: startIso, end: endIso });
      if (applianceId) params.set("applianceId", applianceId);
      const response = await apiRequest<{ intervals: EnergyInterval[] }>(`/api/energy/history?${params}`, { skipErrorToast: true }, token || undefined);
      setIntervals(response.intervals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar medições");
      setIntervals([]);
    } finally { setLoading(false); }
  }, [user, token, startIso, endIso, applianceId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { intervals, loading, error, refresh };
};
