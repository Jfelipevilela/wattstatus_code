// Shared suggestions only. Nothing is added until the user confirms it.
export const APPLIANCE_PRESETS = [
  { name: "Ar-condicionado", power: 1400, hours: 6 },
  { name: "Chuveiro elétrico", power: 5500, hours: 0.5 },
  { name: "Geladeira", power: 150, hours: 24 },
  { name: 'TV LED 50"', power: 100, hours: 4 },
  { name: "Computador", power: 300, hours: 8 },
  { name: "Máquina de lavar", power: 1000, hours: 1 },
  { name: "Micro-ondas", power: 1200, hours: 0.5 },
  { name: "Ventilador", power: 60, hours: 8 },
] as const;
