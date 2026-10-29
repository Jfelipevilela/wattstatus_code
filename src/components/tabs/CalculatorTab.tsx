import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, Check, ChevronDown, Loader2, Plus, Sparkles, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/components/ui/use-toast";
import { notifyError } from "@/lib/error-toast";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import type { ApplianceInput } from "@/hooks/useAppliances";
import { applianceVisual } from "@/components/appliances/applianceVisual";
import { STATE_TARIFFS, formatCurrency, formatDuration, formatNumber } from "@/lib/energy";
import { cn } from "@/lib/utils";
import { APPLIANCE_PRESETS } from "@/lib/appliance-presets";

const PRESETS = APPLIANCE_PRESETS;
const HOUR_CHIPS = [0.5, 1, 4, 8, 24];

interface Props {
  onAddAppliance: (appliance: ApplianceInput) => Promise<void>;
  householdCost?: number;
}

const numberFrom = (value: string) => Number(value.replace(",", "."));

export default function CalculatorTab({ onAddAppliance, householdCost = 0 }: Props) {
  const { preferences, updatePreferences } = useUserPreferences();
  const [name, setName] = useState("Ar-condicionado");
  const [power, setPower] = useState("1400");
  const [hours, setHours] = useState(6);
  const [days, setDays] = useState(30);
  const [state, setState] = useState("SP");
  const [tariff, setTariff] = useState(String(STATE_TARIFFS.SP));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Start from the user's saved tariff once preferences load.
  useEffect(() => {
    if (preferences.tariffState && STATE_TARIFFS[preferences.tariffState]) {
      setState(preferences.tariffState);
      setTariff(String(preferences.tariffValue ?? STATE_TARIFFS[preferences.tariffState]));
    }
  }, [preferences.tariffState, preferences.tariffValue]);

  const powerW = numberFrom(power);
  const rate = numberFrom(tariff);
  const valid = name.trim().length >= 2 && powerW > 0 && hours > 0 && rate > 0;
  const monthlyKWh = valid ? (powerW * hours * days) / 1000 : 0;
  const monthlyCost = monthlyKWh * rate;
  const savingPerHour = valid && hours >= 1 ? ((powerW * days) / 1000) * rate : 0;
  const shareOfHome = householdCost > 0 && valid ? (monthlyCost / (householdCost + monthlyCost)) * 100 : null;
  const { icon: Icon, tone } = applianceVisual(name);

  const touch = () => setSaved(false);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onAddAppliance({
        name: name.trim(),
        power: powerW,
        usageHours: hours,
        days,
        tariff: state,
        tariffValue: rate,
      });
      updatePreferences({ tariffState: state, tariffValue: rate }).catch(() => undefined);
      setSaved(true);
      toast({ title: "Aparelho adicionado", description: `${name.trim()} agora entra nas suas estimativas.` });
    } catch (err) {
      notifyError(err, { title: "Erro ao salvar", fallbackMessage: "Não foi possível adicionar o aparelho." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-energy-green-light/10 px-3 py-1 text-xs font-medium text-energy-700 dark:text-energy-400">
          <Calculator className="h-3.5 w-3.5" aria-hidden="true" /> Simulador em tempo real
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Quanto custa ligar isso?</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Escolha um aparelho, ajuste o uso e veja o impacto na conta de luz na hora.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <section aria-label="Dados do aparelho" className="space-y-6 rounded-[28px] border bg-card p-5 shadow-sm sm:p-7">
          <div>
            <h2 className="text-sm font-semibold">Comece por um aparelho comum</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map((preset) => {
                const visual = applianceVisual(preset.name);
                const active = name === preset.name && powerW === preset.power;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setName(preset.name);
                      setPower(String(preset.power));
                      setHours(preset.hours);
                      touch();
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border p-2.5 text-left text-sm transition-all hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active && "border-energy-green-light bg-energy-green-light/5 ring-1 ring-energy-green-light",
                    )}
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", visual.tone)}>
                      <visual.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 truncate font-medium">{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <label className="space-y-2">
              <span className="text-sm font-medium">Nome</span>
              <div className="flex items-center gap-3 rounded-2xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", tone)}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    touch();
                  }}
                  placeholder="Ex.: Geladeira da cozinha"
                  className="h-12 min-w-0 flex-1 bg-transparent text-sm focus-visible:outline-none"
                />
              </div>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Potência</span>
              <div className="flex items-center rounded-2xl border bg-background px-4 focus-within:ring-2 focus-within:ring-ring">
                <input
                  inputMode="decimal"
                  value={power}
                  onChange={(event) => {
                    setPower(event.target.value.replace(/[^\d.,]/g, ""));
                    touch();
                  }}
                  aria-describedby="power-help"
                  className="h-12 min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums focus-visible:outline-none"
                />
                <span className="text-sm text-muted-foreground">W</span>
              </div>
            </label>
          </div>
          <p id="power-help" className="-mt-2 text-xs text-muted-foreground">
            Está na etiqueta ou no manual, em watts (W). Aparelhos com ciclos, como geladeiras, raramente usam a potência máxima o tempo todo.
          </p>

          <div>
            <div className="flex items-baseline justify-between">
              <span id="hours-label" className="text-sm font-medium">Uso por dia</span>
              <span className="text-2xl font-bold tabular-nums">{formatDuration(hours)}</span>
            </div>
            <Slider
              aria-labelledby="hours-label"
              className="mt-4"
              min={0.25}
              max={24}
              step={0.25}
              value={[hours]}
              onValueChange={([value]) => {
                setHours(value);
                touch();
              }}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {HOUR_CHIPS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setHours(value);
                    touch();
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    hours === value ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                  )}
                >
                  {value < 1 ? `${value * 60} min` : `${value} h`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <span id="days-label" className="text-sm font-medium">Dias de uso no mês</span>
              <span className="text-2xl font-bold tabular-nums">{days}</span>
            </div>
            <Slider
              aria-labelledby="days-label"
              className="mt-4"
              min={1}
              max={31}
              step={1}
              value={[days]}
              onValueChange={([value]) => {
                setDays(value);
                touch();
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Estado</span>
              <div className="relative">
                <select
                  value={state}
                  onChange={(event) => {
                    setState(event.target.value);
                    setTariff(String(STATE_TARIFFS[event.target.value]));
                    touch();
                  }}
                  className="h-12 w-full appearance-none rounded-2xl border bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {Object.keys(STATE_TARIFFS).map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              </div>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Tarifa</span>
              <div className="flex items-center rounded-2xl border bg-background px-4 focus-within:ring-2 focus-within:ring-ring">
                <span className="text-sm text-muted-foreground">R$</span>
                <input
                  inputMode="decimal"
                  value={tariff}
                  onChange={(event) => {
                    setTariff(event.target.value.replace(/[^\d.,]/g, ""));
                    touch();
                  }}
                  className="h-12 min-w-0 flex-1 bg-transparent px-2 text-sm font-medium tabular-nums focus-visible:outline-none"
                />
                <span className="text-sm text-muted-foreground">/kWh</span>
              </div>
            </label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Tarifas de referência por estado. Use o valor da sua conta para mais precisão (impostos e bandeiras mudam o total).
          </p>
        </section>

        <aside aria-live="polite" className="lg:sticky lg:top-6 lg:self-start">
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-energy-green-light/25 blur-3xl" />
            <p className="relative text-xs uppercase tracking-widest text-white/50">Custo estimado por mês</p>
            <p className="relative mt-2 text-5xl font-bold tracking-tight tabular-nums">
              {valid ? formatCurrency(monthlyCost) : "—"}
            </p>
            <p className="relative mt-1 text-white/60">
              {valid ? `${formatNumber(monthlyKWh, 1)} kWh no mês` : "Preencha nome, potência e tarifa"}
            </p>

            <dl className="relative mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <dt className="text-[11px] text-white/50">Por dia de uso</dt>
                <dd className="mt-1 font-semibold tabular-nums">{valid ? formatCurrency(monthlyCost / days) : "—"}</dd>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <dt className="text-[11px] text-white/50">Em 12 meses</dt>
                <dd className="mt-1 font-semibold tabular-nums">{valid ? formatCurrency(monthlyCost * 12) : "—"}</dd>
              </div>
            </dl>

            {savingPerHour > 0 && (
              <p className="relative mt-4 flex gap-3 rounded-2xl border border-energy-green-light/20 bg-energy-green-light/10 p-3 text-sm">
                <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-energy-green-light" aria-hidden="true" />
                <span>
                  Usar <strong>1 h a menos por dia</strong> economiza{" "}
                  <strong className="text-energy-green-light">{formatCurrency(savingPerHour)}</strong> por mês.
                </span>
              </p>
            )}

            {shareOfHome !== null && (
              <div className="relative mt-4">
                <div className="flex justify-between text-xs text-white/60">
                  <span>Peso na sua casa</span>
                  <span className="font-semibold text-white">{formatNumber(shareOfHome, 0)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" role="presentation">
                  <div className="h-full rounded-full bg-gradient-to-r from-energy-green-light to-energy-teal" style={{ width: `${Math.min(shareOfHome, 100)}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-white/50">
                  Comparado ao custo estimado dos seus aparelhos cadastrados ({formatCurrency(householdCost)}/mês).
                </p>
              </div>
            )}

            {saved ? (
              <div className="relative mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-3 text-sm">
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-energy-green-light" /> Adicionado
                </span>
                <Link to="/aparelhos" className="font-medium text-energy-green-light hover:underline">
                  Ver aparelhos →
                </Link>
              </div>
            ) : (
              <Button
                onClick={save}
                disabled={!valid || saving}
                className="relative mt-6 h-12 w-full rounded-full bg-energy-green-light font-semibold text-zinc-950 hover:bg-energy-400"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Adicionar aos meus aparelhos
              </Button>
            )}
          </div>

          <details className="group mt-4 rounded-2xl border bg-card p-4 text-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-energy-green-light" aria-hidden="true" /> Como calculamos
              </span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <p className="rounded-xl bg-muted p-3 font-mono text-xs">
                kWh = potência (W) × horas/dia × dias ÷ 1000
                <br />
                custo = kWh × tarifa (R$/kWh)
              </p>
              {valid && (
                <p className="font-mono text-xs">
                  {formatNumber(powerW, 0)} × {formatNumber(hours, 2)} × {days} ÷ 1000 = {formatNumber(monthlyKWh, 2)} kWh
                </p>
              )}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
