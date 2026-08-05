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

interface ConfirmarVersionDatosInput {
  versionDatosId: number;
  usuarioId: number;
  ajustesRevisados: boolean;
}

function obtenerHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function obtenerMensajeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Error desconocido durante la confirmación.";
}

function obtenerTotalAdvertencias(resumen: Prisma.JsonValue | null): number {
  if (!resumen || typeof resumen !== "object" || Array.isArray(resumen)) {
    return 0;
  }

  const valor = (resumen as Prisma.JsonObject).totalAdvertencias;

  return typeof valor === "number" && Number.isInteger(valor) && valor > 0
    ? valor
    : 0;
}

export async function confirmarVersionDatos(input: ConfirmarVersionDatosInput) {
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

  if (version.estado !== EstadoVersionDatos.VALIDADA) {
    throw new ErrorVersionDatos(
      `La versión no puede confirmarse porque su estado actual es ${version.estado}.`,
      409,
    );
  }

  if (version.totalErrores > 0) {
    throw new ErrorVersionDatos(
      "La versión contiene errores de validación y no puede confirmarse.",
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

  const totalAdvertencias = obtenerTotalAdvertencias(
    archivoDeclaraciones.resumen,
  );

  if (totalAdvertencias > 0 && !input.ajustesRevisados) {
    throw new ErrorVersionDatos(
      `La versión contiene ${totalAdvertencias} ajuste(s) automático(s). El administrador debe revisarlos y aceptarlos antes de confirmar.`,
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

  const hashOrdenes = obtenerHash(bufferOrdenes);

  const hashDeclaraciones = obtenerHash(bufferDeclaraciones);

  if (hashOrdenes !== archivoOrdenes.hashArchivo) {
    throw new ErrorVersionDatos(
      "El archivo almacenado de órdenes no supera la verificación de integridad.",
      409,
    );
  }

  if (hashDeclaraciones !== archivoDeclaraciones.hashArchivo) {
    throw new ErrorVersionDatos(
      "El archivo almacenado de declaraciones y pagos no supera la verificación de integridad.",
      409,
    );
  }

  /*
   * Antes de modificar los datos activos se crea
   * un respaldo completo de PostgreSQL.
   *
   * La versión todavía conserva su estado VALIDADA,
   * por lo que el respaldo representa exactamente
   * el estado anterior a la confirmación.
   */
  try {
    await crearRespaldoDatabase({
      usuarioId: input.usuarioId,

      versionDatosId: input.versionDatosId,

      motivo: "CONFIRMAR_VERSION_DATOS",
    });
  } catch (error) {
    throw new ErrorVersionDatos(
      `La confirmación fue cancelada porque no se pudo crear el respaldo automático: ${obtenerMensajeError(
        error,
      )}`,
      500,
    );
  }

  /*
   * Reserva la versión para impedir dos
   * confirmaciones simultáneas.
   */
  const reserva = await prisma.versionDatos.updateMany({
    where: {
      id: input.versionDatosId,
      estado: EstadoVersionDatos.VALIDADA,
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
         * Se eliminan primero las órdenes.
         * Sus detalles se eliminan mediante
         * la relación con ON DELETE CASCADE.
         */
        await tx.ordenPago.deleteMany();

        /*
         * Al eliminar las declaraciones,
         * sus recibos también se eliminan
         * mediante ON DELETE CASCADE.
         */
        await tx.declaracion.deleteMany();

        /*
         * Después de eliminar órdenes y
         * declaraciones ya pueden retirarse
         * los contribuyentes anteriores.
         */
        await tx.contribuyente.deleteMany();

        /*
         * Primero se importan declaraciones
         * y recibos. Después se importan las
         * órdenes y sus periodos.
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
            `La importación de declaraciones produjo ${importacionDeclaraciones.filasConError} fila(s) con error.`,
          );
        }

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
            `La importación de órdenes produjo ${importacionOrdenes.filasConError} fila(s) con error.`,
          );
        }

        /*
         * Se cuentan los registros realmente
         * almacenados antes de conciliar.
         */
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
            `La versión esperaba ${version.totalOrdenes} órdenes, pero se almacenaron ${totalOrdenes}.`,
          );
        }

        if (totalDeclaraciones !== version.totalDeclaraciones) {
          throw new Error(
            `La versión esperaba ${version.totalDeclaraciones} declaraciones, pero se almacenaron ${totalDeclaraciones}.`,
          );
        }

        if (totalRecibos !== version.totalRecibos) {
          throw new Error(
            `La versión esperaba ${version.totalRecibos} recibos, pero se almacenaron ${totalRecibos}.`,
          );
        }

        /*
         * La conciliación utiliza el mismo
         * cliente transaccional.
         */
        const conciliacion = await ejecutarConciliacion(tx);

        /*
         * Cualquier versión anteriormente
         * activa se conserva como archivada.
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

            accion: "CONFIRMAR_VERSION_DATOS",

            entidad: "VERSION_DATOS",

            entidadId: String(version.id),

            resultado: "CORRECTO",

            detalles: {
              codigo: version.codigo,

              totalOrdenes,

              totalDetalles,

              totalDeclaraciones,

              totalRecibos,

              totalContribuyentes,

              totalAdvertencias,

              ajustesRevisados: input.ajustesRevisados,

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
        /*
         * La confirmación realiza miles de
         * consultas y actualizaciones.
         * Se otorga un máximo de 15 minutos.
         */
        maxWait: 10000,
        timeout: 900000,
      },
    );

    return resultado;
  } catch (error) {
    /*
     * La transacción principal se revierte
     * automáticamente. La versión vuelve a
     * VALIDADA para que pueda reintentarse.
     */
    await prisma.versionDatos.updateMany({
      where: {
        id: input.versionDatosId,

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

          accion: "CONFIRMAR_VERSION_DATOS",

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
        "No se pudo registrar la auditoría de confirmación fallida:",
        errorAuditoria,
      );
    }

    throw new ErrorVersionDatos(
      `No se pudo confirmar la versión: ${obtenerMensajeError(error)}`,
      500,
    );
  }
}
