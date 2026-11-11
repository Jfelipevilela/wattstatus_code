import { useEffect, useId, useRef, useState } from "react";
import { Layers, Power, PowerOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";
import { streamPower, type PowerState } from "@/lib/power-stream";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Floor, Room } from "@/types/property";

export type Scope =
  | { type: "property" }
  | { type: "room"; roomId: string }
  | { type: "floor"; floorId: string }
  | { type: "block"; block: string };

const outcomeLabels = {
  "nao-enviado": "Não enviado, tempo esgotado",
  "ligado-confirmado": "Ligado confirmado",
  "desligado-confirmado": "Desligado confirmado",
  "comando-enviado-sem-confirmacao": "Comando enviado, sem confirmação",
  falhou: "Falhou",
  "nao-controlavel": "Não controlável",
};
type Outcome = keyof typeof outcomeLabels;

// One color per outcome, used by the dot in the result list.
const outcomeTone: Record<Outcome, string> = {
  "nao-enviado": "bg-amber-500",
  "ligado-confirmado": "bg-primary",
  "desligado-confirmado": "bg-primary",
  "comando-enviado-sem-confirmacao": "bg-amber-500",
  falhou: "bg-destructive",
  "nao-controlavel": "bg-muted-foreground/50",
};

// Queue steps shown while the batch runs, before the final outcome.
const stepLabels: Record<"na-fila" | "enviando" | "conferindo", string> = {
  "na-fila": "Na fila",
  enviando: "Enviando comando",
  conferindo: "Conferindo estado",
};
const isFinal = (state: PowerState): state is Outcome => state in outcomeLabels;

export interface BatchResult {
  results: { applianceId: string; name: string; outcome: Outcome }[];
  summary: Record<Outcome, number>;
}

// A scope offered next to the switch, e.g. the floor shown or the whole property.
export interface ScopeChoice {
  key: string;
  // Short text for the segmented control ("Térreo").
  short: string;
  // Full text for the dialog and screen readers ("Andar atual: Térreo").
  label: string;
  scope: Scope;
}

interface Props {
  propertyId: string;
  propertyName: string;
  floors?: Floor[];
  rooms?: Room[];
  room?: Room;
  fixedScope?: { label: string; scope: Scope };
  // Toolbar mode: a scope selector plus the on/off switch.
  scopes?: ScopeChoice[];
  onStart?: () => void;
  onResult?: (result: BatchResult) => void;
}

type Action = "on" | "off";

// Same visual language as the floor plan toolbar pills.
const pill = "flex items-center rounded-full border bg-card p-1 shadow-sm";
const segment = (active: boolean) =>
  cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
  );
// The two halves of the switch: neutral at rest, color only on intent.
const half = (action: Action) =>
  cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
    action === "on" ? "hover:bg-primary/10 hover:text-primary" : "hover:bg-muted",
  );

const previewPower = (propertyId: string, userId: string, token: string | undefined, scope: Scope, action: Action, signal?: AbortSignal) =>
  apiRequest<{ controllableCount: number }>(`/api/properties/${propertyId}/power/preview`, {
    method: "POST",
    headers: { "X-WattStatus-User": userId },
    body: JSON.stringify({ action, scope }),
    timeoutMs: 35000,
    skipErrorToast: true,
    signal,
  }, token);

export function GroupOffControl(props: Props) {
  const { user, token } = useAuth();
  return user ? (
    <ScopedControl
      key={`${user.id}:${props.propertyId}:${props.room?.id ?? "all"}`}
      {...props}
      userId={user.id}
      token={token ?? undefined}
    />
  ) : null;
}

function ScopedControl({
  propertyId,
  propertyName,
  floors = [],
  rooms = [],
  room,
  fixedScope,
  scopes,
  onResult,
  onStart,
  userId,
  token,
}: Props & { userId: string; token?: string }) {
  const id = useId();
  const [action, setAction] = useState<Action>("off");
  const [preview, setPreview] = useState<{ key: string; count: number } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [selected, setSelected] = useState("property");
  const [scopeKey, setScopeKey] = useState(scopes?.[0]?.key ?? "");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [queue, setQueue] = useState<{ applianceId: string; name: string; state: PowerState }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const options: { value: string; label: string; scope: Scope }[] = [
    {
      value: "property",
      label: `Imóvel inteiro: ${propertyName}${floors.length > 1 ? ` · Todos os ${floors.length} andares` : ""}`,
      scope: { type: "property" },
    },
    ...[...new Set(floors.map((f) => f.block).filter((b): b is string => Boolean(b)))].map((block) => ({
      value: `block:${block}`,
      label: `Bloco/local: ${block}`,
      scope: { type: "block" as const, block },
    })),
    ...floors.map((f) => ({
      value: `floor:${f.id}`,
      label: `Pavimento: ${f.block ? `${f.block} / ` : ""}${f.name}`,
      scope: { type: "floor" as const, floorId: f.id },
    })),
    ...rooms.map((r) => ({
      value: `room:${r.id}`,
      label: `Cômodo: ${r.name}`,
      scope: { type: "room" as const, roomId: r.id },
    })),
  ];
  const activeScope = scopes?.find((choice) => choice.key === scopeKey) ?? scopes?.[0];
  const target =
    fixedScope ??
    (activeScope
      ? { label: activeScope.label, scope: activeScope.scope }
      : room
        ? { label: `Cômodo: ${room.name}`, scope: { type: "room" as const, roomId: room.id } }
        : (options.find((o) => o.value === selected) ?? options[0]));

  // Capture the scope when opening: later layout refreshes cannot change the confirmed intent.
  const [intent, setIntent] = useState(target);
  const intentKey = JSON.stringify(intent.scope);
  const previewKey = `${action}:${intentKey}`;
  const count = preview?.key === previewKey ? preview.count : null;

  useEffect(() => {
    if (!open) return;
    let current = true;
    setPreview(null);
    setPreviewError(false);
    const controller = new AbortController();
    void previewPower(propertyId, userId, token, JSON.parse(intentKey), action, controller.signal)
      .then((response) => { if (current) setPreview({ key: `${action}:${intentKey}`, count: response.controllableCount }); })
      .catch(() => { if (current) setPreviewError(true); });
    return () => { current = false; controller.abort(); };
  }, [open, intentKey, action, propertyId, userId, token]);

  const [roomCounts, setRoomCounts] = useState<{ on: number; off: number } | null>(null);
  const [roomCountError, setRoomCountError] = useState(false);
  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const controller = new AbortController();
    setRoomCounts(null);
    setRoomCountError(false);
    void (async () => {
      try {
        const scope: Scope = { type: "room", roomId };
        const on = await previewPower(propertyId, userId, token, scope, "on", controller.signal);
        if (controller.signal.aborted) return;
        const off = await previewPower(propertyId, userId, token, scope, "off", controller.signal);
        if (!controller.signal.aborted) setRoomCounts({ on: on.controllableCount, off: off.controllableCount });
      } catch {
        if (!controller.signal.aborted) setRoomCountError(true);
      }
    })();
    return () => controller.abort();
  }, [roomId, propertyId, userId, token]);

  const verb = action === "on" ? "Ligar" : "Desligar";

  const openDialog = async (button: HTMLButtonElement, choice: Action | null) => {
    triggerRef.current = button;
    // Body portals must be visible when the plan is in fullscreen.
    if (typeof document !== "undefined" && document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { return; }
    }
    if (choice) setAction(choice);
    setIntent(target);
    setPreview(null);
    setPreviewError(false);
    setResult(null);
    setError(null);
    setOpen(true);
  };

  const run = async () => {
    if (busy.current || count === null || count === 0 || previewError) return;
    busy.current = true;
    onStart?.();
    setPending(true);
    setError(null);
    setQueue([]);
    try {
      const response = await streamPower<BatchResult>(propertyId, userId, token, { action, scope: intent.scope }, (event) => {
        if (event.type === "start") setQueue(event.items);
        else setQueue((items) => items.map((item) => (item.applianceId === event.applianceId ? { ...item, state: event.state } : item)));
      });
      setResult(response);
      onResult?.(response);
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : "Não foi possível concluir o controle."} Alguns comandos podem ter sido enviados. Confira os aparelhos antes de tentar novamente.`,
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  // The on/off switch shared by the toolbar and the room panel.
  const powerSwitch = (wide = false) => (
    <div role="group" aria-label={`Ligar ou desligar: ${target.label}`} className={cn(pill, wide && "w-full")}>
      {(["on", "off"] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          disabled={pending}
          aria-label={`${choice === "on" ? "Ligar" : "Desligar"}: ${target.label}`}
          className={cn(half(choice), wide ? "h-10 flex-1 justify-center" : "max-sm:px-2.5")}
          onClick={(event) => void openDialog(event.currentTarget, choice)}
        >
          {choice === "on" ? (
            <Power aria-hidden="true" className="h-4 w-4 text-primary" />
          ) : (
            <PowerOff aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={wide ? undefined : "max-sm:sr-only"}>{choice === "on" ? "Ligar" : "Desligar"}</span>
        </button>
      ))}
    </div>
  );

  let trigger: JSX.Element;
  if (scopes) {
    trigger = (
      <div className="flex items-center gap-2">
        {scopes.length > 1 && (
          <div role="group" aria-label="Onde controlar" className={pill}>
            {scopes.map((choice) => (
              <button
                key={choice.key}
                type="button"
                aria-pressed={choice.key === activeScope?.key}
                title={choice.label}
                disabled={pending}
                className={segment(choice.key === activeScope?.key)}
                onClick={() => setScopeKey(choice.key)}
              >
                {choice.key === scopes[scopes.length - 1].key && <Layers aria-hidden="true" className="h-3.5 w-3.5" />}
                {choice.short}
              </button>
            ))}
          </div>
        )}
        {powerSwitch()}
      </div>
    );
  } else if (room || fixedScope) {
    trigger = (
      <div className="flex flex-col gap-2">
        {powerSwitch(Boolean(room))}
        {room && (
          <p className="text-xs text-muted-foreground" role="status">
            {roomCounts
              ? roomCounts.on + roomCounts.off === 0
                ? "Nenhum aparelho conectado neste ambiente."
                : `${roomCounts.on} ${roomCounts.on === 1 ? "pode" : "podem"} ligar · ${roomCounts.off} ${roomCounts.off === 1 ? "pode" : "podem"} desligar`
              : roomCountError
                ? "Contagem indisponível. Verifique ao abrir a confirmação."
                : "Verificando aparelhos conectados…"}
          </p>
        )}
      </div>
    );
  } else {
    trigger = (
      <button
        type="button"
        disabled={pending}
        className="flex h-9 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        onClick={(event) => void openDialog(event.currentTarget, null)}
      >
        <Power aria-hidden="true" className="h-4 w-4 text-primary" />
        Controlar aparelhos
      </button>
    );
  }

  const confirmed = result ? result.summary[action === "on" ? "ligado-confirmado" : "desligado-confirmado"] ?? 0 : 0;

  return (
    <div className="shrink-0">
      {trigger}
      <AlertDialog open={open} onOpenChange={(value) => { if (!busy.current) setOpen(value); }}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
          className="max-h-[90dvh] overflow-y-auto motion-reduce:animate-none"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{result ? "Resultado do controle" : `${verb} aparelhos?`}</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {result
                ? `${intent.label}. Confira o resultado de cada aparelho abaixo.`
                : `${intent.label}. Enviaremos o comando de ${verb.toLowerCase()} aos aparelhos conectados e conferimos o estado informado por cada um. Aparelhos manuais não são controlados.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!result && !error && !pending && (
            <div className="flex flex-col gap-4">
              {!fixedScope && !room && !scopes && (
                <div className="flex flex-col gap-2">
                  <label htmlFor={id} className="text-sm font-medium">Onde</label>
                  <Select
                    value={selected}
                    onValueChange={(value) => {
                      setSelected(value);
                      const next = options.find((option) => option.value === value);
                      if (next) setIntent(next);
                    }}
                    disabled={pending}
                  >
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div role="group" aria-label="Ação" className={cn(pill, "w-full")}>
                {(["on", "off"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    disabled={pending}
                    aria-pressed={action === choice}
                    onClick={() => setAction(choice)}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
                      action === choice
                        ? choice === "on"
                          ? "bg-primary text-primary-foreground"
                          : "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {choice === "on" ? <Power aria-hidden="true" className="h-4 w-4" /> : <PowerOff aria-hidden="true" className="h-4 w-4" />}
                    {choice === "on" ? "Ligar" : "Desligar"}
                  </button>
                ))}
              </div>

              <div role="status" className="rounded-2xl border bg-muted/40 px-4 py-3">
                {previewError ? (
                  <p className="text-sm">Não foi possível verificar os aparelhos. Feche e tente novamente.</p>
                ) : count === null ? (
                  <div className="flex flex-col gap-2" aria-label="Verificando aparelhos controláveis…">
                    <Skeleton className="h-8 w-12 motion-reduce:animate-none" />
                    <Skeleton className="h-4 w-48 motion-reduce:animate-none" />
                  </div>
                ) : (
                  <>
                    <p aria-hidden="true" className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold tabular-nums">{count}</span>
                      <span className="text-sm text-muted-foreground">{`aparelhos controláveis para ${verb.toLowerCase()}`}</span>
                    </p>
                    <p className="sr-only">{`${count} aparelhos controláveis para ${verb.toLowerCase()}.`}</p>
                  </>
                )}
              </div>
            </div>
          )}

          {pending && (() => {
            const controllable = queue.filter((item) => item.state !== "nao-controlavel");
            const finished = controllable.filter((item) => isFinal(item.state)).length;
            const percent = controllable.length ? Math.round((finished / controllable.length) * 100) : 0;
            return (
              <div className="flex flex-col gap-3">
                <div role="status" aria-live="polite" className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{`${action === "on" ? "Ligando" : "Desligando"} e conferindo cada aparelho…`}</p>
                  {controllable.length > 0 && <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{`${finished} de ${controllable.length}`}</span>}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
                </div>
                {controllable.length === 0 ? (
                  <>
                    <Skeleton className="h-11 w-full motion-reduce:animate-none" />
                    <Skeleton className="h-11 w-full motion-reduce:animate-none" />
                  </>
                ) : (
                  <ul aria-label="Fila de aparelhos" className="max-h-64 divide-y overflow-y-auto rounded-2xl border">
                    {controllable.map((item) => (
                      <li key={item.applianceId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0 truncate text-sm">{item.name}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-2 w-2 rounded-full",
                              isFinal(item.state)
                                ? outcomeTone[item.state]
                                : item.state === "na-fila"
                                  ? "bg-muted-foreground/30"
                                  : "animate-pulse bg-primary/60 motion-reduce:animate-none",
                            )}
                          />
                          {isFinal(item.state) ? outcomeLabels[item.state] : stepLabels[item.state]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              {result.results.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-4">
                  <p role="status" className="text-sm font-medium">
                    Nenhum aparelho neste escopo. Cadastre aparelhos ou conecte SmartThings, Tuya ou LG em Integrações e associe os aparelhos a este imóvel.
                  </p>
                  <a href="/apps" className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-4">Abrir Integrações</a>
                </div>
              ) : (
                <>
                  <div aria-hidden="true" className="flex items-baseline gap-2 rounded-2xl border bg-muted/40 px-4 py-3">
                    <span className="text-3xl font-semibold tabular-nums">{confirmed}</span>
                    <span className="text-sm text-muted-foreground">
                      {`de ${result.results.filter((item) => item.outcome !== "nao-controlavel").length} ${action === "on" ? "ligados" : "desligados"} e confirmados`}
                      {(result.summary["nao-controlavel"] ?? 0) > 0 && ` · ${result.summary["nao-controlavel"]} manual sem controle`}
                    </span>
                  </div>
                  <p role="status" className="sr-only">
                    {`${confirmed} ${action === "on" ? "ligados" : "desligados"} e confirmados, ${result.summary["comando-enviado-sem-confirmacao"] ?? 0} sem confirmação, ${result.summary.falhou ?? 0} falharam, ${result.summary["nao-controlavel"] ?? 0} manuais ou não controláveis${result.summary["nao-enviado"] ? `, ${result.summary["nao-enviado"]} não enviados por tempo` : ""}.`}
                  </p>
                  {(result.summary["nao-enviado"] ?? 0) > 0 && (
                    <p className="text-sm text-muted-foreground">
                      O tempo acabou antes de chegar a alguns aparelhos. Repita o comando para esses aparelhos.
                    </p>
                  )}
                  {result.summary["comando-enviado-sem-confirmacao"] > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Alguns aparelhos não confirmaram o novo estado. Confira no aplicativo do fabricante ou no local.
                    </p>
                  )}
                  <ul aria-label="Resultado por aparelho" className="divide-y rounded-2xl border">
                    {result.results.map((item) => (
                      <li key={item.applianceId} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="min-w-0 break-words text-sm font-medium">{item.name}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", outcomeTone[item.outcome])} />
                          {outcomeLabels[item.outcome]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{result || error ? "Fechar" : "Cancelar"}</AlertDialogCancel>
            {!result && !error && (
              <AlertDialogAction
                disabled={pending || count === null || count === 0 || previewError}
                className={action === "off" ? "bg-foreground text-background hover:bg-foreground/90" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  void run();
                }}
              >
                {pending ? "Verificando…" : `${verb} tudo`}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
