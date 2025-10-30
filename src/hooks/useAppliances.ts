import { useState, useEffect } from "react";

export interface Appliance {
  id: number;
  name: string;
  power: number;
  status: "critical" | "normal" | "warning";
  usageHours: number;
  monthlyCost: number;
  monthlyConsumption: number;
  tariff: string;
  createdAt: string;
}

export const useAppliances = () => {
  const [appliances, setAppliances] = useState<Appliance[]>([]);

  // Load appliances from localStorage on mount
  useEffect(() => {
    const savedAppliances = localStorage.getItem("wattstatus_appliances");
    if (savedAppliances) {
      try {
        setAppliances(JSON.parse(savedAppliances));
      } catch (error) {
        console.error("Error loading appliances from localStorage:", error);
      }
    }
  }, []);

  // Save appliances to localStorage whenever appliances change
  useEffect(() => {
    if (
      appliances.length > 0 ||
      localStorage.getItem("wattstatus_appliances")
    ) {
      localStorage.setItem("wattstatus_appliances", JSON.stringify(appliances));
    }
  }, [appliances]);

  const addAppliance = (appliance: Appliance) => {
    setAppliances((prev) => [...prev, appliance]);
  };

  const updateAppliance = (updatedAppliance: Appliance) => {
    setAppliances((prev) =>
      prev.map((appliance) =>
        appliance.id === updatedAppliance.id ? updatedAppliance : appliance
      )
    );
  };

  const deleteAppliance = (id: number) => {
    setAppliances((prev) => prev.filter((appliance) => appliance.id !== id));
  };

  return {
    appliances,
    addAppliance,
    updateAppliance,
    deleteAppliance,
  };
};
