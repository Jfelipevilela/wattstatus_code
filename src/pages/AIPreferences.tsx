import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AIAlertsPanel, AIPlansPanel } from "@/components/wattai/AIPlansAlerts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useAppliances } from "@/hooks/useAppliances";
import { useProperties } from "@/hooks/useProperties";
import { notifyError } from "@/lib/error-toast";
import { wattAIAccount, type AIPreferences as Prefs } from "@/lib/wattai";

const RECOMMENDATIONS: Array<[string, string]> = [
  ["reduce_usage", "Reduzir tempo de uso"],
  ["review_power", "Revisar potência cadastrada"],
  ["review_continuous", "Conferir uso contínuo"],
  ["enable_measurement", "Habilitar medição real"],
  ["check_device", "Dispositivos sem leitura"],
  ["investigate_increase", "Investigar aumentos"],
  ["set_goal", "Definir meta"],
];
const ALERTS: Array<[string, string]> = [
  ["consumption_increase", "Aumento incomum do consumo"],
  ["goal_risk", "Meta perto de ser ultrapassada"],
  ["forecast", "Previsão mensal relevante"],
  ["missing_reading", "Aparelho sem leitura"],
  ["persistent_anomaly", "Anomalia persistente"],
  ["appliance_anomaly", "Aparelho com consumo anormal"],
  ["savings_opportunity", "Oportunidade de economia"],
];

const Section = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <section className="rounded-2xl border bg-card p-5 sm:p-6">
    <h2 className="text-base font-semibold tracking-tight">{title}</h2>
    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);
const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6">
    <span>
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </span>
    <span className="sm:w-64">{children}</span>
  </label>
);
const toggle = (list: string[] | undefined, value: string, on: boolean) => {
  const set = new Set(list ?? []);
  if (on) set.add(value); else set.delete(value);
  return [...set];
};

export default function AIPreferences() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("aba") === "planos" ? "planos" : params.get("aba") === "alertas" ? "alertas" : "preferencias";
  const client = useQueryClient();
  const { properties } = useProperties();
  const { appliances } = useAppliances();
  const query = useQuery({ queryKey: ["wattai", "preferences"], queryFn: wattAIAccount.preferences, retry: false });
  const alerts = useQuery({ queryKey: ["wattai", "alerts"], queryFn: wattAIAccount.alerts, retry: false });
  const [draft, setDraft] = useState<Prefs>({});
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: () => wattAIAccount.savePreferences({
      monthlyGoal: draft.monthlyGoal ?? null,
      monthlyKWhGoal: draft.monthlyKWhGoal ?? null,
      primaryPropertyId: draft.primaryPropertyId ?? null,
      essentialApplianceIds: draft.essentialApplianceIds ?? [],
      maxReductionPercent: draft.maxReductionPercent ?? 30,
      minHoursByAppliance: draft.minHoursByAppliance ?? {},
      comfortNotes: draft.comfortNotes ?? "",
      recommendationCategories: draft.recommendationCategories ?? [],
      proactiveInsights: draft.proactiveInsights ?? false,
      alertFrequency: draft.alertFrequency ?? "off",
      alertCategories: draft.alertCategories ?? [],
      conversationRetentionDays: draft.conversationRetentionDays ?? 30,
    }),
    onSuccess: () => {
      toast({ title: "Preferências salvas", description: "As próximas análises e recomendações já usam estes ajustes." });
      return client.invalidateQueries({ queryKey: ["wattai"] });
    },
    onError: (error) => notifyError(error, { title: "Não foi possível salvar" }),
  });
  const evaluate = useMutation({
    mutationFn: wattAIAccount.evaluateAlerts,
    onSuccess: (result) => {
      toast({ title: result.skipped ? "Alertas desativados" : `${result.created.length} alerta(s) novo(s)`, description: result.skipped ? "Ative os insights proativos e escolha uma frequência." : undefined });
      return client.invalidateQueries({ queryKey: ["wattai", "alerts"] });
    },
  });
  const erase = useMutation({
    mutationFn: wattAIAccount.deleteData,
    onSuccess: () => {
      try { Object.keys(sessionStorage).filter((key) => key.startsWith("wattai:")).forEach((key) => sessionStorage.removeItem(key)); } catch { /* storage unavailable */ }
      toast({ title: "Dados da IA excluídos", description: "Preferências, conversas, alertas e métricas foram removidos." });
      return client.invalidateQueries({ queryKey: ["wattai"] });
    },
  });

  const recCategories = draft.recommendationCategories ?? [];
  const alertCategories = draft.alertCategories ?? [];
  const essential = new Set(draft.essentialApplianceIds ?? []);
  const select = "w-full rounded-md border bg-background px-3 py-2 text-sm";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <span className="font-semibold">Preferências do WattStatus AI</span>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 pb-16 pt-6 md:px-6">
          <nav className="flex gap-1 rounded-full border bg-card p-1 text-sm" aria-label="Seções do WattStatus AI">
            {([["preferencias", "Preferências"], ["planos", "Planos"], ["alertas", "Alertas"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-current={tab === value ? "page" : undefined}
                onClick={() => setParams(value === "preferencias" ? {} : { aba: value }, { replace: true })}
                className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${tab === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </nav>
          {tab === "planos" ? <AIPlansPanel /> : tab === "alertas" ? <AIAlertsPanel /> : (<>
          <p className="text-sm text-muted-foreground">
            Só o que você define aqui vira preferência. O assistente nunca salva suposições sobre você sem esta página.
          </p>
          {query.isPending ? <Skeleton className="h-96 w-full rounded-2xl" /> : query.isError ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar as preferências agora.</p>
          ) : (
            <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
              <Section title="Metas" description="Usadas na previsão do mês, nos alertas e nos planos de economia.">
                <Field label="Meta mensal de gasto" hint="Em reais">
                  <Input type="number" min={1} step="1" inputMode="decimal" value={draft.monthlyGoal ?? ""} onChange={(e) => set("monthlyGoal", e.target.value ? Number(e.target.value) : null)} placeholder="Ex.: 250" />
                </Field>
                <Field label="Meta mensal de consumo" hint="Em kWh">
                  <Input type="number" min={1} step="1" value={draft.monthlyKWhGoal ?? ""} onChange={(e) => set("monthlyKWhGoal", e.target.value ? Number(e.target.value) : null)} placeholder="Ex.: 300" />
                </Field>
                <Field label="Imóvel principal da IA">
                  <select className={select} value={draft.primaryPropertyId ?? ""} onChange={(e) => set("primaryPropertyId", e.target.value || null)}>
                    <option value="">Mesmo do WattStatus</option>
                    {properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>
              </Section>

              <Section title="Restrições e conforto" description="Os planos nunca passam destes limites.">
                <Field label="Corte máximo por aparelho" hint="Parte das horas diárias que um plano pode reduzir">
                  <select className={select} value={draft.maxReductionPercent ?? 30} onChange={(e) => set("maxReductionPercent", Number(e.target.value))}>
                    {[10, 20, 30, 40, 50].map((value) => <option key={value} value={value}>{value}%</option>)}
                  </select>
                </Field>
                {appliances.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Aparelhos</p>
                    <p className="text-xs text-muted-foreground">Essenciais ficam fora de qualquer corte. O mínimo de horas é um limite de conforto.</p>
                    <ul className="divide-y rounded-xl border">
                      {appliances.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch checked={essential.has(item.id)} onCheckedChange={(on) => set("essentialApplianceIds", toggle(draft.essentialApplianceIds, item.id, on))} aria-label={`${item.name} é essencial`} />
                            Essencial
                          </label>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Mín.
                            <Input type="number" min={0} max={24} step="0.5" className="h-8 w-20" value={draft.minHoursByAppliance?.[item.id] ?? ""} aria-label={`Mínimo de horas para ${item.name}`}
                              onChange={(e) => {
                                const next = { ...(draft.minHoursByAppliance ?? {}) };
                                if (e.target.value === "") delete next[item.id]; else next[item.id] = Number(e.target.value);
                                set("minHoursByAppliance", next);
                              }} />
                            h/dia
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Field label="Observações de conforto" hint="Só para você lembrar; a IA não interpreta este texto">
                  <Input maxLength={300} value={draft.comfortNotes ?? ""} onChange={(e) => set("comfortNotes", e.target.value)} placeholder="Ex.: ar ligado à noite no verão" />
                </Field>
              </Section>

              <Section title="Recomendações" description="Sem nenhuma marcada, todas as categorias aparecem.">
                <div className="grid gap-2 sm:grid-cols-2">
                  {RECOMMENDATIONS.map(([value, label]) => (
                    <label key={value} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      {label}
                      <Switch checked={recCategories.includes(value)} onCheckedChange={(on) => set("recommendationCategories", toggle(recCategories, value, on))} />
                    </label>
                  ))}
                </div>
              </Section>

              <Section title="Alertas proativos" description="Calculados pelo motor do WattStatus, sem custo de IA. Nada é enviado por e-mail ou push nesta versão.">
                <Field label="Permitir insights proativos" hint="Seu consentimento para o WattStatus avaliar alertas">
                  <Switch checked={draft.proactiveInsights ?? false} onCheckedChange={(on) => set("proactiveInsights", on)} />
                </Field>
                <Field label="Frequência máxima">
                  <select className={select} value={draft.alertFrequency ?? "off"} onChange={(e) => set("alertFrequency", e.target.value as Prefs["alertFrequency"])}>
                    <option value="off">Desligado</option>
                    <option value="daily">No máximo um por tipo ao dia</option>
                    <option value="weekly">No máximo um por tipo na semana</option>
                  </select>
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALERTS.map(([value, label]) => (
                    <label key={value} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                      {label}
                      <Switch checked={alertCategories.includes(value)} onCheckedChange={(on) => set("alertCategories", toggle(alertCategories, value, on))} />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" size="sm" disabled={evaluate.isPending} onClick={() => evaluate.mutate()}>
                    {evaluate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />} Verificar agora
                  </Button>
                  <span className="text-xs text-muted-foreground">Salve antes de verificar.</span>
                </div>
                {(alerts.data?.length ?? 0) > 0 && (
                  <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setParams({ aba: "alertas" }, { replace: true })}>
                    Ver {alerts.data!.length} alerta(s)
                  </button>
                )}
              </Section>

              <Section title="Privacidade">
                <Field label="Guardar conversas" hint="Por quanto tempo o histórico fica no servidor">
                  <select className={select} value={draft.conversationRetentionDays ?? 30} onChange={(e) => set("conversationRetentionDays", Number(e.target.value) as Prefs["conversationRetentionDays"])}>
                    <option value={0}>Não guardar</option>
                    <option value={7}>7 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={90}>90 dias</option>
                  </select>
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" size="sm" className="text-destructive" disabled={erase.isPending}
                    onClick={() => { if (window.confirm("Excluir preferências, conversas, alertas e métricas da IA? Isso não pode ser desfeito.")) erase.mutate(); }}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir meus dados da IA
                  </Button>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Seus aparelhos e medições não são afetados.</span>
                </div>
              </Section>

              <div className="sticky bottom-4 flex justify-end">
                <Button type="submit" disabled={save.isPending} className="rounded-full shadow-lg">
                  {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar preferências
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Administração da IA: <Link to="/ia/admin" className="underline underline-offset-2">painel</Link> (somente administradores).</p>
            </form>
          )}
          </>)}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
