import { useContext, type ReactNode } from "react";
import { ApplianceQuantityContext } from "./appliance-quantity";
import { Leaf } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/energy";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  name: string;
  tariff?: number;
  assumptions?: string;
  source?: string;
  kind: string;
  result?: { consumptionKWh: number; cost: number } | null;
  loading?: boolean;
  monitoringOnly?: boolean;
  editing?: boolean;
  error?: string | null;
  children: ReactNode;
}

/** Presentation only: values always come from the existing calculation API. */
export default function ApplianceSetupSummary({ name, kind, result, loading, monitoringOnly, editing, error, children, tariff, assumptions, source }: Props) {
  const contextQuantity = useContext(ApplianceQuantityContext);
  const quantity = editing ? 1 : contextQuantity;
  return <aside className="appliance-setup-summary" aria-label="Resumo antes de confirmar">
    <div className={`appliance-estimate${!loading && !result && !monitoringOnly ? ' appliance-estimate-pending' : ''}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">{monitoringOnly ? "Monitoramento real" : "Estimativa mensal"}</p><Leaf className="size-5" aria-hidden="true" /></div>
      {monitoringOnly ? <><p className="mt-4 text-2xl font-semibold">Sem estimativa mensal</p><p className="mt-2 text-sm">As medições ficam no histórico de medições. Contador acumulado não é consumo do mês.</p></>
        : loading ? <div className="mt-4 flex flex-col gap-3"><Skeleton className="h-8 w-40 motion-reduce:animate-none" /><p className="text-sm">Calculando estimativa…</p></div>
          : result ? <><p className="mt-4 text-3xl font-semibold tabular-nums">{formatCurrency(result.cost)}<span className="ml-1 text-sm font-medium">/mês</span></p>
            <p className="mt-2 text-base tabular-nums">{formatNumber(result.consumptionKWh)} kWh/mês{quantity > 1 && ' por unidade'}</p>
            {quantity > 1 && <p className="mt-2 text-sm font-semibold tabular-nums">{quantity} unidades: {formatCurrency(result.cost * quantity)}/mês</p>}</>
            : <><p className="appliance-estimate-value mt-4 text-3xl font-semibold tabular-nums">R$ --<span className="ml-1 text-sm font-medium">/mês</span></p><p className="mt-2 text-sm text-muted-foreground">Preencha o uso e a tarifa para ver o custo.</p></>}
      {(result || monitoringOnly) && <div className="appliance-estimate-basis">
        {source && <p>{source}</p>}
        {assumptions && !monitoringOnly && <p>{assumptions}</p>}
        {typeof tariff === 'number' && Number.isFinite(tariff) && tariff > 0 && !monitoringOnly && <p>Tarifa utilizada: {`R$ ${formatNumber(tariff, 4)}`}/kWh</p>}
      </div>}
      <p className="mt-4 text-xs">{kind}</p>
      {result && <p className="mt-2 text-xs">Estimativa de consumo, não uma medição real.</p>}
    </div>
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div><h3 className="text-base font-semibold">{editing ? "Confira a alteração" : "Pronto para adicionar?"}</h3>
        <p className="mt-2 break-words text-sm text-muted-foreground">{name.trim() || "Seu aparelho"}</p>
        <p className="mt-2 text-xs text-muted-foreground">{editing ? "Atualiza este aparelho, preservando seu histórico." : quantity > 1 ? `Cadastra ${quantity} aparelhos iguais, numerados de 1 a ${quantity}. Cada um pode ser editado depois.` : "Cadastra 1 aparelho na sua lista. Você poderá editar depois."}</p></div>
      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error} Seus dados foram mantidos.</p>}
      <div className="flex flex-col gap-3">{children}</div>
      <details className="appliance-small-detail"><summary>Como ler esta estimativa</summary><p>O custo usa consumo × tarifa. Potência e tempo alteram a estimativa por uso; referências de ensaio usam a média da fonte. Para várias unidades, use a Simulação por ambiente.</p></details>
    </div>
  </aside>;
}
