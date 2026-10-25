import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Loader2, LogOut, Plug, Power, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { apiRequest } from "@/lib/api";
import { formatNumber } from "@/lib/energy";
import { notifyError } from "@/lib/error-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAppliances } from "@/hooks/useAppliances";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSmartThingsDevices, type DeviceCommand } from "@/hooks/useSmartThingsDevices";
import { DeviceControlCard } from "@/components/smartthings/DeviceControlCard";
import { DeviceDetailsDialog } from "@/components/smartthings/DeviceDetailsDialog";
import { ImportDeviceDialog, type ImportValues } from "@/components/smartthings/ImportDeviceDialog";
import { ConnectSmartThings } from "@/components/smartthings/ConnectSmartThings";
import { formatElapsed, isInertDevice, type DeviceState, type OverviewItem } from "@/components/smartthings/types";

const LONG_ON_ALERT_MS = 2 * 3600000;
const USAGE_PERSIST_DEBOUNCE_MS = 1500;

type UsageEntry = { accumulatedMs: number; lastOn?: number; alerted: boolean; day: string; isOn: boolean };

// Local calendar day, so the daily counter resets at local midnight (not UTC).
const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

interface Props {
  saveToken: (token: string) => Promise<void>;
  saving: boolean;
  revokeToken: () => Promise<void>;
  revoking: boolean;
  oauthAvailable: boolean;
  onOAuth: () => void;
  redirecting: boolean;
}

export default function SmartThingsPanel({
  saveToken,
  saving,
  revokeToken,
  revoking,
  oauthAvailable,
  onOAuth,
  redirecting,
}: Props) {
  const { token, user } = useAuth();
  const { addAppliance, appliances, updateAppliance } = useAppliances();
  const { preferences, updatePreferences } = useUserPreferences();
  const { items, fetchedAt, loading, error, pending, refresh, refreshDevice, sendCommand } =
    useSmartThingsDevices(true);
  const [details, setDetails] = useState<OverviewItem | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<OverviewItem | null>(null);
  const [collectionEnabled, setCollectionEnabled] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const [usage, setUsage] = useState<Record<string, UsageEntry>>({});
  const [, setTick] = useState(0);
  const usageLoaded = useRef(false);
  const syncedEnergy = useRef<Record<string, number>>({});

  const tokenRejected = Boolean(error && /token smartthings/i.test(error));

  useEffect(() => {
    if (!user) return;
    apiRequest<{ settings: { energyCollectionEnabled?: boolean } }>(
      "/api/user-settings",
      { skipErrorToast: true },
      token || undefined,
    )
      .then(({ settings }) => setCollectionEnabled(settings.energyCollectionEnabled === true))
      .catch(() => setCollectionEnabled(false));
  }, [user, token]);

  const toggleCollection = async (next: boolean) => {
    setSavingCollection(true);
    try {
      await apiRequest(
        "/api/user-settings",
        { method: "PUT", body: JSON.stringify({ energyCollectionEnabled: next }) },
        token || undefined,
      );
      setCollectionEnabled(next);
    } catch (err) {
      notifyError(err, { title: "Falha ao alterar coleta" });
    } finally {
      setSavingCollection(false);
    }
  };

  // Daily on-time counter, persisted so the usage charts survive reloads.
  useEffect(() => {
    if (!user) return;
    apiRequest<{ usage: Array<{ deviceId: string; accumulatedMs: number; lastOn?: string | null; day?: string }> }>(
      "/api/integrations/smartthings/usage",
      { method: "GET", skipErrorToast: true },
      token || undefined,
    )
      .then((response) => {
        const today = localDay();
        const map: Record<string, UsageEntry> = {};
        for (const row of response.usage) {
          const sameDay = (row.day || today) === today;
          map[row.deviceId] = {
            accumulatedMs: sameDay ? row.accumulatedMs || 0 : 0,
            lastOn: sameDay && row.lastOn ? new Date(row.lastOn).getTime() : undefined,
            alerted: false,
            day: today,
            isOn: sameDay && Boolean(row.lastOn),
          };
        }
        setUsage((current) => ({ ...map, ...current }));
      })
      .catch(() => undefined)
      .finally(() => {
        usageLoaded.current = true;
      });
  }, [token, user]);

  useEffect(() => {
    if (items.length === 0) return;
    const now = Date.now();
    const today = localDay();
    setUsage((prev) => {
      const next = { ...prev };
      for (const { device, status } of items) {
        const state = status?.state.switch;
        if (!state) continue;
        const entry = { ...(next[device.id] ?? { accumulatedMs: 0, alerted: false, day: today, isOn: false }) };
        if (entry.day !== today) {
          Object.assign(entry, { accumulatedMs: 0, day: today, lastOn: entry.isOn ? now : undefined, alerted: false });
        }
        const isOn = state === "on";
        if (isOn && !entry.isOn) Object.assign(entry, { isOn: true, lastOn: now });
        if (!isOn && entry.isOn) {
          entry.accumulatedMs += entry.lastOn ? now - entry.lastOn : 0;
          Object.assign(entry, { isOn: false, lastOn: undefined, alerted: false });
        }
        next[device.id] = entry;
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!user || !usageLoaded.current || Object.keys(usage).length === 0) return;
    const timer = setTimeout(() => {
      const payload = Object.entries(usage).map(([deviceId, entry]) => ({
        deviceId,
        accumulatedMs: entry.accumulatedMs,
        lastOn: entry.isOn && entry.lastOn ? new Date(entry.lastOn).toISOString() : null,
        day: entry.day,
      }));
      apiRequest(
        "/api/integrations/smartthings/usage",
        { method: "POST", body: JSON.stringify({ usage: payload }), skipErrorToast: true },
        token || undefined,
      ).catch(() => undefined);
    }, USAGE_PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [usage, token, user]);

  // Re-render every 30 s for the running counters and the long-on alert.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((tick) => tick + 1);
      setUsage((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const { device } of items) {
          const entry = next[device.id];
          if (!entry?.isOn || entry.alerted || !entry.lastOn) continue;
          const total = entry.accumulatedMs + Date.now() - entry.lastOn;
          if (total >= LONG_ON_ALERT_MS) {
            toast({ title: "Ligado há muito tempo", description: `${device.name} está ligado há ${formatElapsed(total)} hoje.` });
            next[device.id] = { ...entry, alerted: true };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 30000);
    return () => clearInterval(id);
  }, [items]);

  const usageFor = (deviceId: string) => {
    const entry = usage[deviceId];
    if (!entry) return null;
    return entry.accumulatedMs + (entry.isOn && entry.lastOn ? Date.now() - entry.lastOn : 0);
  };

  // Keep the imported appliance's meter reading current. Only the cumulative
  // counter is synced: instantaneous power would distort the monthly estimate.
  useEffect(() => {
    for (const { device, status } of items) {
      const energy = status?.state.energyKWh;
      const target = appliances.find(
        (appliance) => appliance.integrationProvider === "smartthings" && appliance.integrationDeviceId === device.id,
      );
      // A zero counter means "no reading yet"; the API only stores positive values.
      if (!target || energy === null || energy === undefined || energy <= 0) continue;
      const last = syncedEnergy.current[target.id] ?? target.measuredConsumptionKWh ?? null;
      if (last !== null && Math.abs(last - energy) <= 0.01) continue;
      syncedEnergy.current[target.id] = energy;
      updateAppliance(target.id, { measuredConsumptionKWh: energy }).catch(() => {
        delete syncedEnergy.current[target.id];
      });
    }
  }, [items, appliances, updateAppliance]);

  const importedIds = useMemo(
    () =>
      new Set(
        appliances
          .filter((appliance) => appliance.integrationProvider === "smartthings")
          .map((appliance) => appliance.integrationDeviceId),
      ),
    [appliances],
  );

  const importDevice = async (values: ImportValues) => {
    if (!importTarget) return;
    const { device } = importTarget;
    if (importedIds.has(device.id)) return;
    setImporting(device.id);
    try {
      await addAppliance({
        name: values.name,
        power: values.power,
        usageHours: values.usageHours,
        days: values.days,
        tariff: values.tariffState,
        tariffValue: values.tariffValue,
        createdAt: new Date().toISOString(),
        measuredConsumptionKWh: values.measuredConsumptionKWh,
        integrationProvider: "smartthings",
        integrationDeviceId: device.id,
        propertyId: values.propertyId,
        roomId: values.roomId ?? null,
      });
      if (!preferences.tariffState || !preferences.tariffValue) {
        updatePreferences({ tariffState: values.tariffState, tariffValue: values.tariffValue }).catch(() => undefined);
      }
      setImportTarget(null);
      toast({ title: "Aparelho importado", description: `${values.name} agora entra nas suas estimativas.` });
    } catch (err) {
      notifyError(err, { title: "Erro ao importar dispositivo", fallbackMessage: "Erro ao importar dispositivo." });
    } finally {
      setImporting(null);
    }
  };

  const runCommand = (deviceId: string, command: DeviceCommand, optimistic: Partial<DeviceState>) =>
    sendCommand(deviceId, command, optimistic)
      .then((confirmed) => {
        if (!confirmed)
          toast({
            title: "Comando enviado, sem confirmação",
            description: "O dispositivo ainda não informou o novo estado. Atualize em alguns segundos.",
          });
      })
      .catch((err) =>
      notifyError(err, { title: "Comando não aplicado", fallbackMessage: "O dispositivo não respondeu ao comando." }),
    );

  // Controllable devices first; inert ones (collapsed) at the end.
  const sortedItems = [...items].sort(
    (a, b) => Number(isInertDevice(a.device.capabilities)) - Number(isInertDevice(b.device.capabilities)),
  );
  const online = items.filter((item) => item.status?.online).length;
  const turnedOn = items.filter((item) => item.status?.state.switch === "on").length;
  const powerReadings = items
    .map((item) => item.status?.state.powerW)
    .filter((value): value is number => typeof value === "number");
  const totalPower = powerReadings.reduce((sum, value) => sum + value, 0);

  const stats = [
    { icon: Plug, label: "Dispositivos", value: String(items.length), hint: `${online} online` },
    { icon: Power, label: "Ligados agora", value: String(turnedOn), hint: turnedOn === 1 ? "aparelho" : "aparelhos" },
    {
      icon: Zap,
      label: "Potência agora",
      value: powerReadings.length > 0 ? `${formatNumber(totalPower, 0)} W` : "—",
      hint: powerReadings.length > 0 ? `de ${powerReadings.length} com medidor` : "nenhum medidor de potência",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Samsung SmartThings</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Sua casa conectada</h1>
          <p className="mt-2 text-muted-foreground">
            {fetchedAt
              ? `Atualizado às ${fetchedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · atualiza a cada minuto`
              : "Carregando dispositivos…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Atualizar
          </Button>
          <Button variant="ghost" className="h-11" onClick={revokeToken} disabled={revoking}>
            <LogOut className="mr-2 h-4 w-4" />
            {revoking ? "Desconectando…" : "Desconectar"}
          </Button>
        </div>
      </section>

      {tokenRejected && (
        <ConnectSmartThings
          compact
          oauthAvailable={oauthAvailable}
          onOAuth={onOAuth}
          redirecting={redirecting}
          saving={saving}
          onSave={async (value) => {
            await saveToken(value);
            await refresh();
          }}
          reason={error ?? undefined}
        />
      )}

      {!tokenRejected && error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 p-4 text-sm">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={refresh}>
            Tentar novamente
          </Button>
        </div>
      )}

      <dl className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-energy-400">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              <dd className="truncate text-xs text-muted-foreground">{hint}</dd>
            </div>
          </div>
        ))}
      </dl>

      {loading && items.length === 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Carregando dispositivos">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-[440px] rounded-[28px]" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <section className="rounded-3xl border border-dashed p-10 text-center">
          <h2 className="text-xl font-semibold">Nenhum dispositivo encontrado</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Adicione aparelhos no app SmartThings e confira se o token tem permissão para ver dispositivos.
          </p>
        </section>
      ) : (
        <section aria-label="Dispositivos" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {sortedItems.map((item) => (
            <DeviceControlCard
              key={item.device.id}
              item={item}
              pending={Boolean(pending[item.device.id])}
              usageMs={usageFor(item.device.id)}
              imported={importedIds.has(item.device.id)}
              importing={importing === item.device.id}
              onCommand={(command, optimistic) => runCommand(item.device.id, command, optimistic)}
              onRefresh={() => refreshDevice(item.device.id)}
              onImport={() => setImportTarget(item)}
              onDetails={() => setDetails(item)}
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-energy-blue-light/10 text-energy-blue-light">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">Coleta automática de consumo</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              O servidor lê periodicamente os medidores dos aparelhos importados, mesmo com esta página fechada. A
              diferença entre leituras vira consumo medido; lacunas não são preenchidas.
            </p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-3 text-sm font-medium">
          {savingCollection && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {collectionEnabled ? "Ativada" : "Desativada"}
          <Switch
            checked={collectionEnabled}
            disabled={savingCollection}
            onCheckedChange={toggleCollection}
            aria-label="Coleta automática de consumo"
          />
        </label>
      </section>

      <ImportDeviceDialog
        item={importTarget}
        defaultState={preferences.tariffState}
        defaultTariff={preferences.tariffValue}
        importing={Boolean(importing)}
        onCancel={() => setImportTarget(null)}
        onConfirm={importDevice}
      />

      <DeviceDetailsDialog
        item={details ? items.find((item) => item.device.id === details.device.id) ?? details : null}
        onClose={() => setDetails(null)}
      />
    </div>
  );
}
