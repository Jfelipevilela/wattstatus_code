import { Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogIcon,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/energy";
import type { OverviewItem } from "./types";

const reading = (value: number | null | undefined, unit: string, digits = 1) =>
  value === null || value === undefined ? "Não informado" : `${formatNumber(value, digits)} ${unit}`;

export function DeviceDetailsDialog({
  item,
  onClose,
}: {
  item: OverviewItem | null;
  onClose: () => void;
}) {
  const state = item?.status?.state;
  // Raw meter attributes, shown so readings can be checked against the source.
  const main = (item?.status?.raw as { components?: { main?: Record<string, unknown> } } | undefined)?.components?.main;
  const energyRaw = main
    ? Object.fromEntries(
        ["powerMeter", "energyMeter", "powerConsumptionReport"].filter((key) => main[key]).map((key) => [key, main[key]]),
      )
    : null;
  const rows: Array<[string, string, string]> = item
    ? [
        ["Marca / modelo", [item.device.brand, item.device.model].filter(Boolean).join(" · ") || "Não informado", ""],
        ["Ambiente", item.device.room || "Não informado", ""],
        ["Disponibilidade", item.status ? (item.status.online ? "Online" : "Offline") : "Sem leitura", "Estado de conexão informado pela SmartThings."],
        ["Liga/desliga", state?.switch === "on" ? "Ligado" : state?.switch === "off" ? "Desligado" : "Não informado", ""],
        [
          "Potência",
          reading(state?.powerW, "W", 0),
          state?.powerSource === "live"
            ? "Medidor em tempo real."
            : state?.powerSource === "average"
              ? `Média calculada pela energia do último relatório Samsung${state.powerAt ? ` (até ${new Date(state.powerAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})` : ""}.`
              : state?.powerSource === "report"
                ? `Valor do relatório Samsung, enviado a cada ~15 min${state.powerAt ? ` (último às ${new Date(state.powerAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})` : ""}. Não é leitura instantânea.`
                : "O dispositivo não informa potência.",
        ],
        ["Energia acumulada", reading(state?.energyKWh, "kWh"), "Contador do medidor desde o último reset. A diferença entre leituras vira o consumo medido."],
        ["Temperatura ambiente", reading(state?.temperatureC, "°C"), ""],
        ["Umidade", reading(state?.humidity, "%", 0), ""],
        ["Última leitura", state?.updatedAt ? new Date(state.updatedAt).toLocaleString("pt-BR") : "Não informada", ""],
      ]
    : [];
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogIcon tone="blue"><Cpu /></DialogIcon>
          <DialogTitle>{item?.device.name}</DialogTitle>
          <DialogDescription>Leituras atuais e recursos que este dispositivo informa.</DialogDescription>
        </DialogHeader>
        {item?.error && (
          <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
            {item.error}
          </p>
        )}
        <dl className="divide-y rounded-xl border">
          {rows.map(([title, value, help]) => (
            <div key={title} className="grid gap-1 p-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-sm text-muted-foreground">{title}</dt>
              <dd className="text-sm">
                <span className="font-medium">{value}</span>
                {help && <span className="mt-0.5 block text-xs text-muted-foreground">{help}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="mb-2 text-sm font-medium">Capacidades</h3>
          <div className="flex flex-wrap gap-1.5">
            {(item?.device.capabilities ?? []).length > 0
              ? item!.device.capabilities!.map((capability) => (
                  <Badge key={capability} variant="outline" className="font-mono text-[11px] font-normal">
                    {capability}
                  </Badge>
                ))
              : <span className="text-sm text-muted-foreground">Nenhuma capacidade listada.</span>}
          </div>
        </div>
        {energyRaw && Object.keys(energyRaw).length > 0 && (
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">Dados de energia enviados pela Samsung</summary>
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed">
              {JSON.stringify(energyRaw, null, 2)}
            </pre>
          </details>
        )}
        <p className="break-all font-mono text-[11px] text-muted-foreground">ID: {item?.device.id}</p>
      </DialogContent>
    </Dialog>
  );
}
