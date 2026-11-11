import { Router, type NextFunction, type Response, type RequestHandler } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { intervalsBody } from "../energy/energy-compact";
import {
  energyQuerySchema,
  floorInputSchema,
  floorUpdateSchema,
  layoutUpdateSchema,
  propertyDeleteSchema,
  propertyInputSchema,
  propertyUpdateSchema,
  roomDeleteSchema,
  roomInputSchema,
  roomUpdateSchema,
} from "./properties.schema";
import { groupPowerSchema, groupOffSchema, type GroupOffService } from "../appliances/group-off.service";
import { PropertyService } from "./properties.service";

const id = z.string().uuid();

type Handler = (req: AuthenticatedRequest & { userId: string }, res: Response) => Promise<unknown>;

// Every route runs as the authenticated user; ids in the path are only looked
// up inside that user's records, so a foreign id behaves as "not found".
const route = (handler: Handler) => async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw new ApiError(401, "Não autenticado");
    for (const key of ["id", "floorId", "roomId"]) {
      if (req.params[key] !== undefined && !id.safeParse(req.params[key]).success) {
        throw new ApiError(404, "Recurso não encontrado");
      }
    }
    await handler(req as AuthenticatedRequest & { userId: string }, res);
  } catch (err) {
    next(err);
  }
};

const range = (query: unknown) => {
  const parsed = energyQuerySchema.parse(query);
  const start = new Date(parsed.start);
  const end = new Date(parsed.end);
  const span = end.getTime() - start.getTime();
  if (span <= 0 || span > 366 * 86400000) throw new ApiError(400, "Período inválido");
  return { start, end, roomId: parsed.roomId, format: parsed.format };
};

export const createPropertyRouter = (
  service: PropertyService,
  groupOff?: GroupOffService,
  offLimiter?: RequestHandler,
  previewLimiter?: RequestHandler,
) => {
  const router = Router();

  if (groupOff) router.post("/:id/power-off", offLimiter ?? ((_req, _res, next) => next()), route(async (req, res) => {
    const expectedUser = req.header("x-wattstatus-user");
    if (expectedUser && expectedUser !== req.userId) throw new ApiError(409, "A sessão mudou. Reabra a confirmação.");
    res.json(await groupOff.run(req.userId, req.params.id, groupOffSchema.parse(req.body)));
  }));

  if (groupOff) for (const preview of [false, true]) {
    router.post(preview ? "/:id/power/preview" : "/:id/power", (preview ? previewLimiter : offLimiter) ?? ((_req, _res, next) => next()), route(async (req, res) => {
      const expectedUser = req.header("x-wattstatus-user");
      if (expectedUser && expectedUser !== req.userId) throw new ApiError(409, "A sessão mudou. Reabra a confirmação.");
      const { action, scope } = groupPowerSchema.parse(req.body);
      const result = await groupOff.run(req.userId, req.params.id, scope, action, preview);
      res.json(preview ? { controllableCount: result.controllableCount, total: result.results.length } : result);
    }));
  }

  // Same batch as /power, with live progress as server-sent events: the
  // queue state of every appliance, then the final result.
  if (groupOff) router.post("/:id/power/stream", offLimiter ?? ((_req, _res, next) => next()), async (req, res, next) => {
    let started = false;
    try {
      const userId = (req as typeof req & { userId?: string }).userId;
      if (!userId) throw new ApiError(401, "Não autenticado");
      const expectedUser = req.header("x-wattstatus-user");
      if (expectedUser && expectedUser !== userId) throw new ApiError(409, "A sessão mudou. Reabra a confirmação.");
      const { action, scope } = groupPowerSchema.parse(req.body);
      // The stream opens on the first event, after ownership and scope checks:
      // a foreign or invalid request still gets a plain JSON error.
      const send = (event: string, data: unknown) => {
        if (!started) {
          res.status(200).set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
          res.flushHeaders?.();
          started = true;
        }
        if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      const result = await groupOff.run(userId, req.params.id, scope, action, false, (event) => send(event.type, event));
      send("done", result);
      res.end();
    } catch (error) {
      if (!started) return next(error);
      const status = error instanceof ApiError ? error.status : 500;
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ status, error: status === 500 ? "Não foi possível concluir o controle." : (error as Error).message })}\n\n`);
        res.end();
      }
    }
  });

  router.get("/", route(async (req, res) => {
    res.json({ properties: await service.listWithStats(req.userId, req.query.archived === "1") });
  }));
  router.post("/", route(async (req, res) => {
    res.status(201).json({ property: await service.create(req.userId, propertyInputSchema.parse(req.body)) });
  }));
  router.get("/:id", route(async (req, res) => {
    res.json({ property: await service.get(req.userId, req.params.id) });
  }));
  router.patch("/:id", route(async (req, res) => {
    res.json({ property: await service.update(req.userId, req.params.id, propertyUpdateSchema.parse(req.body)) });
  }));
  router.delete("/:id", route(async (req, res) => {
    const body = propertyDeleteSchema.parse(req.body ?? {});
    await service.remove(req.userId, req.params.id, body.moveAppliancesTo);
    res.status(204).send();
  }));
  router.get("/:id/summary", route(async (req, res) => {
    res.json(await service.summary(req.userId, req.params.id));
  }));
  router.get("/:id/energy", route(async (req, res) => {
    const { start, end, roomId, format } = range(req.query);
    const energy = await service.energy(req.userId, req.params.id, start, end, roomId);
    res.json({ ...energy, intervals: intervalsBody(energy.intervals, format) });
  }));

  router.get("/:id/floors", route(async (req, res) => {
    res.json({ floors: await service.listFloors(req.userId, req.params.id) });
  }));
  router.post("/:id/floors", route(async (req, res) => {
    res.status(201).json({ floor: await service.addFloor(req.userId, req.params.id, floorInputSchema.parse(req.body)) });
  }));
  router.patch("/:id/floors/:floorId", route(async (req, res) => {
    res.json({
      floor: await service.updateFloor(req.userId, req.params.id, req.params.floorId, floorUpdateSchema.parse(req.body)),
    });
  }));
  router.delete("/:id/floors/:floorId", route(async (req, res) => {
    await service.removeFloor(req.userId, req.params.id, req.params.floorId);
    res.status(204).send();
  }));

  router.get("/:id/rooms", route(async (req, res) => {
    res.json({ rooms: await service.listRooms(req.userId, req.params.id) });
  }));
  router.post("/:id/rooms", route(async (req, res) => {
    res.status(201).json({ room: await service.addRoom(req.userId, req.params.id, roomInputSchema.parse(req.body)) });
  }));
  router.get("/:id/rooms/:roomId", route(async (req, res) => {
    res.json({ room: await service.getRoom(req.userId, req.params.id, req.params.roomId) });
  }));
  router.patch("/:id/rooms/:roomId", route(async (req, res) => {
    res.json({
      room: await service.updateRoom(req.userId, req.params.id, req.params.roomId, roomUpdateSchema.parse(req.body)),
    });
  }));
  router.delete("/:id/rooms/:roomId", route(async (req, res) => {
    const body = roomDeleteSchema.parse(req.body ?? {});
    await service.removeRoom(req.userId, req.params.id, req.params.roomId, body.moveAppliancesTo);
    res.status(204).send();
  }));
  router.get("/:id/rooms/:roomId/energy", route(async (req, res) => {
    const { start, end } = range(req.query);
    res.json(await service.energy(req.userId, req.params.id, start, end, req.params.roomId));
  }));

  router.get("/:id/layout", route(async (req, res) => {
    const [floors, rooms] = await Promise.all([
      service.listFloors(req.userId, req.params.id),
      service.listRooms(req.userId, req.params.id),
    ]);
    res.json({ floors, rooms: rooms.map(({ id: roomId, floorId, layout }) => ({ id: roomId, floorId, layout })) });
  }));
  router.put("/:id/layout", route(async (req, res) => {
    const body = layoutUpdateSchema.parse(req.body);
    res.json({ rooms: await service.saveLayout(req.userId, req.params.id, body.rooms) });
  }));

  return router;
};
