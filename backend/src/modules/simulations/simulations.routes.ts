import { Router, type NextFunction, type Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth-middleware";
import { ApiError } from "../../middleware/error-handler";
import { simulationResolveSchema, simulationRoomParamsSchema } from "./simulations.schema";
import { SimulationService } from "./simulations.service";

type Handler = (req: AuthenticatedRequest & { userId: string }, res: Response) => Promise<void>;
const route = (handler: Handler) => async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw new ApiError(401, "Não autenticado.");
    await handler(req as AuthenticatedRequest & { userId: string }, res);
  } catch (error) { next(error); }
};

export const createSimulationRouter = (service: SimulationService) => {
  const router = Router();
  router.use((req: AuthenticatedRequest, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const expectedUser = req.header("x-wattstatus-user");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && expectedUser && expectedUser !== req.userId) {
      return next(new ApiError(409, "A sessão mudou. Reabra a simulação antes de continuar."));
    }
    next();
  });
  router.get("/sources", route(async (req, res) => {
    res.json(await service.sources(req.userId));
  }));
  router.get("/properties/:propertyId/rooms/:roomId", route(async (req, res) => {
    const parsed = simulationRoomParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new ApiError(404, "Ambiente não encontrado.");
    res.json(await service.loadRoom(req.userId, parsed.data.propertyId, parsed.data.roomId));
  }));
  router.post("/resolve", route(async (req, res) => {
    const input = simulationResolveSchema.parse(req.body);
    res.json({ item: await service.resolveCatalog(input.catalogDeviceId) });
  }));
  router.post("/calculate", route(async (req, res) => {
    res.json(await service.calculate(req.userId, req.body));
  }));
  return router;
};
