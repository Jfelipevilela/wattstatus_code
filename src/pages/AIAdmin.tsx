import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { notifyError } from "@/lib/error-toast";
import { wattAIAccount } from "@/lib/wattai";

type Usage = {
  requests?: number; activeUsers?: number; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number;
  avgLatencyMs?: number; p95LatencyMs?: number; llm?: number; errors?: number; limited?: number; guardRejected?: number;
  recommendationsApplied?: number;
  byFeature?: Array<{ _id: { feature: string; intent: string }; count: number }>;
  byModel?: Array<{ _id: string; count: number; costUsd: number }>;
};
type Settings = { enabled?: boolean; modelFast?: string; modelReasoning?: string; dailyUserBudget?: number; monthlyGlobalBudget?: number; experimental?: Record<string, boolean> };
type Effective = { generative: boolean; keyConfigured: boolean; envEnabled: boolean; modelFast: string; modelReasoning: string; dailyUserBudget: number; monthlyGlobalBudget: number; maxConcurrent: number };

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-xl border bg-card px-4 py-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);
const n = (value?: number, digits = 0) => (value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

// Aggregates only: no conversation content is ever loaded here.
export default function AIAdmin() {
  const client = useQueryClient();
  const [days, setDays] = useState(30);
  const settings = useQuery({ queryKey: ["wattai", "admin", "settings"], queryFn: wattAIAccount.adminSettings, retry: false });
  const usage = useQuery({ queryKey: ["wattai", "admin", "usage", days], queryFn: () => wattAIAccount.adminUsage(days), retry: false, enabled: settings.isSuccess });
  const [draft, setDraft] = useState<Settings>({});
  useEffect(() => { if (settings.data) setDraft(settings.data.settings as Settings); }, [settings.data]);
  const save = useMutation({
    mutationFn: () => wattAIAccount.saveAdminSettings(draft),
    onSuccess: () => { toast({ title: "Configuração salva" }); return client.invalidateQueries({ queryKey: ["wattai"] }); },
    onError: (error) => notifyError(error, { title: "Não foi possível salvar" }),
  });

  const effective = settings.data?.effective as Effective | undefined;
  const u = (usage.data?.usage ?? {}) as Usage;
  const errorRate = u.requests ? (u.errors ?? 0) / u.requests : 0;
  const select = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  const forbidden = settings.error && (settings.error as { status?: number }).status === 403;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <span className="font-semibold">Administração do WattStatus AI</span>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 pb-16 pt-6 md:px-6">
          {settings.isPending ? <Skeleton className="h-64 w-full rounded-2xl" /> : forbidden ? (
            <div className="flex items-center gap-3 rounded-2xl border p-6 text-sm"><ShieldAlert className="h-5 w-5 text-muted-foreground" /> Acesso restrito a administradores.</div>
          ) : settings.isError ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar a administração agora.</p>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Uso</h2>
                  <select className="rounded-md border bg-background px-2 py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período">
                    {[1, 7, 30, 90].map((value) => <option key={value} value={value}>Últimos {value} dia(s)</option>)}
                  </select>
                </div>
                {usage.isPending ? <Skeleton className="h-32 w-full rounded-2xl" /> : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Stat label="Solicitações" value={n(u.requests)} hint={`${n(u.llm)} com modelo`} />
                    <Stat label="Usuários ativos" value={n(u.activeUsers)} />
                    <Stat label="Tokens" value={n((u.inputTokens ?? 0) + (u.outputTokens ?? 0))} hint={`${n(u.inputTokens)} entrada · ${n(u.outputTokens)} saída`} />
                    <Stat label="Custo estimado" value={`US$ ${n(u.estimatedCostUsd, 4)}`} hint="Pelo preço configurado" />
                    <Stat label="Latência média" value={`${n(u.avgLatencyMs)} ms`} hint={`p95 ${n(u.p95LatencyMs)} ms`} />
                    <Stat label="Taxa de erro" value={`${n(errorRate * 100, 1)}%`} hint={`${n(u.errors)} erro(s), inclui recusas da guarda`} />
                    <Stat label="Limites atingidos" value={n(u.limited)} />
                    <Stat label="Reescritas recusadas" value={n(u.guardRejected)} hint="Números ou afirmações fora dos fatos" />
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 text-sm font-medium">Funcionalidades mais usadas</p>
                    <ul className="space-y-1 text-sm">
                      {(u.byFeature ?? []).slice(0, 8).map((row) => (
                        <li key={`${row._id.feature}:${row._id.intent}`} className="flex justify-between gap-2"><span className="truncate">{row._id.feature} · {row._id.intent}</span><span className="tabular-nums text-muted-foreground">{row.count}</span></li>
                      ))}
                      {!u.byFeature?.length && <li className="text-muted-foreground">Sem dados no período.</li>}
                    </ul>
                  </div>
                  <div className="rounded-xl border bg-card p-4">
                    <p className="mb-2 text-sm font-medium">Modelos utilizados</p>
                    <ul className="space-y-1 text-sm">
                      {(u.byModel ?? []).map((row) => (
                        <li key={row._id} className="flex justify-between gap-2"><span>{row._id}</span><span className="tabular-nums text-muted-foreground">{row.count} · US$ {n(row.costUsd, 4)}</span></li>
                      ))}
                      {!u.byModel?.length && <li className="text-muted-foreground">Nenhuma chamada a modelo no período.</li>}
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Recomendações marcadas como aplicadas: {n(u.recommendationsApplied)}. Isso é declarado pelo usuário, não economia observada.</p>
              </section>

              <form className="space-y-4 rounded-2xl border bg-card p-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
                <h2 className="text-base font-semibold">Configuração</h2>
                <p className="text-xs text-muted-foreground">
                  Chave do provedor: {effective?.keyConfigured ? "configurada no servidor" : "ausente"} · IA no ambiente: {effective?.envEnabled ? "ligada" : "desligada"} · em uso agora: {effective?.generative ? "modelo generativo" : "somente motor de cálculo"}.
                  A chave e os tetos ficam nas variáveis de ambiente; aqui só é possível desligar ou reduzir.
                </p>
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium">Usar modelo generativo</span>
                  <Switch checked={draft.enabled !== false} onCheckedChange={(on) => setDraft((d) => ({ ...d, enabled: on }))} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-sm"><span className="font-medium">Modelo rápido</span>
                    <select className={select} value={draft.modelFast ?? effective?.modelFast} onChange={(e) => setDraft((d) => ({ ...d, modelFast: e.target.value }))}>
                      {settings.data!.allowedModels.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Modelo de raciocínio</span>
                    <select className={select} value={draft.modelReasoning ?? effective?.modelReasoning} onChange={(e) => setDraft((d) => ({ ...d, modelReasoning: e.target.value }))}>
                      {settings.data!.allowedModels.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Chamadas por usuário por dia</span>
                    <Input type="number" min={0} value={draft.dailyUserBudget ?? effective?.dailyUserBudget ?? ""} onChange={(e) => setDraft((d) => ({ ...d, dailyUserBudget: Number(e.target.value) }))} />
                  </label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Teto global em 30 dias</span>
                    <Input type="number" min={0} value={draft.monthlyGlobalBudget ?? effective?.monthlyGlobalBudget ?? ""} onChange={(e) => setDraft((d) => ({ ...d, monthlyGlobalBudget: Number(e.target.value) }))} />
                  </label>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Recursos experimentais</p>
                  {([["chartExplain", "Explicar gráficos"], ["alerts", "Alertas proativos"], ["streaming", "Progresso em tempo real"]] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-4 text-sm">
                      {label}
                      <Switch checked={draft.experimental?.[key] !== false} onCheckedChange={(on) => setDraft((d) => ({ ...d, experimental: { ...(d.experimental ?? {}), [key]: on } }))} />
                    </label>
                  ))}
                  <label className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                    Comandos SmartThings
                    <Switch checked={false} disabled aria-label="Comandos SmartThings (bloqueados)" />
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar</Button>
                </div>
              </form>
            </>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
