import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import { ejecutarConciliacionRequerimientos } from "./conciliacion-requerimientos.service";
import { importarRequerimientosDesdeBuffer } from "./importadores/importar-requerimientos";
import { crearRespaldoDatabase } from "./respaldo-database.service";
import { ErrorVersionRequerimientos } from "./versiones-requerimientos.service";

interface ConfirmarVersionRequerimientosInput {
  versionRequerimientosId: number;
  usuarioId: number;
}

function obtenerHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function obtenerMensajeError(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido.";
}

export async function confirmarVersionRequerimientos(
  input: ConfirmarVersionRequerimientosInput,
) {
  const version = await prisma.versionRequerimientos.findUnique({
    where: {
      id: input.versionRequerimientosId,
    },
    include: {
      archivo: true,
    },
  });

  if (!version) {
    throw new ErrorVersionRequerimientos(
      "La versión de requerimientos solicitada no existe.",
      404,
    );
  }

  if (version.estado !== EstadoVersionDatos.VALIDADA) {
    throw new ErrorVersionRequerimientos(
      `La versión no puede confirmarse porque su estado actual es ${version.estado}.`,
      409,
    );
  }

  if (version.totalErrores > 0) {
    throw new ErrorVersionRequerimientos(
      "La versión contiene errores de validación y no puede confirmarse.",
      409,
    );
  }

  if (!version.archivo) {
    throw new ErrorVersionRequerimientos(
      "La versión no contiene el archivo de requerimientos.",
      409,
    );
  }

  let buffer: Buffer;

  try {
    buffer = gunzipSync(Buffer.from(version.archivo.contenidoGzip));
  } catch {
    throw new ErrorVersionRequerimientos(
      "No se pudo descomprimir el archivo almacenado en la versión.",
      409,
    );
  }

  if (obtenerHash(buffer) !== version.archivo.hashArchivo) {
    throw new ErrorVersionRequerimientos(
      "El archivo almacenado no supera la verificación de integridad.",
      409,
    );
  }

  try {
    await crearRespaldoDatabase({
      usuarioId: input.usuarioId,
      versionRequerimientosId: input.versionRequerimientosId,
      motivo: "CONFIRMAR_VERSION_REQUERIMIENTOS",
    });
  } catch (error) {
    throw new ErrorVersionRequerimientos(
      "La confirmación fue cancelada porque no se pudo crear el respaldo " +
        `automático: ${obtenerMensajeError(error)}`,
      500,
    );
  }

  const reserva = await prisma.versionRequerimientos.updateMany({
    where: {
      id: input.versionRequerimientosId,
      estado: EstadoVersionDatos.VALIDADA,
      totalErrores: 0,
    },
    data: {
      estado: EstadoVersionDatos.APLICANDO,
    },
  });

  if (reserva.count !== 1) {
    throw new ErrorVersionRequerimientos(
      "La versión ya está siendo procesada o cambió de estado.",
      409,
    );
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        /*
         * Solo se reemplazan requerimientos.
         * Órdenes, declaraciones, recibos, usuarios y contribuyentes
         * permanecen disponibles.
         */
        await tx.requerimiento.deleteMany();

        const importacion = await importarRequerimientosDesdeBuffer(
          buffer,
          version.archivo!.nombreArchivo,
          {
            cliente: tx,
            versionRequerimientosId: version.id,
            usuarioId: input.usuarioId,
          },
        );

        const conciliacion = await ejecutarConciliacionRequerimientos(tx);

        await tx.versionRequerimientos.updateMany({
          where: {
            estado: EstadoVersionDatos.ACTIVA,
            id: {
              not: version.id,
            },
          },
          data: {
            estado: EstadoVersionDatos.ARCHIVADA,
          },
        });

        const versionActiva = await tx.versionRequerimientos.update({
          where: {
            id: version.id,
          },
          data: {
            estado: EstadoVersionDatos.ACTIVA,
            fechaAplicacion: new Date(),
          },
        });

        const [totalRequerimientos, totalDetalles, totalContribuyentes] =
          await Promise.all([
            tx.requerimiento.count(),
            tx.requerimientoDetalle.count(),
            tx.contribuyente.count(),
          ]);

        await tx.auditoria.create({
          data: {
            usuarioId: input.usuarioId,
            accion: "CONFIRMAR_VERSION_REQUERIMIENTOS",
            entidad: "VERSION_REQUERIMIENTOS",
            entidadId: String(version.id),
            resultado: "CORRECTO",
            detalles: {
              codigo: version.codigo,
              importacionId: importacion.id,
              totalRequerimientos,
              totalDetalles,
              totalContribuyentes,
              conciliacion: {
                detallesProcesados: conciliacion.detallesProcesados,
                requerimientosProcesadas:
                  conciliacion.requerimientosProcesadas,
                resumenDetalles: conciliacion.resumenDetalles,
                resumenRequerimientos:
                  conciliacion.resumenRequerimientos,
              },
            } satisfies Prisma.InputJsonObject,
          },
        });

        return {
          version: versionActiva,
          importacion,
          totales: {
            requerimientos: totalRequerimientos,
            detalles: totalDetalles,
            contribuyentes: totalContribuyentes,
          },
          conciliacion,
        };
      },
      {
        maxWait: 10000,
        timeout: 900000,
      },
    );
  } catch (error) {
    await prisma.versionRequerimientos.updateMany({
      where: {
        id: input.versionRequerimientosId,
        estado: EstadoVersionDatos.APLICANDO,
      },
      data: {
        estado: EstadoVersionDatos.VALIDADA,
      },
    });

    try {
      await prisma.auditoria.create({
        data: {
          usuarioId: input.usuarioId,
          accion: "CONFIRMAR_VERSION_REQUERIMIENTOS",
          entidad: "VERSION_REQUERIMIENTOS",
          entidadId: String(input.versionRequerimientosId),
          resultado: "ERROR",
          detalles: {
            mensaje: obtenerMensajeError(error),
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (errorAuditoria) {
      console.error(
        "No se pudo registrar la auditoría de confirmación fallida:",
        errorAuditoria,
      );
    }

    throw new ErrorVersionRequerimientos(
      `No se pudo confirmar la versión: ${obtenerMensajeError(error)}`,
      500,
    );
  }
}
