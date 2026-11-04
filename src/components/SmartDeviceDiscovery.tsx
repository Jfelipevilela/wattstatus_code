import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wifi, PlugZap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DiscoveredDevice } from "./DeviceConfigurationPanel";
import { extractCumulativeKWh, extractReportCumulativeKWh, extractReportDelta } from "../../backend/src/modules/integrations/energy-reading";

export default function SmartDeviceDiscovery({
  onSelect,
}: {
  onSelect: (device: DiscoveredDevice) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    apiRequest<{ hasToken: boolean }>("/api/integrations/smartthings/token", {
      signal: controller.signal,
      skipErrorToast: true,
    })
      .then((data) => {
        if (!controller.signal.aborted) setConfigured(data.hasToken);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Não foi possível verificar a conexão SmartThings.");
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [retry]);
  const discover = async () => {
    if (loading || selected) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const { devices } = await apiRequest<{ devices: DiscoveredDevice[] }>(
        "/api/integrations/smartthings/devices",
        { signal: controller.signal, skipErrorToast: true },
      );
      if (!controller.signal.aborted) {
        setDevices(devices);
        setLoaded(true);
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof ApiError && [401, 403].includes(failure.status)
          ? "A autorização SmartThings precisa ser verificada. Abra a integração para reconectar sua conta."
          : "Não foi possível consultar SmartThings. Verifique a conexão ou tente novamente.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  const select = async (device: DiscoveredDevice) => {
    if (selected) return;
    const controller = new AbortController();
    request.current = controller;
    setSelected(device.id);
    setError(null);
    try {
      const { status } = await apiRequest<{
        status: {
          online?: boolean;
          raw?: {
            components?: {
              main?: {
                energyMeter?: { energy?: { value?: number; unit?: string } };
                powerMeter?: { power?: { value?: number; unit?: string } };
              };
            };
          };
        };
      }>(
        `/api/integrations/smartthings/devices/${encodeURIComponent(device.id)}/status`,
        { signal: controller.signal, skipErrorToast: true },
      );
      if (status.online === false) throw new Error("Dispositivo offline");
      const main = status.raw?.components?.main;
      const delta = extractReportDelta(status.raw);
      let energyInterval = delta ? { kWh: delta.deltaKWh, startAt: delta.startAt.toISOString(), endAt: delta.endAt.toISOString() } : undefined;
      if (!energyInterval && (extractCumulativeKWh(status.raw) ?? extractReportCumulativeKWh(status.raw)) !== null) {
        const end = new Date(); const start = new Date(end.getTime() - 31 * 86400000);
        const query = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
        try {
          const history = await apiRequest<{ intervals: Array<{ deviceId: string; provider: string; consumptionKWh: number; startAt: string; endAt: string }> }>(`/api/energy/history?${query}`, { signal: controller.signal, skipErrorToast: true });
          const latest = history.intervals.filter(row => row.deviceId === device.id && row.provider === "smartthings")
            .sort((a, b) => b.endAt.localeCompare(a.endAt))[0];
          if (latest) energyInterval = { kWh: latest.consumptionKWh, startAt: latest.startAt, endAt: latest.endAt };
        } catch { /* A single counter/history outage must not invent interval energy. */ }
      }
      const power = main?.powerMeter?.power;
      if (!controller.signal.aborted)
        onSelect({
          ...device,
          power:
            typeof power?.value === "number" &&
            Number.isFinite(power.value) &&
            power.value >= 0 &&
            ["W", "kW"].includes(power.unit || "")
              ? power.value * (power.unit === "kW" ? 1000 : 1)
              : undefined,
          counterKWh: extractCumulativeKWh(status.raw) ?? extractReportCumulativeKWh(status.raw) ?? undefined,
          energyInterval,
        });
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Não foi possível ler este dispositivo. Ele pode estar offline; tente novamente. A biblioteca e o cadastro manual continuam disponíveis.",
        );
    } finally {
      if (!controller.signal.aborted) setSelected(null);
    }
  };
  return (
    <section className="flex flex-col gap-4" aria-label="Dispositivos inteligentes">
      <Card className="appliance-smart-connection flex flex-col gap-4 shadow-none">
        <Wifi className="size-6 text-primary" aria-hidden="true" />
        <h2 className="text-2xl font-semibold">Seus dispositivos, conectados</h2>
        <p className="text-sm text-muted-foreground">Encontre os aparelhos autorizados na sua conta Samsung SmartThings.</p>
        <p className="text-sm text-muted-foreground">
          {configured === null
            ? "Verificando conexão…"
            : configured
              ? "Conta conectada. Busque os dispositivos autorizados."
              : "Conta não conectada."}
        </p>
        <p className="text-xs text-muted-foreground">
          A conexão permite consultar dispositivos. A medição de energia depende dos recursos de cada aparelho.
        </p>
        {configured === null ? <Skeleton className="h-12 w-full motion-reduce:animate-none" /> : configured ? (
          <Button
            className="min-h-11"
            disabled={loading || Boolean(selected)}
            onClick={() => void discover()}
          >
            {loading ? "Buscando dispositivos…" : "Buscar dispositivos"}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link to="/integracoes/smartthings">Configurar conexão</Link>
          </Button>
        )}
      </Card>
      {error && <div role="alert" className="appliance-origin flex flex-col gap-3"><p className="text-sm text-destructive">{error}</p><div className="flex flex-wrap gap-3"><Button type="button" variant="outline" onClick={() => configured === null ? setRetry(value => value + 1) : void discover()} disabled={loading}>Tentar novamente</Button><Button asChild variant="link"><Link to="/integracoes/smartthings">Verificar conexão</Link></Button></div></div>}
      {loading && <div role="status" aria-label="Buscando dispositivos"><Skeleton className="h-24 w-full motion-reduce:animate-none" /></div>}
      <div role="status" aria-live="polite">
        {loaded && `${devices.length} dispositivo(s) encontrado(s).`}
      </div>
      {loaded && !devices.length && (
        <p className="text-sm text-muted-foreground">
          Nenhum dispositivo disponível na conta autorizada.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {devices.map((device) => (
          <Card key={device.id} className="appliance-smart-device min-w-0">
            <PlugZap className="size-5 text-primary" aria-hidden="true" />
            <h3 className="break-words font-medium">{device.name}</h3>
            <p className="text-sm text-muted-foreground">
              {device.brand} {device.model}
            </p>
            <p className="text-xs text-muted-foreground">
              Conectividade e medição serão consultadas ao selecionar. Sem
              medidor energético, o consumo será estimado com os dados que você
              informar.
            </p>
            <Button
              variant="outline"
              disabled={Boolean(selected) || loading}
              className="min-h-11 w-full"
              onClick={() => void select(device)}
            >
              {selected === device.id
                ? "Consultando…"
                : "Selecionar dispositivo"}
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
