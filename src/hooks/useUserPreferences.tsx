import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "./useAuth";
import { AvailableAppId } from "@/types/apps";

export type UserPreferences = {
  theme: "light" | "dark" | "system";
  apps: AvailableAppId[];
  historicalData: Array<{ month: string; consumption: number; cost: number }>;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  apps: [],
  historicalData: [],
};

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  loading: boolean;
  refresh: () => Promise<void>;
  updatePreferences: (input: Partial<UserPreferences>) => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | undefined>(undefined);

export const UserPreferencesProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, token } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);

  const sanitizeApps = (apps?: unknown): AvailableAppId[] => {
    const allowed: AvailableAppId[] = ["smartthings", "lg-thinq"];
    if (!Array.isArray(apps)) return [];
    return apps.filter((item): item is AvailableAppId => allowed.includes(item as AvailableAppId));
  };

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    if (!user) {
      setPreferences(DEFAULT_PREFERENCES);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ settings: UserPreferences }>(
        "/api/user-settings",
        { method: "GET", signal },
        token || undefined
      );
      if (signal?.aborted || version !== requestVersion.current) return;
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...res.settings,
        apps: sanitizeApps(res.settings?.apps),
      });
    } catch {
      if (!signal?.aborted && version === requestVersion.current) setPreferences(DEFAULT_PREFERENCES);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    const requests = requestVersion;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => { requests.current++; controller.abort(); };
  }, [refresh]);

  const updatePreferences = useCallback(
    async (input: Partial<UserPreferences>) => {
      setPreferences((prev) => ({
        ...prev,
        ...input,
        apps: input.apps ? sanitizeApps(input.apps) : prev.apps,
      }));
      if (!user) return;
      await apiRequest(
        "/api/user-settings",
        {
          method: "PUT",
          body: JSON.stringify({
            ...input,
            apps: input.apps ? sanitizeApps(input.apps) : undefined,
          }),
        },
        token || undefined
      );
    },
    [token, user]
  );

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences,
        loading,
        refresh,
        updatePreferences,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
};

export const useUserPreferences = () => {
  const ctx = useContext(UserPreferencesContext);
  if (!ctx) {
    throw new Error("useUserPreferences must be used inside UserPreferencesProvider");
  }
  return ctx;
};
