import { Building2, Home, Store, Warehouse, type LucideIcon } from "lucide-react";
import type { PropertyType } from "@/types/property";

export const PROPERTY_ICONS: Record<PropertyType, LucideIcon> = {
  house: Home,
  apartment: Building2,
  commercial: Store,
  other: Warehouse,
};
export const PROPERTY_COLORS = ["#00C853", "#2979FF", "#14b8a6", "#f59e0b", "#8b5cf6", "#f43f5e"];
