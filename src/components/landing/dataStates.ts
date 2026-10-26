import type { CSSProperties } from "react";

// The data-quality states the product distinguishes. Demos on the landing use
// the same vocabulary so a visitor learns it before signing up.
export const DATA_STATES = [
  { key: "measured", label: "Medido", hint: "leitura de dispositivo integrado" },
  { key: "estimated", label: "Estimado", hint: "calculado pelo cadastro do aparelho" },
  { key: "partial", label: "Parcial", hint: "só parte dos aparelhos tem medidor" },
  { key: "nodata", label: "Sem dados", hint: "nenhuma leitura no período" },
] as const;
export type DataState = (typeof DATA_STATES)[number]["key"];

// Pattern as well as colour, so states never rely on hue alone.
export const stateStyle = (state: DataState): CSSProperties =>
  state === "measured"
    ? { background: "linear-gradient(180deg, var(--l-accent), var(--l-accent-2))" }
    : state === "estimated"
      ? { background: "repeating-linear-gradient(135deg, rgb(var(--l-amber-rgb) / 0.85) 0 4px, rgb(var(--l-amber-rgb) / 0.35) 4px 8px)" }
      : state === "partial"
        ? { background: "linear-gradient(0deg, var(--l-accent) 0 55%, transparent 55%), repeating-linear-gradient(135deg, rgb(var(--l-accent-rgb) / 0.55) 0 3px, transparent 3px 7px)" }
        : { border: "1.5px dashed var(--l-nodata)" };
