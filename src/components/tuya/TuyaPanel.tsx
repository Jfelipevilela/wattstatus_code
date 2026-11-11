import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Boxes, ChevronDown, Gauge, Power, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatNumber } from "@/lib/energy";
import { notifyError } from "@/lib/error-toast";
import { useAppliances } from "@/hooks/useAppliances";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useIntegrationDevices, type DeviceCommand } from "@/hooks/useSmartThingsDevices";
import { DeviceControlCard } from "@/components/smartthings/DeviceControlCard";
import { DeviceDetailsDialog } from "@/components/smartthings/DeviceDetailsDialog";
import { ImportDeviceDialog, type ImportValues } from "@/components/smartthings/ImportDeviceDialog";
import type { DeviceState, OverviewItem } from "@/components/smartthings/types";

const PROVIDER = "tuya";

// Linked state of the Tuya page: live readings, switch control and import of
// a device as an appliance. Reuses the SmartThings device cards: both providers
// return the same normalized status.
export default function TuyaPanel() {
  const { addAppliance, appliances, updateAppliance } = useAppliances();
  const { preferences, updatePreferences } = useUserPreferences();
  const { items, fetchedAt, loading, error, pending, refresh, refreshDevice, sendCommand } =
    useIntegrationDevices(PROVIDER, true);
  const [details, setDetails] = useState<OverviewItem | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<OverviewItem | null>(null);
  const syncedEnergy = useRef<Record<string, number>>({});

  const importedIds = useMemo(
    () =>
      new Set(
        appliances
          .filter((appliance) => appliance.integrationProvider === PROVIDER)
          .map((appliance) => appliance.integrationDeviceId),
      ),
    [appliances],
  );

  // Keep the imported appliance's meter current. Only the cumulative counter is
  // synced: instantaneous power would distort the monthly estimate.
  useEffect(() => {
    for (const { device, status } of items) {
      const energy = status?.state.energyKWh;
      const target = appliances.find(
        (appliance) => appliance.integrationProvider === PROVIDER && appliance.integrationDeviceId === device.id,
      );
      if (!target || energy === null || energy === undefined || energy <= 0) continue;
      const last = syncedEnergy.current[target.id] ?? target.measuredConsumptionKWh ?? null;
      if (last !== null && Math.abs(last - energy) <= 0.01) continue;
      syncedEnergy.current[target.id] = energy;
      updateAppliance(target.id, { measuredConsumptionKWh: energy }).catch(() => {
        delete syncedEnergy.current[target.id];
      });
    }
  }, [items, appliances, updateAppliance]);

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
        integrationProvider: PROVIDER,
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

  const online = items.filter((item) => item.status?.online).length;
  const turnedOn = items.filter((item) => item.status?.state.switch === "on").length;
  const powerReadings = items
    .map((item) => item.status?.state.powerW)
    .filter((value): value is number => typeof value === "number");
  const totalPower = powerReadings.reduce((sum, value) => sum + value, 0);

  const stats = [
    { icon: Boxes, label: "Dispositivos", value: String(items.length), hint: `${online} online` },
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
          <p className="text-sm font-medium text-muted-foreground">Tuya / Smart Life</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Seus dispositivos Tuya</h1>
          <p className="mt-3 max-w-prose text-sm text-muted-foreground">
            Veja o estado ligado/desligado quando disponível e a potência e o consumo quando o aparelho mede energia.
            O controle liga/desliga exige uma chave (switch). Cor, temperatura, modo e outros recursos ainda não são controlados aqui.
          </p>
          <p className="mt-2 text-muted-foreground">
            {fetchedAt
              ? `Atualizado às ${fetchedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · atualiza a cada minuto`
              : "Carregando dispositivos…"}
          </p>
        </div>
        <Button variant="outline" className="h-11" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} aria-hidden="true" />
          Atualizar
        </Button>
      </section>

      {error && (
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
            Adicione dispositivos no Smart Life ou Tuya Smart, na mesma conta que foi vinculada, e toque em Atualizar.
          </p>
        </section>
      ) : (
        <section aria-label="Dispositivos" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const capabilities = item.device.capabilities ?? [];
            // Capabilities describe functions, not a physical category: a meter may be a light or an AC.
            const metered = capabilities.includes("powerMeter") || capabilities.includes("energyMeter");
            const switchable = capabilities.includes("switch");
            const Icon = metered ? Gauge : switchable ? Power : Boxes;
            const category = metered ? "Dispositivo com medição de energia" : switchable ? "Dispositivo com liga/desliga" : "Dispositivo Tuya";
            return (
              <div key={item.device.id} className="flex min-w-0 flex-col gap-2">
                <p className="flex items-center gap-2 px-4 text-xs text-muted-foreground">
                  <Icon className="size-4 shrink-0 text-energy-green-light" aria-hidden="true" />
                  {category}
                </p>
                <DeviceControlCard
                  item={item}
                  pending={Boolean(pending[item.device.id])}
                  usageMs={null}
                  imported={importedIds.has(item.device.id)}
                  importing={importing === item.device.id}
                  onCommand={(command, optimistic) => runCommand(item.device.id, command, optimistic)}
                  onRefresh={() => refreshDevice(item.device.id)}
                  onImport={() => setImportTarget(item)}
                  onDetails={() => setDetails(item)}
                />
              </div>
            );
          })}
        </section>
      )}

      <details className="group rounded-2xl border bg-card p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
          Como adicionar um dispositivo
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1. Cadastre no Smart Life ou Tuya Smart.</span> Abra o app na conta vinculada
            e siga as instruções para adicionar seu dispositivo compatível.
          </li>
          <li>
            <span className="font-medium text-foreground">2. Atualize esta página.</span> O dispositivo aparece com o nome
            que você deu no app e as leituras disponíveis. Potência e consumo exigem medição pelo aparelho.
          </li>
          <li>
            <span className="font-medium text-foreground">3. Importe como aparelho.</span> Toque em Importar no cartão
            do dispositivo para colocá-lo num imóvel e num ambiente. O mesmo vale em{" "}
            <Link to="/aparelhos?adicionar=1" className="underline underline-offset-4">
              Aparelhos → Adicionar → Conectados
            </Link>
            .
          </li>
        </ol>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          O vínculo com a conta Smart Life ou Tuya Smart fica guardado no servidor, criptografado.
        </p>
      </details>

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
