import { createHash } from "node:crypto";

import {
  EstadoConciliacion,
  EstadoImportacion,
  ModoImportacion,
  OrigenImportacion,
  TipoFechaFiltro,
  TipoImportacion,
  type Prisma,
} from "../../../generated/prisma/client";

import { analizarArchivoLiquidaciones } from "./analizar-liquidaciones";

interface ContextoImportacionLiquidaciones {
  cliente: Prisma.TransactionClient;
  versionLiquidacionesId: number;
  usuarioId: number;
}

function obtenerTipoDocumento(documento: string): string {
  if (documento.length === 8) {
    return "DNI";
  }

  if (documento.length === 11) {
    return "RUC";
  }

  return "OTRO";
}

export async function importarLiquidacionesDesdeBuffer(
  buffer: Buffer,
  nombreArchivo: string,
  contexto: ContextoImportacionLiquidaciones,
) {
  const resultado = analizarArchivoLiquidaciones(buffer, nombreArchivo);

  if (resultado.filasConError > 0) {
    throw new Error(
      `El archivo contiene ${resultado.filasConError} fila(s) con error y no puede importarse.`,
    );
  }

  const hashArchivo = createHash("sha256").update(buffer).digest("hex");
  const tx = contexto.cliente;

  const importacion = await tx.importacion.create({
    data: {
      tipo: TipoImportacion.LIQUIDACIONES,
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
      versionLiquidacionesId: contexto.versionLiquidacionesId,
      usuarioId: contexto.usuarioId,
    },
  });

  for (const liquidacion of resultado.liquidaciones) {
    const contribuyente = await tx.contribuyente.upsert({
      where: {
        numeroDocumento: liquidacion.dniRuc,
      },
      update: {
        tipoDocumento: obtenerTipoDocumento(liquidacion.dniRuc),
        nombreRazonSocial: liquidacion.nombreRazonSocial,
        direccion: liquidacion.direccion,
      },
      create: {
        tipoDocumento: obtenerTipoDocumento(liquidacion.dniRuc),
        numeroDocumento: liquidacion.dniRuc,
        nombreRazonSocial: liquidacion.nombreRazonSocial,
        direccion: liquidacion.direccion,
      },
    });

    const estaAnulada = liquidacion.estadoOriginal === "ANULADO";

    await tx.liquidacion.create({
      data: {
        anioLiquidacion: liquidacion.anioLiquidacion,
        numeroLiquidacion: liquidacion.numeroLiquidacion,
        idOrigen: liquidacion.idOrigen,
        fechaEmision: liquidacion.fechaEmision,
        contribuyenteId: contribuyente.id,
        dniRucOriginal: liquidacion.dniRuc,
        nombreOriginal: liquidacion.nombreRazonSocial,
        direccionOriginal: liquidacion.direccion,
        placa: liquidacion.placa,
        fechaSunarp: liquidacion.fechaSunarp,
        estadoOriginal: liquidacion.estadoOriginal,
        periodoOriginal: liquidacion.periodoOriginal,
        importeTotal: liquidacion.importeTotal,
        totalPagado: 0,
        saldo: estaAnulada ? 0 : liquidacion.importeTotal,
        estado: estaAnulada
          ? EstadoConciliacion.ANULADO
          : EstadoConciliacion.PENDIENTE,
        usuarioCreacion: liquidacion.usuarioCreacion,
        fechaCreacionOrigen: liquidacion.fechaCreacionOrigen,
        usuarioModificacion: liquidacion.usuarioModificacion,
        fechaModificacionOrigen: liquidacion.fechaModificacionOrigen,
        fechaGeneracion: liquidacion.fechaGeneracion,
        anioRVeh: liquidacion.anioRVeh,
        numeroRVeh: liquidacion.numeroRVeh,
        archivoOrigen: nombreArchivo,
        filaOrigen: liquidacion.fila,
        datosOriginales:
          liquidacion.datosOriginales satisfies Prisma.InputJsonObject,
        importacionId: importacion.id,
        versionLiquidacionesId: contexto.versionLiquidacionesId,
        detalles: {
          create: liquidacion.detalles.map((detalle) => ({
            periodoAnio: detalle.anio,
            periodoOriginal: detalle.original,
            trimestreDesde: detalle.trimestreDesde,
            trimestreHasta: detalle.trimestreHasta,
            valorReferencial: detalle.valorReferencial,
            anioFabricacion: detalle.anioFabricacion,
            uit: detalle.uit,
            baseImponible: detalle.baseImponible,
            impuesto: detalle.impuesto,
            reajuste: detalle.reajuste,
            interes: detalle.interes,
            gastosAdmin: detalle.gastosAdministrativos,
            totalPeriodo: detalle.totalPeriodo,
            montoPagado: 0,
            saldo: estaAnulada ? 0 : detalle.totalPeriodo,
            estado: estaAnulada
              ? EstadoConciliacion.ANULADO
              : EstadoConciliacion.PENDIENTE,
            observacion: estaAnulada
              ? "La liquidación figura como anulada en el archivo de origen."
              : null,
          })),
        },
      },
    });
  }

  const importacionFinal = await tx.importacion.update({
    where: {
      id: importacion.id,
    },
    data: {
      estado: EstadoImportacion.COMPLETADA,
      filasCorrectas: resultado.filasValidas,
      filasConError: 0,
      registrosNuevos: resultado.totalLiquidaciones,
      registrosActualizados: 0,
      registrosSinCambios: 0,
      mensaje:
        `Se importaron ${resultado.totalLiquidaciones} liquidaciones ` +
        `y ${resultado.totalDetalles} periodos.`,
      fechaFinalizacion: new Date(),
    },
  });

  return {
    ...importacionFinal,
    totalLiquidaciones: resultado.totalLiquidaciones,
    totalDetalles: resultado.totalDetalles,
    activas: resultado.activas,
    anuladas: resultado.anuladas,
  };
}
