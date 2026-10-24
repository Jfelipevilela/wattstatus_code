import type { QueryClient } from "@tanstack/react-query";

// Every cached server answer is keyed by the signed-in user, so one account
// can never be served another account's data, even before the cache is
// cleared on a user change (useAuth).
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
]);

// Rooms or properties removed or changed move appliances on the server.
export const refreshAfterPlaceChange = (client: QueryClient) => Promise.all([
  client.invalidateQueries({ queryKey: applianceKeys.all }),
  refreshAfterApplianceChange(client),
]);
