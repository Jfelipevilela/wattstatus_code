import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Fan,
  Info,
  Leaf,
  Loader2,
  Minus,
  Plus,
  Power,
  RefreshCw,
  Snowflake,
  Thermometer,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { deviceIconForCapabilities } from "@/assets/device-icons";
import { formatNumber } from "@/lib/energy";
import { cn } from "@/lib/utils";
import type { DeviceCommand } from "@/hooks/useSmartThingsDevices";
import { TvRemote } from "./TvRemote";
import {
  FAN_LABELS,
  INPUT_LABELS,
  OPTIONAL_MODE_LABELS,
  MODE_LABELS,
  deviceKind,
  isInertDevice,
  formatElapsed,
  label,
  type DeviceState,
  type OverviewItem,
} from "./types";

const POWER_TITLES = {
  live: "Potência agora",
  report: "Potência (relatório)",
  average: "Potência média",
} as const;

const SETPOINT_COMMIT_MS = 700;
const DEFAULT_RANGE = { min: 16, max: 30 };

interface Props {
  item: OverviewItem;
  pending: boolean;
  usageMs: number | null;
  imported: boolean;
  importing: boolean;
  onCommand: (command: DeviceCommand, optimistic: Partial<DeviceState>) => void;
  onRefresh: () => void;
  onImport: () => void;
  onDetails: () => void;
}

const relativeTime = (iso: string | null) => {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return null;
  if (diff < 60000) return "agora";
  if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `há ${Math.floor(diff / 3600000)} h`;
  return new Date(iso).toLocaleDateString("pt-BR");
};

function AirConditionerArt({
  on,
  setpoint,
}: {
  on: boolean;
  setpoint: number | null;
}) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-48 pb-6">
      <div className="relative h-14 rounded-2xl bg-gradient-to-b from-white to-zinc-200 ring-1 ring-zinc-200 dark:ring-0 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)]">
        <span
          className={cn(
            "absolute right-5 top-3 font-mono text-sm font-semibold tabular-nums transition-opacity",
            on ? "text-sky-500 opacity-100" : "opacity-0",
          )}
        >
          {setpoint ?? "--"}
        </span>
        <span className="absolute left-4 top-4 h-1 w-1 rounded-full bg-zinc-300" />
        <span className="absolute inset-x-3 bottom-2 h-1.5 rounded-full bg-zinc-300/80" />
      </div>
      {on && (
        <div className="absolute inset-x-8 top-16 flex justify-between">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className="h-5 w-px animate-pulse bg-gradient-to-b from-sky-300/70 to-transparent"
              style={{ animationDelay: `${index * 200}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TvArt({ on }: { on: boolean }) {
  return (
    <div aria-hidden="true" className="mx-auto w-48 pb-4">
      <div
        className={cn(
          "aspect-video rounded-xl border-4 border-zinc-800 transition-all duration-500",
          on
            ? "bg-gradient-to-br from-violet-600/70 via-sky-500/50 to-fuchsia-500/60 shadow-[0_0_40px_-8px_rgba(139,92,246,0.7)]"
            : "bg-zinc-950",
        )}
      />
      <div className="mx-auto h-2 w-16 rounded-b-lg bg-zinc-800" />
    </div>
  );
}

function DeviceArt({ Icon, on }: { Icon: IconType; on: boolean }) {
  return (
    <div aria-hidden="true" className="flex justify-center pb-4">
      <div
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-3xl transition-all duration-500",
          on
            ? "bg-energy-green-light/15 text-energy-green-light shadow-[0_0_40px_-6px_rgba(0,200,83,0.55)]"
            : "bg-zinc-100 dark:bg-white/5 text-zinc-400 dark:text-white/40",
        )}
      >
        <Icon className="h-9 w-9" />
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  value,
  options,
  current,
  onSelect,
  disabled,
}: {
  icon: typeof Zap;
  title: string;
  value: string;
  options?: Array<{ value: string; label: string }>;
  current?: string | null;
  onSelect?: (value: string) => void;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-start justify-between">
        <Icon className="h-4 w-4 text-zinc-500 dark:text-white/60" aria-hidden="true" />
        {options && (
          <ChevronDown
            className="h-3.5 w-3.5 text-zinc-400 dark:text-white/40"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="mt-3 block text-[11px] text-zinc-500 dark:text-white/50">{title}</span>
      <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">
        {value}
      </span>
    </>
  );
  const base =
    "w-full min-w-0 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] p-3 text-left";
  if (!options || options.length === 0 || !onSelect)
    return <div className={base}>{body}</div>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`${title}: ${value}. Alterar`}
        className={cn(
          base,
          "transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light disabled:opacity-50",
        )}
      >
        {body}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onSelect(option.value)}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                option.value === current ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeviceControlCard({
  item,
  pending,
  usageMs,
  imported,
  importing,
  onCommand,
  onRefresh,
  onImport,
  onDetails,
}: Props) {
  const { device, status, error } = item;
  const state = status?.state;
  const capabilities = device.capabilities ?? [];
  const kind = deviceKind(capabilities);
  const on = state?.switch === "on";
  const online = Boolean(status?.online);
  const canSwitch =
    capabilities.length === 0 || capabilities.includes("switch");
  const hasMeter = ["powerMeter", "energyMeter", "powerConsumptionReport"].some(
    (id) => capabilities.includes(id),
  );
  const importable = canSwitch || hasMeter;
  // Devices with nothing to control or measure (hubs, phones) start collapsed.
  const inert = isInertDevice(capabilities);
  const [expanded, setExpanded] = useState(false);
  const canSetpoint = capabilities.includes("thermostatCoolingSetpoint");
  const range = state?.setpointRange ?? DEFAULT_RANGE;
  const Icon = deviceIconForCapabilities(capabilities);

  // Local setpoint follows the device until the user drags, then commits once.
  const [setpoint, setSetpoint] = useState<number | null>(
    state?.coolingSetpointC ?? null,
  );
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setSetpoint(state?.coolingSetpointC ?? null);
  }, [state?.coolingSetpointC]);
  useEffect(() => () => clearTimeout(commitTimer.current), []);

  const changeSetpoint = (value: number) => {
    const next = Math.min(range.max, Math.max(range.min, Math.round(value)));
    setSetpoint(next);
    dirty.current = true;
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      dirty.current = false;
      onCommand(
        {
          capability: "thermostatCoolingSetpoint",
          command: "setCoolingSetpoint",
          arguments: [next],
        },
        { coolingSetpointC: next },
      );
    }, SETPOINT_COMMIT_MS);
  };

  const togglePower = () =>
    onCommand(
      { capability: "switch", command: on ? "off" : "on" },
      { switch: on ? "off" : "on" },
    );

  const updated = relativeTime(state?.updatedAt ?? null);
  const statusLine = pending
    ? { dot: "bg-energy-yellow animate-pulse", text: "Aguardando dispositivo…" }
    : error && !status
      ? { dot: "bg-energy-red", text: "Leitura indisponível" }
      : !online
        ? { dot: "bg-zinc-300 dark:bg-white/30", text: "Offline" }
        : {
            dot: "bg-energy-green-light",
            text: updated ? `Conectado · ${updated}` : "Conectado",
          };

  const usageTile = (
    <Tile
      icon={Clock}
      title="Ligado hoje"
      value={usageMs === null ? "Sem registro" : formatElapsed(usageMs)}
    />
  );
  const powerTile = (
    <Tile
      icon={Zap}
      title={POWER_TITLES[state?.powerSource ?? "live"]}
      value={
        state?.powerW !== null && state?.powerW !== undefined
          ? `${formatNumber(state.powerW, 0)} W`
          : "—"
      }
    />
  );

  if (inert && !expanded)
    return (
      <article
        aria-labelledby={`device-${device.id}`}
        className="flex items-center gap-3 self-start rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 shadow-sm dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-white/50">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`device-${device.id}`} className="truncate text-sm font-medium" title={device.name}>
            {device.name}
          </h3>
          <p className="flex items-center gap-1.5 truncate text-xs text-zinc-500 dark:text-white/50">
            <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusLine.dot)} />
            {device.room || "Sem ambiente"} · sem controle de energia
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={`Expandir ${device.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </article>
    );

  return (
    <article
      aria-labelledby={`device-${device.id}`}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[28px] border border-zinc-200 dark:border-white/10 bg-gradient-to-b from-white to-zinc-50 p-5 text-zinc-900 dark:from-zinc-900 dark:to-zinc-950 dark:text-white shadow-xl transition-shadow",
        on && "shadow-[0_20px_60px_-25px_rgba(0,200,83,0.35)]",
      )}
    >
      {on && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-sky-400/10 blur-3xl"
        />
      )}
      <header className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-white/60">
            <Thermometer className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{device.room || "Sem ambiente"}</span>
            {state?.temperatureC !== null &&
              state?.temperatureC !== undefined && (
                <span className="font-semibold text-zinc-900 dark:text-white">
                  {formatNumber(state.temperatureC, 0)}°C
                </span>
              )}
          </p>
        </div>
        {canSwitch && (
          <button
            type="button"
            onClick={togglePower}
            disabled={pending || !status}
            aria-pressed={on}
            aria-label={on ? `Desligar ${device.name}` : `Ligar ${device.name}`}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light disabled:cursor-not-allowed disabled:opacity-40",
              on
                ? "border-energy-green-light/40 bg-energy-green-light text-zinc-950 shadow-[0_0_24px_-4px_rgba(0,200,83,0.8)]"
                : "border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-white/80 hover:bg-zinc-100 dark:hover:bg-white/10",
            )}
          >
            {pending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Power className="h-5 w-5" />
            )}
          </button>
        )}
      </header>

      <div className="relative mt-4">
        {kind === "climate" ? (
          <AirConditionerArt on={on} setpoint={setpoint} />
        ) : kind === "tv" ? (
          <TvArt on={on} />
        ) : (
          <DeviceArt Icon={Icon} on={on} />
        )}
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={`device-${device.id}`}
            className="truncate text-base font-semibold"
            title={device.name}
          >
            {device.name}
          </h3>
          <p className="truncate text-xs text-zinc-500 dark:text-white/50">
            {[device.brand, device.model].filter(Boolean).join(" · ")}
          </p>
        </div>
        <p className="shrink-0 text-right">
          {kind === "tv" && on && (state?.channel || state?.inputSource) ? (
            <span className="block max-w-[10rem]">
              <span className="block truncate text-3xl font-light tabular-nums tracking-tight">
                {state.channel
                  ? `Canal ${state.channel}`
                  : label(INPUT_LABELS, state.inputSource)}
              </span>
              {state.channelName && (
                <span className="block truncate text-xs text-zinc-500 dark:text-white/50">
                  {state.channelName}
                </span>
              )}
            </span>
          ) : kind === "climate" && setpoint !== null ? (
            <span className="text-5xl font-light tabular-nums tracking-tight">
              {setpoint}
              <span className="align-top text-lg text-zinc-500 dark:text-white/60">°C</span>
            </span>
          ) : state?.powerW !== null && state?.powerW !== undefined ? (
            <span className="text-4xl font-light tabular-nums tracking-tight">
              {formatNumber(state.powerW, 0)}
              <span className="ml-1 text-base text-zinc-500 dark:text-white/60">W</span>
            </span>
          ) : (
            <span className="text-2xl font-light text-zinc-700 dark:text-white/80">
              {state?.switch ? (on ? "Ligado" : "Desligado") : ""}
            </span>
          )}
        </p>
      </div>

      {kind === "climate" && canSetpoint && setpoint !== null && (
        <div className="relative mt-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => changeSetpoint(setpoint - 1)}
              disabled={!online || setpoint <= range.min}
              aria-label="Diminuir temperatura"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <Slider
              value={[setpoint]}
              min={range.min}
              max={range.max}
              step={1}
              disabled={!online}
              onValueChange={([value]) => changeSetpoint(value)}
              aria-label="Temperatura desejada"
              className="flex-1 [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&>span:first-child]:h-10 [&>span:first-child]:rounded-full [&>span:first-child]:bg-zinc-200 dark:[&>span:first-child]:bg-white/10 [&>span:first-child>span]:bg-gradient-to-r [&>span:first-child>span]:from-sky-500/40 [&>span:first-child>span]:to-sky-300/60"
            />
            <button
              type="button"
              onClick={() => changeSetpoint(setpoint + 1)}
              disabled={!online || setpoint >= range.max}
              aria-label="Aumentar temperatura"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1.5 flex justify-between px-14 text-[11px] text-zinc-400 dark:text-white/40">
            <span>{range.min}°</span>
            <span>{range.max}°</span>
          </div>
        </div>
      )}

      {kind === "tv" && (
        <TvRemote
          state={state}
          capabilities={capabilities}
          disabled={pending || !online || !on}
          onCommand={onCommand}
        />
      )}

      <div className="relative mt-5 grid grid-cols-3 gap-2">
        {kind === "climate" ? (
          <>
            <Tile
              icon={Snowflake}
              title="Modo"
              value={label(MODE_LABELS, state?.mode ?? null)}
              current={state?.mode}
              disabled={pending || !online}
              options={state?.supportedModes.map((mode) => ({
                value: mode,
                label: label(MODE_LABELS, mode),
              }))}
              onSelect={(mode) =>
                onCommand(
                  {
                    capability: "airConditionerMode",
                    command: "setAirConditionerMode",
                    arguments: [mode],
                  },
                  { mode },
                )
              }
            />
            <Tile
              icon={Fan}
              title="Ventilação"
              value={label(FAN_LABELS, state?.fanMode ?? null)}
              current={state?.fanMode}
              disabled={pending || !online}
              options={state?.supportedFanModes.map((fan) => ({
                value: fan,
                label: label(FAN_LABELS, fan),
              }))}
              onSelect={(fanMode) =>
                onCommand(
                  {
                    capability: "airConditionerFanMode",
                    command: "setFanMode",
                    arguments: [fanMode],
                  },
                  { fanMode },
                )
              }
            />
            {powerTile}
            {state && state.supportedOptionalModes.length > 0 && (
              <div className="col-span-3">
                <Tile
                  icon={Leaf}
                  title="Modo especial"
                  value={label(OPTIONAL_MODE_LABELS, state.optionalMode)}
                  current={state.optionalMode}
                  disabled={pending || !online}
                  options={state.supportedOptionalModes.map((mode) => ({
                    value: mode,
                    label: label(OPTIONAL_MODE_LABELS, mode),
                  }))}
                  onSelect={(optionalMode) =>
                    onCommand(
                      {
                        capability: "custom.airConditionerOptionalMode",
                        command: "setAcOptionalMode",
                        arguments: [optionalMode],
                      },
                      { optionalMode },
                    )
                  }
                />
              </div>
            )}
          </>
        ) : hasMeter ? (
          <>
            {powerTile}
            <Tile
              icon={Activity}
              title="Acumulado"
              value={
                state?.energyKWh !== null && state?.energyKWh !== undefined
                  ? `${formatNumber(state.energyKWh, 1)} kWh`
                  : "—"
              }
            />
            {usageTile}
          </>
        ) : canSwitch ? (
          <>
            <div className="col-span-2 flex items-center rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-3 text-xs text-zinc-500 dark:text-white/50">
              Sem medidor de energia. Importe para estimar o consumo.
            </div>
            {usageTile}
          </>
        ) : (
          <p className="col-span-3 rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-3 text-center text-xs text-zinc-500 dark:text-white/50">
            Este dispositivo não tem controle nem medição de energia.
          </p>
        )}
      </div>

      <footer className="relative mt-5 flex items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/10 pt-4 text-xs">
        <span
          className="flex min-w-0 items-center gap-2 text-zinc-500 dark:text-white/60"
          role="status"
        >
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 shrink-0 rounded-full", statusLine.dot)}
          />
          <span className="truncate">{statusLine.text}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {!importable ? null : imported ? (
            <span className="rounded-full bg-zinc-100 dark:bg-white/5 px-2.5 py-1 text-zinc-500 dark:text-white/60">
              Importado
            </span>
          ) : (
            <button
              type="button"
              onClick={onImport}
              disabled={importing}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-white/5 px-2.5 py-1 font-medium text-zinc-700 dark:text-white/80 hover:bg-zinc-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light disabled:opacity-50"
            >
              {importing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              Importar
            </button>
          )}
          {inert && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-expanded={true}
              aria-label={`Recolher ${device.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onDetails}
            aria-label={`Detalhes de ${device.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 dark:text-white/60 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light"
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={pending}
            aria-label={`Atualizar ${device.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 dark:text-white/60 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </span>
      </footer>
    </article>
  );
}
