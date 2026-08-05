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
import { ejecutarConciliacionLiquidaciones } from "./conciliacion-liquidaciones.service";
import { ejecutarConciliacionRequerimientos } from "./conciliacion-requerimientos.service";
import { ejecutarConciliacionRequerimientosManuales } from "./conciliacion-requerimientos-manuales.service";
import { importarDeclaracionesDesdeBuffer } from "./importadores/importar-declaraciones";
import { crearRespaldoDatabase } from "./respaldo-database.service";
import { ErrorVersionPagosSisgat } from "./versiones-pagos-sisgat.service";

interface ConfirmarVersionPagosInput {
  versionPagosSisgatId: number;
  usuarioId: number;
  ajustesRevisados: boolean;
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

export async function confirmarVersionPagosSisgat(
  input: ConfirmarVersionPagosInput,
) {
  const version =
    await prisma
      .versionPagosSisgat
      .findUnique({
        where: {
          id:
            input.versionPagosSisgatId,
        },
        include: {
          archivo: true,
        },
      });

  if (!version) {
    throw new ErrorVersionPagosSisgat(
      "La versión solicitada no existe.",
      404,
    );
  }

  if (
    version.estado !==
    EstadoVersionDatos.VALIDADA
  ) {
    throw new ErrorVersionPagosSisgat(
      `La versión no puede confirmarse porque su estado es ${version.estado}.`,
      409,
    );
  }

  if (version.totalErrores > 0) {
    throw new ErrorVersionPagosSisgat(
      "La versión contiene errores y no puede confirmarse.",
      409,
    );
  }

  if (!version.archivo) {
    throw new ErrorVersionPagosSisgat(
      "La versión no contiene el archivo de declaraciones y pagos.",
      409,
    );
  }

  const archivoVersion =
    version.archivo;

  if (
    version.totalAdvertencias > 0 &&
    !input.ajustesRevisados
  ) {
    throw new ErrorVersionPagosSisgat(
      `La versión contiene ${version.totalAdvertencias} ajuste(s) automático(s). Debes revisarlos y aceptarlos.`,
      409,
    );
  }

  let buffer: Buffer;

  try {
    buffer = gunzipSync(
      Buffer.from(
        archivoVersion.contenidoGzip,
      ),
    );
  } catch {
    throw new ErrorVersionPagosSisgat(
      "No se pudo descomprimir el archivo almacenado.",
      409,
    );
  }

  if (
    obtenerHash(buffer) !==
    archivoVersion.hashArchivo
  ) {
    throw new ErrorVersionPagosSisgat(
      "El archivo almacenado no supera la verificación de integridad.",
      409,
    );
  }

  try {
    await crearRespaldoDatabase({
      usuarioId:
        input.usuarioId,
      versionPagosSisgatId:
        version.id,
      motivo:
        "CONFIRMAR_VERSION_PAGOS_SISGAT",
    });
  } catch (error) {
    throw new ErrorVersionPagosSisgat(
      `La actualización fue cancelada porque no pudo crearse el respaldo: ${obtenerMensajeError(error)}`,
      500,
    );
  }

  const reserva =
    await prisma
      .versionPagosSisgat
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
    throw new ErrorVersionPagosSisgat(
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
            ordenes:
              await tx.ordenPago.count(),
            liquidaciones:
              await tx.liquidacion.count(),
            requerimientosSisgat:
              await tx.requerimiento.count(),
            requerimientosManuales:
              await tx.requerimientoManual.count(),
          };

          /*
           * Solo se reemplaza la fuente
           * Declaraciones + Recibos SisGAT.
           * Las órdenes, liquidaciones y
           * requerimientos se conservan.
           */
          await tx.declaracion.deleteMany();

          const importacion =
            await importarDeclaracionesDesdeBuffer(
              buffer,
              archivoVersion.nombreArchivo,
              opcionesImportacion,
              {
                cliente: tx,
                versionPagosSisgatId:
                  version.id,
                usuarioId:
                  input.usuarioId,
                permitirArchivoDuplicado:
                  true,
              },
            );

          if (
            importacion.filasConError > 0
          ) {
            throw new Error(
              `La importación produjo ${importacion.filasConError} fila(s) con error.`,
            );
          }

          const [
            totalDeclaraciones,
            totalRecibos,
            totalContribuyentes,
          ] = await Promise.all([
            tx.declaracion.count(),
            tx.reciboPago.count(),
            tx.contribuyente.count(),
          ]);

          if (
            totalDeclaraciones !==
            version.totalDeclaraciones
          ) {
            throw new Error(
              `La versión esperaba ${version.totalDeclaraciones} declaraciones, pero se almacenaron ${totalDeclaraciones}.`,
            );
          }

          if (
            totalRecibos !==
            version.totalRecibos
          ) {
            throw new Error(
              `La versión esperaba ${version.totalRecibos} recibos, pero se almacenaron ${totalRecibos}.`,
            );
          }

          const conciliacionOrdenes =
            await ejecutarConciliacion(
              tx,
            );

          const conciliacionLiquidaciones =
            await ejecutarConciliacionLiquidaciones(
              tx,
            );

          const conciliacionRequerimientos =
            await ejecutarConciliacionRequerimientos(
              tx,
            );

          const conciliacionManuales =
            await ejecutarConciliacionRequerimientosManuales(
              tx,
            );

          const conteosDespues = {
            ordenes:
              await tx.ordenPago.count(),
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
                `La actualización de pagos alteró la cantidad de ${clave}: ${conteosAntes[clave]} → ${conteosDespues[clave]}.`,
              );
            }
          }

          await tx
            .versionPagosSisgat
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
              .versionPagosSisgat
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
                "CONFIRMAR_VERSION_PAGOS_SISGAT",
              entidad:
                "VERSION_PAGOS_SISGAT",
              entidadId:
                String(version.id),
              resultado:
                "CORRECTO",
              detalles: {
                codigo: version.codigo,
                totalDeclaraciones,
                totalRecibos,
                totalContribuyentes,
                totalAdvertencias:
                  version
                    .totalAdvertencias,
                ajustesRevisados:
                  input
                    .ajustesRevisados,
                importacionId:
                  importacion
                    .importacionId,
                conteosConservados:
                  conteosDespues,
                conciliacionOrdenes:
                  convertirAJsonPrisma(
                    conciliacionOrdenes,
                  ),
                conciliacionLiquidaciones:
                  convertirAJsonPrisma(
                    conciliacionLiquidaciones,
                  ),
                conciliacionRequerimientos:
                  convertirAJsonPrisma(
                    conciliacionRequerimientos,
                  ),
                conciliacionManuales: {
                  periodosProcesados:
                    conciliacionManuales
                      .periodosProcesados,
                  requerimientosProcesados:
                    conciliacionManuales
                      .requerimientosProcesados,
                  requerimientosPagadosPorTresAnios:
                    conciliacionManuales
                      .requerimientosPagadosPorTresAnios,
                  resumenRequerimientos:
                    conciliacionManuales
                      .resumenRequerimientos,
                  resumenRevision:
                    conciliacionManuales
                      .resumenRevision,
                  resumenValidacionAnios:
                    conciliacionManuales
                      .resumenValidacionAnios,
                },
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
              declaraciones:
                totalDeclaraciones,
              recibos: totalRecibos,
            },
            modulosConservados:
              conteosDespues,
            conciliaciones: {
              ordenes:
                conciliacionOrdenes,
              liquidaciones:
                conciliacionLiquidaciones,
              requerimientosSisgat:
                conciliacionRequerimientos,
              requerimientosManuales: {
                periodosProcesados:
                  conciliacionManuales
                    .periodosProcesados,
                requerimientosProcesados:
                  conciliacionManuales
                    .requerimientosProcesados,
                requerimientosPagadosPorTresAnios:
                  conciliacionManuales
                    .requerimientosPagadosPorTresAnios,
                resumenRequerimientos:
                  conciliacionManuales
                    .resumenRequerimientos,
                resumenRevision:
                  conciliacionManuales
                    .resumenRevision,
                resumenValidacionAnios:
                  conciliacionManuales
                    .resumenValidacionAnios,
              },
            },
          };
        },
        {
          maxWait: 10000,
          timeout: 1800000,
        },
      );

    return resultado;
  } catch (error) {
    await prisma
      .versionPagosSisgat
      .updateMany({
        where: {
          id:
            input.versionPagosSisgatId,
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
            "CONFIRMAR_VERSION_PAGOS_SISGAT",
          entidad:
            "VERSION_PAGOS_SISGAT",
          entidadId:
            String(
              input
                .versionPagosSisgatId,
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

    throw new ErrorVersionPagosSisgat(
      `No se pudo confirmar la versión de pagos: ${obtenerMensajeError(error)}`,
      500,
    );
  }
}
