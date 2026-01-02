import React, { createContext, useContext } from "react";
import { SiSmartthings, SiLg } from "react-icons/si";
import { useUserPreferences } from "./useUserPreferences";
import { AvailableAppId } from "@/types/apps";

interface AppConfig {
  id: AvailableAppId;
  name: string;
  url: string;
  icon: React.ReactNode;
}

const AVAILABLE_APPS: Record<AvailableAppId, AppConfig> = {
  smartthings: {
    id: "smartthings",
    name: "SmartThings",
    icon: <SiSmartthings />,
    url: "/integracoes/smartthings",
  },
  "lg-thinq": {
    id: "lg-thinq",
    name: "LG ThinQ",
    url: "/integracoes/lg-thinq",
    icon: <SiLg />,
  },
};

interface AppsContextValue {
  apps: AppConfig[];
  addApp: (id: AvailableAppId) => void;
  removeApp: (id: AvailableAppId) => void;
  isActive: (id: AvailableAppId) => boolean;
  available: AppConfig[];
}

const AppsContext = createContext<AppsContextValue | undefined>(undefined);

export const AppsProvider = ({ children }: { children: React.ReactNode }) => {
  const { preferences, updatePreferences } = useUserPreferences();
  const appIds = preferences.apps || [];

  const addApp = (id: AvailableAppId) => {
    const next = Array.from(new Set<AvailableAppId>([...appIds, id]));
    updatePreferences({ apps: next }).catch(() => {
      // falha silenciosa para nao travar UI
    });
  };

  const removeApp = (id: AvailableAppId) => {
    updatePreferences({ apps: appIds.filter((x) => x !== id) }).catch(() => {
      // falha silenciosa para nao travar UI
    });
  };

  const isActive = (id: AvailableAppId) => appIds.includes(id);

  const apps = appIds.map((appId) => AVAILABLE_APPS[appId]).filter(Boolean);

  return (
    <AppsContext.Provider
      value={{
        apps,
        addApp,
        removeApp,
        isActive,
        available: Object.values(AVAILABLE_APPS),
      }}
    >
      {children}
    </AppsContext.Provider>
  );
};

export const useApps = () => {
  const ctx = useContext(AppsContext);
  if (!ctx) throw new Error("useApps must be used inside AppsProvider");
  return ctx;
};
