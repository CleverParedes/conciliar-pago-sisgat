import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  EstadoVersionDatos,
  ModoImportacion,
  TipoArchivoVersion,
  TipoFechaFiltro,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

import { crearRespaldoDatabase } from "./respaldo-database.service";

import { ejecutarConciliacion } from "./conciliacion.service";

import { importarDeclaracionesDesdeBuffer } from "./importadores/importar-declaraciones";

import { importarOrdenesDesdeBuffer } from "./importadores/importar-ordenes";

import { ErrorVersionDatos } from "./versiones-datos.service";

interface RestaurarVersionDatosInput {
  versionDatosId: number;
  usuarioId: number;
}

function obtenerHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function obtenerMensajeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Error desconocido durante la restauración.";
}

export async function restaurarVersionDatos(input: RestaurarVersionDatosInput) {
  const version = await prisma.versionDatos.findUnique({
    where: {
      id: input.versionDatosId,
    },

    include: {
      archivos: true,
    },
  });

  if (!version) {
    throw new ErrorVersionDatos("La versión solicitada no existe.", 404);
  }

  if (version.estado === EstadoVersionDatos.ACTIVA) {
    throw new ErrorVersionDatos(
      "La versión seleccionada ya se encuentra activa.",
      409,
    );
  }

  if (version.estado !== EstadoVersionDatos.ARCHIVADA) {
    throw new ErrorVersionDatos(
      `La versión no puede restaurarse porque su estado actual es ${version.estado}.`,
      409,
    );
  }

  if (version.totalErrores > 0) {
    throw new ErrorVersionDatos(
      "La versión contiene errores de validación y no puede restaurarse.",
      409,
    );
  }

  const archivoOrdenes = version.archivos.find(
    (archivo) => archivo.tipo === TipoArchivoVersion.ORDENES,
  );

  const archivoDeclaraciones = version.archivos.find(
    (archivo) => archivo.tipo === TipoArchivoVersion.DECLARACIONES_PAGOS,
  );

  if (!archivoOrdenes) {
    throw new ErrorVersionDatos(
      "La versión no contiene el archivo de órdenes.",
      409,
    );
  }

  if (!archivoDeclaraciones) {
    throw new ErrorVersionDatos(
      "La versión no contiene el archivo de declaraciones y pagos.",
      409,
    );
  }

  let bufferOrdenes: Buffer;
  let bufferDeclaraciones: Buffer;

  try {
    bufferOrdenes = gunzipSync(Buffer.from(archivoOrdenes.contenidoGzip));

    bufferDeclaraciones = gunzipSync(
      Buffer.from(archivoDeclaraciones.contenidoGzip),
    );
  } catch {
    throw new ErrorVersionDatos(
      "No se pudieron descomprimir los archivos almacenados en la versión.",
      409,
    );
  }

  if (obtenerHash(bufferOrdenes) !== archivoOrdenes.hashArchivo) {
    throw new ErrorVersionDatos(
      "El archivo almacenado de órdenes no supera la verificación de integridad.",
      409,
    );
  }

  if (obtenerHash(bufferDeclaraciones) !== archivoDeclaraciones.hashArchivo) {
    throw new ErrorVersionDatos(
      "El archivo almacenado de declaraciones y pagos no supera la verificación de integridad.",
      409,
    );
  }

  /*
   * Se respalda la base activa antes de sustituirla
   * con los archivos almacenados en la versión
   * archivada.
   */
  try {
    await crearRespaldoDatabase({
      usuarioId: input.usuarioId,

      versionDatosId: input.versionDatosId,

      motivo: "RESTAURAR_VERSION_DATOS",
    });
  } catch (error) {
    throw new ErrorVersionDatos(
      `La restauración fue cancelada porque no se pudo crear el respaldo automático: ${obtenerMensajeError(
        error,
      )}`,
      500,
    );
  }

  /*
   * Reserva la versión para impedir que
   * sea restaurada simultáneamente por
   * dos solicitudes.
   */
  const reserva = await prisma.versionDatos.updateMany({
    where: {
      id: input.versionDatosId,

      estado: EstadoVersionDatos.ARCHIVADA,

      totalErrores: 0,
    },

    data: {
      estado: EstadoVersionDatos.APLICANDO,
    },
  });

  if (reserva.count !== 1) {
    throw new ErrorVersionDatos(
      "La versión ya está siendo procesada o cambió de estado.",
      409,
    );
  }

  const opcionesImportacion = {
    modo: ModoImportacion.HISTORICA,

    fechaDesde: null,

    fechaHasta: null,

    tipoFechaFiltro: TipoFechaFiltro.NO_ESPECIFICADO,
  };

  try {
    const resultado = await prisma.$transaction(
      async (tx) => {
        /*
         * Se guarda la versión que estaba
         * activa antes de la restauración.
         */
        const versionAnterior = await tx.versionDatos.findFirst({
          where: {
            estado: EstadoVersionDatos.ACTIVA,

            id: {
              not: version.id,
            },
          },

          select: {
            id: true,
            codigo: true,
            fechaAplicacion: true,
          },
        });

        /*
         * La restauración reemplaza toda la
         * información activa. Los detalles de
         * órdenes se eliminan por cascada.
         */
        await tx.ordenPago.deleteMany();

        /*
         * Los recibos se eliminan por cascada
         * al eliminar sus declaraciones.
         */
        await tx.declaracion.deleteMany();

        await tx.contribuyente.deleteMany();

        /*
         * Se reconstruyen declaraciones y
         * recibos desde el archivo almacenado.
         */
        const importacionDeclaraciones = await importarDeclaracionesDesdeBuffer(
          bufferDeclaraciones,

          archivoDeclaraciones.nombreArchivo,

          opcionesImportacion,

          {
            cliente: tx,

            versionDatosId: version.id,

            usuarioId: input.usuarioId,

            permitirArchivoDuplicado: true,
          },
        );

        if (importacionDeclaraciones.filasConError > 0) {
          throw new Error(
            `La restauración de declaraciones produjo ${importacionDeclaraciones.filasConError} fila(s) con error.`,
          );
        }

        /*
         * Se reconstruyen las órdenes y sus
         * detalles desde el archivo almacenado.
         */
        const importacionOrdenes = await importarOrdenesDesdeBuffer(
          bufferOrdenes,

          archivoOrdenes.nombreArchivo,

          opcionesImportacion,

          {
            cliente: tx,

            versionDatosId: version.id,

            usuarioId: input.usuarioId,

            permitirArchivoDuplicado: true,
          },
        );

        if (importacionOrdenes.filasConError > 0) {
          throw new Error(
            `La restauración de órdenes produjo ${importacionOrdenes.filasConError} fila(s) con error.`,
          );
        }

        const [
          totalOrdenes,
          totalDeclaraciones,
          totalRecibos,
          totalContribuyentes,
          totalDetalles,
        ] = await Promise.all([
          tx.ordenPago.count(),

          tx.declaracion.count(),

          tx.reciboPago.count(),

          tx.contribuyente.count(),

          tx.ordenDetalle.count(),
        ]);

        if (totalOrdenes !== version.totalOrdenes) {
          throw new Error(
            `La versión esperaba ${version.totalOrdenes} órdenes, pero se restauraron ${totalOrdenes}.`,
          );
        }

        if (totalDeclaraciones !== version.totalDeclaraciones) {
          throw new Error(
            `La versión esperaba ${version.totalDeclaraciones} declaraciones, pero se restauraron ${totalDeclaraciones}.`,
          );
        }

        if (totalRecibos !== version.totalRecibos) {
          throw new Error(
            `La versión esperaba ${version.totalRecibos} recibos, pero se restauraron ${totalRecibos}.`,
          );
        }

        /*
         * Después de reconstruir los registros
         * se vuelve a ejecutar la conciliación.
         */
        const conciliacion = await ejecutarConciliacion(tx);

        /*
         * La versión que estaba activa pasa a
         * ser archivada.
         */
        await tx.versionDatos.updateMany({
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

        /*
         * La versión restaurada vuelve a quedar
         * como la única versión activa.
         */
        const versionActiva = await tx.versionDatos.update({
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
            fechaAnalisis: true,
            fechaAplicacion: true,
          },
        });

        await tx.auditoria.create({
          data: {
            usuarioId: input.usuarioId,

            accion: "RESTAURAR_VERSION_DATOS",

            entidad: "VERSION_DATOS",

            entidadId: String(version.id),

            resultado: "CORRECTO",

            detalles: {
              codigoRestaurado: version.codigo,

              versionAnteriorId: versionAnterior?.id ?? null,

              codigoAnterior: versionAnterior?.codigo ?? null,

              totalOrdenes,

              totalDetalles,

              totalDeclaraciones,

              totalRecibos,

              totalContribuyentes,

              importacionOrdenesId: importacionOrdenes.importacionId,

              importacionDeclaracionesId:
                importacionDeclaraciones.importacionId,

              conciliacion: {
                detallesProcesados: conciliacion.detallesProcesados,

                ordenesProcesadas: conciliacion.ordenesProcesadas,

                resumenDetalles: conciliacion.resumenDetalles,

                resumenOrdenes: conciliacion.resumenOrdenes,
              },
            } satisfies Prisma.InputJsonObject,
          },
        });

        return {
          version: versionActiva,

          versionAnterior,

          importaciones: {
            ordenes: importacionOrdenes,

            declaracionesPagos: importacionDeclaraciones,
          },

          totales: {
            contribuyentes: totalContribuyentes,

            ordenes: totalOrdenes,

            detalles: totalDetalles,

            declaraciones: totalDeclaraciones,

            recibos: totalRecibos,
          },

          conciliacion,
        };
      },
      {
        maxWait: 10000,
        timeout: 900000,
      },
    );

    return resultado;
  } catch (error) {
    /*
     * Si ocurre cualquier error, PostgreSQL
     * revierte los cambios y la versión vuelve
     * a su estado ARCHIVADA.
     */
    await prisma.versionDatos.updateMany({
      where: {
        id: input.versionDatosId,

        estado: EstadoVersionDatos.APLICANDO,
      },

      data: {
        estado: EstadoVersionDatos.ARCHIVADA,
      },
    });

    try {
      await prisma.auditoria.create({
        data: {
          usuarioId: input.usuarioId,

          accion: "RESTAURAR_VERSION_DATOS",

          entidad: "VERSION_DATOS",

          entidadId: String(input.versionDatosId),

          resultado: "ERROR",

          detalles: {
            mensaje: obtenerMensajeError(error),
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (errorAuditoria) {
      console.error(
        "No se pudo registrar la auditoría de restauración fallida:",
        errorAuditoria,
      );
    }

    throw new ErrorVersionDatos(
      `No se pudo restaurar la versión: ${obtenerMensajeError(error)}`,
      500,
    );
  }
}
