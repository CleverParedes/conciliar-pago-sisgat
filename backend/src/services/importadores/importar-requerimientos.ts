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

import { analizarArchivoRequerimientos } from "./analizar-requerimientos";

interface ContextoImportacionRequerimientos {
  cliente: Prisma.TransactionClient;
  versionRequerimientosId: number;
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

export async function importarRequerimientosDesdeBuffer(
  buffer: Buffer,
  nombreArchivo: string,
  contexto: ContextoImportacionRequerimientos,
) {
  const resultado = analizarArchivoRequerimientos(buffer, nombreArchivo);

  if (resultado.filasConError > 0) {
    throw new Error(
      `El archivo contiene ${resultado.filasConError} fila(s) con error y no puede importarse.`,
    );
  }

  const hashArchivo = createHash("sha256").update(buffer).digest("hex");
  const tx = contexto.cliente;

  const importacion = await tx.importacion.create({
    data: {
      tipo: TipoImportacion.REQUERIMIENTOS,
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
      versionRequerimientosId: contexto.versionRequerimientosId,
      usuarioId: contexto.usuarioId,
    },
  });

  for (const requerimiento of resultado.requerimientos) {
    const contribuyente = await tx.contribuyente.upsert({
      where: {
        numeroDocumento: requerimiento.dniRuc,
      },
      update: {
        tipoDocumento: obtenerTipoDocumento(requerimiento.dniRuc),
      },
      create: {
        tipoDocumento: obtenerTipoDocumento(requerimiento.dniRuc),
        numeroDocumento: requerimiento.dniRuc,
        nombreRazonSocial: requerimiento.nombreRazonSocial,
        direccion: requerimiento.direccion,
      },
    });

    const estaAnulada = requerimiento.estadoOriginal === "ANULADO";

    await tx.requerimiento.create({
      data: {
        anioRequerimiento: requerimiento.anioRequerimiento,
        numeroRequerimiento: requerimiento.numeroRequerimiento,
        idOrigen: requerimiento.idOrigen,
        fechaEmision: requerimiento.fechaEmision,
        contribuyenteId: contribuyente.id,
        dniRucOriginal: requerimiento.dniRuc,
        nombreOriginal: requerimiento.nombreRazonSocial,
        direccionOriginal: requerimiento.direccion,
        placa: requerimiento.placa,
        fechaSunarp: requerimiento.fechaSunarp,
        estadoOriginal: requerimiento.estadoOriginal,
        periodoOriginal: requerimiento.periodoOriginal,
        importeTotal: requerimiento.importeTotal,
        totalPagado: 0,
        saldo: estaAnulada ? 0 : requerimiento.importeTotal,
        estado: estaAnulada
          ? EstadoConciliacion.ANULADO
          : EstadoConciliacion.PENDIENTE,
        usuarioCreacion: requerimiento.usuarioCreacion,
        fechaCreacionOrigen: requerimiento.fechaCreacionOrigen,
        usuarioModificacion: requerimiento.usuarioModificacion,
        fechaModificacionOrigen: requerimiento.fechaModificacionOrigen,
        fechaGeneracion: requerimiento.fechaGeneracion,
        archivoOrigen: nombreArchivo,
        filaOrigen: requerimiento.fila,
        datosOriginales:
          requerimiento.datosOriginales satisfies Prisma.InputJsonObject,
        importacionId: importacion.id,
        versionRequerimientosId: contexto.versionRequerimientosId,
        detalles: {
          create: requerimiento.detalles.map((detalle) => ({
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
      registrosNuevos: resultado.totalRequerimientos,
      registrosActualizados: 0,
      registrosSinCambios: 0,
      mensaje:
        `Se importaron ${resultado.totalRequerimientos} requerimientos ` +
        `y ${resultado.totalDetalles} periodos. ` +
        `Advertencias conservadas: ${resultado.advertencias.length}.`,
      fechaFinalizacion: new Date(),
    },
  });

  return {
    ...importacionFinal,
    totalRequerimientos: resultado.totalRequerimientos,
    totalDetalles: resultado.totalDetalles,
    activos: resultado.activos,
    anulados: resultado.anulados,
    advertencias: resultado.advertencias,
  };
}
