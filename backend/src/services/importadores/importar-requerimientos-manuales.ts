import { createHash } from "node:crypto";

import {
  EstadoConciliacionManual,
  EstadoImportacion,
  EstadoNotificacionManual,
  EstadoRevisionManual,
  ModoImportacion,
  OrigenImportacion,
  TipoFechaFiltro,
  TipoImportacion,
  TipoRegistroManual,
  type Prisma,
} from "../../../generated/prisma/client";

import {
  analizarArchivoRequerimientosManuales,
  type EstadoManualNormalizado,
  type RequerimientoManualAnalizado,
  type TipoRegistroManualAnalizado,
} from "./analizar-requerimientos-manuales";

interface ContextoImportacionRequerimientosManuales {
  cliente: Prisma.TransactionClient;
  versionRequerimientosManualesId:
    number;
  usuarioId: number;
  anioGestion: number;
}

function tipoRegistroPrisma(
  tipo:
    TipoRegistroManualAnalizado,
): TipoRegistroManual {
  switch (tipo) {
    case "REGISTRO_COMPLETO":
      return TipoRegistroManual.REGISTRO_COMPLETO;
    case "INCOMPLETO":
      return TipoRegistroManual.INCOMPLETO;
    case "VACIO":
      return TipoRegistroManual.VACIO;
    case "SIN_REGISTRO":
      return TipoRegistroManual.SIN_REGISTRO;
    case "ANULADO":
      return TipoRegistroManual.ANULADO;
  }
}

function determinarEstadoConciliadoInicial(
  requerimiento:
    RequerimientoManualAnalizado,
): EstadoConciliacionManual {
  if (
    requerimiento.tipoRegistro ===
    "ANULADO"
  ) {
    return EstadoConciliacionManual.ANULADO;
  }

  if (
    requerimiento.tipoRegistro ===
      "VACIO" ||
    requerimiento.tipoRegistro ===
      "SIN_REGISTRO" ||
    requerimiento
      .estadoManualNormalizado ===
      "NO_APLICA"
  ) {
    return EstadoConciliacionManual.NO_APLICA;
  }

  return EstadoConciliacionManual.REVISAR;
}

function determinarEstadoRevisionInicial(
  requerimiento:
    RequerimientoManualAnalizado,
): EstadoRevisionManual {
  if (
    requerimiento.tipoRegistro ===
      "ANULADO" ||
    requerimiento.tipoRegistro ===
      "VACIO" ||
    requerimiento.tipoRegistro ===
      "SIN_REGISTRO" ||
    requerimiento
      .estadoManualNormalizado ===
      "NO_APLICA"
  ) {
    return EstadoRevisionManual.NO_APLICA;
  }

  return EstadoRevisionManual.PENDIENTE;
}

function determinarEstadoNotificacionInicial(
  requerimiento:
    RequerimientoManualAnalizado,
): EstadoNotificacionManual {
  if (
    requerimiento
      .fechaNotificacionOriginal ||
    requerimiento
      .numeroCedulonOriginal
  ) {
    return EstadoNotificacionManual.NOTIFICADO;
  }

  if (
    requerimiento
      .notificadorOriginal
  ) {
    return EstadoNotificacionManual.ASIGNADO;
  }

  return EstadoNotificacionManual.SIN_ASIGNAR;
}

function estadoManualTexto(
  estado:
    EstadoManualNormalizado,
): string {
  return estado;
}

function datosOriginalesJson(
  datos:
    Record<
      string,
      string | number | boolean | null
    >,
): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(datos).map(
      ([clave, valor]) => [
        clave,
        valor === null
          ? ""
          : valor,
      ],
    ),
  ) as Prisma.InputJsonObject;
}

function tieneSeguimientoOriginal(
  requerimiento:
    RequerimientoManualAnalizado,
): boolean {
  return Boolean(
    requerimiento
      .notificadorOriginal ||
      requerimiento
        .responsableOriginal ||
      requerimiento
        .numeroLiquidacionDeudaOriginal ||
      requerimiento
        .fechaNotificacionOriginal ||
      requerimiento
        .numeroCedulonOriginal ||
      requerimiento
        .observacionesOriginal,
  );
}

export async function importarRequerimientosManualesDesdeBuffer(
  buffer: Buffer,
  nombreArchivo: string,
  contexto:
    ContextoImportacionRequerimientosManuales,
) {
  const resultado =
    await analizarArchivoRequerimientosManuales(
      buffer,
      nombreArchivo,
      contexto.anioGestion,
    );

  if (
    resultado.filasConError >
    0
  ) {
    throw new Error(
      `El Excel contiene ${resultado.filasConError} fila(s) con error y no puede importarse.`,
    );
  }

  const hashArchivo =
    createHash("sha256")
      .update(buffer)
      .digest("hex");

  const tx =
    contexto.cliente;

  const importacion =
    await tx.importacion.create({
      data: {
        tipo:
          TipoImportacion.REQUERIMIENTOS_MANUALES,
        origen:
          OrigenImportacion.MANUAL,
        estado:
          EstadoImportacion.PROCESANDO,
        nombreArchivo,
        hashArchivo,
        totalFilas:
          resultado.totalFilas,
        filasCorrectas: 0,
        filasConError: 0,
        modo:
          ModoImportacion.HISTORICA,
        fechaDesde: null,
        fechaHasta: null,
        tipoFechaFiltro:
          TipoFechaFiltro.NO_ESPECIFICADO,
        registrosNuevos: 0,
        registrosActualizados: 0,
        registrosSinCambios: 0,
        versionRequerimientosManualesId:
          contexto
            .versionRequerimientosManualesId,
        usuarioId:
          contexto.usuarioId,
      },
    });

  let seguimientosIniciales = 0;

  for (
    const requerimiento
    of resultado.requerimientos
  ) {
    const estadoConciliado =
      determinarEstadoConciliadoInicial(
        requerimiento,
      );

    const estadoRevision =
      determinarEstadoRevisionInicial(
        requerimiento,
      );

    const estadoNotificacion =
      determinarEstadoNotificacionInicial(
        requerimiento,
      );

    const seguimientoOriginal =
      tieneSeguimientoOriginal(
        requerimiento,
      );

    if (seguimientoOriginal) {
      seguimientosIniciales += 1;
    }

    await tx
      .requerimientoManual
      .create({
        data: {
          anioGestion:
            contexto.anioGestion,
          numeroRequerimiento:
            requerimiento
              .numeroRequerimiento,
          correlativoExcel:
            requerimiento
              .correlativoExcel,
          placaOriginal:
            requerimiento
              .placaOriginal,
          placaNormalizada:
            requerimiento
              .placaNormalizada,
          fechaRequerimiento:
            requerimiento
              .fechaRequerimiento,
          anioVehiculoOriginal:
            requerimiento
              .anioVehiculoOriginal,
          anioVehiculo:
            requerimiento
              .anioVehiculo,
          deudaOriginal:
            requerimiento
              .deudaOriginal,
          propietarioOriginal:
            requerimiento
              .propietarioOriginal,
          estadoManualOriginal:
            requerimiento
              .estadoManualOriginal,
          provinciaOriginal:
            requerimiento
              .provinciaOriginal,
          distritoOriginal:
            requerimiento
              .distritoOriginal,
          direccionOriginal:
            requerimiento
              .direccionOriginal,
          notificadorOriginal:
            requerimiento
              .notificadorOriginal,
          observacionesOriginal:
            requerimiento
              .observacionesOriginal,
          numeroLiquidacionDeudaOriginal:
            requerimiento
              .numeroLiquidacionDeudaOriginal,
          fechaNotificacionOriginal:
            requerimiento
              .fechaNotificacionOriginal,
          numeroCedulonOriginal:
            requerimiento
              .numeroCedulonOriginal,
          responsableOriginal:
            requerimiento
              .responsableOriginal,
          tipoRegistro:
            tipoRegistroPrisma(
              requerimiento
                .tipoRegistro,
            ),
          estadoConciliado,
          estadoRevision,
          estadoNotificacion,
          notificadorActual:
            requerimiento
              .notificadorOriginal,
          responsableActual:
            requerimiento
              .responsableOriginal,
          numeroLiquidacionDeudaActual:
            requerimiento
              .numeroLiquidacionDeudaOriginal,
          fechaNotificacionActual:
            requerimiento
              .fechaNotificacionOriginal,
          numeroCedulonActual:
            requerimiento
              .numeroCedulonOriginal,
          observacionSeguimiento:
            requerimiento
              .observacionesOriginal,
          archivoOrigen:
            nombreArchivo,
          filaOrigen:
            requerimiento.fila,
          datosOriginales:
            datosOriginalesJson(
              requerimiento
                .datosOriginales,
            ),
          importacionId:
            importacion.id,
          versionRequerimientosManualesId:
            contexto
              .versionRequerimientosManualesId,
          periodos: {
            create:
              requerimiento
                .periodos.map(
                  (periodo) => ({
                    periodoAnio:
                      periodo.anio,
                    estadoConciliado:
                      estadoConciliado ===
                        EstadoConciliacionManual.ANULADO
                        ? EstadoConciliacionManual.ANULADO
                        : estadoConciliado ===
                            EstadoConciliacionManual.NO_APLICA
                          ? EstadoConciliacionManual.NO_APLICA
                          : EstadoConciliacionManual.REVISAR,
                    montoPagado: 0,
                    observacion:
                      "Pendiente de conciliación automática por placa y periodo.",
                  }),
                ),
          },
          historial: {
            create: {
              usuarioId:
                contexto.usuarioId,
              accion:
                "IMPORTACION_INICIAL",
              campo: null,
              valorAnterior: null,
              valorNuevo:
                estadoManualTexto(
                  requerimiento
                    .estadoManualNormalizado,
                ),
              motivo:
                "Carga inicial desde el Excel de requerimientos manuales.",
              detalles: {
                versionRequerimientosManualesId:
                  contexto
                    .versionRequerimientosManualesId,
                filaOrigen:
                  requerimiento.fila,
                tipoRegistro:
                  requerimiento
                    .tipoRegistro,
                estadoManualNormalizado:
                  requerimiento
                    .estadoManualNormalizado,
                periodos:
                  requerimiento
                    .periodos.map(
                      (periodo) =>
                        periodo.anio,
                    ),
              } satisfies Prisma.InputJsonObject,
            },
          },
          ...(seguimientoOriginal
            ? {
                seguimientos: {
                  create: {
                    usuarioId:
                      contexto.usuarioId,
                    estadoNotificacion,
                    notificador:
                      requerimiento
                        .notificadorOriginal,
                    responsable:
                      requerimiento
                        .responsableOriginal,
                    numeroLiquidacionDeuda:
                      requerimiento
                        .numeroLiquidacionDeudaOriginal,
                    fechaNotificacion:
                      requerimiento
                        .fechaNotificacionOriginal,
                    numeroCedulon:
                      requerimiento
                        .numeroCedulonOriginal,
                    observacion:
                      requerimiento
                        .observacionesOriginal,
                  },
                },
              }
            : {}),
        },
      });
  }

  const importacionFinal =
    await tx.importacion.update({
      where: {
        id:
          importacion.id,
      },
      data: {
        estado:
          EstadoImportacion.COMPLETADA,
        filasCorrectas:
          resultado.filasValidas,
        filasConError: 0,
        registrosNuevos:
          resultado.filasValidas,
        registrosActualizados: 0,
        registrosSinCambios: 0,
        mensaje:
          `Se importaron ${resultado.filasValidas} requerimientos manuales, ` +
          `${resultado.totalPeriodos} periodos y ` +
          `${seguimientosIniciales} seguimientos iniciales. ` +
          `Advertencias conservadas: ${resultado.advertencias.length}.`,
        fechaFinalizacion:
          new Date(),
      },
    });

  return {
    ...importacionFinal,
    totalRegistros:
      resultado.filasValidas,
    totalPeriodos:
      resultado.totalPeriodos,
    seguimientosIniciales,
    porTipoRegistro:
      resultado.porTipoRegistro,
    porEstadoManual:
      resultado.porEstadoManual,
    advertencias:
      resultado.advertencias,
  };
}
