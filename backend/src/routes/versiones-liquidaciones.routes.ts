import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";

import type { SesionPublica } from "../services/auth.service";
import { confirmarVersionLiquidaciones } from "../services/confirmar-version-liquidaciones.service";
import {
  analizarVersionLiquidaciones,
  ErrorVersionLiquidaciones,
  listarVersionesLiquidaciones,
  obtenerVersionLiquidaciones,
} from "../services/versiones-liquidaciones.service";

export const versionesLiquidacionesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});

function obtenerAdministrador(
  res: Response,
): NonNullable<SesionPublica["usuario"]> {
  const locals = res.locals as {
    sesion?: SesionPublica;
  };
  const sesion = locals.sesion;

  if (!sesion?.usuario || sesion.rol !== "ADMINISTRADOR") {
    throw new ErrorVersionLiquidaciones(
      "No se pudo identificar al administrador.",
      401,
    );
  }

  return sesion.usuario;
}

function obtenerIdVersion(req: Request): number {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorVersionLiquidaciones(
      "El identificador de la versión no es válido.",
    );
  }

  return id;
}

function responderError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof ErrorVersionLiquidaciones) {
    res.status(error.status).json({
      ok: false,
      message: error.message,
      data: null,
    });
    return;
  }

  next(error);
}

versionesLiquidacionesRouter.get(
  "/",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versiones = await listarVersionesLiquidaciones();

      res.status(200).json({
        ok: true,
        message: "Historial de liquidaciones obtenido correctamente.",
        data: versiones,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesLiquidacionesRouter.post(
  "/analizar",
  upload.single("liquidaciones"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);

      if (!req.file) {
        throw new ErrorVersionLiquidaciones(
          'Debes enviar Liquidaciones.txt en el campo "liquidaciones".',
        );
      }

      if (!/\.(txt|csv)$/i.test(req.file.originalname)) {
        throw new ErrorVersionLiquidaciones(
          "Solo se permiten archivos TXT o CSV.",
        );
      }

      const resultado = await analizarVersionLiquidaciones({
        archivo: {
          nombreArchivo: req.file.originalname,
          buffer: req.file.buffer,
        },
        usuarioId: administrador.id,
        comentario:
          typeof req.body.comentario === "string"
            ? req.body.comentario
            : null,
      });

      res.status(201).json({
        ok: true,
        message:
          resultado.totales.errores === 0
            ? "El archivo fue validado y puede confirmarse."
            : "El archivo fue analizado, pero contiene errores.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesLiquidacionesRouter.post(
  "/:id/confirmar",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);
      const versionLiquidacionesId = obtenerIdVersion(req);

      const resultado = await confirmarVersionLiquidaciones({
        versionLiquidacionesId,
        usuarioId: administrador.id,
      });

      res.status(200).json({
        ok: true,
        message:
          "La versión de liquidaciones fue confirmada y conciliada correctamente.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesLiquidacionesRouter.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versionLiquidacionesId = obtenerIdVersion(req);
      const version = await obtenerVersionLiquidaciones(
        versionLiquidacionesId,
      );

      res.status(200).json({
        ok: true,
        message: "Detalle de la versión obtenido correctamente.",
        data: version,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);
