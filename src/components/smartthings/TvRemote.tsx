import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  MonitorPlay,
  Pause,
  Play,
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import type { DeviceCommand } from "@/hooks/useSmartThingsDevices";
import { cn } from "@/lib/utils";
import { INPUT_LABELS, label, type DeviceState } from "./types";

const VOLUME_COMMIT_MS = 500;

interface Props {
  state: DeviceState | undefined;
  capabilities: string[];
  disabled: boolean;
  onCommand: (command: DeviceCommand, optimistic: Partial<DeviceState>) => void;
}

const keyClass =
  "flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/[0.06] text-zinc-800 dark:text-white/90 transition-colors hover:bg-zinc-200 dark:hover:bg-white/[0.12] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-energy-green-light disabled:pointer-events-none disabled:opacity-35";

export function TvRemote({ state, capabilities, disabled, onCommand }: Props) {
  const has = (capability: string) => capabilities.includes(capability);
  const [volume, setVolume] = useState<number | null>(state?.volume ?? null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!dirty.current) setVolume(state?.volume ?? null);
  }, [state?.volume]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const changeVolume = (value: number) => {
    const next = Math.max(0, Math.min(100, Math.round(value)));
    setVolume(next);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dirty.current = false;
      onCommand({ capability: "audioVolume", command: "setVolume", arguments: [next] }, { volume: next });
    }, VOLUME_COMMIT_MS);
  };

  const step = (command: "volumeUp" | "volumeDown") =>
    volume === null
      ? onCommand({ capability: "audioVolume", command }, {})
      : changeVolume(volume + (command === "volumeUp" ? 1 : -1));

  const muted = !disabled && state?.muted === true;
  const showChannel = has("tvChannel");
  const showMute = has("audioMute");
  const showInput = has("mediaInputSource") && Boolean(state && state.supportedInputSources.length > 0);
  const columns = [showChannel, showMute, showInput].filter(Boolean).length;
  const VolumeIcon = muted ? VolumeX : (volume ?? 0) > 50 ? Volume2 : Volume1;

  return (
    <div className="relative mt-5 space-y-3">
      {has("audioVolume") && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={cn(keyClass, "h-10 w-10 shrink-0")}
            disabled={disabled}
            aria-label="Diminuir volume"
            onClick={() => step("volumeDown")}
          >
            <Volume1 className="h-4 w-4" />
          </button>
          {volume !== null ? (
            <Slider
              value={[volume]}
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              onValueChange={([value]) => changeVolume(value)}
              aria-label="Volume"
              className="flex-1 [&_[role=slider]]:h-6 [&_[role=slider]]:w-6 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&>span:first-child]:h-10 [&>span:first-child]:rounded-full [&>span:first-child]:bg-zinc-200 dark:[&>span:first-child]:bg-white/10 [&>span:first-child>span]:bg-gradient-to-r [&>span:first-child>span]:from-violet-500/40 [&>span:first-child>span]:to-fuchsia-300/60"
            />
          ) : (
            <span className="flex-1 text-center text-xs text-zinc-500 dark:text-white/50">Volume não informado</span>
          )}
          <button
            type="button"
            className={cn(keyClass, "h-10 w-10 shrink-0")}
            disabled={disabled}
            aria-label="Aumentar volume"
            onClick={() => step("volumeUp")}
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {columns > 0 && (
      <div className={cn("grid gap-2", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {showChannel && (
          <div className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.04] p-2">
            <button
              type="button"
              className={cn(keyClass, "h-9 w-full")}
              disabled={disabled}
              aria-label="Próximo canal"
              onClick={() => onCommand({ capability: "tvChannel", command: "channelUp" }, {})}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <span className="text-[11px] text-zinc-500 dark:text-white/50">Canal</span>
            <button
              type="button"
              className={cn(keyClass, "h-9 w-full")}
              disabled={disabled}
              aria-label="Canal anterior"
              onClick={() => onCommand({ capability: "tvChannel", command: "channelDown" }, {})}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}

        {showMute && (
          <button
            type="button"
            disabled={disabled}
            aria-pressed={muted}
            aria-label={muted ? "Ativar som" : "Silenciar"}
            onClick={() =>
              onCommand({ capability: "audioMute", command: muted ? "unmute" : "mute" }, { muted: !muted })
            }
            className={cn(
              keyClass,
              "flex-col gap-1 rounded-2xl text-xs",
              muted && "border-energy-yellow/40 bg-energy-yellow/15 text-energy-yellow",
            )}
          >
            <VolumeIcon className="h-5 w-5" />
            {muted ? "Mudo" : volume !== null ? `${volume}%` : "Som"}
          </button>
        )}

        {showInput && state && (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={disabled}
              aria-label={`Fonte: ${label(INPUT_LABELS, state.inputSource)}. Alterar`}
              className={cn(keyClass, "flex-col gap-1 rounded-2xl text-xs")}
            >
              <MonitorPlay className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{label(INPUT_LABELS, state.inputSource)}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {state.supportedInputSources.map((source) => (
                <DropdownMenuItem
                  key={source}
                  onSelect={() =>
                    onCommand(
                      { capability: "mediaInputSource", command: "setInputSource", arguments: [source] },
                      { inputSource: source },
                    )
                  }
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", source === state.inputSource ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  {label(INPUT_LABELS, source)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      )}

      {has("mediaPlayback") && (
        <div className="flex justify-center gap-2">
          {[
            { command: "play", icon: Play, text: "Reproduzir" },
            { command: "pause", icon: Pause, text: "Pausar" },
            { command: "stop", icon: Square, text: "Parar" },
          ].map(({ command, icon: Icon, text }) => (
            <button
              key={command}
              type="button"
              disabled={disabled}
              aria-label={text}
              onClick={() => onCommand({ capability: "mediaPlayback", command }, { playback: command === "play" ? "playing" : command === "pause" ? "paused" : "stopped" })}
              className={cn(keyClass, "h-10 w-10")}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
