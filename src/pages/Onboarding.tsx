import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Home, PlugZap, Sparkles, Zap } from "lucide-react";
import { AppSidebar, SidebarProvider, SidebarTrigger } from "@/components/Sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { PropertyForm } from "@/components/properties/PropertyForm";
import { useProperties, usePropertyLayout, type PropertyInput } from "@/hooks/useProperties";
import { useAppliances } from "@/hooks/useAppliances";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useWattAI } from "@/components/wattai/WattAI";
import { APPLIANCE_PRESETS } from "@/lib/appliance-presets";
import { STATE_TARIFFS, formatCurrency, formatNumber, getMonthlyEstimate, hasEstimatedTariff } from "@/lib/energy";
import { notifyError } from "@/lib/error-toast";

const stages = ["Boas-vindas", "Seu imóvel", "Tarifa", "Primeiro aparelho", "Estimativa", "Explorar"];
const field = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold hover:bg-muted";

export default function Onboarding() {
  const navigate = useNavigate();
  const { preferences, loading: preferencesLoading, updatePreferences } = useUserPreferences();
  const { primary: property, loading: propertiesLoading, update: updateProperty } = useProperties();
  const { appliances, loading: appliancesLoading, addAppliance } = useAppliances();
  const { rooms } = usePropertyLayout(property?.id);
  const { openAssistant } = useWattAI();
  const [step, setStep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tariffState, setTariffState] = useState("");
  const [tariffMode, setTariffMode] = useState<"reference" | "custom">("reference");
  const [tariffInput, setTariffInput] = useState("");
  const [name, setName] = useState("");
  const [power, setPower] = useState("");
  const [hours, setHours] = useState("");
  const [days, setDays] = useState("30");
  const [roomId, setRoomId] = useState("");
  const [formError, setFormError] = useState("");
  const saving = useRef(false);

  useEffect(() => {
    if (!preferencesLoading && !propertiesLoading && !appliancesLoading && step === null) {
      setStep(preferences.onboarding?.step ?? (appliances.length > 0 ? 4 : 0));
    }
  }, [preferencesLoading, propertiesLoading, appliancesLoading, preferences.onboarding, appliances.length, step]);
  useEffect(() => {
    if (preferences.tariffState || property?.tariffState) setTariffState(preferences.tariffState || property?.tariffState || "");
    if (preferences.tariffValue || property?.tariffValue) {
      setTariffInput(String(preferences.tariffValue || property?.tariffValue));
      setTariffMode("custom");
    }
  }, [preferences.tariffState, preferences.tariffValue, property?.tariffState, property?.tariffValue]);

  const persist = async (next: number, status: "in_progress" | "later" | "complete" = "in_progress") => {
    await updatePreferences({ onboarding: { status, step: next } });
    setStep(next);
  };
  const run = async (action: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setFormError("");
    try { await action(); }
    catch (error) { notifyError(error, { title: "Não foi possível salvar", fallbackMessage: "Tente novamente." }); }
    finally { saving.current = false; setBusy(false); }
  };
  const later = () => void run(async () => { await persist(step ?? 0, "later"); navigate("/dashboard"); });
  const saveProperty = (input: PropertyInput) => void run(async () => {
    if (!property) throw new Error("Aguarde o carregamento do imóvel.");
    await updateProperty.mutateAsync({ id: property.id, ...input });
    await persist(2);
  });
  const saveTariff = () => void run(async () => {
    if (!tariffState || !STATE_TARIFFS[tariffState]) { setFormError("Selecione um estado."); return; }
    const rate = tariffMode === "reference" ? STATE_TARIFFS[tariffState] : Number(tariffInput.replace(",", "."));
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10) { setFormError("Informe uma tarifa entre R$ 0,01 e R$ 10,00 por kWh."); return; }
    await updatePreferences({ tariffState, tariffValue: rate });
    if (property) await updateProperty.mutateAsync({ id: property.id, tariffState, tariffValue: rate });
    await persist(3);
  });
  const saveAppliance = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const watts = Number(power.replace(",", "."));
      const perDay = Number(hours.replace(",", "."));
      const perMonth = Number(days);
      if (name.trim().length < 2 || !Number.isFinite(watts) || watts <= 0 || !Number.isFinite(perDay) || perDay <= 0 || perDay > 24 || !Number.isInteger(perMonth) || perMonth < 1 || perMonth > 31) {
        setFormError("Informe nome, potência positiva, horas entre 0 e 24 e dias entre 1 e 31."); return;
      }
      const state = preferences.tariffState || tariffState;
      const rate = preferences.tariffValue || (state ? STATE_TARIFFS[state] : undefined);
      if (!state || !rate) { setFormError("Configure a tarifa antes de adicionar o aparelho."); return; }
      await addAppliance({ name: name.trim(), power: watts, usageHours: perDay, days: perMonth, tariff: state, tariffValue: rate, propertyId: property?.id, roomId: roomId || null });
      await persist(4);
    });
  };
  const now = new Date();
  const scoped = appliances.filter((item) => !property || item.propertyId === property.id || !item.propertyId);
  const estimate = getMonthlyEstimate(scoped, now.getFullYear(), now.getMonth() + 1);
  const costAvailable = scoped.length > 0 && scoped.every(hasEstimatedTariff);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="flex h-16 items-center gap-3 border-b px-4"><SidebarTrigger /><Zap className="h-5 w-5 text-primary" aria-hidden="true" /><span className="font-semibold">Primeiros passos</span></header>
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={17} /> Dashboard</Link>
            <button type="button" className="min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={later} disabled={busy}>Continuar mais tarde</button>
          </div>
          {step === null ? <p role="status">Carregando seus dados…</p> : <>
            <div className="mb-9">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">WATTSTATUS · PRIMEIRO ACESSO</p>
              <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">Etapa {step + 1} de 6 · {stages[step]}</p>
              <div className="mt-4 grid grid-cols-6 gap-1.5" aria-hidden="true">{stages.map((label, index) => <span key={label} className={`h-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} />)}</div>
            </div>

            {step === 0 && <section className="rounded-2xl border bg-card p-6 sm:p-10">
              <Home className="mb-5 h-9 w-9 text-primary" aria-hidden="true" />
              <h1 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Vamos entender o consumo de energia da sua casa?</h1>
              <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">Configure um imóvel, informe sua tarifa e adicione um aparelho. Você verá sua primeira estimativa; pode sair e voltar quando quiser.</p>
              <div className="mt-8 flex flex-wrap gap-3"><button className={primary} disabled={busy} onClick={() => void run(() => persist(1))}>Começar <ArrowRight size={17} /></button>
                <button className={secondary} disabled={busy} onClick={later}>Explorar o sistema</button></div>
            </section>}

            {step === 1 && <section className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">Seu primeiro imóvel</h1><p className="mt-2 text-muted-foreground">Já reservamos um imóvel para sua conta. Ajuste os dados ou continue com ele; nenhum imóvel será duplicado.</p></div>
              {property ? <div className="rounded-2xl border bg-card p-5 sm:p-7"><PropertyForm initial={property} submitting={busy} submitLabel="Salvar e continuar" onSubmit={saveProperty} /><button type="button" className="mt-4 text-sm text-muted-foreground underline" disabled={busy} onClick={() => void run(() => persist(2))}>Usar {property.name} como está</button></div> : <p role="status">Preparando seu imóvel…</p>}
            </section>}

            {step === 2 && <section className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">Qual tarifa usar?</h1><p className="mt-2 text-muted-foreground">A referência por estado ajuda a começar. Se você conhece o valor de sua conta, informe sua tarifa em R$/kWh. Referências não são preços oficiais atualizados.</p></div>
              <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7"><div className="space-y-2"><label htmlFor="onboarding-state" className="text-sm font-medium">Estado</label><select id="onboarding-state" className={field} value={tariffState} onChange={(e) => setTariffState(e.target.value)}><option value="">Selecione</option>{Object.keys(STATE_TARIFFS).map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select></div>
                <fieldset className="space-y-3"><legend className="text-sm font-medium">Origem da tarifa</legend><label className="flex min-h-11 items-center gap-3"><input type="radio" name="tariff-mode" checked={tariffMode === "reference"} onChange={() => setTariffMode("reference")} /> Usar referência {tariffState && `(R$ ${formatNumber(STATE_TARIFFS[tariffState])}/kWh)`}</label><label className="flex min-h-11 items-center gap-3"><input type="radio" name="tariff-mode" checked={tariffMode === "custom"} onChange={() => setTariffMode("custom")} /> Informar meu valor</label></fieldset>
                {tariffMode === "custom" && <div className="space-y-2"><label htmlFor="onboarding-rate" className="text-sm font-medium">Valor por kWh (R$)</label><input id="onboarding-rate" className={field} inputMode="decimal" value={tariffInput} onChange={(e) => setTariffInput(e.target.value)} placeholder="Ex.: 0,82" /></div>}
                {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<button className={primary} disabled={busy} onClick={saveTariff}>Salvar tarifa <ArrowRight size={17} /></button></div>
            </section>}

            {step === 3 && <section className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">Adicione um aparelho</h1><p className="mt-2 text-muted-foreground">Escolha uma sugestão e ajuste os valores, ou preencha os seus. Nada é salvo até você confirmar.</p></div>
              <form className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7" onSubmit={saveAppliance} noValidate>
                <div><p className="mb-2 text-sm font-medium">Sugestões</p><div className="flex flex-wrap gap-2">{APPLIANCE_PRESETS.map((preset) => <button key={preset.name} type="button" className="min-h-11 rounded-full border px-3 text-xs hover:border-primary hover:bg-primary/5" onClick={() => { setName(preset.name); setPower(String(preset.power)); setHours(String(preset.hours)); setFormError(""); }}>{preset.name}</button>)}</div></div>
                <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="appliance-name" className="text-sm font-medium">Nome</label><input id="appliance-name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></div><div className="space-y-2"><label htmlFor="appliance-power" className="text-sm font-medium">Potência (W)</label><input id="appliance-power" className={field} inputMode="decimal" value={power} onChange={(e) => setPower(e.target.value)} required /></div><div className="space-y-2"><label htmlFor="appliance-hours" className="text-sm font-medium">Horas por dia</label><input id="appliance-hours" className={field} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} required /></div><div className="space-y-2"><label htmlFor="appliance-days" className="text-sm font-medium">Dias no mês</label><input id="appliance-days" className={field} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} required /></div></div>
                <p className="text-sm text-muted-foreground">Imóvel: <strong className="text-foreground">{property?.name ?? "Carregando…"}</strong></p>
                {rooms.length > 0 && <div className="space-y-2"><label htmlFor="appliance-room" className="text-sm font-medium">Ambiente (opcional)</label><select id="appliance-room" className={field} value={roomId} onChange={(e) => setRoomId(e.target.value)}><option value="">Sem ambiente</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></div>}
                {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
                <div className="flex flex-wrap gap-3"><button type="submit" className={primary} disabled={busy || !property}><PlugZap size={17} /> Salvar aparelho</button><button type="button" className={secondary} disabled={busy} onClick={() => void run(() => persist(4))}>Pular por agora</button></div>
              </form>
            </section>}

            {step === 4 && <section className="space-y-6"><div><h1 className="text-3xl font-bold tracking-tight">Sua primeira estimativa</h1><p className="mt-2 text-muted-foreground">Projeção para {now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}, baseada na potência e no tempo de uso informado. Não representa uma medição real.</p></div>
              {estimate.rows.length ? <div className="rounded-2xl border bg-card p-6 sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><div><p className="text-sm text-muted-foreground">Consumo estimado</p><p className="mt-2 text-3xl font-bold">{formatNumber(estimate.consumption)} <span className="text-base font-medium">kWh</span></p></div><div><p className="text-sm text-muted-foreground">Custo estimado</p><p className="mt-2 text-3xl font-bold">{costAvailable ? formatCurrency(estimate.cost) : "Tarifa pendente"}</p></div></div><p className="mt-5 text-xs text-muted-foreground">Premissa: potência × horas por dia × dias informados, limitada aos {estimate.days} dias deste mês. A tarifa salva em cada aparelho compõe o custo.</p><ul className="mt-6 divide-y border-t">{estimate.rows.map((row) => <li key={row.id} className="flex justify-between gap-3 py-3 text-sm"><span>{row.name}</span><span className="tabular-nums">{formatNumber(row.consumo)} kWh</span></li>)}</ul></div> : <div className="rounded-2xl border bg-card p-6"><p>Ainda não há aparelhos suficientes para uma estimativa.</p><button className={`${secondary} mt-4`} onClick={() => void run(() => persist(3))}>Adicionar aparelho</button></div>}
              <button className={primary} disabled={busy} onClick={() => void run(() => persist(5))}>Explorar o WattStatus <ArrowRight size={17} /></button>
            </section>}

            {step === 5 && <section className="space-y-6"><div><Check className="mb-4 h-9 w-9 text-primary" aria-hidden="true" /><h1 className="text-3xl font-bold tracking-tight">Pronto para explorar</h1><p className="mt-2 text-muted-foreground">Seus dados salvos já aparecem nas áreas do WattStatus.</p></div>
              <div className="grid gap-3 sm:grid-cols-2">{[["Abrir dashboard", "/dashboard"], ["Adicionar aparelhos", "/aparelhos?adicionar=1"], ["Configurar ambientes", property ? `/imoveis/${property.id}` : "/imoveis"], ["Explorar maquete 3D", property ? `/imoveis/${property.id}` : "/imoveis"], ["Conectar SmartThings", "/integracoes/smartthings"], ["Visualizar relatórios", "/relatorios"]].map(([label, to]) => <Link key={label} to={to} className={`${secondary} justify-between`}>{label} <ArrowRight size={16} /></Link>)}<button type="button" className={`${secondary} justify-between`} onClick={() => openAssistant()}><span>WattStatus AI</span><Sparkles size={16} /></button></div>
              <button className={primary} disabled={busy} onClick={() => void run(async () => { await persist(5, "complete"); navigate("/dashboard"); })}>Concluir e abrir dashboard <ArrowRight size={17} /></button>
            </section>}
          </>}
          {step !== null && step > 0 && step < 5 && <button className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => void run(() => persist(step - 1))} disabled={busy}><ArrowLeft size={16} /> Etapa anterior</button>}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
