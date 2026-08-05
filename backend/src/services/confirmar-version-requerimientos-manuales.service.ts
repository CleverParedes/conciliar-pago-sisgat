import { createHash } from "node:crypto";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import { ejecutarConciliacionRequerimientosManuales } from "./conciliacion-requerimientos-manuales.service";
import { importarRequerimientosManualesDesdeBuffer } from "./importadores/importar-requerimientos-manuales";
import { crearRespaldoDatabase } from "./respaldo-database.service";
import { ErrorVersionRequerimientosManuales } from "./versiones-requerimientos-manuales.service";

interface ConfirmarVersionRequerimientosManualesInput {
  versionRequerimientosManualesId: number;
  usuarioId: number;
}

function obtenerHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function obtenerMensajeError(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido.";
}

function convertirAJsonPrisma(valor: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
}

export async function confirmarVersionRequerimientosManuales(
  input: ConfirmarVersionRequerimientosManualesInput,
) {
  const version = await prisma.versionRequerimientosManuales.findUnique({
    where: {
      id: input.versionRequerimientosManualesId,
    },
    include: {
      archivo: true,
    },
  });

  if (!version) {
    throw new ErrorVersionRequerimientosManuales(
      "La versión de requerimientos manuales solicitada no existe.",
      404,
    );
  }

  if (version.estado !== EstadoVersionDatos.VALIDADA) {
    throw new ErrorVersionRequerimientosManuales(
      `La versión no puede confirmarse porque su estado actual es ${version.estado}.`,
      409,
    );
  }

  if (version.totalErrores > 0) {
    throw new ErrorVersionRequerimientosManuales(
      "La versión contiene errores de validación y no puede confirmarse.",
      409,
    );
  }

  if (!version.archivo) {
    throw new ErrorVersionRequerimientosManuales(
      "La versión no contiene el Excel original.",
      409,
    );
  }

  const archivoVersion = version.archivo;
  const buffer = Buffer.from(archivoVersion.contenidoOriginal);

  if (obtenerHash(buffer) !== archivoVersion.hashArchivo) {
    throw new ErrorVersionRequerimientosManuales(
      "El Excel almacenado no supera la verificación de integridad.",
      409,
    );
  }

  try {
    await crearRespaldoDatabase({
      usuarioId: input.usuarioId,
      versionRequerimientosManualesId:
        input.versionRequerimientosManualesId,
      motivo: "CONFIRMAR_VERSION_REQUERIMIENTOS_MANUALES",
    });
  } catch (error) {
    throw new ErrorVersionRequerimientosManuales(
      "La confirmación fue cancelada porque no se pudo crear el respaldo automático: " +
        obtenerMensajeError(error),
      500,
    );
  }

  const reserva = await prisma.versionRequerimientosManuales.updateMany({
    where: {
      id: input.versionRequerimientosManualesId,
      estado: EstadoVersionDatos.VALIDADA,
      totalErrores: 0,
    },
    data: {
      estado: EstadoVersionDatos.APLICANDO,
    },
  });

  if (reserva.count !== 1) {
    throw new ErrorVersionRequerimientosManuales(
      "La versión ya está siendo procesada o cambió de estado.",
      409,
    );
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const [
          registrosAnteriores,
          periodosAnteriores,
          seguimientosAnteriores,
          historialAnterior,
        ] = await Promise.all([
          tx.requerimientoManual.count(),
          tx.requerimientoManualPeriodo.count(),
          tx.seguimientoRequerimientoManual.count(),
          tx.historialRequerimientoManual.count(),
        ]);

        /*
         * Los periodos, seguimientos e historial operativo se eliminan por
         * cascada al borrar los requerimientos manuales. El respaldo completo
         * ya fue creado antes de iniciar esta transacción.
         */
        await tx.requerimientoManual.deleteMany({});

        const importacion =
          await importarRequerimientosManualesDesdeBuffer(
            buffer,
            archivoVersion.nombreArchivo,
            {
              cliente: tx,
              versionRequerimientosManualesId: version.id,
              usuarioId: input.usuarioId,
              anioGestion: version.anioGestion,
            },
          );

        const conciliacion =
          await ejecutarConciliacionRequerimientosManuales(tx);

        await tx.versionRequerimientosManuales.updateMany({
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

        const versionActiva =
          await tx.versionRequerimientosManuales.update({
            where: {
              id: version.id,
            },
            data: {
              estado: EstadoVersionDatos.ACTIVA,
              fechaAplicacion: new Date(),
            },
            select: {
              id: true,
              codigo: true,
              estado: true,
              anioGestion: true,
              fechaAnalisis: true,
              fechaAplicacion: true,
            },
          });

        const [
          totalRegistros,
          totalPeriodos,
          totalSeguimientos,
          totalHistorial,
        ] = await Promise.all([
          tx.requerimientoManual.count(),
          tx.requerimientoManualPeriodo.count(),
          tx.seguimientoRequerimientoManual.count(),
          tx.historialRequerimientoManual.count(),
        ]);

        await tx.auditoria.create({
          data: {
            usuarioId: input.usuarioId,
            accion: "CONFIRMAR_VERSION_REQUERIMIENTOS_MANUALES",
            entidad: "VERSION_REQUERIMIENTOS_MANUALES",
            entidadId: String(version.id),
            resultado: "CORRECTO",
            detalles: {
              codigo: version.codigo,
              anioGestion: version.anioGestion,
              modoActualizacion: "REEMPLAZO_COMPLETO",
              importacionId: importacion.id,
              eliminados: {
                registros: registrosAnteriores,
                periodos: periodosAnteriores,
                seguimientos: seguimientosAnteriores,
                historial: historialAnterior,
              },
              actuales: {
                registros: totalRegistros,
                periodos: totalPeriodos,
                seguimientos: totalSeguimientos,
                historial: totalHistorial,
              },
              registrosNuevos: importacion.registrosNuevos,
              conciliacion: convertirAJsonPrisma(conciliacion),
            } satisfies Prisma.InputJsonObject,
          },
        });

        return {
          version: versionActiva,
          importacion,
          reemplazo: {
            registrosEliminados: registrosAnteriores,
            periodosEliminados: periodosAnteriores,
            seguimientosEliminados: seguimientosAnteriores,
            historialEliminado: historialAnterior,
          },
          totales: {
            registros: totalRegistros,
            periodos: totalPeriodos,
            seguimientos: totalSeguimientos,
            historial: totalHistorial,
          },
          conciliacion,
        };
      },
      {
        maxWait: 10000,
        timeout: 1800000,
      },
    );
  } catch (error) {
    await prisma.versionRequerimientosManuales.updateMany({
      where: {
        id: input.versionRequerimientosManualesId,
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
          accion: "CONFIRMAR_VERSION_REQUERIMIENTOS_MANUALES",
          entidad: "VERSION_REQUERIMIENTOS_MANUALES",
          entidadId: String(input.versionRequerimientosManualesId),
          resultado: "ERROR",
          detalles: {
            mensaje: obtenerMensajeError(error),
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (errorAuditoria) {
      console.error(
        "No se pudo registrar la auditoría de la confirmación fallida:",
        errorAuditoria,
      );
    }

    throw new ErrorVersionRequerimientosManuales(
      `No se pudo confirmar la versión: ${obtenerMensajeError(error)}`,
      500,
    );
  }
}
