import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/lib/api";
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
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
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
  }, []);
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
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Não foi possível consultar SmartThings. Verifique a conexão ou tente novamente.",
        );
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
          energyInterval: delta ? { kWh: delta.deltaKWh, startAt: delta.startAt.toISOString(), endAt: delta.endAt.toISOString() } : undefined,
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
    <section className="space-y-4" aria-label="Dispositivos inteligentes">
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Samsung SmartThings</h2>
        <p className="text-sm text-muted-foreground">
          {configured === null
            ? "Verificando conexão…"
            : configured
              ? "Conta conectada. Busque os dispositivos autorizados."
              : "Conta não conectada."}
        </p>
        <p className="text-xs text-muted-foreground">
          Nenhum comando será enviado. Não fazemos associação automática com
          modelos da biblioteca.
        </p>
        {configured ? (
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
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
          <Card key={device.id} className="min-w-0 space-y-3 p-4">
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
      <p className="text-xs text-muted-foreground">
        Outros ecossistemas podem ser adicionados por providers. Nenhum conector
        novo é ativado nesta versão.
      </p>
    </section>
  );
}
