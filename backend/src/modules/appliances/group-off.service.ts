import { z } from "zod";
import { ApiError } from "../../middleware/error-handler";
import type { ApplianceRecord } from "../../types";
import type { PropertyService } from "../properties/properties.service";
import type { DeviceIntegration } from "../integrations/types";
import { providerGate } from "../integrations/provider-gate";
export const groupOffSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("property") }).strict(),
  z.object({ type: z.literal("room"), roomId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("floor"), floorId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal("block"),
      block: z.string().trim().min(1).max(80),
    })
    .strict(),
]);
export const groupPowerSchema = z.object({ action: z.enum(["on", "off"]), scope: groupOffSchema }).strict();
export type GroupOffScope = z.infer<typeof groupOffSchema>;
export type OffOutcome =
  | "nao-enviado"
  | "ligado-confirmado"
  | "desligado-confirmado"
  | "comando-enviado-sem-confirmacao"
  | "falhou"
  | "nao-controlavel";
export interface OffResult {
  applianceId: string;
  name: string;
  outcome: OffOutcome;
}
// Live progress of a batch: queued, sending, verifying, then a final outcome.
export type ProgressState = OffOutcome | "na-fila" | "enviando" | "conferindo";
export type ProgressEvent =
  | { type: "start"; action: "on" | "off"; total: number; items: { applianceId: string; name: string; state: ProgressState }[] }
  | { type: "item"; applianceId: string; state: ProgressState };
export type ProviderResolver = (
  userId: string,
  provider: string,
) => Promise<DeviceIntegration | null>;
const isTimeout = (error: unknown) =>
  error instanceof Error &&
  (error.message === "timeout" ||
    (error instanceof ApiError && error.code === "PROVIDER_TIMEOUT"));
const isDeadline = (error: unknown) => error instanceof Error && error.message === "deadline";

// The provider must honor AbortSignal. A timeout never triggers a command retry:
// a lost acknowledgement may still mean that the physical device received it.
export class GroupOffService {
  private active = new Set<string>();
  constructor(
    private properties: Pick<
      PropertyService,
      "get" | "listFloors" | "listRooms"
    >,
    private appliances: {
      listAppliances(userId: string): Promise<ApplianceRecord[]>;
    },
    private resolve: ProviderResolver,
    private limits = {
      concurrency: 4,
      callMs: 3000,
      batchMs: 25000,
      retryMs: 500,
      maxDevices: 100,
    },
  ) {}
  async run(userId: string, propertyId: string, scope: GroupOffScope, action: "on" | "off" = "off", preview = false, onEvent?: (event: ProgressEvent) => void) {
    let controllableCount = 0;
    if (!preview && this.active.has(userId))
      throw new ApiError(
        409,
        "Um controle já está em andamento. Aguarde o resultado.",
      );
    if (!preview) this.active.add(userId);
    try {
      const deadline = Date.now() + this.limits.batchMs;
      const call = async <T>(
        action: (signal: AbortSignal) => Promise<T>,
      ): Promise<T> => {
        const ms = Math.min(this.limits.callMs, deadline - Date.now());
        if (ms <= 0) throw new Error("deadline");
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            action(controller.signal),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error("timeout"));
              }, ms);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      const property = await call(() =>
        this.properties.get(userId, propertyId),
      );
      if (property.archivedAt) throw new ApiError(409, "Imóvel arquivado.");
      const [floors, rooms, records] = await Promise.all([
        call(() => this.properties.listFloors(userId, propertyId)),
        call(() => this.properties.listRooms(userId, propertyId)),
        call(() => this.appliances.listAppliances(userId)),
      ]);
      let roomIds: Set<string> | null = null;
      if (scope.type === "room") {
        if (!rooms.some((r) => r.id === scope.roomId))
          throw new ApiError(404, "Ambiente não encontrado.");
        roomIds = new Set([scope.roomId]);
      } else if (scope.type === "floor" || scope.type === "block") {
        const selected = floors.filter((f) =>
          scope.type === "floor"
            ? f.id === scope.floorId
            : f.block === scope.block,
        );
        if (!selected.length) throw new ApiError(404, "Escopo não encontrado.");
        const floorIds = new Set(selected.map((f) => f.id));
        roomIds = new Set(
          rooms.filter((r) => floorIds.has(r.floorId)).map((r) => r.id),
        );
      }
      const targets = records.filter(
        (a) =>
          a.userId === userId &&
          a.propertyId === propertyId &&
          (!roomIds || (a.roomId && roomIds.has(a.roomId))),
      );
      if (targets.length > this.limits.maxDevices)
        throw new ApiError(
          400,
          "Este escopo excede o limite de 100 aparelhos. Escolha um escopo menor.",
        );
      const providers = new Map<
        string,
        Promise<{
          integration: DeviceIntegration;
          devices: Awaited<ReturnType<DeviceIntegration["listDevices"]>>;
        } | null>
      >();
      const provider = (id: string) => {
        if (!providers.has(id))
          providers.set(
            id,
            (async () => {
              const integration = await call(() => this.resolve(userId, id));
              if (
                !integration?.isConfigured() ||
                !(action === "on" ? integration.getPowerOnCommands || (id === "tuya" && integration.getPowerOffCommands) : integration.getPowerOffCommands)
              )
                return null;
              return {
                integration,
                devices: await call((signal) =>
                  integration.listDevices(signal),
                ),
              };
            })().catch(() => {
              throw new Error("provider unavailable");
            }),
          );
        return providers.get(id)!;
      };
      // 1. Plan: resolve each appliance to a provider device and its commands.
      type Plan = { integration: DeviceIntegration; provider: string; deviceId: string; commands: Awaited<ReturnType<NonNullable<DeviceIntegration["getPowerOffCommands"]>>> };
      const plan = async (a: ApplianceRecord): Promise<Plan | OffOutcome> => {
        if (!a.integrationProvider || !a.integrationDeviceId) return "nao-controlavel";
        try {
          const configured = await provider(a.integrationProvider);
          if (!configured) return "nao-controlavel";
          const { integration, devices } = configured;
          // A database link alone is insufficient: verify the current provider account too.
          const device = devices.find((d) => d.id === a.integrationDeviceId);
          if (!device) return "falhou";
          const commands = await call((signal) =>
            action === "off"
              ? integration.getPowerOffCommands!(device, signal)
              : integration.getPowerOnCommands
                ? integration.getPowerOnCommands(device, signal)
                // Tuya explicitly supports switch on/off; never infer this for other providers.
                : integration.getPowerOffCommands!(device, signal).then(commands => commands.filter(c => c.capability === "switch" && c.command === "off").map(c => ({ ...c, command: "on" }))),
          );
          if (!commands.length) return "nao-controlavel";
          return { integration, provider: a.integrationProvider, deviceId: device.id, commands };
        } catch {
          return "falhou";
        }
      };

      // Appliances linked to the same physical device share one job.
      const keyOf = (a: ApplianceRecord) =>
        a.integrationProvider && a.integrationDeviceId ? `${a.integrationProvider}:${a.integrationDeviceId}` : a.id;
      const unique = new Map<string, ApplianceRecord>();
      for (const a of targets) if (!unique.has(keyOf(a))) unique.set(keyOf(a), a);
      const keys = [...unique.keys()];
      const final = new Map<string, OffOutcome>();
      const plans = new Map<string, Plan>();
      const emit = (key: string, state: ProgressState) => {
        if (!onEvent) return;
        for (const a of targets) if (keyOf(a) === key) onEvent({ type: "item", applianceId: a.id, state });
      };
      const pool = async (items: string[], task: (key: string) => Promise<void>) => {
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(this.limits.concurrency, items.length) }, async () => {
            while (next < items.length) await task(items[next++]);
          }),
        );
      };
      await pool(keys, async (key) => {
        const planned = await plan(unique.get(key)!);
        if (typeof planned === "string") { final.set(key, planned); return; }
        controllableCount++;
        plans.set(key, planned);
      });
      if (onEvent && !preview)
        onEvent({
          type: "start",
          action,
          total: targets.length,
          items: targets.map((a) => ({ applianceId: a.id, name: a.name, state: final.get(keyOf(a)) ?? "na-fila" })),
        });

      if (!preview) {
        // 2. Dispatch every command first, through the provider gate, so a large
        // batch is fast without flooding any provider. A timeout never triggers
        // a retry: a lost acknowledgement may still mean the device received it.
        const attempted = new Set<string>();
        // Waiting for a provider slot only spends the batch deadline; the per-call
        // timeout starts when the call actually goes out.
        const gated = <T>(provider: string, task: (signal: AbortSignal) => Promise<T>) => {
          const left = deadline - Date.now();
          if (left <= 0) return Promise.reject(new Error("deadline"));
          const waitLimit = AbortSignal.timeout(left);
          return providerGate(provider)
            .run(() => call(task), waitLimit)
            .catch((error) => { throw error instanceof Error && error.message === "aborted" ? new Error("deadline") : error; });
        };
        await pool([...plans.keys()], async (key) => {
          const p = plans.get(key)!;
          if (Date.now() >= deadline) { final.set(key, "nao-enviado"); emit(key, "nao-enviado"); return; }
          emit(key, "enviando");
          for (const command of p.commands) {
            try {
              const accepted = await gated(p.provider, (signal) => {
                attempted.add(key);
                return p.integration.executeCommand(p.deviceId, command, signal);
              });
              if (!accepted.ok) { final.set(key, "falhou"); break; }
            } catch (error) {
              if (isTimeout(error) && attempted.has(key)) continue;
              final.set(key, attempted.has(key) && isDeadline(error) ? "comando-enviado-sem-confirmacao" : attempted.has(key) ? "falhou" : "nao-enviado");
              break;
            }
          }
          emit(key, final.get(key) ?? "conferindo");
        });

        // 3. Verify: read back each device, once more after a short wait.
        // Offline or unknown is never taken as confirmation.
        const pending = () => [...plans.keys()].filter((key) => !final.has(key));
        for (let attempt = 0; attempt < 2 && pending().length; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, Math.max(0, Math.min(this.limits.retryMs, deadline - Date.now()))));
          await pool(pending(), async (key) => {
            const p = plans.get(key)!;
            try {
              const status = await gated(p.provider, (signal) => p.integration.getDeviceStatus(p.deviceId, signal));
              const confirmed = p.commands.every(
                (command) =>
                  (p.integration.readPowerState ? p.integration.readPowerState(status, command) : status.state?.switch) === action,
              );
              if (status.online && confirmed) {
                final.set(key, action === "on" ? "ligado-confirmado" : "desligado-confirmado");
                emit(key, final.get(key)!);
              }
            } catch {
              /* Re-read once; offline/unknown is never confirmation. */
            }
          });
        }
        for (const key of pending()) {
          final.set(key, "comando-enviado-sem-confirmacao");
          emit(key, "comando-enviado-sem-confirmacao");
        }
      }
      const results: OffResult[] = targets.map((a) => ({
        applianceId: a.id,
        name: a.name,
        outcome: final.get(keyOf(a)) ?? "nao-controlavel",
      }));
      const summary: Record<OffOutcome, number> = {
        "nao-enviado": 0,
        "ligado-confirmado": 0,
        "desligado-confirmado": 0,
        "comando-enviado-sem-confirmacao": 0,
        falhou: 0,
        "nao-controlavel": 0,
      };
      for (const result of results) summary[result.outcome]++;
      return { action, scope, results, summary, controllableCount };
    } finally {
      if (!preview) this.active.delete(userId);
    }
  }
}
