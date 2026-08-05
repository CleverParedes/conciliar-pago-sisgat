import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  ejecutarConciliacion,
} from "../services/conciliacion.service";

const router = Router();

router.post(
  "/ejecutar",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const resultado =
        await ejecutarConciliacion();

      res.status(200).json({
        ok: true,
        message:
          "La conciliación fue ejecutada correctamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

export {
  router as conciliacionRouter,
};