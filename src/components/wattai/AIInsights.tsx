import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { brl, wattAI, wattAIPlans, SOURCE_LABEL } from "@/lib/wattai";
import { useWattAI } from "./WattAI";

// Token-free insights computed by the engine. Hidden when the AI endpoint is
// unavailable, so the page works the same without it.
export function AIInsights({ propertyId, title = "Análises do WattStatus AI" }: { propertyId?: string; title?: string }) {
  const { user } = useAuth();
  const { openAssistant, openSimulator } = useWattAI();
  const client = useQueryClient();
  const key = ["wattai", "insights", propertyId ?? "primary"];
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(user),
    queryFn: () => wattAI.insights(propertyId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const setState = useMutation({
    mutationFn: ({ id, state, property }: { id: string; state: string; property: string }) => wattAI.setRecommendationState(id, state, property),
    onSuccess: () => client.invalidateQueries({ queryKey: ["wattai", "insights"] }),
  });

  const [rated, setRated] = useState<Record<string, boolean>>({});
  const rate = (id: string, feedback: "useful" | "not_useful", propertyId: string) => {
    setRated((current) => ({ ...current, [id]: true }));
    void wattAIPlans.feedback(id, feedback, propertyId).catch(() => setRated((current) => ({ ...current, [id]: false })));
  };
  const data = query.data;
  if (query.isError || !data?.property || (!data.insights.length && !data.recommendations.length)) return null;
  const property = data.property;
  const recs = data.recommendations.filter((item) => item.state !== "applied").slice(0, 3);
  const applied = data.recommendations.filter((item) => item.state === "applied").slice(0, 2);

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="ai-insights-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="ai-insights-title" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {title}
        </h2>
        <button type="button" onClick={() => openAssistant({ message: "Analisar minha casa", context: { propertyId: property.id } })} className="text-xs font-medium text-primary hover:underline">
          Perguntar à IA
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-3">
          {data.insights.slice(0, 4).map((item) => (
            <li key={item.id} className="text-sm">
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.detail} <span className="uppercase tracking-wide">· {SOURCE_LABEL[item.source]}</span></p>
            </li>
          ))}
        </ul>
        {recs.length > 0 && (
          <ul className="space-y-2">
            {recs.map((item) => (
              <li key={item.id} className="rounded-lg border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium">{item.title}</p>
                  {item.impactMonthly ? <span className="shrink-0 text-xs tabular-nums text-primary">−{brl(item.impactMonthly)}/mês</span> : null}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.kind === "reduce_usage" && item.applianceId && (
                    <button type="button" onClick={() => openSimulator({ propertyId: property.id, applianceId: item.applianceId! })} className="text-[11px] font-medium hover:underline">Simular</button>
                  )}
                  <button type="button" disabled={setState.isPending} onClick={() => setState.mutate({ id: item.id, state: "applied", property: property.id })} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <Check className="h-3 w-3" aria-hidden /> Apliquei
                  </button>
                  <button type="button" disabled={setState.isPending} onClick={() => setState.mutate({ id: item.id, state: "dismissed", property: property.id })} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" aria-hidden /> Dispensar
                  </button>
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                    {rated[item.id] ? "Obrigado pelo retorno" : (<>
                      Útil?
                      <button type="button" className="rounded px-1 hover:text-foreground" onClick={() => rate(item.id, "useful", property.id)}>Sim</button>
                      <button type="button" className="rounded px-1 hover:text-foreground" onClick={() => rate(item.id, "not_useful", property.id)}>Não</button>
                    </>)}
                  </span>
                </div>
              </li>
            ))}
            {applied.map((item) => (
              <li key={item.id} className="px-1 text-[11px] text-muted-foreground">
                Acompanhando: {item.title}.{" "}
                {item.tracking?.status === "ok" && item.tracking.change !== null
                  ? `Consumo medido ${Math.round(Math.abs(item.tracking.change) * 100)}% ${item.tracking.change < 0 ? "menor" : "maior"} depois da mudança (sem prova de causa).`
                  : "Aguardando 7 dias de medições antes e depois para comparar."}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
