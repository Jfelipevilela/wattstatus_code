import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useAppliances } from "@/hooks/useAppliances";
import { toast } from "@/components/ui/use-toast";
import { Loader2, PlugZap, Zap, Download, LogOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SiSmartthings } from "react-icons/si";
import { deviceIconForCapabilities } from "@/assets/device-icons";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useSmartThingsToken } from "@/hooks/useSmartThingsToken";
import { LuPower, LuPowerOff } from "react-icons/lu";
import { notifyError } from "@/lib/error-toast";
interface DeviceSummary {
  id: string;
  name: string;
  brand: string;
  model?: string;
  room?: string;
  capabilities?: string[];
}

interface DeviceStatus {
  id: string;
  online: boolean;
  raw: any;
}

const extractEnergyInfo = (status: any) => {
  const main = status?.components?.main;
  const power = main?.powerMeter?.power?.value;
  const energy = main?.energyMeter?.energy?.value;
  const unitPower = main?.powerMeter?.power?.unit || "W";
  const unitEnergy = main?.energyMeter?.energy?.unit || "kWh";

  // Fallback em powerConsumptionReport (geralmente Wh)
  const pcr = main?.powerConsumptionReport?.powerConsumption?.value;
  const energyWh = typeof pcr?.energy === "number" ? pcr.energy : undefined;
  const powerFromReport =
    typeof pcr?.power === "number" ? pcr.power : undefined;
  const energyKWhFromReport =
    typeof energyWh === "number" ? energyWh / 1000 : undefined;

  return {
    power:
      typeof power === "number"
        ? power
        : typeof powerFromReport === "number"
        ? powerFromReport
        : null,
    energy:
      typeof energy === "number"
        ? energy
        : typeof energyKWhFromReport === "number"
        ? energyKWhFromReport
        : null,
    unitPower,
    unitEnergy: energy ? unitEnergy : "kWh",
  };
};

const SmartThingsPanel: React.FC = () => {
  const { token, user } = useAuth();
  const { revoking, revokeToken, hasToken } = useSmartThingsToken();
  const { addAppliance, appliances, updateAppliance } = useAppliances();
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [statuses, setStatuses] = useState<Record<string, DeviceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onTimes, setOnTimes] = useState<
    Record<
      string,
      {
        accumulatedMs: number;
        lastOn?: number;
        alerted: boolean;
        day: string;
        isOn: boolean;
      }
    >
  >({});
  const lastSynced = React.useRef<
    Record<string, { energy?: number; power?: number }>
  >({});
  // const [tick, setTick] = useState(0); // força re-render do cronômetro
  const [detailsDevice, setDetailsDevice] = useState<{
    device: DeviceSummary;
    status?: DeviceStatus;
  } | null>(null);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState<string | null>(null);
  const persistTimer = React.useRef<NodeJS.Timeout | null>(null);
  const [tick, setTick] = useState(0); // força re-render do cronometro

  // carrega estado persistido do cronometro do backend
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const resp = await apiRequest<{
          usage: Array<{
            deviceId: string;
            accumulatedMs: number;
            lastOn?: string | null;
            day?: string;
          }>;
        }>(
          "/api/integrations/smartthings/usage",
          { method: "GET", skipErrorToast: true },
          token
        );
        const today = new Date().toISOString().slice(0, 10);
        const map: Record<
          string,
          {
            accumulatedMs: number;
            lastOn?: number;
            alerted: boolean;
            day: string;
            isOn: boolean;
          }
        > = {};
        resp.usage.forEach((u) => {
          const day = u.day || today;
          map[u.deviceId] = {
            accumulatedMs: day === today ? u.accumulatedMs || 0 : 0,
            lastOn: u.lastOn ? new Date(u.lastOn).getTime() : undefined,
            alerted: false,
            day,
            isOn: Boolean(u.lastOn),
          };
        });
        setOnTimes(map);
      } catch (err) {
        console.error("Erro ao carregar uso do backend", err);
      }
    };
    load();
  }, [token, user]);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ devices: DeviceSummary[] }>(
        "/api/integrations/smartthings/devices",
        { method: "GET", skipErrorToast: true },
        token || undefined
      );
      setDevices(data.devices);
      const statusList = await Promise.all(
        data.devices.map((d) =>
          apiRequest<{ status: DeviceStatus }>(
            `/api/integrations/smartthings/devices/${d.id}/status`,
            { method: "GET", skipErrorToast: true },
            token || undefined
          ).catch(() => null)
        )
      );
      console.log("Fetched SmartThings device statuses:", statusList);
      const map: Record<string, DeviceStatus> = {};
      statusList.forEach((item, idx) => {
        if (item?.status) {
          map[data.devices[idx].id] = item.status;
        }
      });
      setStatuses(map);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao carregar dispositivos SmartThings";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token, hasToken, user]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchDevices();
    }, 60000);
    return () => clearInterval(id);
  }, [fetchDevices]);

  // persiste cronometro no backend (leve debounce)
  useEffect(() => {
    if (!user) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      try {
        const payload = Object.entries(onTimes).map(([deviceId, entry]) => ({
          deviceId,
          accumulatedMs: entry.accumulatedMs || 0,
          lastOn:
            entry.isOn && entry.lastOn
              ? new Date(entry.lastOn).toISOString()
              : null,
          day: entry.day,
        }));
        await apiRequest(
          "/api/integrations/smartthings/usage",
          {
            method: "POST",
            body: JSON.stringify({ usage: payload }),
            skipErrorToast: true,
          },
          token || undefined
        );
      } catch (err) {
        console.error("Erro ao salvar uso no backend", err);
      }
    }, 1500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [onTimes, token, user]);

  // Re-render a cada segundo para mostrar cronômetro em tempo real
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const cards = useMemo(
    () =>
      devices.map((device) => {
        const status = statuses[device.id];
        const energyInfo = status ? extractEnergyInfo(status.raw) : null;
        return { device, status, energyInfo };
      }),
    [devices, statuses]
  );

  const importDevice = async (
    device: DeviceSummary,
    energyKWh?: number | null,
    powerW?: number | null
  ) => {
    if (!user) return;
    if (!energyKWh) {
      notifyError(
        "O dispositivo não retornou consumo. Ligue-o e tente novamente.",
        {
          title: "Dados insuficientes",
        }
      );
      return;
    }
    setImporting(device.id);
    try {
      await addAppliance({
        name: device.name || device.id,
        power: powerW && powerW > 0 ? powerW : 1000,
        usageHours: 1,
        days: 30,
        tariff: "SP",
        createdAt: new Date().toISOString(),
        measuredConsumptionKWh: energyKWh,
        integrationProvider: "smartthings",
        integrationDeviceId: device.id,
      });
      toast({
        title: "Importado",
        description: `${device.name} importado do SmartThings.`,
      });
    } catch (err) {
      notifyError(err, {
        title: "Erro ao importar dispositivo",
        fallbackMessage: "Erro ao importar dispositivo.",
      });
    } finally {
      setImporting(null);
    }
  };

  const toggleDevice = async (device: DeviceSummary, status?: DeviceStatus) => {
    if (!user) return;
    const current =
      status?.raw?.components?.main?.switch?.switch?.value === "on";
    const nextCommand = current ? "off" : "on";
    setToggling((prev) => ({ ...prev, [device.id]: true }));
    try {
      await apiRequest(
        `/api/integrations/smartthings/devices/${device.id}/commands`,
        {
          method: "POST",
          body: JSON.stringify({
            capability: "switch",
            command: nextCommand,
            component: "main",
          }),
        },
        token || undefined
      );
      toast({
        title: "Comando enviado",
        description: `${device.name}: ${
          nextCommand === "on" ? "Ligado" : "Desligado"
        }.`,
      });
      // Aguarda SmartThings aplicar e refaz fetch
      await new Promise((r) => setTimeout(r, 800));
      await fetchDevices();
    } catch (err) {
      notifyError(err, {
        title: "Erro ao enviar comando",
        fallbackMessage: "Erro ao enviar comando.",
      });
    } finally {
      setToggling((prev) => ({ ...prev, [device.id]: false }));
    }
  };
  // Atualiza consumo medido para aparelhos ja importados sem gerar spam na API
  useEffect(() => {
    const sync = async () => {
      for (const card of cards) {
        const target = appliances.find(
          (a) => a.integrationDeviceId === card.device.id
        );
        const energy = card.energyInfo?.energy;
        const power =
          card.energyInfo?.power && card.energyInfo.power > 0
            ? card.energyInfo.power
            : undefined;
        if (target && typeof energy === "number") {
          const last = lastSynced.current[target.id] || {};
          const energyChanged =
            !last.energy || Math.abs(last.energy - energy) > 0.01;
          const powerChanged =
            typeof power === "number" &&
            (!last.power || Math.abs((last.power || 0) - power) > 1);
          if (energyChanged || powerChanged) {
            await updateAppliance(target.id, {
              measuredConsumptionKWh: energy,
              power: power ?? target.power,
            });
            lastSynced.current[target.id] = {
              energy,
              power: power ?? last.power,
            };
          }
        }
      }
    };
    if (cards.length > 0 && appliances.length > 0) {
      sync();
    }
  }, [cards, appliances, updateAppliance]);

  // Track tempo ligado e alertar quando passar do limite
  // Atualiza cronometro de ligado/desligado (diario), evitando saltos
  useEffect(() => {
    if (Object.keys(statuses).length === 0) return;
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    setOnTimes((prev) => {
      const next = { ...prev };
      devices.forEach((device) => {
        const status = statuses[device.id];
        if (!status) {
          return;
        }
        const isOn =
          status?.raw?.components?.main?.switch?.switch?.value === "on";
        const entry = next[device.id] || {
          accumulatedMs: 0,
          alerted: false,
          day: today,
          isOn: false,
        };
        if (entry.day !== today) {
          entry.accumulatedMs = 0;
          entry.day = today;
          entry.lastOn = undefined;
          entry.alerted = false;
          entry.isOn = false;
        }
        if (isOn === entry.isOn) {
          next[device.id] = entry;
          return;
        }
        if (isOn && !entry.isOn) {
          entry.lastOn = entry.lastOn ?? now;
          entry.isOn = true;
        } else if (!isOn && entry.isOn) {
          if (entry.lastOn) {
            entry.accumulatedMs += now - entry.lastOn;
          }
          entry.lastOn = undefined;
          entry.isOn = false;
          entry.alerted = false;
        }
        next[device.id] = entry;
      });
      return next;
    });
  }, [devices, statuses]);

  useEffect(() => {
    const THRESHOLD_MINUTES = 120; // 2 horas ligado gera alerta
    const interval = setInterval(() => {
      setOnTimes((prev) => {
        const now = Date.now();
        const next = { ...prev };
        devices.forEach((device) => {
          const entry = next[device.id];
          const isOn =
            statuses[device.id]?.raw?.components?.main?.switch?.switch
              ?.value === "on";
          if (!entry || !isOn) return;
          const total =
            entry.accumulatedMs + (entry.lastOn ? now - entry.lastOn : 0);
          if (!entry.alerted && total >= THRESHOLD_MINUTES * 60 * 1000) {
            toast({
              title: "Ligado h\u00e1 muito tempo",
              description: `${
                device.name
              } est\u00e1 ligado h\u00e1 ${Math.floor(
                total / 3600000
              )}h ${Math.floor((total / 60000) % 60)}m.`,
            });
            entry.alerted = true;
          }
        });
        return next;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [devices, statuses]);

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = hours.toString().padStart(2, "0");
    const mm = minutes.toString().padStart(2, "0");
    const ss = seconds.toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const sendAcCommand = async (
    deviceId: string,
    payload: { capability: string; command: string; arguments?: any[] }
  ) => {
    if (!token) return;
    await apiRequest(
      `/api/integrations/smartthings/devices/${deviceId}/commands`,
      {
        method: "POST",
        body: JSON.stringify({
          component: "main",
          ...payload,
        }),
      },
      token || undefined
    );
  };

  return (
    <Card className="shadow-xl border border-border/60">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-gradient-to-br from-energy-green-light/50 to-blue-600/20">
            <SiSmartthings className="h-5 w-5 text-energy-green-light" />
          </div>
          <div>
            <CardTitle className="text-lg">Samsung SmartThings</CardTitle>
            <p className="text-xs text-muted-foreground">
              Dispositivos conectados e consumo reportado
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-energy-green-light opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-energy-green-light" />
            </span>

            <span className="text-sm text-muted-foreground">
              Atualização automática
            </span>
          </span>

          <Button
            variant="secondary"
            onClick={revokeToken}
            disabled={revoking || loading}
            className="gap-1"
          >
            <LogOut className="h-4 w-4" />
            {revoking ? "Desconectando..." : "Desconectar"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando dispositivos...
          </div>
        )}
        {!loading && cards.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Nenhum dispositivo SmartThings encontrado ou token n\u00e3o
            configurado.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(({ device, status, energyInfo }) => {
            return (
              <Card
                key={device.id}
                className="border border-border hover:shadow-xl transition bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 rounded-xl"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-3">
                      {(() => {
                        const Icon = deviceIconForCapabilities(
                          device.capabilities
                        );
                        return (
                          <div className="h-10 w-10 rounded-lg bg-energy-green-light/10 flex items-center justify-center text-energy-green-light">
                            <Icon className="h-5 w-5" />
                          </div>
                        );
                      })()}
                      <div className="flex flex-col">
                        <span className="font-semibold text-lg">
                          {device.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {device.brand}{" "}
                          {device.model ? `- ${device.model}` : ""}{" "}
                          {device.room ? `- ${device.room}` : ""}
                        </span>
                      </div>
                    </CardTitle>
                    <Badge
                      variant={status?.online ? "default" : "secondary"}
                      className={
                        status?.online ? "bg-green-500 text-white" : ""
                      }
                    >
                      {status?.online ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60">
                      <div className="text-xs text-muted-foreground">
                        Potencia
                      </div>
                      <div className="font-semibold">
                        {energyInfo?.power !== null
                          ? `${energyInfo?.power?.toFixed(2)} ${
                              energyInfo?.unitPower || "W"
                            }`
                          : "n/d"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60">
                      <div className="text-xs text-muted-foreground">
                        Energia
                      </div>
                      <div className="font-semibold">
                        {energyInfo?.energy !== null
                          ? `${energyInfo?.energy?.toFixed(2)} ${
                              energyInfo?.unitEnergy || "kWh"
                            }`
                          : "n/d"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60">
                      <div className="text-xs text-muted-foreground">
                        Tempo de uso
                      </div>
                      <div className="font-semibold">
                        {(() => {
                          const entry = onTimes[device.id];
                          if (!entry) return "n/d";
                          const now = Date.now(); // tick força re-render
                          const total =
                            (entry.accumulatedMs || 0) +
                            (entry.lastOn ? now - entry.lastOn : 0);
                          return total > 0 ? formatDuration(total) : "00:00:00";
                        })()}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 col-span-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Switch
                        </div>
                        <div className="font-semibold">
                          {status?.raw?.components?.main?.switch?.switch
                            ?.value || "desconhecido"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => setDetailsDevice({ device, status })}
                    >
                      Detalhes
                    </Button>
                    <Button
                      size="sm"
                      className={`flex-1 justify-center text-white
                                ${
                                  (status?.raw?.components?.main?.switch?.switch
                                    ?.value || "off") === "on"
                                    ? "bg-red-500 hover:bg-red-600"
                                    : "bg-energy-green-light hover:bg-energy-green-dark"
                                }
                              `}
                      disabled={toggling[device.id]}
                      onClick={() => toggleDevice(device, status)}
                    >
                      {toggling[device.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (status?.raw?.components?.main?.switch?.switch
                          ?.value || "off") === "on" ? (
                        <div className="flex items-center gap-2 ">
                          <LuPowerOff className="h-4 w-4" />
                          <span>Desligar</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 ">
                          <LuPower className="h-4 w-4" />
                          <span>Ligar</span>
                        </div>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      disabled={importing === device.id}
                      onClick={() =>
                        importDevice(
                          device,
                          energyInfo?.energy ?? null,
                          energyInfo?.power ?? null
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      {importing === device.id ? "Importando..." : "Importar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Dialog
          open={Boolean(detailsDevice)}
          onOpenChange={() => setDetailsDevice(null)}
        >
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader className="space-y-1">
              <div className="flex items-center gap-2">
                <SiSmartthings className="h-5 w-5 text-energy-green-light" />
                <DialogTitle>
                  {detailsDevice?.device.name || "Detalhes do dispositivo"}
                </DialogTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Leituras resumidas e o que cada dado significa para voce.
              </p>
            </DialogHeader>
            {(() => {
              const info = detailsDevice?.status
                ? extractEnergyInfo(detailsDevice.status.raw)
                : null;
              const switchState =
                detailsDevice?.status?.raw?.components?.main?.switch?.switch
                  ?.value;
              const online = detailsDevice?.status?.online;
              const capabilities = detailsDevice?.device.capabilities || [];
              return (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-border/60 p-4 bg-slate-50 dark:bg-slate-900/50">
                      <div className="text-xs text-muted-foreground">
                        Marca / Modelo
                      </div>
                      <div className="font-semibold">
                        {detailsDevice?.device.brand}{" "}
                        {detailsDevice?.device.model || ""}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Ambiente
                      </div>
                      <div className="font-semibold">
                        {detailsDevice?.device.room || "Não informado"}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        ID do dispositivo
                      </div>
                      <div className="font-mono text-xs break-all">
                        {detailsDevice?.device.id}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 p-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Disponibilidade
                        </span>
                        <Badge
                          variant={online ? "default" : "secondary"}
                          className={online ? "bg-green-500 text-white" : ""}
                        >
                          {online ? "Online" : "Offline"}
                        </Badge>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Estado do switch
                        </div>
                        <div className="font-semibold">
                          {switchState ? switchState.toUpperCase() : "N/A"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Representa se o dispositivo esta ligado ou desligado
                          no SmartThings.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Potencia instantanea
                          </div>
                          <div className="font-semibold">
                            {info?.power
                              ? `${info.power.toFixed(2)} ${
                                  info.unitPower || "W"
                                }`
                              : "Não disponível"}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Uso em tempo real (ex.: ligar o ar aumenta este
                            valor na hora).
                          </p>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Energia acumulada
                          </div>
                          <div className="font-semibold">
                            {info?.energy
                              ? `${info.energy.toFixed(2)} ${
                                  info.unitEnergy || "kWh"
                                }`
                              : "Não disponível"}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Soma de consumo medida pelo dispositivo desde o
                            ultimo reset.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 p-4 bg-slate-50 dark:bg-slate-900/50">
                    <div className="text-xs text-muted-foreground mb-2">
                      Principais capacidades
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {capabilities.length > 0
                        ? capabilities.map((cap) => (
                            <Badge
                              key={cap}
                              variant="outline"
                              className="text-xs"
                            >
                              {cap}
                            </Badge>
                          ))
                        : "Nenhuma capacidade listada"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Cada capacidade indica um conjunto de comandos ou leituras
                      suportadas (ex.: switch, powerMeter, airConditionerMode).
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-4 bg-gradient-to-br from-slate-100 to-white dark:from-slate-800 dark:to-slate-900/80">
                    <h4 className="font-semibold mb-2 text-sm">
                      Como ler estes números
                    </h4>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      <li>
                        <span className="font-semibold text-foreground">
                          Potencia instantanea:
                        </span>{" "}
                        consumo no momento; otimo para ver o impacto de
                        ligar/desligar o aparelho.
                      </li>
                      <li>
                        <span className="font-semibold text-foreground">
                          Energia acumulada:
                        </span>{" "}
                        total consumido em kWh, ideal para acompanhar a fatura
                        mensal.
                      </li>
                      <li>
                        <span className="font-semibold text-foreground">
                          Switch:
                        </span>{" "}
                        estado logico do dispositivo no SmartThings
                        (liga/desliga).
                      </li>
                      <li>
                        <span className="font-semibold text-foreground">
                          Capacidades:
                        </span>{" "}
                        recursos que podem ser usados em automacoes ou comandos
                        (modo, ventilação, etc.).
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default SmartThingsPanel;
