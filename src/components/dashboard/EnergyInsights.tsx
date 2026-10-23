import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type InsightTone = "neutral" | "positive" | "warning";

export interface Insight {
  id: string;
  icon: LucideIcon;
  tone: InsightTone;
  title: string;
  body: string;
  action?: { label: string; to: string };
}

const toneClass: Record<InsightTone, string> = {
  neutral: "bg-energy-blue-light/10 text-energy-blue-light",
  positive: "bg-energy-green-light/10 text-energy-700 dark:text-energy-400",
  warning: "bg-energy-yellow/15 text-amber-700 dark:text-energy-yellow",
};

export function EnergyInsights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section aria-labelledby="insights-title" className="space-y-3">
      <h2 id="insights-title" className="text-lg font-semibold tracking-tight">
        O que os números dizem
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map(({ id, icon: Icon, tone, title, body, action }) => (
          <li
            key={id}
            className="flex gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                toneClass[tone],
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="font-medium leading-snug">{title}</p>
              <p className="text-sm text-muted-foreground">{body}</p>
              {action && (
                <Link
                  to={action.to}
                  className="inline-block pt-1 text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-energy-400"
                >
                  {action.label} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
