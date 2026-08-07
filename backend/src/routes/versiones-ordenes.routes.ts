import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";

import type {
  SesionPublica,
} from "../services/auth.service";
import {
  confirmarVersionOrdenes,
} from "../services/confirmar-version-ordenes.service";
import {
  probarArchivoOrdenes,
  analizarVersionOrdenes,
  ErrorVersionOrdenes,
  listarVersionesOrdenes,
  obtenerVersionOrdenes,
} from "../services/versiones-ordenes.service";

export const versionesOrdenesRouter =
  Router();

const upload = multer({
  storage:
    multer.memoryStorage(),
  limits: {
    fileSize:
      25 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (
    _req,
    file,
    callback,
  ) => {
    if (
      !/\.(txt|csv)$/i.test(
        file.originalname,
      )
    ) {
      callback(
        new ErrorVersionOrdenes(
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
): NonNullable<
  SesionPublica["usuario"]
> {
  const locals =
    res.locals as {
      sesion?: SesionPublica;
    };

  if (
    !locals.sesion?.usuario ||
    locals.sesion.rol !==
      "ADMINISTRADOR"
  ) {
    throw new ErrorVersionOrdenes(
      "No se pudo identificar al administrador.",
      401,
    );
  }

  return locals.sesion.usuario;
}

function obtenerIdVersion(
  req: Request,
): number {
  const id =
    Number(req.params.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new ErrorVersionOrdenes(
      "El identificador de la versión no es válido.",
    );
  }

  return id;
}

versionesOrdenesRouter.get(
  "/",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const versiones =
        await listarVersionesOrdenes();

      res.status(200).json({
        ok: true,
        message:
          "Historial de órdenes obtenido correctamente.",
        data: versiones,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesOrdenesRouter.get(
  "/:id",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const version =
        await obtenerVersionOrdenes(
          obtenerIdVersion(req),
        );

      res.status(200).json({
        ok: true,
        message:
          "Detalle de la versión obtenido correctamente.",
        data: version,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesOrdenesRouter.post(
  "/probar",
  upload.single("archivo"),
  async (req, res, next): Promise<void> => {
    try {
      obtenerAdministrador(res);

      if (!req.file) {
        throw new ErrorVersionOrdenes(
          'Debes enviar el reporte de órdenes en el campo "archivo".',
        );
      }

      const resultado = probarArchivoOrdenes({
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
      next(error);
    }
  },
);

versionesOrdenesRouter.post(
  "/analizar",
  upload.single("archivo"),
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.file) {
        throw new ErrorVersionOrdenes(
          'Debes enviar el reporte de órdenes en el campo "archivo".',
        );
      }

      const administrador =
        obtenerAdministrador(res);

      const resultado =
        await analizarVersionOrdenes({
          archivo: {
            nombreArchivo:
              req.file.originalname,
            buffer:
              req.file.buffer,
          },
          usuarioId:
            administrador.id,
          comentario:
            typeof req.body
              .comentario ===
            "string"
              ? req.body.comentario
              : null,
        });

      res.status(201).json({
        ok: true,
        message:
          resultado.puedeConfirmarse
            ? "El archivo fue validado y está listo para confirmar."
            : "El análisis terminó con errores.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesOrdenesRouter.post(
  "/:id/confirmar",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const administrador =
        obtenerAdministrador(res);

      const resultado =
        await confirmarVersionOrdenes({
          versionOrdenesId:
            obtenerIdVersion(req),
          usuarioId:
            administrador.id,
        });

      res.status(200).json({
        ok: true,
        message:
          "Las órdenes fueron actualizadas y conciliadas contra los pagos SisGAT activos.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesOrdenesRouter.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (
      error instanceof
      ErrorVersionOrdenes
    ) {
      res.status(error.status).json({
        ok: false,
        message: error.message,
        data: null,
      });
      return;
    }

    if (
      error instanceof
      multer.MulterError
    ) {
      res.status(400).json({
        ok: false,
        message:
          error.code ===
          "LIMIT_FILE_SIZE"
            ? "El archivo supera el límite de 25 MB."
            : "No se pudo recibir el archivo.",
        data: null,
      });
      return;
    }

    next(error);
  },
);
