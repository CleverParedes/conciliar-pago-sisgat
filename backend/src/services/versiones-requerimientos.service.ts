import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import { analizarArchivoRequerimientos } from "./importadores/analizar-requerimientos";

const MAXIMO_ERRORES_GUARDADOS = 1000;

export class ErrorVersionRequerimientos extends Error {
  public readonly status: number;

  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "ErrorVersionRequerimientos";
    this.status = status;
  }
}

interface AnalizarVersionRequerimientosInput {
  archivo: {
    nombreArchivo: string;
    buffer: Buffer;
  };
  usuarioId: number;
  comentario?: string | null;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function analizarVersionRequerimientos(
  input: AnalizarVersionRequerimientosInput,
) {
  const resultado = analizarArchivoRequerimientos(
    input.archivo.buffer,
    input.archivo.nombreArchivo,
  );

  const hashArchivo = hashBuffer(input.archivo.buffer);

  const versionAnterior = await prisma.versionRequerimientos.findUnique({
    where: {
      hashArchivo,
    },
    select: {
      id: true,
      codigo: true,
      estado: true,
    },
  });

  const esReanalisis =
    versionAnterior?.estado === EstadoVersionDatos.FALLIDA ||
    versionAnterior?.estado === EstadoVersionDatos.CANCELADA;

  if (versionAnterior && !esReanalisis) {
    throw new ErrorVersionRequerimientos(
      `Este archivo ya fue analizado en la versión ${versionAnterior.codigo}, ` +
        `cuyo estado actual es ${versionAnterior.estado}.`,
      409,
    );
  }

  const estado =
    resultado.filasConError === 0
      ? EstadoVersionDatos.VALIDADA
      : EstadoVersionDatos.FALLIDA;

  const contenidoGzip = gzipSync(input.archivo.buffer);

  const version = await prisma.$transaction(
    async (tx) => {
      if (versionAnterior && esReanalisis) {
        await tx.archivoVersionRequerimientos.deleteMany({
          where: {
            versionRequerimientosId: versionAnterior.id,
          },
        });
      }

      const datosVersion = {
        estado,
        usuarioId: input.usuarioId,
        comentario: input.comentario?.trim().slice(0, 500) || null,
        totalRequerimientos: resultado.totalRequerimientos,
        totalDetalles: resultado.totalDetalles,
        totalErrores: resultado.filasConError,
        fechaAnalisis: new Date(),
        fechaAplicacion: null,
      };

      const nuevaVersion =
        versionAnterior && esReanalisis
          ? await tx.versionRequerimientos.update({
              where: {
                id: versionAnterior.id,
              },
              data: datosVersion,
            })
          : await tx.versionRequerimientos.create({
              data: {
                hashArchivo,
                ...datosVersion,
              },
            });

      const archivo = await tx.archivoVersionRequerimientos.create({
        data: {
          versionRequerimientosId: nuevaVersion.id,
          nombreArchivo: input.archivo.nombreArchivo,
          hashArchivo,
          contenidoGzip,
          tamanoOriginal: input.archivo.buffer.length,
          tamanoComprimido: contenidoGzip.length,
          totalFilas: resultado.totalFilas,
          filasValidas: resultado.filasValidas,
          filasConError: resultado.filasConError,
          resumen: {
            totalRequerimientos: resultado.totalRequerimientos,
            totalDetalles: resultado.totalDetalles,
            activos: resultado.activos,
            anulados: resultado.anulados,
            porAnioRequerimiento: resultado.porAnioRequerimiento,
            porCantidadPeriodos: resultado.porCantidadPeriodos,
            erroresGuardados: Math.min(
              resultado.errores.length,
              MAXIMO_ERRORES_GUARDADOS,
            ),
            advertencias: resultado.advertencias.map((advertencia) => ({
              fila: advertencia.fila,
              tipo: advertencia.tipo,
              mensaje: advertencia.mensaje,
            })),
          } satisfies Prisma.InputJsonObject,
        },
      });

      const errores = resultado.errores.slice(
        0,
        MAXIMO_ERRORES_GUARDADOS,
      );

      if (errores.length > 0) {
        await tx.errorArchivoRequerimiento.createMany({
          data: errores.map((error) => ({
            archivoId: archivo.id,
            fila: error.fila,
            campo: error.campo,
            mensaje: error.mensaje,
            datosOriginales:
              error.datosOriginales satisfies Prisma.InputJsonObject,
          })),
        });
      }

      await tx.auditoria.create({
        data: {
          usuarioId: input.usuarioId,
          accion: esReanalisis
            ? "REANALIZAR_VERSION_REQUERIMIENTOS"
            : "ANALIZAR_VERSION_REQUERIMIENTOS",
          entidad: "VERSION_REQUERIMIENTOS",
          entidadId: String(nuevaVersion.id),
          resultado:
            resultado.filasConError > 0 ? "CON_ERRORES" : "CORRECTO",
          detalles: {
            codigo: nuevaVersion.codigo,
            totalRequerimientos: resultado.totalRequerimientos,
            totalDetalles: resultado.totalDetalles,
            activos: resultado.activos,
            anulados: resultado.anulados,
            totalErrores: resultado.filasConError,
            totalAdvertencias: resultado.advertencias.length,
            advertencias: resultado.advertencias.map((advertencia) => ({
              fila: advertencia.fila,
              tipo: advertencia.tipo,
              mensaje: advertencia.mensaje,
            })),
            reanalisis: esReanalisis,
          } satisfies Prisma.InputJsonObject,
        },
      });

      return nuevaVersion;
    },
    {
      maxWait: 10000,
      timeout: 60000,
    },
  );

  return {
    id: version.id,
    codigo: version.codigo,
    estado: version.estado,
    fechaAnalisis: version.fechaAnalisis,
    puedeConfirmarse: resultado.filasConError === 0,
    reanalisis: esReanalisis,
    totales: {
      requerimientos: resultado.totalRequerimientos,
      detalles: resultado.totalDetalles,
      activos: resultado.activos,
      anulados: resultado.anulados,
      errores: resultado.filasConError,
    },
    archivo: {
      nombre: input.archivo.nombreArchivo,
      totalFilas: resultado.totalFilas,
      filasValidas: resultado.filasValidas,
      filasConError: resultado.filasConError,
      errores: resultado.errores.slice(0, 20),
      advertencias: resultado.advertencias.slice(0, 20),
    },
  };
}

export async function listarVersionesRequerimientos() {
  return prisma.versionRequerimientos.findMany({
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
      updatedAt: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          nombreUsuario: true,
        },
      },
      archivo: {
        select: {
          id: true,
          nombreArchivo: true,
          tamanoOriginal: true,
          tamanoComprimido: true,
          totalFilas: true,
          filasValidas: true,
          filasConError: true,
          resumen: true,
        },
      },
      _count: {
        select: {
          importaciones: true,
          requerimientos: true,
        },
      },
    },
  });
}

export async function obtenerVersionRequerimientos(
  versionRequerimientosId: number,
) {
  const version = await prisma.versionRequerimientos.findUnique({
    where: {
      id: versionRequerimientosId,
    },
    select: {
      id: true,
      codigo: true,
      hashArchivo: true,
      estado: true,
      comentario: true,
      totalRequerimientos: true,
      totalDetalles: true,
      totalErrores: true,
      fechaAnalisis: true,
      fechaAplicacion: true,
      createdAt: true,
      updatedAt: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          nombreUsuario: true,
        },
      },
      archivo: {
        select: {
          id: true,
          nombreArchivo: true,
          hashArchivo: true,
          tamanoOriginal: true,
          tamanoComprimido: true,
          totalFilas: true,
          filasValidas: true,
          filasConError: true,
          resumen: true,
          errores: {
            orderBy: [
              {
                fila: "asc",
              },
              {
                id: "asc",
              },
            ],
            take: 100,
            select: {
              id: true,
              fila: true,
              campo: true,
              mensaje: true,
              datosOriginales: true,
              createdAt: true,
            },
          },
        },
      },
      importaciones: {
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
          tipo: true,
          origen: true,
          estado: true,
          nombreArchivo: true,
          totalFilas: true,
          filasCorrectas: true,
          filasConError: true,
          registrosNuevos: true,
          registrosActualizados: true,
          registrosSinCambios: true,
          fechaImportacion: true,
          fechaFinalizacion: true,
          mensaje: true,
        },
      },
      _count: {
        select: {
          requerimientos: true,
          importaciones: true,
        },
      },
    },
  });

  if (!version) {
    throw new ErrorVersionRequerimientos(
      "La versión de requerimientos solicitada no existe.",
      404,
    );
  }

  return version;
}
