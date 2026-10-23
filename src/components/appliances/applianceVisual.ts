import type { LucideIcon } from "lucide-react";
import {
  AirVent,
  Bath,
  Cpu,
  Fan,
  Flame,
  Lightbulb,
  Microwave,
  Monitor,
  Plug,
  Refrigerator,
  Tv,
  WashingMachine,
} from "lucide-react";
import { normalizeSearch } from "@/lib/energy";

export interface ApplianceVisual {
  icon: LucideIcon;
  // Tailwind classes for the icon tile; one hue per category keeps the grid scannable.
  tone: string;
  bar: string;
}

const RULES: Array<[RegExp, ApplianceVisual]> = [
  [/\b(ar|ar condicionado|air|split|climatiz)/, { icon: AirVent, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400", bar: "bg-sky-500" }],
  [/(geladeira|refrigerador|freezer|frigobar)/, { icon: Refrigerator, tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", bar: "bg-cyan-500" }],
  [/(tv|televis|smart tv|crystal|qled|oled)/, { icon: Tv, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400", bar: "bg-violet-500" }],
  [/(chuveiro|banho|aquecedor de agua)/, { icon: Bath, tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400", bar: "bg-orange-500" }],
  [/(lavar|lavadora|secadora|maquina de lavar)/, { icon: WashingMachine, tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500" }],
  [/(micro|forno|airfryer|air fryer|fritadeira)/, { icon: Microwave, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400", bar: "bg-amber-500" }],
  [/(fogao|cooktop|aquecedor|ferro)/, { icon: Flame, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400", bar: "bg-rose-500" }],
  [/(lampada|luz|led|ilumina)/, { icon: Lightbulb, tone: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400", bar: "bg-yellow-500" }],
  [/(ventilador|circulador)/, { icon: Fan, tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400", bar: "bg-teal-500" }],
  [/(computador|pc|notebook|servidor|console|playstation|xbox)/, { icon: Cpu, tone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400", bar: "bg-fuchsia-500" }],
  [/(monitor)/, { icon: Monitor, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400", bar: "bg-violet-500" }],
];

const FALLBACK: ApplianceVisual = {
  icon: Plug,
  tone: "bg-energy-green-light/10 text-energy-700 dark:text-energy-400",
  bar: "bg-energy-green-light",
};

export const applianceVisual = (name: string): ApplianceVisual => {
  const text = normalizeSearch(name);
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? FALLBACK;
};

export const providerLabel = (provider?: string | null) =>
  !provider ? "Manual" : provider === "smartthings" ? "SmartThings" : provider === "lg-thinq" ? "LG ThinQ" : provider;
