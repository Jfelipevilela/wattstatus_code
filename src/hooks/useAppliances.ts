import { useState, useEffect } from "react";
import { apiClient } from "@/utils/apiClient";

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
  userId?: string; // Adicionado para compatibilidade
}

export const useAppliances = () => {
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const userData = localStorage.getItem("wattstatus_user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setCurrentUserId(user.id);
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
  }, []);

  // Load appliances from API on mount and when user changes
  useEffect(() => {
    if (currentUserId) {
      try {
        const loadAppliances = async () => {
          const userAppliances = await apiClient.getUserAppliances(
            currentUserId
          );
          setAppliances(userAppliances);
        };
        loadAppliances();
      } catch (error) {
        console.error("Error loading appliances from API:", error);
        setAppliances([]);
      }
    }
  }, [currentUserId]);

  const addAppliance = async (appliance: Appliance) => {
    if (!currentUserId) {
      console.error("No user logged in");
      return;
    }
    try {
      await apiClient.createAppliance(currentUserId, appliance);
      setAppliances((prev) => [...prev, appliance]);
    } catch (error) {
      console.error("Error adding appliance:", error);
    }
  };

  const updateAppliance = async (updatedAppliance: Appliance) => {
    if (!currentUserId) {
      console.error("No user logged in");
      return;
    }
    try {
      await apiClient.updateAppliance(
        currentUserId,
        updatedAppliance.id,
        updatedAppliance
      );
      setAppliances((prev) =>
        prev.map((appliance) =>
          appliance.id === updatedAppliance.id ? updatedAppliance : appliance
        )
      );
    } catch (error) {
      console.error("Error updating appliance:", error);
    }
  };

  const deleteAppliance = async (id: number) => {
    if (!currentUserId) {
      console.error("No user logged in");
      return;
    }
    try {
      await apiClient.deleteAppliance(currentUserId, id);
      setAppliances((prev) => prev.filter((appliance) => appliance.id !== id));
    } catch (error) {
      console.error("Error deleting appliance:", error);
    }
  };

  return {
    appliances,
    addAppliance,
    updateAppliance,
    deleteAppliance,
  };
};
