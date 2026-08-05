import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";

import type { SesionPublica } from "../services/auth.service";
import { confirmarVersionRequerimientosManuales } from "../services/confirmar-version-requerimientos-manuales.service";
import {
  analizarVersionRequerimientosManuales,
  ErrorVersionRequerimientosManuales,
  listarVersionesRequerimientosManuales,
} from "../services/versiones-requerimientos-manuales.service";

export const versionesRequerimientosManualesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      callback(
        new ErrorVersionRequerimientosManuales(
          "Solo se permiten archivos Excel con extensión .xlsx.",
        ),
      );
      return;
    }

    callback(null, true);
  },
});

function obtenerAdministrador(
  res: Response,
): NonNullable<SesionPublica["usuario"]> {
  const locals = res.locals as {
    sesion?: SesionPublica;
  };

  if (!locals.sesion?.usuario || locals.sesion.rol !== "ADMINISTRADOR") {
    throw new ErrorVersionRequerimientosManuales(
      "No se pudo identificar al administrador.",
      401,
    );
  }

  return locals.sesion.usuario;
}

function obtenerIdVersion(req: Request): number {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorVersionRequerimientosManuales(
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
  if (error instanceof ErrorVersionRequerimientosManuales) {
    res.status(error.status).json({
      ok: false,
      message: error.message,
      data: null,
    });
    return;
  }

  next(error);
}

versionesRequerimientosManualesRouter.get(
  "/",
  async (_req, res, next): Promise<void> => {
    try {
      const versiones = await listarVersionesRequerimientosManuales();

      res.status(200).json({
        ok: true,
        message: "Historial de Requerimientos manuales obtenido correctamente.",
        data: versiones,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesRequerimientosManualesRouter.post(
  "/analizar",
  upload.single("archivo"),
  async (req, res, next): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);

      if (!req.file) {
        throw new ErrorVersionRequerimientosManuales(
          'Debes enviar el Excel en el campo "archivo".',
        );
      }

      const resultado = await analizarVersionRequerimientosManuales({
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
        message: resultado.puedeConfirmarse
          ? "El Excel fue validado y puede confirmarse."
          : "El Excel fue analizado, pero contiene errores.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesRequerimientosManualesRouter.post(
  "/:id/confirmar",
  async (req, res, next): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);
      const versionRequerimientosManualesId = obtenerIdVersion(req);

      const resultado = await confirmarVersionRequerimientosManuales({
        versionRequerimientosManualesId,
        usuarioId: administrador.id,
      });

      res.status(200).json({
        ok: true,
        message:
          "La versión de Requerimientos manuales fue aplicada mediante reemplazo completo y luego conciliada.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);
