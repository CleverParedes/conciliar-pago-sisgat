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
  confirmarVersionPagosSisgat,
} from "../services/confirmar-version-pagos-sisgat.service";
import {
  analizarVersionPagosSisgat,
  ErrorVersionPagosSisgat,
  listarVersionesPagosSisgat,
  obtenerVersionPagosSisgat,
} from "../services/versiones-pagos-sisgat.service";

export const versionesPagosSisgatRouter =
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
        new ErrorVersionPagosSisgat(
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
    throw new ErrorVersionPagosSisgat(
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
    throw new ErrorVersionPagosSisgat(
      "El identificador de la versión no es válido.",
    );
  }

  return id;
}

versionesPagosSisgatRouter.get(
  "/",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const versiones =
        await listarVersionesPagosSisgat();

      res.status(200).json({
        ok: true,
        message:
          "Historial de pagos SisGAT obtenido correctamente.",
        data: versiones,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesPagosSisgatRouter.get(
  "/:id",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const version =
        await obtenerVersionPagosSisgat(
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

versionesPagosSisgatRouter.post(
  "/analizar",
  upload.single("archivo"),
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.file) {
        throw new ErrorVersionPagosSisgat(
          'Debes enviar el reporte de pagos en el campo "archivo".',
        );
      }

      const administrador =
        obtenerAdministrador(res);

      const resultado =
        await analizarVersionPagosSisgat({
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
            ? resultado
                .requiereRevisionAjustes
              ? "El archivo fue validado. Revisa los ajustes automáticos antes de confirmar."
              : "El archivo fue validado y está listo para confirmar."
            : "El análisis terminó con errores.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesPagosSisgatRouter.post(
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
        await confirmarVersionPagosSisgat({
          versionPagosSisgatId:
            obtenerIdVersion(req),
          usuarioId:
            administrador.id,
          ajustesRevisados:
            req.body
              .ajustesRevisados ===
            true,
        });

      res.status(200).json({
        ok: true,
        message:
          "Los pagos SisGAT fueron actualizados y los cuatro módulos dependientes se recalcularon.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesPagosSisgatRouter.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (
      error instanceof
      ErrorVersionPagosSisgat
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
