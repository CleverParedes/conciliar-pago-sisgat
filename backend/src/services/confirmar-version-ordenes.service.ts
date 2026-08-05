import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  EstadoVersionDatos,
  ModoImportacion,
  TipoFechaFiltro,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import { ejecutarConciliacion } from "./conciliacion.service";
import { importarOrdenesDesdeBuffer } from "./importadores/importar-ordenes";
import { crearRespaldoDatabase } from "./respaldo-database.service";
import { ErrorVersionOrdenes } from "./versiones-ordenes.service";

interface ConfirmarVersionOrdenesInput {
  versionOrdenesId: number;
  usuarioId: number;
}

function obtenerHash(
  buffer: Buffer,
): string {
  return createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function obtenerMensajeError(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Error desconocido durante la confirmación.";
}

function convertirAJsonPrisma(
  valor: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(valor),
  ) as Prisma.InputJsonValue;
}

export async function confirmarVersionOrdenes(
  input: ConfirmarVersionOrdenesInput,
) {
  const version =
    await prisma
      .versionOrdenes
      .findUnique({
        where: {
          id:
            input.versionOrdenesId,
        },
        include: {
          archivo: true,
        },
      });

  if (!version) {
    throw new ErrorVersionOrdenes(
      "La versión solicitada no existe.",
      404,
    );
  }

  if (
    version.estado !==
    EstadoVersionDatos.VALIDADA
  ) {
    throw new ErrorVersionOrdenes(
      `La versión no puede confirmarse porque su estado es ${version.estado}.`,
      409,
    );
  }

  if (version.totalErrores > 0) {
    throw new ErrorVersionOrdenes(
      "La versión contiene errores y no puede confirmarse.",
      409,
    );
  }

  if (!version.archivo) {
    throw new ErrorVersionOrdenes(
      "La versión no contiene el archivo de órdenes.",
      409,
    );
  }

  const archivoVersion =
    version.archivo;

  let buffer: Buffer;

  try {
    buffer = gunzipSync(
      Buffer.from(
        archivoVersion
          .contenidoGzip,
      ),
    );
  } catch {
    throw new ErrorVersionOrdenes(
      "No se pudo descomprimir el archivo almacenado.",
      409,
    );
  }

  if (
    obtenerHash(buffer) !==
    archivoVersion.hashArchivo
  ) {
    throw new ErrorVersionOrdenes(
      "El archivo almacenado no supera la verificación de integridad.",
      409,
    );
  }

  try {
    await crearRespaldoDatabase({
      usuarioId:
        input.usuarioId,
      versionOrdenesId:
        version.id,
      motivo:
        "CONFIRMAR_VERSION_ORDENES",
    });
  } catch (error) {
    throw new ErrorVersionOrdenes(
      `La actualización fue cancelada porque no pudo crearse el respaldo: ${obtenerMensajeError(error)}`,
      500,
    );
  }

  const reserva =
    await prisma
      .versionOrdenes
      .updateMany({
        where: {
          id: version.id,
          estado:
            EstadoVersionDatos.VALIDADA,
          totalErrores: 0,
        },
        data: {
          estado:
            EstadoVersionDatos.APLICANDO,
        },
      });

  if (reserva.count !== 1) {
    throw new ErrorVersionOrdenes(
      "La versión ya está siendo procesada o cambió de estado.",
      409,
    );
  }

  const opcionesImportacion = {
    modo:
      ModoImportacion.HISTORICA,
    fechaDesde: null,
    fechaHasta: null,
    tipoFechaFiltro:
      TipoFechaFiltro.NO_ESPECIFICADO,
  };

  try {
    const resultado =
      await prisma.$transaction(
        async (tx) => {
          const conteosAntes = {
            declaraciones:
              await tx.declaracion.count(),
            recibos:
              await tx.reciboPago.count(),
            liquidaciones:
              await tx.liquidacion.count(),
            requerimientosSisgat:
              await tx.requerimiento.count(),
            requerimientosManuales:
              await tx.requerimientoManual.count(),
          };

          await tx.ordenPago.deleteMany();

          const importacion =
            await importarOrdenesDesdeBuffer(
              buffer,
              archivoVersion
                .nombreArchivo,
              opcionesImportacion,
              {
                cliente: tx,
                versionOrdenesId:
                  version.id,
                usuarioId:
                  input.usuarioId,
                permitirArchivoDuplicado:
                  true,
              },
            );

          if (
            importacion.filasConError >
            0
          ) {
            throw new Error(
              `La importación produjo ${importacion.filasConError} fila(s) con error.`,
            );
          }

          const [
            totalOrdenes,
            totalDetalles,
            totalContribuyentes,
          ] = await Promise.all([
            tx.ordenPago.count(),
            tx.ordenDetalle.count(),
            tx.contribuyente.count(),
          ]);

          if (
            totalOrdenes !==
            version.totalOrdenes
          ) {
            throw new Error(
              `La versión esperaba ${version.totalOrdenes} órdenes, pero se almacenaron ${totalOrdenes}.`,
            );
          }

          if (
            totalDetalles !==
            version.totalDetalles
          ) {
            throw new Error(
              `La versión esperaba ${version.totalDetalles} detalles, pero se almacenaron ${totalDetalles}.`,
            );
          }

          const conciliacion =
            await ejecutarConciliacion(
              tx,
            );

          const conteosDespues = {
            declaraciones:
              await tx.declaracion.count(),
            recibos:
              await tx.reciboPago.count(),
            liquidaciones:
              await tx.liquidacion.count(),
            requerimientosSisgat:
              await tx.requerimiento.count(),
            requerimientosManuales:
              await tx.requerimientoManual.count(),
          };

          for (
            const clave
            of Object.keys(
              conteosAntes,
            ) as Array<
              keyof typeof conteosAntes
            >
          ) {
            if (
              conteosAntes[clave] !==
              conteosDespues[clave]
            ) {
              throw new Error(
                `La actualización de órdenes alteró la cantidad de ${clave}: ${conteosAntes[clave]} → ${conteosDespues[clave]}.`,
              );
            }
          }

          await tx
            .versionOrdenes
            .updateMany({
              where: {
                estado:
                  EstadoVersionDatos.ACTIVA,
                id: {
                  not: version.id,
                },
              },
              data: {
                estado:
                  EstadoVersionDatos.ARCHIVADA,
              },
            });

          const versionActiva =
            await tx
              .versionOrdenes
              .update({
                where: {
                  id: version.id,
                },
                data: {
                  estado:
                    EstadoVersionDatos.ACTIVA,
                  fechaAplicacion:
                    new Date(),
                },
                select: {
                  id: true,
                  codigo: true,
                  estado: true,
                  fechaAnalisis: true,
                  fechaAplicacion:
                    true,
                },
              });

          await tx.auditoria.create({
            data: {
              usuarioId:
                input.usuarioId,
              accion:
                "CONFIRMAR_VERSION_ORDENES",
              entidad:
                "VERSION_ORDENES",
              entidadId:
                String(version.id),
              resultado:
                "CORRECTO",
              detalles: {
                codigo:
                  version.codigo,
                totalOrdenes,
                totalDetalles,
                totalContribuyentes,
                importacionId:
                  importacion
                    .importacionId,
                modulosConservados:
                  conteosDespues,
                conciliacion:
                  convertirAJsonPrisma(
                    conciliacion,
                  ),
              } satisfies Prisma.InputJsonObject,
            },
          });

          return {
            version:
              versionActiva,
            importacion,
            totales: {
              contribuyentes:
                totalContribuyentes,
              ordenes:
                totalOrdenes,
              detalles:
                totalDetalles,
            },
            modulosConservados:
              conteosDespues,
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
    await prisma
      .versionOrdenes
      .updateMany({
        where: {
          id:
            input.versionOrdenesId,
          estado:
            EstadoVersionDatos.APLICANDO,
        },
        data: {
          estado:
            EstadoVersionDatos.VALIDADA,
        },
      });

    try {
      await prisma.auditoria.create({
        data: {
          usuarioId:
            input.usuarioId,
          accion:
            "CONFIRMAR_VERSION_ORDENES",
          entidad:
            "VERSION_ORDENES",
          entidadId:
            String(
              input
                .versionOrdenesId,
            ),
          resultado: "ERROR",
          detalles: {
            mensaje:
              obtenerMensajeError(
                error,
              ),
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (errorAuditoria) {
      console.error(
        "No se pudo registrar la auditoría de la actualización fallida:",
        errorAuditoria,
      );
    }

    throw new ErrorVersionOrdenes(
      `No se pudo confirmar la versión de órdenes: ${obtenerMensajeError(error)}`,
      500,
    );
  }
}
