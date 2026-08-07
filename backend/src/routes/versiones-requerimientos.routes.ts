import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";

import type { SesionPublica } from "../services/auth.service";
import { confirmarVersionRequerimientos } from "../services/confirmar-version-requerimientos.service";
import {
  probarArchivoRequerimientos,
  analizarVersionRequerimientos,
  ErrorVersionRequerimientos,
  listarVersionesRequerimientos,
  obtenerVersionRequerimientos,
} from "../services/versiones-requerimientos.service";

export const versionesRequerimientosRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!/\.(txt|csv)$/i.test(file.originalname)) {
      callback(
        new ErrorVersionRequerimientos(
          "Solo se permiten archivos TXT o CSV.",
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

  if (
    !locals.sesion?.usuario ||
    locals.sesion.rol !== "ADMINISTRADOR"
  ) {
    throw new ErrorVersionRequerimientos(
      "No se pudo identificar al administrador.",
      401,
    );
  }

  return locals.sesion.usuario;
}

function obtenerIdVersion(req: Request): number {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorVersionRequerimientos(
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
  if (error instanceof ErrorVersionRequerimientos) {
    res.status(error.status).json({
      ok: false,
      message: error.message,
      data: null,
    });
    return;
  }

  next(error);
}

versionesRequerimientosRouter.get(
  "/",
  async (_req, res, next): Promise<void> => {
    try {
      const versiones = await listarVersionesRequerimientos();

      res.status(200).json({
        ok: true,
        message: "Historial de Requerimientos SisGAT obtenido correctamente.",
        data: versiones,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesRequerimientosRouter.post(
  "/probar",
  upload.single("requerimientos"),
  async (req, res, next): Promise<void> => {
    try {
      obtenerAdministrador(res);

      if (!req.file) {
        throw new ErrorVersionRequerimientos(
          'Debes enviar el reporte en el campo "requerimientos".',
        );
      }

      const resultado = probarArchivoRequerimientos({
        nombreArchivo: req.file.originalname,
        buffer: req.file.buffer,
      });

      res.status(200).json({
        ok: true,
        message:
          resultado.puedeConfirmarse
            ? "Prueba completada: el archivo es válido. No se creó ninguna versión ni se modificaron datos."
            : "Prueba completada: se detectaron errores. No se creó ninguna versión ni se modificaron datos.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesRequerimientosRouter.post(
  "/analizar",
  upload.single("requerimientos"),
  async (req, res, next): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);

      if (!req.file) {
        throw new ErrorVersionRequerimientos(
          'Debes enviar el reporte en el campo "requerimientos".',
        );
      }

      const resultado = await analizarVersionRequerimientos({
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
          ? "El archivo fue validado y puede confirmarse."
          : "El archivo fue analizado, pero contiene errores.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesRequerimientosRouter.post(
  "/:id/confirmar",
  async (req, res, next): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);
      const versionRequerimientosId = obtenerIdVersion(req);

      const resultado = await confirmarVersionRequerimientos({
        versionRequerimientosId,
        usuarioId: administrador.id,
      });

      res.status(200).json({
        ok: true,
        message:
          "La versión de Requerimientos SisGAT fue confirmada y conciliada correctamente.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesRequerimientosRouter.get(
  "/:id",
  async (req, res, next): Promise<void> => {
    try {
      const version = await obtenerVersionRequerimientos(
        obtenerIdVersion(req),
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
