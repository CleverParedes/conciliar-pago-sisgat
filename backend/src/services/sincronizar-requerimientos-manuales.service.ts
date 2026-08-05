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
} from "../../generated/prisma/client";

import {
  analizarArchivoRequerimientosManuales,
  type EstadoManualNormalizado,
  type RequerimientoManualAnalizado,
  type TipoRegistroManualAnalizado,
} from "./importadores/analizar-requerimientos-manuales";

interface ContextoSincronizacion {
  cliente: Prisma.TransactionClient;
  versionRequerimientosManualesId: number;
  usuarioId: number;
  anioGestion: number;
}

function tipoRegistroPrisma(
  tipo: TipoRegistroManualAnalizado,
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
  requerimiento: RequerimientoManualAnalizado,
): EstadoConciliacionManual {
  if (requerimiento.tipoRegistro === "ANULADO") {
    return EstadoConciliacionManual.ANULADO;
  }

  if (
    requerimiento.tipoRegistro === "VACIO" ||
    requerimiento.tipoRegistro === "SIN_REGISTRO" ||
    requerimiento.estadoManualNormalizado === "NO_APLICA"
  ) {
    return EstadoConciliacionManual.NO_APLICA;
  }

  return EstadoConciliacionManual.REVISAR;
}

function determinarEstadoRevisionInicial(
  requerimiento: RequerimientoManualAnalizado,
): EstadoRevisionManual {
  if (
    requerimiento.tipoRegistro === "ANULADO" ||
    requerimiento.tipoRegistro === "VACIO" ||
    requerimiento.tipoRegistro === "SIN_REGISTRO" ||
    requerimiento.estadoManualNormalizado === "NO_APLICA"
  ) {
    return EstadoRevisionManual.NO_APLICA;
  }

  return EstadoRevisionManual.PENDIENTE;
}

function determinarEstadoNotificacionInicial(
  requerimiento: RequerimientoManualAnalizado,
): EstadoNotificacionManual {
  if (
    requerimiento.fechaNotificacionOriginal ||
    requerimiento.numeroCedulonOriginal
  ) {
    return EstadoNotificacionManual.NOTIFICADO;
  }

  if (requerimiento.notificadorOriginal) {
    return EstadoNotificacionManual.ASIGNADO;
  }

  return EstadoNotificacionManual.SIN_ASIGNAR;
}

function datosOriginalesJson(
  datos: Record<string, string | number | boolean | null>,
): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(datos).map(([clave, valor]) => [
      clave,
      valor === null ? "" : valor,
    ]),
  ) as Prisma.InputJsonObject;
}

function aJsonPrisma(valor: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
}

function tieneSeguimientoOriginal(
  requerimiento: RequerimientoManualAnalizado,
): boolean {
  return Boolean(
    requerimiento.notificadorOriginal ||
      requerimiento.responsableOriginal ||
      requerimiento.numeroLiquidacionDeudaOriginal ||
      requerimiento.fechaNotificacionOriginal ||
      requerimiento.numeroCedulonOriginal ||
      requerimiento.observacionesOriginal,
  );
}

function fechaComparable(valor: Date | null): string | null {
  return valor ? valor.toISOString().slice(0, 10) : null;
}

function estadoManualTexto(estado: EstadoManualNormalizado): string {
  return estado;
}

function fuenteAnalizada(requerimiento: RequerimientoManualAnalizado) {
  return {
    correlativoExcel: requerimiento.correlativoExcel,
    placaOriginal: requerimiento.placaOriginal,
    placaNormalizada: requerimiento.placaNormalizada,
    fechaRequerimiento: fechaComparable(requerimiento.fechaRequerimiento),
    anioVehiculoOriginal: requerimiento.anioVehiculoOriginal,
    anioVehiculo: requerimiento.anioVehiculo,
    deudaOriginal: requerimiento.deudaOriginal,
    propietarioOriginal: requerimiento.propietarioOriginal,
    estadoManualOriginal: requerimiento.estadoManualOriginal,
    provinciaOriginal: requerimiento.provinciaOriginal,
    distritoOriginal: requerimiento.distritoOriginal,
    direccionOriginal: requerimiento.direccionOriginal,
    notificadorOriginal: requerimiento.notificadorOriginal,
    observacionesOriginal: requerimiento.observacionesOriginal,
    numeroLiquidacionDeudaOriginal:
      requerimiento.numeroLiquidacionDeudaOriginal,
    fechaNotificacionOriginal: fechaComparable(
      requerimiento.fechaNotificacionOriginal,
    ),
    numeroCedulonOriginal: requerimiento.numeroCedulonOriginal,
    responsableOriginal: requerimiento.responsableOriginal,
    tipoRegistro: requerimiento.tipoRegistro,
    periodos: requerimiento.periodos.map((periodo) => periodo.anio).sort(),
  };
}

function fuenteExistente(requerimiento: {
  correlativoExcel: number | null;
  placaOriginal: string | null;
  placaNormalizada: string | null;
  fechaRequerimiento: Date | null;
  anioVehiculoOriginal: string | null;
  anioVehiculo: number | null;
  deudaOriginal: string | null;
  propietarioOriginal: string | null;
  estadoManualOriginal: string | null;
  provinciaOriginal: string | null;
  distritoOriginal: string | null;
  direccionOriginal: string | null;
  notificadorOriginal: string | null;
  observacionesOriginal: string | null;
  numeroLiquidacionDeudaOriginal: string | null;
  fechaNotificacionOriginal: Date | null;
  numeroCedulonOriginal: string | null;
  responsableOriginal: string | null;
  tipoRegistro: TipoRegistroManual;
  periodos: Array<{ periodoAnio: number }>;
}) {
  return {
    correlativoExcel: requerimiento.correlativoExcel,
    placaOriginal: requerimiento.placaOriginal,
    placaNormalizada: requerimiento.placaNormalizada,
    fechaRequerimiento: fechaComparable(requerimiento.fechaRequerimiento),
    anioVehiculoOriginal: requerimiento.anioVehiculoOriginal,
    anioVehiculo: requerimiento.anioVehiculo,
    deudaOriginal: requerimiento.deudaOriginal,
    propietarioOriginal: requerimiento.propietarioOriginal,
    estadoManualOriginal: requerimiento.estadoManualOriginal,
    provinciaOriginal: requerimiento.provinciaOriginal,
    distritoOriginal: requerimiento.distritoOriginal,
    direccionOriginal: requerimiento.direccionOriginal,
    notificadorOriginal: requerimiento.notificadorOriginal,
    observacionesOriginal: requerimiento.observacionesOriginal,
    numeroLiquidacionDeudaOriginal:
      requerimiento.numeroLiquidacionDeudaOriginal,
    fechaNotificacionOriginal: fechaComparable(
      requerimiento.fechaNotificacionOriginal,
    ),
    numeroCedulonOriginal: requerimiento.numeroCedulonOriginal,
    responsableOriginal: requerimiento.responsableOriginal,
    tipoRegistro: requerimiento.tipoRegistro,
    periodos: requerimiento.periodos
      .map((periodo) => periodo.periodoAnio)
      .sort(),
  };
}

function crearPeriodos(
  requerimiento: RequerimientoManualAnalizado,
  estadoConciliado: EstadoConciliacionManual,
) {
  return requerimiento.periodos.map((periodo) => ({
    periodoAnio: periodo.anio,
    estadoConciliado:
      estadoConciliado === EstadoConciliacionManual.ANULADO
        ? EstadoConciliacionManual.ANULADO
        : estadoConciliado === EstadoConciliacionManual.NO_APLICA
          ? EstadoConciliacionManual.NO_APLICA
          : EstadoConciliacionManual.REVISAR,
    montoPagado: 0,
    observacion:
      "Pendiente de conciliación automática por placa y periodo.",
  }));
}

export async function sincronizarRequerimientosManualesDesdeBuffer(
  buffer: Buffer,
  nombreArchivo: string,
  contexto: ContextoSincronizacion,
) {
  const resultado = await analizarArchivoRequerimientosManuales(
    buffer,
    nombreArchivo,
    contexto.anioGestion,
  );

  if (resultado.filasConError > 0) {
    throw new Error(
      `El Excel contiene ${resultado.filasConError} fila(s) con error y no puede aplicarse.`,
    );
  }

  const tx = contexto.cliente;
  const hashArchivo = createHash("sha256").update(buffer).digest("hex");

  const importacion = await tx.importacion.create({
    data: {
      tipo: TipoImportacion.REQUERIMIENTOS_MANUALES,
      origen: OrigenImportacion.MANUAL,
      estado: EstadoImportacion.PROCESANDO,
      nombreArchivo,
      hashArchivo,
      totalFilas: resultado.totalFilas,
      filasCorrectas: 0,
      filasConError: 0,
      modo: ModoImportacion.HISTORICA,
      fechaDesde: null,
      fechaHasta: null,
      tipoFechaFiltro: TipoFechaFiltro.NO_ESPECIFICADO,
      registrosNuevos: 0,
      registrosActualizados: 0,
      registrosSinCambios: 0,
      versionRequerimientosManualesId:
        contexto.versionRequerimientosManualesId,
      usuarioId: contexto.usuarioId,
    },
  });

  const existentes = await tx.requerimientoManual.findMany({
    where: {
      anioGestion: contexto.anioGestion,
    },
    include: {
      periodos: {
        select: {
          periodoAnio: true,
        },
      },
    },
  });

  const porNumero = new Map(
    existentes.map((registro) => [registro.numeroRequerimiento, registro]),
  );
  const procesados = new Set<string>();

  let registrosNuevos = 0;
  let registrosActualizados = 0;
  let registrosSinCambios = 0;
  let seguimientosIniciales = 0;

  for (const requerimiento of resultado.requerimientos) {
    procesados.add(requerimiento.numeroRequerimiento);
    const existente = porNumero.get(requerimiento.numeroRequerimiento);
    const estadoConciliado = determinarEstadoConciliadoInicial(requerimiento);
    const estadoRevision = determinarEstadoRevisionInicial(requerimiento);

    if (!existente) {
      const estadoNotificacion = determinarEstadoNotificacionInicial(
        requerimiento,
      );
      const seguimientoOriginal = tieneSeguimientoOriginal(requerimiento);

      if (seguimientoOriginal) {
        seguimientosIniciales += 1;
      }

      await tx.requerimientoManual.create({
        data: {
          anioGestion: contexto.anioGestion,
          numeroRequerimiento: requerimiento.numeroRequerimiento,
          correlativoExcel: requerimiento.correlativoExcel,
          placaOriginal: requerimiento.placaOriginal,
          placaNormalizada: requerimiento.placaNormalizada,
          fechaRequerimiento: requerimiento.fechaRequerimiento,
          anioVehiculoOriginal: requerimiento.anioVehiculoOriginal,
          anioVehiculo: requerimiento.anioVehiculo,
          deudaOriginal: requerimiento.deudaOriginal,
          propietarioOriginal: requerimiento.propietarioOriginal,
          estadoManualOriginal: requerimiento.estadoManualOriginal,
          provinciaOriginal: requerimiento.provinciaOriginal,
          distritoOriginal: requerimiento.distritoOriginal,
          direccionOriginal: requerimiento.direccionOriginal,
          notificadorOriginal: requerimiento.notificadorOriginal,
          observacionesOriginal: requerimiento.observacionesOriginal,
          numeroLiquidacionDeudaOriginal:
            requerimiento.numeroLiquidacionDeudaOriginal,
          fechaNotificacionOriginal: requerimiento.fechaNotificacionOriginal,
          numeroCedulonOriginal: requerimiento.numeroCedulonOriginal,
          responsableOriginal: requerimiento.responsableOriginal,
          tipoRegistro: tipoRegistroPrisma(requerimiento.tipoRegistro),
          estadoConciliado,
          estadoRevision,
          estadoNotificacion,
          notificadorActual: requerimiento.notificadorOriginal,
          responsableActual: requerimiento.responsableOriginal,
          numeroLiquidacionDeudaActual:
            requerimiento.numeroLiquidacionDeudaOriginal,
          fechaNotificacionActual: requerimiento.fechaNotificacionOriginal,
          numeroCedulonActual: requerimiento.numeroCedulonOriginal,
          observacionSeguimiento: requerimiento.observacionesOriginal,
          archivoOrigen: nombreArchivo,
          filaOrigen: requerimiento.fila,
          datosOriginales: datosOriginalesJson(requerimiento.datosOriginales),
          importacionId: importacion.id,
          versionRequerimientosManualesId:
            contexto.versionRequerimientosManualesId,
          periodos: {
            create: crearPeriodos(requerimiento, estadoConciliado),
          },
          historial: {
            create: {
              usuarioId: contexto.usuarioId,
              accion: "IMPORTACION_NUEVO_DESDE_EXCEL",
              campo: null,
              valorAnterior: null,
              valorNuevo: estadoManualTexto(
                requerimiento.estadoManualNormalizado,
              ),
              motivo:
                "Registro incorporado por una nueva versión del Excel de requerimientos manuales.",
              detalles: {
                versionRequerimientosManualesId:
                  contexto.versionRequerimientosManualesId,
                filaOrigen: requerimiento.fila,
                tipoRegistro: requerimiento.tipoRegistro,
                periodos: requerimiento.periodos.map((periodo) => periodo.anio),
              } satisfies Prisma.InputJsonObject,
            },
          },
          ...(seguimientoOriginal
            ? {
                seguimientos: {
                  create: {
                    usuarioId: contexto.usuarioId,
                    estadoNotificacion,
                    notificador: requerimiento.notificadorOriginal,
                    responsable: requerimiento.responsableOriginal,
                    numeroLiquidacionDeuda:
                      requerimiento.numeroLiquidacionDeudaOriginal,
                    fechaNotificacion: requerimiento.fechaNotificacionOriginal,
                    numeroCedulon: requerimiento.numeroCedulonOriginal,
                    observacion: requerimiento.observacionesOriginal,
                  },
                },
              }
            : {}),
        },
      });

      registrosNuevos += 1;
      continue;
    }

    const anterior = fuenteExistente(existente);
    const nueva = fuenteAnalizada(requerimiento);
    const huboCambios = JSON.stringify(anterior) !== JSON.stringify(nueva);
    const periodosCambiaron =
      JSON.stringify(anterior.periodos) !== JSON.stringify(nueva.periodos);

    if (periodosCambiaron) {
      await tx.requerimientoManualPeriodo.deleteMany({
        where: {
          requerimientoManualId: existente.id,
        },
      });
    }

    await tx.requerimientoManual.update({
      where: {
        id: existente.id,
      },
      data: {
        correlativoExcel: requerimiento.correlativoExcel,
        placaOriginal: requerimiento.placaOriginal,
        placaNormalizada: requerimiento.placaNormalizada,
        fechaRequerimiento: requerimiento.fechaRequerimiento,
        anioVehiculoOriginal: requerimiento.anioVehiculoOriginal,
        anioVehiculo: requerimiento.anioVehiculo,
        deudaOriginal: requerimiento.deudaOriginal,
        propietarioOriginal: requerimiento.propietarioOriginal,
        estadoManualOriginal: requerimiento.estadoManualOriginal,
        provinciaOriginal: requerimiento.provinciaOriginal,
        distritoOriginal: requerimiento.distritoOriginal,
        direccionOriginal: requerimiento.direccionOriginal,
        notificadorOriginal: requerimiento.notificadorOriginal,
        observacionesOriginal: requerimiento.observacionesOriginal,
        numeroLiquidacionDeudaOriginal:
          requerimiento.numeroLiquidacionDeudaOriginal,
        fechaNotificacionOriginal: requerimiento.fechaNotificacionOriginal,
        numeroCedulonOriginal: requerimiento.numeroCedulonOriginal,
        responsableOriginal: requerimiento.responsableOriginal,
        tipoRegistro: tipoRegistroPrisma(requerimiento.tipoRegistro),
        estadoConciliado,
        estadoRevision,
        archivoOrigen: nombreArchivo,
        filaOrigen: requerimiento.fila,
        datosOriginales: datosOriginalesJson(requerimiento.datosOriginales),
        importacionId: importacion.id,
        versionRequerimientosManualesId:
          contexto.versionRequerimientosManualesId,
        ...(periodosCambiaron
          ? {
              periodos: {
                create: crearPeriodos(requerimiento, estadoConciliado),
              },
            }
          : {}),
        ...(huboCambios
          ? {
              historial: {
                create: {
                  usuarioId: contexto.usuarioId,
                  accion: "ACTUALIZACION_DESDE_EXCEL",
                  campo: "DATOS_ORIGEN",
                  valorAnterior: JSON.stringify(anterior).slice(0, 3000),
                  valorNuevo: JSON.stringify(nueva).slice(0, 3000),
                  motivo:
                    "Datos de origen actualizados desde una nueva versión del Excel. El seguimiento operativo se conservó.",
                  detalles: {
                    versionRequerimientosManualesId:
                      contexto.versionRequerimientosManualesId,
                    filaOrigen: requerimiento.fila,
                    periodosCambiaron,
                    fuenteAnterior: aJsonPrisma(anterior),
                    fuenteNueva: aJsonPrisma(nueva),
                    seguimientoOperativoConservado: true,
                  } satisfies Prisma.InputJsonObject,
                },
              },
            }
          : {}),
      },
    });

    if (huboCambios) {
      registrosActualizados += 1;
    } else {
      registrosSinCambios += 1;
    }
  }

  const registrosConservadosNoIncluidos = existentes.filter(
    (registro) => !procesados.has(registro.numeroRequerimiento),
  ).length;

  const importacionFinal = await tx.importacion.update({
    where: {
      id: importacion.id,
    },
    data: {
      estado: EstadoImportacion.COMPLETADA,
      filasCorrectas: resultado.filasValidas,
      filasConError: 0,
      registrosNuevos,
      registrosActualizados,
      registrosSinCambios,
      mensaje:
        `Se procesaron ${resultado.filasValidas} filas del Excel: ` +
        `${registrosNuevos} nuevas, ${registrosActualizados} actualizadas y ` +
        `${registrosSinCambios} sin cambios. ` +
        `${registrosConservadosNoIncluidos} registros anteriores no incluidos ` +
        `se conservaron para no perder seguimientos ni historial.`,
      fechaFinalizacion: new Date(),
    },
  });

  return {
    ...importacionFinal,
    totalRegistros: resultado.filasValidas,
    totalPeriodos: resultado.totalPeriodos,
    registrosNuevos,
    registrosActualizados,
    registrosSinCambios,
    registrosConservadosNoIncluidos,
    seguimientosIniciales,
    porTipoRegistro: resultado.porTipoRegistro,
    porEstadoManual: resultado.porEstadoManual,
    advertencias: resultado.advertencias,
  };
}
