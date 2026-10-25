import { Building } from "lucide-react";
import type { Appliance } from "@/hooks/useAppliances";
import { appliancePropertyId } from "@/lib/property-energy";
import { formatCurrency, getMonthlyEstimate } from "@/lib/energy";
import { cn } from "@/lib/utils";
import type { Property } from "@/types/property";

interface Props {
  properties: Property[];
  scopeId: string | null;
  onChange: (id: string | null) => void;
  appliances: Appliance[];
  primaryId: string | null;
  year: number;
  month: number;
}

// Scope picker that doubles as a ranking: each property shows its estimated
// cost for the selected month, so "Todos" always matches the sum.
export function PropertyScopeBar({ properties, scopeId, onChange, appliances, primaryId, year, month }: Props) {
  const costs = properties.map((property) => ({
    property,
    cost: getMonthlyEstimate(
      appliances.filter((item) => appliancePropertyId(item, primaryId) === property.id),
      year,
      month,
    ).cost,
  }));
  const total = costs.reduce((sum, row) => sum + row.cost, 0);
  const chip = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
    );
  return (
    <nav aria-label="Escopo da análise" className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Building className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <button type="button" aria-pressed={!scopeId} onClick={() => onChange(null)} className={chip(!scopeId)}>
        Todos os imóveis <span className="tabular-nums opacity-70">{formatCurrency(total)}</span>
      </button>
      {costs
        .sort((a, b) => b.cost - a.cost)
        .map(({ property, cost }) => (
          <button
            key={property.id}
            type="button"
            aria-pressed={scopeId === property.id}
            onClick={() => onChange(property.id)}
            className={chip(scopeId === property.id)}
          >
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: property.color ?? "#00C853" }} />
            {property.name}
            <span className="tabular-nums opacity-70">{formatCurrency(cost)}</span>
          </button>
        ))}
    </nav>
  );
}
