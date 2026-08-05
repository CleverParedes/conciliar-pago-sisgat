import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import multer from "multer";

import {
  EstadoVersionDatos,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

import type { SesionPublica } from "../services/auth.service";

import { confirmarVersionDatos } from "../services/confirmar-version-datos.service";

import { restaurarVersionDatos } from "../services/restaurar-version-datos.service";

import {
  analizarVersionDatos,
  ErrorVersionDatos,
  listarVersionesDatos,
  obtenerVersionDatos,
} from "../services/versiones-datos.service";

export const versionesDatosRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 25 * 1024 * 1024,

    files: 2,
  },

  fileFilter: (_req, file, callback) => {
    if (!/\.(txt|csv)$/i.test(file.originalname)) {
      callback(new ErrorVersionDatos("Solo se permiten archivos TXT o CSV."));

      return;
    }

    callback(null, true);
  },
});

function obtenerArchivo(
  req: Request,
  campo: string,
): Express.Multer.File | null {
  if (!req.files || Array.isArray(req.files)) {
    return null;
  }

  return req.files[campo]?.[0] ?? null;
}

function obtenerAdministrador(
  res: Response,
): NonNullable<SesionPublica["usuario"]> {
  const locals = res.locals as {
    sesion?: SesionPublica;
  };

  const sesion = locals.sesion;

  if (!sesion?.usuario || sesion.rol !== "ADMINISTRADOR") {
    throw new ErrorVersionDatos(
      "No se pudo identificar al administrador.",
      401,
    );
  }

  return sesion.usuario;
}

function obtenerIdVersion(req: Request): number {
  const versionDatosId = Number(req.params.id);

  if (!Number.isInteger(versionDatosId) || versionDatosId <= 0) {
    throw new ErrorVersionDatos(
      "El identificador de la versión no es válido.",
    );
  }

  return versionDatosId;
}


versionesDatosRouter.get(
  "/centro-actualizacion",

  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const [
        versionDatos,
        versionOrdenes,
        versionPagosSisgat,
        versionLiquidaciones,
        versionRequerimientos,
        versionRequerimientosManuales,
      ] = await Promise.all([
        prisma.versionDatos.findFirst({
          where: {
            estado:
              EstadoVersionDatos.ACTIVA,
          },
          orderBy: {
            fechaAplicacion:
              "desc",
          },
          select: {
            id: true,
            codigo: true,
            estado: true,
            comentario: true,
            totalOrdenes: true,
            totalDeclaraciones:
              true,
            totalRecibos: true,
            totalErrores: true,
            fechaAplicacion:
              true,
          },
        }),

        prisma.versionOrdenes
          .findFirst({
            where: {
              estado:
                EstadoVersionDatos
                  .ACTIVA,
            },
            orderBy: {
              fechaAplicacion:
                "desc",
            },
            select: {
              id: true,
              codigo: true,
              estado: true,
              comentario: true,
              totalOrdenes: true,
              totalDetalles: true,
              totalErrores: true,
              fechaAplicacion:
                true,
            },
          }),

        prisma.versionPagosSisgat
          .findFirst({
            where: {
              estado:
                EstadoVersionDatos
                  .ACTIVA,
            },
            orderBy: {
              fechaAplicacion:
                "desc",
            },
            select: {
              id: true,
              codigo: true,
              estado: true,
              comentario: true,
              totalDeclaraciones:
                true,
              totalRecibos: true,
              totalErrores: true,
              totalAdvertencias:
                true,
              fechaAplicacion:
                true,
            },
          }),

        prisma.versionLiquidaciones
          .findFirst({
            where: {
              estado:
                EstadoVersionDatos
                  .ACTIVA,
            },
            orderBy: {
              fechaAplicacion:
                "desc",
            },
            select: {
              id: true,
              codigo: true,
              estado: true,
              comentario: true,
              totalLiquidaciones:
                true,
              totalDetalles: true,
              totalErrores: true,
              fechaAplicacion:
                true,
            },
          }),

        prisma.versionRequerimientos
          .findFirst({
            where: {
              estado:
                EstadoVersionDatos
                  .ACTIVA,
            },
            orderBy: {
              fechaAplicacion:
                "desc",
            },
            select: {
              id: true,
              codigo: true,
              estado: true,
              comentario: true,
              totalRequerimientos:
                true,
              totalDetalles: true,
              totalErrores: true,
              fechaAplicacion:
                true,
            },
          }),

        prisma
          .versionRequerimientosManuales
          .findFirst({
            where: {
              estado:
                EstadoVersionDatos
                  .ACTIVA,
            },
            orderBy: {
              fechaAplicacion:
                "desc",
            },
            select: {
              id: true,
              codigo: true,
              estado: true,
              comentario: true,
              anioGestion: true,
              totalRegistros: true,
              totalPeriodos: true,
              totalErrores: true,
              totalAdvertencias:
                true,
              fechaAplicacion:
                true,
            },
          }),
      ]);

      res.status(200).json({
        ok: true,

        message:
          "Resumen del centro de actualización obtenido correctamente.",

        data: {
          pagosSisgat:
            versionPagosSisgat
              ? {
                  disponible: true,
                  versionId:
                    versionPagosSisgat.id,
                  codigo:
                    versionPagosSisgat.codigo,
                  estado:
                    versionPagosSisgat.estado,
                  fechaAplicacion:
                    versionPagosSisgat
                      .fechaAplicacion,
                  totalPrincipal:
                    versionPagosSisgat
                      .totalDeclaraciones,
                  etiquetaPrincipal:
                    "Declaraciones",
                  totalSecundario:
                    versionPagosSisgat
                      .totalRecibos,
                  etiquetaSecundaria:
                    "Recibos",
                  totalErrores:
                    versionPagosSisgat
                      .totalErrores,
                  totalAdvertencias:
                    versionPagosSisgat
                      .totalAdvertencias,
                  comentario:
                    versionPagosSisgat
                      .comentario,
                  versionCompartida:
                    false,
                }
              : {
                  disponible: false,
                  versionCompartida:
                    false,
                },

          ordenes:
            versionOrdenes
              ? {
                  disponible: true,
                  versionId:
                    versionOrdenes.id,
                  codigo:
                    versionOrdenes.codigo,
                  estado:
                    versionOrdenes.estado,
                  fechaAplicacion:
                    versionOrdenes
                      .fechaAplicacion,
                  totalPrincipal:
                    versionOrdenes
                      .totalOrdenes,
                  etiquetaPrincipal:
                    "Órdenes",
                  totalSecundario:
                    versionOrdenes
                      .totalDetalles,
                  etiquetaSecundaria:
                    "Periodos",
                  totalErrores:
                    versionOrdenes
                      .totalErrores,
                  comentario:
                    versionOrdenes
                      .comentario,
                  versionCompartida:
                    false,
                }
              : versionDatos
                ? {
                    disponible: true,
                    versionId:
                      versionDatos.id,
                    codigo:
                      versionDatos.codigo,
                    estado:
                      versionDatos.estado,
                    fechaAplicacion:
                      versionDatos
                        .fechaAplicacion,
                    totalPrincipal:
                      versionDatos
                        .totalOrdenes,
                    etiquetaPrincipal:
                      "Órdenes",
                    totalSecundario:
                      null,
                    etiquetaSecundaria:
                      null,
                    totalErrores:
                      versionDatos
                        .totalErrores,
                    comentario:
                      versionDatos
                        .comentario,
                    versionCompartida:
                      true,
                  }
                : {
                    disponible: false,
                    versionCompartida:
                      false,
                  },

          liquidaciones:
            versionLiquidaciones
              ? {
                  disponible: true,
                  versionId:
                    versionLiquidaciones
                      .id,
                  codigo:
                    versionLiquidaciones
                      .codigo,
                  estado:
                    versionLiquidaciones
                      .estado,
                  fechaAplicacion:
                    versionLiquidaciones
                      .fechaAplicacion,
                  totalPrincipal:
                    versionLiquidaciones
                      .totalLiquidaciones,
                  etiquetaPrincipal:
                    "Liquidaciones",
                  totalSecundario:
                    versionLiquidaciones
                      .totalDetalles,
                  etiquetaSecundaria:
                    "Periodos",
                  totalErrores:
                    versionLiquidaciones
                      .totalErrores,
                  comentario:
                    versionLiquidaciones
                      .comentario,
                  versionCompartida:
                    false,
                }
              : {
                  disponible: false,
                  versionCompartida:
                    false,
                },

          requerimientosSisgat:
            versionRequerimientos
              ? {
                  disponible: true,
                  versionId:
                    versionRequerimientos
                      .id,
                  codigo:
                    versionRequerimientos
                      .codigo,
                  estado:
                    versionRequerimientos
                      .estado,
                  fechaAplicacion:
                    versionRequerimientos
                      .fechaAplicacion,
                  totalPrincipal:
                    versionRequerimientos
                      .totalRequerimientos,
                  etiquetaPrincipal:
                    "Requerimientos",
                  totalSecundario:
                    versionRequerimientos
                      .totalDetalles,
                  etiquetaSecundaria:
                    "Periodos",
                  totalErrores:
                    versionRequerimientos
                      .totalErrores,
                  comentario:
                    versionRequerimientos
                      .comentario,
                  versionCompartida:
                    false,
                }
              : {
                  disponible: false,
                  versionCompartida:
                    false,
                },

          requerimientosManuales:
            versionRequerimientosManuales
              ? {
                  disponible: true,
                  versionId:
                    versionRequerimientosManuales
                      .id,
                  codigo:
                    versionRequerimientosManuales
                      .codigo,
                  estado:
                    versionRequerimientosManuales
                      .estado,
                  fechaAplicacion:
                    versionRequerimientosManuales
                      .fechaAplicacion,
                  totalPrincipal:
                    versionRequerimientosManuales
                      .totalRegistros,
                  etiquetaPrincipal:
                    "Registros",
                  totalSecundario:
                    versionRequerimientosManuales
                      .totalPeriodos,
                  etiquetaSecundaria:
                    "Periodos",
                  totalErrores:
                    versionRequerimientosManuales
                      .totalErrores,
                  totalAdvertencias:
                    versionRequerimientosManuales
                      .totalAdvertencias,
                  anioGestion:
                    versionRequerimientosManuales
                      .anioGestion,
                  comentario:
                    versionRequerimientosManuales
                      .comentario,
                  versionCompartida:
                    false,
                }
              : {
                  disponible: false,
                  versionCompartida:
                    false,
                },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesDatosRouter.get(
  "/",

  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versiones = await listarVersionesDatos();

      res.status(200).json({
        ok: true,

        message: "Historial de versiones obtenido correctamente.",

        data: versiones,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesDatosRouter.get(
  "/:id",

  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versionDatosId = obtenerIdVersion(req);

      const version = await obtenerVersionDatos(versionDatosId);

      res.status(200).json({
        ok: true,

        message: "Detalle de la versión obtenido correctamente.",

        data: version,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesDatosRouter.post(
  "/analizar",

  upload.fields([
    {
      name: "ordenes",
      maxCount: 1,
    },
    {
      name: "declaracionesPagos",
      maxCount: 1,
    },
  ]),

  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ordenes = obtenerArchivo(req, "ordenes");

      const declaracionesPagos = obtenerArchivo(req, "declaracionesPagos");

      if (!ordenes) {
        throw new ErrorVersionDatos(
          'Debes enviar el archivo de órdenes en el campo "ordenes".',
        );
      }

      if (!declaracionesPagos) {
        throw new ErrorVersionDatos(
          'Debes enviar el archivo de declaraciones y pagos en el campo "declaracionesPagos".',
        );
      }

      const administrador = obtenerAdministrador(res);

      const resultado = await analizarVersionDatos({
        ordenes: {
          nombreArchivo: ordenes.originalname,

          buffer: ordenes.buffer,
        },

        declaracionesPagos: {
          nombreArchivo: declaracionesPagos.originalname,

          buffer: declaracionesPagos.buffer,
        },

        usuarioId: administrador.id,

        comentario:
          typeof req.body.comentario === "string" ? req.body.comentario : null,
      });

      res.status(201).json({
        ok: true,

        message: resultado.puedeConfirmarse
          ? resultado.requiereRevisionAjustes
            ? "Los archivos fueron analizados. Existen ajustes automáticos que el administrador debe revisar antes de confirmar."
            : "Los archivos fueron analizados correctamente y están listos para confirmar."
          : "El análisis terminó con errores. La versión no puede confirmarse.",

        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesDatosRouter.post(
  "/:id/confirmar",

  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versionDatosId = obtenerIdVersion(req);

      const administrador = obtenerAdministrador(res);

      const resultado = await confirmarVersionDatos({
        versionDatosId,

        usuarioId: administrador.id,

        ajustesRevisados: req.body.ajustesRevisados === true,
      });

      res.status(200).json({
        ok: true,

        message:
          "La versión fue confirmada y la conciliación se actualizó correctamente.",

        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesDatosRouter.post(
  "/:id/restaurar",

  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const versionDatosId = obtenerIdVersion(req);

      const administrador = obtenerAdministrador(res);

      const resultado = await restaurarVersionDatos({
        versionDatosId,

        usuarioId: administrador.id,
      });

      res.status(200).json({
        ok: true,

        message:
          "La versión fue restaurada y la conciliación se actualizó correctamente.",

        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

versionesDatosRouter.use(
  (error: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (error instanceof ErrorVersionDatos) {
      res.status(error.status).json({
        ok: false,

        message: error.message,

        data: null,
      });

      return;
    }

    if (error instanceof multer.MulterError) {
      const mensaje =
        error.code === "LIMIT_FILE_SIZE"
          ? "Uno de los archivos supera el límite de 25 MB."
          : "No se pudieron recibir los archivos.";

      res.status(400).json({
        ok: false,
        message: mensaje,
        data: null,
      });

      return;
    }

    next(error);
  },
);