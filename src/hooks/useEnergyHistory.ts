import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { apiRequest } from "@/lib/api";
import { expandIntervals } from "@/lib/energy-compact";
import { energyHistoryKeys } from "@/lib/cache-keys";

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

// Measured readings only (never estimates). Cached per user and period; a
// newer period always wins over a slower, older response.
export const useEnergyHistory = (start: Date, end: Date, applianceId?: string) => {
  const { user, token } = useAuth();
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const query = useQuery({
    queryKey: energyHistoryKeys.range(user?.id ?? "anonymous", startIso, endIso, applianceId ?? null),
    enabled: Boolean(user),
    // Readings arrive at most every few minutes.
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      // Columns: about 6x smaller than plain JSON for a month of readings.
      const params = new URLSearchParams({ start: startIso, end: endIso, format: "columns" });
      if (applianceId) params.set("applianceId", applianceId);
      return apiRequest<{ intervals: Parameters<typeof expandIntervals>[0] }>(`/api/energy/history?${params}`, { skipErrorToast: true, signal }, token || undefined)
        .then((response) => expandIntervals(response.intervals));
    },
  });
  const failed = query.isError && !query.isFetching;
  return {
    // The previous period stays visible while a new one loads; a failed period shows no readings.
    intervals: !user || failed ? EMPTY : query.data ?? EMPTY,
    loading: Boolean(user) && query.isFetching,
    error: failed ? (query.error instanceof Error ? query.error.message : "Falha ao consultar medições") : null,
    refresh: async () => { await query.refetch(); },
  };
};
const EMPTY: EnergyInterval[] = [];
