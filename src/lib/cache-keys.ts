import type { QueryClient } from "@tanstack/react-query";

// Appliance, property and energy answers are keyed by the signed-in user, so
// one account is never served another account's data, even before the cache
// is cleared on a user change (useAuth). The ["wattai", ...] keys belong to the
// AI module and do not carry the user; they rely on that clear.
export const applianceKeys = {
  all: ["appliances"] as const,
  list: (userId: string) => ["appliances", userId] as const,
};
export const propertyKeys = {
  all: ["properties"] as const,
  list: (userId: string, includeArchived: boolean) => ["properties", userId, "list", includeArchived] as const,
  detail: (userId: string, id: string) => ["properties", userId, id] as const,
  energy: (userId: string, id: string, start: string, end: string) => ["properties", userId, id, "energy", start, end] as const,
};
export const energyHistoryKeys = {
  all: ["energy-history"] as const,
  range: (userId: string, start: string, end: string, applianceId: string | null) =>
    ["energy-history", userId, start, end, applianceId] as const,
};

// Readings are attributed to appliances, rooms and properties when they are
// read, and estimates come from the appliance list. After any appliance
// change, everything derived from it refreshes (in the background: the
// previous values stay visible until the new ones arrive).
export const refreshAfterApplianceChange = (client: QueryClient) => Promise.all([
  client.invalidateQueries({ queryKey: energyHistoryKeys.all }),
  client.invalidateQueries({ queryKey: propertyKeys.all }),
  client.invalidateQueries({ queryKey: ["wattai", "insights"] }),
  client.invalidateQueries({ queryKey: ["wattai", "report-summary"] }),
  // A plan's progress is recomputed from the current snapshot on every read.
  // The saved plan list and alerts are stored records and stay as they are.
  client.invalidateQueries({ queryKey: ["wattai", "plan"] }),
]);

// Rooms or properties removed or changed move appliances on the server.
export const refreshAfterPlaceChange = (client: QueryClient) => Promise.all([
  client.invalidateQueries({ queryKey: applianceKeys.all }),
  refreshAfterApplianceChange(client),
]);
