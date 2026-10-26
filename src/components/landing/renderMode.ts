import { useEffect, useState } from "react";

// Shared 3D / light-mode choice for every WebGL element of the landing
// (hero house, AI core). Light mode is the default for data saving or very
// modest devices; the visitor can switch it from the hero, and the choice is
// remembered in this browser only.
const PREF_KEY = "wattstatus-landing-3d";
const EVENT = "wattstatus-landing-mode";

export const readPref = (): "on" | "off" | null => {
  try {
    const value = localStorage.getItem(PREF_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
};

export const writePref = (value: "on" | "off") => {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this visit.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
};

export const prefersLight = () => {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return !!nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2;
};

export const initialLite = () => {
  const pref = readPref();
  return pref ? pref === "off" : prefersLight();
};

/** Light mode, kept in sync when the visitor switches it elsewhere. */
export const useLiteMode = () => {
  const [lite, setLite] = useState(initialLite);
  useEffect(() => {
    const update = (event: Event) => setLite((event as CustomEvent<"on" | "off">).detail === "off");
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return lite;
};
