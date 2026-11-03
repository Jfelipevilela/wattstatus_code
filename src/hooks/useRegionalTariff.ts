import { useEffect, useRef, useSyncExternalStore } from "react";
import { locateRegionalTariff, type RegionalTariff } from "@/lib/regional-tariff";

interface LocationState { status: "idle" | "loading" | "ready" | "error"; suggestion?: RegionalTariff; error?: string }
const empty: LocationState = { status: "idle" };
let current = empty;
let generation = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = (next: LocationState) => { current = next; listeners.forEach((listener) => listener()); };

async function requestLocation() {
  if (current.status === "loading") return;
  const version = ++generation;
  publish({ status: "loading" });
  try {
    const suggestion = await locateRegionalTariff({ geolocation: navigator.geolocation, fetch: window.fetch.bind(window) });
    if (version === generation) publish({ status: "ready", suggestion });
  } catch {
    if (version === generation) publish({ status: "error", error: "Localização indisponível ou não autorizada. Escolha o estado e a tarifa manualmente, ou tente novamente." });
  }
}
function clearLocation() { generation++; publish(empty); }

/** Only a UF-level suggestion in tab memory. No coordinates, storage or settings writes. */
export function useRegionalTariff() {
  return { ...useSyncExternalStore(subscribe, () => current, () => empty), requestLocation, clearLocation };
}

/** Declare after a form's reset effects so opening a different record keeps its values. */
export function useRegionalTariffDefault(onApply: (suggestion: RegionalTariff) => void, canApply: () => boolean, resetKey?: unknown) {
  const { suggestion } = useRegionalTariff();
  const applied = useRef<{ suggestion: RegionalTariff; resetKey: unknown }>();
  useEffect(() => {
    if (!suggestion || !canApply()) return;
    if (applied.current?.suggestion === suggestion && applied.current.resetKey === resetKey) return;
    applied.current = { suggestion, resetKey };
    onApply(suggestion);
  }, [canApply, onApply, resetKey, suggestion]);
}
