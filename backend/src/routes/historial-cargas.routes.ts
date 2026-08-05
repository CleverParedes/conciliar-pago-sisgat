import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { prisma } from "../lib/prisma";

export const historialCargasRouter =
  Router();

historialCargasRouter.get(
  "/",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const [
        versionesPagos,
        versionesOrdenes,
        versionesLiquidaciones,
        versionesRequerimientos,
        versionesManuales,
      ] = await Promise.all([
        prisma.versionPagosSisgat.findMany({
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            codigo: true,
            estado: true,
            comentario: true,
            totalDeclaraciones: true,
            totalRecibos: true,
            totalErrores: true,
            totalAdvertencias: true,
            fechaAnalisis: true,
            fechaAplicacion: true,
            createdAt: true,
            usuario: {
              select: {
                id: true,
                nombre: true,
                nombreUsuario: true,
              },
            },
            archivo: {
              select: {
                nombreArchivo: true,
                tamanoOriginal: true,
                totalFilas: true,
                filasValidas: true,
                filasConError: true,
              },
            },
          },
        }),

        prisma.versionOrdenes.findMany({
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            codigo: true,
            estado: true,
            comentario: true,
            totalOrdenes: true,
            totalDetalles: true,
            totalErrores: true,
            fechaAnalisis: true,
            fechaAplicacion: true,
            createdAt: true,
            usuario: {
              select: {
                id: true,
                nombre: true,
                nombreUsuario: true,
              },
            },
            archivo: {
              select: {
                nombreArchivo: true,
                tamanoOriginal: true,
                totalFilas: true,
                filasValidas: true,
                filasConError: true,
              },
            },
          },
        }),

        prisma.versionLiquidaciones.findMany({
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            codigo: true,
            estado: true,
            comentario: true,
            totalLiquidaciones: true,
            totalDetalles: true,
            totalErrores: true,
            fechaAnalisis: true,
            fechaAplicacion: true,
            createdAt: true,
            usuario: {
              select: {
                id: true,
                nombre: true,
                nombreUsuario: true,
              },
            },
            archivo: {
              select: {
                nombreArchivo: true,
                tamanoOriginal: true,
                totalFilas: true,
                filasValidas: true,
                filasConError: true,
              },
            },
          },
        }),

        prisma.versionRequerimientos.findMany({
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            codigo: true,
            estado: true,
            comentario: true,
            totalRequerimientos: true,
            totalDetalles: true,
            totalErrores: true,
            fechaAnalisis: true,
            fechaAplicacion: true,
            createdAt: true,
            usuario: {
              select: {
                id: true,
                nombre: true,
                nombreUsuario: true,
              },
            },
            archivo: {
              select: {
                nombreArchivo: true,
                tamanoOriginal: true,
                totalFilas: true,
                filasValidas: true,
                filasConError: true,
              },
            },
          },
        }),

        prisma.versionRequerimientosManuales.findMany({
          orderBy: {
            createdAt: "desc",
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
            totalAdvertencias: true,
            fechaAnalisis: true,
            fechaAplicacion: true,
            createdAt: true,
            usuario: {
              select: {
                id: true,
                nombre: true,
                nombreUsuario: true,
              },
            },
            archivo: {
              select: {
                nombreArchivo: true,
                nombreHoja: true,
                tamanoOriginal: true,
                totalFilas: true,
                filasValidas: true,
                filasConError: true,
              },
            },
          },
        }),
      ]);

      const historial = [
        ...versionesPagos.map(
          (version) => ({
            clave:
              `PAGOS_SISGAT:${version.id}`,
            tipo: "PAGOS_SISGAT",
            tipoEtiqueta:
              "Declaraciones y pagos SisGAT",
            versionId: version.id,
            codigo: version.codigo,
            estado: version.estado,
            comentario:
              version.comentario,
            principal: {
              etiqueta: "Declaraciones",
              total:
                version.totalDeclaraciones,
            },
            secundario: {
              etiqueta: "Recibos",
              total:
                version.totalRecibos,
            },
            totalErrores:
              version.totalErrores,
            totalAdvertencias:
              version.totalAdvertencias,
            anioGestion: null,
            fechaAnalisis:
              version.fechaAnalisis,
            fechaAplicacion:
              version.fechaAplicacion,
            createdAt: version.createdAt,
            usuario: version.usuario,
            archivo: version.archivo
              ? {
                  nombre:
                    version.archivo
                      .nombreArchivo,
                  hoja: null,
                  tamano:
                    version.archivo
                      .tamanoOriginal,
                  totalFilas:
                    version.archivo
                      .totalFilas,
                  filasValidas:
                    version.archivo
                      .filasValidas,
                  filasConError:
                    version.archivo
                      .filasConError,
                }
              : null,
          }),
        ),

        ...versionesOrdenes.map(
          (version) => ({
            clave:
              `ORDENES:${version.id}`,
            tipo: "ORDENES",
            tipoEtiqueta:
              "Órdenes de pago",
            versionId: version.id,
            codigo: version.codigo,
            estado: version.estado,
            comentario:
              version.comentario,
            principal: {
              etiqueta: "Órdenes",
              total:
                version.totalOrdenes,
            },
            secundario: {
              etiqueta: "Periodos",
              total:
                version.totalDetalles,
            },
            totalErrores:
              version.totalErrores,
            totalAdvertencias: 0,
            anioGestion: null,
            fechaAnalisis:
              version.fechaAnalisis,
            fechaAplicacion:
              version.fechaAplicacion,
            createdAt: version.createdAt,
            usuario: version.usuario,
            archivo: version.archivo
              ? {
                  nombre:
                    version.archivo
                      .nombreArchivo,
                  hoja: null,
                  tamano:
                    version.archivo
                      .tamanoOriginal,
                  totalFilas:
                    version.archivo
                      .totalFilas,
                  filasValidas:
                    version.archivo
                      .filasValidas,
                  filasConError:
                    version.archivo
                      .filasConError,
                }
              : null,
          }),
        ),

        ...versionesLiquidaciones.map(
          (version) => ({
            clave:
              `LIQUIDACIONES:${version.id}`,
            tipo: "LIQUIDACIONES",
            tipoEtiqueta:
              "Liquidaciones",
            versionId: version.id,
            codigo: version.codigo,
            estado: version.estado,
            comentario:
              version.comentario,
            principal: {
              etiqueta: "Liquidaciones",
              total:
                version.totalLiquidaciones,
            },
            secundario: {
              etiqueta: "Periodos",
              total:
                version.totalDetalles,
            },
            totalErrores:
              version.totalErrores,
            totalAdvertencias: 0,
            anioGestion: null,
            fechaAnalisis:
              version.fechaAnalisis,
            fechaAplicacion:
              version.fechaAplicacion,
            createdAt: version.createdAt,
            usuario: version.usuario,
            archivo: version.archivo
              ? {
                  nombre:
                    version.archivo
                      .nombreArchivo,
                  hoja: null,
                  tamano:
                    version.archivo
                      .tamanoOriginal,
                  totalFilas:
                    version.archivo
                      .totalFilas,
                  filasValidas:
                    version.archivo
                      .filasValidas,
                  filasConError:
                    version.archivo
                      .filasConError,
                }
              : null,
          }),
        ),

        ...versionesRequerimientos.map(
          (version) => ({
            clave:
              `REQUERIMIENTOS_SISGAT:${version.id}`,
            tipo:
              "REQUERIMIENTOS_SISGAT",
            tipoEtiqueta:
              "Requerimientos SisGAT",
            versionId: version.id,
            codigo: version.codigo,
            estado: version.estado,
            comentario:
              version.comentario,
            principal: {
              etiqueta:
                "Requerimientos",
              total:
                version.totalRequerimientos,
            },
            secundario: {
              etiqueta: "Periodos",
              total:
                version.totalDetalles,
            },
            totalErrores:
              version.totalErrores,
            totalAdvertencias: 0,
            anioGestion: null,
            fechaAnalisis:
              version.fechaAnalisis,
            fechaAplicacion:
              version.fechaAplicacion,
            createdAt: version.createdAt,
            usuario: version.usuario,
            archivo: version.archivo
              ? {
                  nombre:
                    version.archivo
                      .nombreArchivo,
                  hoja: null,
                  tamano:
                    version.archivo
                      .tamanoOriginal,
                  totalFilas:
                    version.archivo
                      .totalFilas,
                  filasValidas:
                    version.archivo
                      .filasValidas,
                  filasConError:
                    version.archivo
                      .filasConError,
                }
              : null,
          }),
        ),

        ...versionesManuales.map(
          (version) => ({
            clave:
              `REQUERIMIENTOS_MANUALES:${version.id}`,
            tipo:
              "REQUERIMIENTOS_MANUALES",
            tipoEtiqueta:
              "Requerimientos manuales",
            versionId: version.id,
            codigo: version.codigo,
            estado: version.estado,
            comentario:
              version.comentario,
            principal: {
              etiqueta: "Registros",
              total:
                version.totalRegistros,
            },
            secundario: {
              etiqueta: "Periodos",
              total:
                version.totalPeriodos,
            },
            totalErrores:
              version.totalErrores,
            totalAdvertencias:
              version.totalAdvertencias,
            anioGestion:
              version.anioGestion,
            fechaAnalisis:
              version.fechaAnalisis,
            fechaAplicacion:
              version.fechaAplicacion,
            createdAt: version.createdAt,
            usuario: version.usuario,
            archivo: version.archivo
              ? {
                  nombre:
                    version.archivo
                      .nombreArchivo,
                  hoja:
                    version.archivo
                      .nombreHoja,
                  tamano:
                    version.archivo
                      .tamanoOriginal,
                  totalFilas:
                    version.archivo
                      .totalFilas,
                  filasValidas:
                    version.archivo
                      .filasValidas,
                  filasConError:
                    version.archivo
                      .filasConError,
                }
              : null,
          }),
        ),
      ].sort(
        (a, b) =>
          new Date(
            b.fechaAplicacion ??
              b.fechaAnalisis ??
              b.createdAt,
          ).getTime() -
          new Date(
            a.fechaAplicacion ??
              a.fechaAnalisis ??
              a.createdAt,
          ).getTime(),
      );

      res.status(200).json({
        ok: true,
        message:
          "Historial unificado obtenido correctamente.",
        data: historial,
      });
    } catch (error) {
      next(error);
    }
  },
);
