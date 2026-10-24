import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { aiErrorMessage, wattAI, type UsageSimulation } from "@/lib/wattai";
import { SimulationSummary, SourceBadge } from "./WattAICards";
import type { SimulatorTarget } from "./WattAI";

type Loaded = Awaited<ReturnType<typeof wattAI.simulate>>;

// Every slider move is recomputed by the deterministic engine on the server;
// no model call and no tokens.
export default function WattAISimulator({ target, onClose }: { target: SimulatorTarget; onClose: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [hours, setHours] = useState<number | null>(target.proposedHours ?? null);
  const [days, setDays] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPending(true);
      wattAI.simulate({
        propertyId: target.propertyId,
        applianceId: target.applianceId,
        proposedHours: hours ?? Math.max(0, (data?.appliance.usageHours ?? 1) - 1),
        ...(days && data && days !== data.appliance.days ? { daysPerMonth: days } : {}),
      }, controller.signal)
        .then((result) => {
          setData(result);
          setError(null);
          if (hours === null) setHours(result.simulation.proposedHours);
          if (days === null) setDays(result.simulation.daysPerMonth);
        })
        .catch((err) => { if (err?.name !== "AbortError") setError(aiErrorMessage(err)); })
        .finally(() => setPending(false));
    }, data ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [target.propertyId, target.applianceId, hours, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const simulation: UsageSimulation | null = data?.simulation ?? null;
  const current = data?.appliance.usageHours ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Simulador de economia</DialogTitle>
          <DialogDescription>
            {data ? `${data.appliance.name}${data.appliance.roomName ? ` · ${data.appliance.roomName}` : ""} · ${data.appliance.power} W · R$ ${data.appliance.rate.toFixed(2)}/kWh` : "Carregando aparelho…"}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" />}
        {data && simulation && hours !== null && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Horas por dia</span>
                <span className="tabular-nums text-muted-foreground">{current} h → <span className="font-medium text-foreground">{hours} h</span></span>
              </div>
              <Slider min={0} max={Math.max(current, 1)} step={0.5} value={[hours]} onValueChange={([value]) => setHours(value)} aria-label="Horas propostas por dia" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Dias de uso por mês</span>
                <span className="tabular-nums font-medium">{days}</span>
              </div>
              <Slider min={1} max={31} step={1} value={[days ?? data.appliance.days]} onValueChange={([value]) => setDays(value)} aria-label="Dias de uso por mês" />
            </div>
            <div className="flex items-center justify-between">
              <SourceBadge source={simulation.source} />
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Recalculando" />}
            </div>
            <SimulationSummary simulation={simulation} />
            {simulation.warnings.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">{simulation.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              {data.appliance.measured ? "Aparelho com medição: a potência média medida é usada quando há uma semana de leituras." : "Aparelho sem medição: resultado estimado pela potência e horas cadastradas."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
