import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";
import type { EnergyInterval } from "./useEnergyHistory";
import type { Floor, Property, Room, RoomLayout } from "@/types/property";

export type PropertyInput = Partial<Omit<Property, "id" | "isPrimary" | "createdAt" | "updatedAt" | "archivedAt">> & {
  name: string;
};

const useApi = () => {
  const { token } = useAuth();
  return <T,>(path: string, init: RequestInit & { skipErrorToast?: boolean } = {}) =>
    apiRequest<T>(path, init, token || undefined);
};

export const propertyKeys = {
  all: ["properties"] as const,
  detail: (id: string) => ["properties", id] as const,
  energy: (id: string, start: string, end: string) => ["properties", id, "energy", start, end] as const,
};

export const useProperties = (includeArchived = false) => {
  const { user } = useAuth();
  const api = useApi();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...propertyKeys.all, includeArchived],
    enabled: Boolean(user),
    queryFn: () =>
      api<{ properties: Property[] }>(`/api/properties${includeArchived ? "?archived=1" : ""}`, { skipErrorToast: true }).then(
        (data) => data.properties,
      ),
  });
  const invalidate = () => client.invalidateQueries({ queryKey: propertyKeys.all });
  const create = useMutation({
    mutationFn: (input: PropertyInput) =>
      api<{ property: Property }>("/api/properties", { method: "POST", body: JSON.stringify(input) }).then((data) => data.property),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: Partial<PropertyInput> & { id: string; isPrimary?: true; archived?: boolean }) =>
      api<{ property: Property }>(`/api/properties/${id}`, { method: "PATCH", body: JSON.stringify(input) }).then(
        (data) => data.property,
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, moveAppliancesTo }: { id: string; moveAppliancesTo?: string }) =>
      api(`/api/properties/${id}`, { method: "DELETE", body: JSON.stringify({ moveAppliancesTo }) }),
    onSuccess: invalidate,
  });
  const properties = query.data ?? [];
  return {
    properties,
    primary: properties.find((item) => item.isPrimary) ?? properties[0] ?? null,
    loading: query.isPending,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    create,
    update,
    remove,
  };
};

export const usePropertyLayout = (propertyId: string | undefined) => {
  const { user } = useAuth();
  const api = useApi();
  const client = useQueryClient();
  const key = propertyKeys.detail(propertyId ?? "none");
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(user && propertyId),
    queryFn: async () => {
      const [floors, rooms] = await Promise.all([
        api<{ floors: Floor[] }>(`/api/properties/${propertyId}/floors`, { skipErrorToast: true }),
        api<{ rooms: Room[] }>(`/api/properties/${propertyId}/rooms`, { skipErrorToast: true }),
      ]);
      return { floors: floors.floors, rooms: rooms.rooms };
    },
  });
  const invalidate = () => client.invalidateQueries({ queryKey: key });
  const base = `/api/properties/${propertyId}`;
  const addRoom = useMutation({
    mutationFn: (input: { name: string; type: string; floorId?: string }) =>
      api<{ room: Room }>(`${base}/rooms`, { method: "POST", body: JSON.stringify(input) }).then((data) => data.room),
    onSuccess: invalidate,
  });
  const updateRoom = useMutation({
    mutationFn: ({ id, ...input }: Partial<Room> & { id: string }) =>
      api<{ room: Room }>(`${base}/rooms/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: input.name, type: input.type, floorId: input.floorId, color: input.color }),
      }).then((data) => data.room),
    onSuccess: invalidate,
  });
  const removeRoom = useMutation({
    mutationFn: ({ id, moveAppliancesTo }: { id: string; moveAppliancesTo?: string | null }) =>
      api(`${base}/rooms/${id}`, { method: "DELETE", body: JSON.stringify({ moveAppliancesTo }) }),
    onSuccess: invalidate,
  });
  const addFloor = useMutation({
    mutationFn: (input: { name: string; level: number }) =>
      api<{ floor: Floor }>(`${base}/floors`, { method: "POST", body: JSON.stringify(input) }).then((data) => data.floor),
    onSuccess: invalidate,
  });
  const removeFloor = useMutation({
    mutationFn: (floorId: string) => api(`${base}/floors/${floorId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  const saveLayout = useMutation({
    mutationFn: (rooms: Array<{ id: string; floorId?: string; layout: RoomLayout }>) =>
      api<{ rooms: Room[] }>(`${base}/layout`, { method: "PUT", body: JSON.stringify({ rooms }) }).then((data) => data.rooms),
    onSuccess: (rooms) => client.setQueryData(key, (old: { floors: Floor[]; rooms: Room[] } | undefined) => old && { ...old, rooms }),
  });
  return {
    floors: query.data?.floors ?? [],
    rooms: query.data?.rooms ?? [],
    loading: query.isPending,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    addRoom,
    updateRoom,
    removeRoom,
    addFloor,
    removeFloor,
    saveLayout,
  };
};

export const usePropertyEnergy = (propertyId: string | undefined, start: Date, end: Date) => {
  const { user } = useAuth();
  const api = useApi();
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const query = useQuery({
    queryKey: propertyKeys.energy(propertyId ?? "none", startIso, endIso),
    enabled: Boolean(user && propertyId),
    // One retry, so a failed reading shows as "indisponível" in seconds.
    retry: 1,
    queryFn: () =>
      api<{ intervals: EnergyInterval[]; unlocated: { count: number; consumptionKWh: number } }>(
        `/api/properties/${propertyId}/energy?${new URLSearchParams({ start: startIso, end: endIso })}`,
        { skipErrorToast: true },
      ),
  });
  return {
    intervals: query.data?.intervals ?? [],
    unlocated: query.data?.unlocated ?? { count: 0, consumptionKWh: 0 },
    loading: query.isPending,
    error: query.error?.message ?? null,
  };
};
