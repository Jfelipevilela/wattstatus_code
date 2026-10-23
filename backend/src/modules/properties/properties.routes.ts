import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
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
  return { start, end, roomId: parsed.roomId };
};

export const createPropertyRouter = (service: PropertyService) => {
  const router = Router();

  router.get("/", route(async (req, res) => {
    res.json({ properties: await service.list(req.userId, req.query.archived === "1") });
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
    const { start, end, roomId } = range(req.query);
    res.json(await service.energy(req.userId, req.params.id, start, end, roomId));
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
