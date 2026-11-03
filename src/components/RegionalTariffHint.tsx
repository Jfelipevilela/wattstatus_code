import { Button } from "@/components/ui/button";
import { useRegionalTariff } from "@/hooks/useRegionalTariff";
import { formatCurrency } from "@/lib/energy";
import type { RegionalTariff } from "@/lib/regional-tariff";

export default function RegionalTariffHint({ onApply }: {
  onApply: (suggestion: RegionalTariff) => void;
}) {
  const { status, suggestion, error, requestLocation, clearLocation } = useRegionalTariff();
  return <div className="flex flex-col gap-2 text-xs text-muted-foreground">
    <p role="status">{suggestion
      ? `Referência da sua região: ${suggestion.state} · ${suggestion.region}, ${formatCurrency(suggestion.rate)}/kWh. Você pode alterar conforme sua conta.`
      : error || "Autorize a localização para sugerir a tarifa do seu estado. Você pode alterar. A posição é processada neste navegador."}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={status === "loading"} onClick={() => {
        if (suggestion) onApply(suggestion); else void requestLocation();
      }}>{status === "loading" ? "Identificando região…" : suggestion ? "Usar referência local" : "Usar minha localização"}</Button>
      {suggestion && <Button type="button" variant="ghost" size="sm" onClick={clearLocation}>Limpar localização</Button>}
    </div>
  </div>;
}
