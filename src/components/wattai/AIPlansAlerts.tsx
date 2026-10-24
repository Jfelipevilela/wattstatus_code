import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { brl, wattAIPlans, type SavedPlanView } from "@/lib/wattai";

const STATUS_LABEL = { pending: "Pendente", applied: "Aplicada", skipped: "Ignorada" } as const;

function PlanDetail({ plan }: { plan: SavedPlanView }) {
  const client = useQueryClient();
  const detail = useQuery({ queryKey: ["wattai", "plan", plan.id], queryFn: () => wattAIPlans.get(plan.id), retry: false });
  const setAction = useMutation({
    mutationFn: ({ applianceId, status }: { applianceId: string; status: "pending" | "applied" | "skipped" }) => wattAIPlans.setAction(plan.id, applianceId, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["wattai", "plan", plan.id] }),
  });
  const actions = detail.data?.plan.actions ?? plan.actions;
  const progress = new Map((detail.data?.progress ?? []).map((item) => [item.applianceId, item]));
  const applied = actions.filter((action) => action.status === "applied").reduce((sum, action) => sum + action.monthlyCost, 0);
  return (
    <div className="space-y-3">
      <div className="h-1.5 rounded-full bg-muted" aria-label="Progresso do plano">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${plan.achieved > 0 ? Math.min(100, (applied / plan.achieved) * 100) : 0}%` }} />
      </div>
      <ul className="divide-y rounded-xl border">
        {actions.map((action) => {
          const state = progress.get(action.applianceId);
          return (
            <li key={action.applianceId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{action.applianceName}: {action.fromHours.toLocaleString("pt-BR")} h → {action.toHours.toLocaleString("pt-BR")} h/dia</span>
                <span className="text-xs text-muted-foreground">
                  −{brl(action.monthlyCost)}/mês simulado · esforço {action.effort === "medio" ? "médio" : action.effort}
                  {state?.registeredAtTarget ? " · cadastro já está no alvo" : state?.registeredHours !== null && state?.registeredHours !== undefined ? ` · cadastro atual ${state.registeredHours.toLocaleString("pt-BR")} h` : ""}
                  {state?.missing ? " · aparelho removido" : ""}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px]", action.status === "applied" && "border-primary text-primary")}>{STATUS_LABEL[action.status ?? "pending"]}</span>
                <Button size="sm" variant="ghost" disabled={setAction.isPending} onClick={() => setAction.mutate({ applianceId: action.applianceId, status: action.status === "applied" ? "pending" : "applied" })} aria-label={`Marcar ${action.applianceName} como aplicada`}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" disabled={setAction.isPending} onClick={() => setAction.mutate({ applianceId: action.applianceId, status: "skipped" })} aria-label={`Ignorar ${action.applianceName}`}>
                  <X className="h-4 w-4" />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      {plan.uncertainty.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground">{plan.uncertainty.map((line) => <li key={line}>{line}</li>)}</ul>}
      <p className="text-xs text-muted-foreground">Aplicada = declarado por você. A economia observada só aparece quando houver medições antes e depois.</p>
    </div>
  );
}

export function AIPlansPanel() {
  const client = useQueryClient();
  const plans = useQuery({ queryKey: ["wattai", "plans"], queryFn: wattAIPlans.list, retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const remove = useMutation({ mutationFn: wattAIPlans.remove, onSuccess: () => client.invalidateQueries({ queryKey: ["wattai", "plans"] }) });
  if (plans.isPending) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (plans.isError) return <p className="text-sm text-muted-foreground">Não foi possível carregar os planos agora.</p>;
  if (!plans.data.length) {
    return <p className="rounded-2xl border p-6 text-sm text-muted-foreground">Nenhum plano salvo. Peça ao WattStatus AI, por exemplo: "Quero reduzir minha conta de R$ 350 para R$ 250", e toque em "Salvar este plano".</p>;
  }
  return (
    <ul className="space-y-3">
      {plans.data.map((plan) => (
        <li key={plan.id} className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <button type="button" className="min-w-0 text-left" onClick={() => setOpen(open === plan.id ? null : plan.id)} aria-expanded={open === plan.id}>
              <p className="font-medium">Meta de {brl(plan.target)} por mês</p>
              <p className="text-xs text-muted-foreground">
                De {brl(plan.reference)} estimados · plano de {brl(plan.achieved)} · {plan.reachable ? "alcança a meta" : `faltam ${brl(plan.remaining)}`} · {new Date(plan.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </button>
            <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={remove.isPending} onClick={() => remove.mutate(plan.id)} aria-label="Excluir plano">
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
          {open === plan.id && <div className="mt-3"><PlanDetail plan={plan} /></div>}
        </li>
      ))}
    </ul>
  );
}

const PRIORITY_STYLE = { alta: "bg-destructive", media: "bg-amber-500", baixa: "bg-muted-foreground/50" } as const;

export function AIAlertsPanel() {
  const client = useQueryClient();
  const alerts = useQuery({ queryKey: ["wattai", "alerts"], queryFn: wattAIPlans.alerts, retry: false });
  const setState = useMutation({
    mutationFn: ({ key, state }: { key: string; state: "read" | "dismissed" | "new" }) => wattAIPlans.setAlert(key, state),
    onSuccess: () => client.invalidateQueries({ queryKey: ["wattai", "alerts"] }),
  });
  if (alerts.isPending) return <Skeleton className="h-48 w-full rounded-2xl" />;
  const list = (alerts.data ?? []).filter((alert) => alert.state !== "dismissed");
  if (!list.length) return <p className="rounded-2xl border p-6 text-sm text-muted-foreground">Nenhum alerta ativo. Os alertas aparecem quando você permite insights proativos nas preferências.</p>;
  return (
    <ul className="space-y-2">
      {list.map((alert) => (
        <li key={alert.key} className={cn("flex items-start gap-3 rounded-xl border bg-card px-4 py-3", alert.state === "read" && "opacity-70")}>
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PRIORITY_STYLE[alert.priority ?? "media"])} aria-label={`Prioridade ${alert.priority}`} />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">{alert.title}</span>
            <span className="text-xs text-muted-foreground">{alert.detail} · {new Date(alert.createdAt).toLocaleDateString("pt-BR")}</span>
          </span>
          <span className="flex shrink-0 gap-1">
            {alert.state !== "read" && <Button size="sm" variant="ghost" onClick={() => setState.mutate({ key: alert.key, state: "read" })}>Lido</Button>}
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setState.mutate({ key: alert.key, state: "dismissed" })}>Dispensar</Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
