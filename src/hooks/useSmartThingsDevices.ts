import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";
import type {
  DeviceState,
  DeviceStatus,
  OverviewItem,
} from "@/components/smartthings/types";

const POLL_MS = 60_000;
// SmartThings applies commands asynchronously and some devices (TVs above all)
// take several seconds to report the new state. Re-read on a backoff until the
// requested state shows up. Four reads stay well under the 12 reads/min limit.
const CONFIRM_DELAYS_MS = [1500, 2500, 3500, 4500];

const matches = (state: DeviceState | undefined, expected: Partial<DeviceState>) =>
  Boolean(state) &&
  Object.entries(expected).every(([key, value]) => state![key as keyof DeviceState] === value);

export interface DeviceCommand {
  capability: string;
  command: string;
  arguments?: Array<string | number>;
}

export const useSmartThingsDevices = (enabled: boolean) => {
  const { token, user } = useAuth();
  const [items, setItems] = useState<OverviewItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);
  // Devices with a command awaiting confirmation keep their optimistic state
  // when a background poll returns an older reading.
  const confirming = useRef(new Set<string>());

  const lastRefresh = useRef(0);
  // background: polls may reuse the server's 60 s device-list cache; statuses
  // are always read live. A manual refresh asks for a fresh device list.
  const refresh = useCallback(async (background = false) => {
    if (!enabled || !user || inFlight.current) return;
    lastRefresh.current = Date.now();
    inFlight.current = true;
    setLoading(true);
    try {
      const data = await apiRequest<{ fetchedAt: string; items: OverviewItem[] }>(
        `/api/integrations/smartthings/overview${background ? "?cached=1" : ""}`,
        { method: "GET", skipErrorToast: true },
        token || undefined,
      );
      setItems((prev) =>
        data.items.map((item) =>
          confirming.current.has(item.device.id)
            ? prev.find((current) => current.device.id === item.device.id) ?? item
            : item,
        ),
      );
      setFetchedAt(new Date(data.fetchedAt));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dispositivos SmartThings");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [enabled, user, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll only while the tab is visible, and refresh as soon as it returns.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh(true);
    }, POLL_MS);
    // A quick tab switch does not need new readings.
    const onVisible = () =>
      document.visibilityState === "visible" && Date.now() - lastRefresh.current > 15_000 && refresh(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  const patchState = (deviceId: string, patch: Partial<DeviceState>) =>
    setItems((prev) =>
      prev.map((item) =>
        item.device.id === deviceId && item.status
          ? { ...item, status: { ...item.status, state: { ...item.status.state, ...patch } } }
          : item,
      ),
    );

  const readDevice = useCallback(
    (deviceId: string) =>
      apiRequest<{ status: DeviceStatus }>(
        `/api/integrations/smartthings/devices/${deviceId}/status`,
        { method: "GET", skipErrorToast: true },
        token || undefined,
      ).then((response) => response.status),
    [token],
  );

  const applyStatus = (deviceId: string, status: DeviceStatus) =>
    setItems((prev) =>
      prev.map((item) => (item.device.id === deviceId ? { ...item, status, error: null } : item)),
    );

  const refreshDevice = useCallback(
    async (deviceId: string) => {
      try {
        applyStatus(deviceId, await readDevice(deviceId));
      } catch (err) {
        setItems((prev) =>
          prev.map((item) =>
            item.device.id === deviceId
              ? { ...item, error: err instanceof Error ? err.message : "Leitura indisponível" }
              : item,
          ),
        );
      }
    },
    [readDevice],
  );

  // Optimistic: the UI shows the requested state at once, then waits for the
  // device to confirm it. Returns false when the device never confirmed, in
  // which case the real reported state is shown.
  const sendCommand = useCallback(
    async (deviceId: string, command: DeviceCommand, optimistic: Partial<DeviceState>) => {
      const previous = items.find((item) => item.device.id === deviceId)?.status?.state;
      confirming.current.add(deviceId);
      patchState(deviceId, optimistic);
      setPending((prev) => ({ ...prev, [deviceId]: true }));
      try {
        await apiRequest(
          `/api/integrations/smartthings/devices/${deviceId}/commands`,
          { method: "POST", body: JSON.stringify({ component: "main", ...command }) },
          token || undefined,
        );
        if (Object.keys(optimistic).length === 0) {
          await new Promise((resolve) => setTimeout(resolve, CONFIRM_DELAYS_MS[0]));
          applyStatus(deviceId, await readDevice(deviceId));
          return true;
        }
        let latest: DeviceStatus | null = null;
        for (const delay of CONFIRM_DELAYS_MS) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          latest = await readDevice(deviceId).catch(() => latest);
          if (latest && matches(latest.state, optimistic)) {
            applyStatus(deviceId, latest);
            return true;
          }
        }
        if (latest) applyStatus(deviceId, latest);
        return false;
      } catch (err) {
        if (previous) patchState(deviceId, previous);
        throw err;
      } finally {
        confirming.current.delete(deviceId);
        setPending((prev) => ({ ...prev, [deviceId]: false }));
      }
    },
    [items, token, readDevice],
  );

  return { items, fetchedAt, loading, error, pending, refresh: () => refresh(), refreshDevice, sendCommand };
};
