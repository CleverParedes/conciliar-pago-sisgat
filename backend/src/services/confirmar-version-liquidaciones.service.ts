import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import { ejecutarConciliacionLiquidaciones } from "./conciliacion-liquidaciones.service";
import { importarLiquidacionesDesdeBuffer } from "./importadores/importar-liquidaciones";
import { crearRespaldoDatabase } from "./respaldo-database.service";
import { ErrorVersionLiquidaciones } from "./versiones-liquidaciones.service";

interface ConfirmarVersionLiquidacionesInput {
  versionLiquidacionesId: number;
  usuarioId: number;
}

function obtenerHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function obtenerMensajeError(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido.";
}

export async function confirmarVersionLiquidaciones(
  input: ConfirmarVersionLiquidacionesInput,
) {
  const version = await prisma.versionLiquidaciones.findUnique({
    where: {
      id: input.versionLiquidacionesId,
    },
    include: {
      archivo: true,
    },
  });

  if (!version) {
    throw new ErrorVersionLiquidaciones(
      "La versión de liquidaciones solicitada no existe.",
      404,
    );
  }

  if (version.estado !== EstadoVersionDatos.VALIDADA) {
    throw new ErrorVersionLiquidaciones(
      `La versión no puede confirmarse porque su estado actual es ${version.estado}.`,
      409,
    );
  }

  if (version.totalErrores > 0) {
    throw new ErrorVersionLiquidaciones(
      "La versión contiene errores de validación y no puede confirmarse.",
      409,
    );
  }

  if (!version.archivo) {
    throw new ErrorVersionLiquidaciones(
      "La versión no contiene el archivo de liquidaciones.",
      409,
    );
  }

  let buffer: Buffer;

  try {
    buffer = gunzipSync(Buffer.from(version.archivo.contenidoGzip));
  } catch {
    throw new ErrorVersionLiquidaciones(
      "No se pudo descomprimir el archivo almacenado en la versión.",
      409,
    );
  }

  if (obtenerHash(buffer) !== version.archivo.hashArchivo) {
    throw new ErrorVersionLiquidaciones(
      "El archivo almacenado no supera la verificación de integridad.",
      409,
    );
  }

  try {
    await crearRespaldoDatabase({
      usuarioId: input.usuarioId,
      versionLiquidacionesId: input.versionLiquidacionesId,
      motivo: "CONFIRMAR_VERSION_LIQUIDACIONES",
    });
  } catch (error) {
    throw new ErrorVersionLiquidaciones(
      "La confirmación fue cancelada porque no se pudo crear el respaldo " +
        `automático: ${obtenerMensajeError(error)}`,
      500,
    );
  }

  const reserva = await prisma.versionLiquidaciones.updateMany({
    where: {
      id: input.versionLiquidacionesId,
      estado: EstadoVersionDatos.VALIDADA,
      totalErrores: 0,
    },
    data: {
      estado: EstadoVersionDatos.APLICANDO,
    },
  });

  if (reserva.count !== 1) {
    throw new ErrorVersionLiquidaciones(
      "La versión ya está siendo procesada o cambió de estado.",
      409,
    );
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        /*
         * Solo se reemplazan liquidaciones.
         * Órdenes, declaraciones, recibos, usuarios y contribuyentes
         * permanecen disponibles.
         */
        await tx.liquidacion.deleteMany();

        const importacion = await importarLiquidacionesDesdeBuffer(
          buffer,
          version.archivo!.nombreArchivo,
          {
            cliente: tx,
            versionLiquidacionesId: version.id,
            usuarioId: input.usuarioId,
          },
        );

        const conciliacion = await ejecutarConciliacionLiquidaciones(tx);

        await tx.versionLiquidaciones.updateMany({
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

        const versionActiva = await tx.versionLiquidaciones.update({
          where: {
            id: version.id,
          },
          data: {
            estado: EstadoVersionDatos.ACTIVA,
            fechaAplicacion: new Date(),
          },
        });

        const [totalLiquidaciones, totalDetalles, totalContribuyentes] =
          await Promise.all([
            tx.liquidacion.count(),
            tx.liquidacionDetalle.count(),
            tx.contribuyente.count(),
          ]);

        await tx.auditoria.create({
          data: {
            usuarioId: input.usuarioId,
            accion: "CONFIRMAR_VERSION_LIQUIDACIONES",
            entidad: "VERSION_LIQUIDACIONES",
            entidadId: String(version.id),
            resultado: "CORRECTO",
            detalles: {
              codigo: version.codigo,
              importacionId: importacion.id,
              totalLiquidaciones,
              totalDetalles,
              totalContribuyentes,
              conciliacion: {
                detallesProcesados: conciliacion.detallesProcesados,
                liquidacionesProcesadas:
                  conciliacion.liquidacionesProcesadas,
                resumenDetalles: conciliacion.resumenDetalles,
                resumenLiquidaciones:
                  conciliacion.resumenLiquidaciones,
              },
            } satisfies Prisma.InputJsonObject,
          },
        });

        return {
          version: versionActiva,
          importacion,
          totales: {
            liquidaciones: totalLiquidaciones,
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
    await prisma.versionLiquidaciones.updateMany({
      where: {
        id: input.versionLiquidacionesId,
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
          accion: "CONFIRMAR_VERSION_LIQUIDACIONES",
          entidad: "VERSION_LIQUIDACIONES",
          entidadId: String(input.versionLiquidacionesId),
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

    throw new ErrorVersionLiquidaciones(
      `No se pudo confirmar la versión: ${obtenerMensajeError(error)}`,
      500,
    );
  }
}
