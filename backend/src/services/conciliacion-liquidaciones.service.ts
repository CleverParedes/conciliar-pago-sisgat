import {
  EstadoConciliacion,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

const TOLERANCIA_MONTO = 0.05;

export interface ResultadoConciliacionLiquidaciones {
  detallesProcesados: number;
  liquidacionesProcesadas: number;
  resumenDetalles: Record<string, number>;
  resumenLiquidaciones: Record<string, number>;
}

interface SolapamientoDetectado {
  trimestre: number;
  recibos: string[];
}

function redondearMoneda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function normalizarTexto(valor: string | null): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function reciboSeSuperpone(
  trimestreDesde: number | null,
  trimestreHasta: number | null,
  detalleDesde: number,
  detalleHasta: number,
): boolean {
  if (trimestreDesde === null || trimestreHasta === null) {
    return false;
  }

  return trimestreHasta >= detalleDesde && trimestreDesde <= detalleHasta;
}

function incrementarResumen(
  resumen: Record<string, number>,
  estado: EstadoConciliacion,
): void {
  resumen[estado] = (resumen[estado] ?? 0) + 1;
}

function determinarEstadoLiquidacion(
  estados: EstadoConciliacion[],
  estadoOriginal: string | null,
): EstadoConciliacion {
  const original = normalizarTexto(estadoOriginal);

  if (original === "ANULADO") {
    return EstadoConciliacion.ANULADO;
  }

  if (original !== "ACTIVO") {
    return EstadoConciliacion.REVISAR;
  }

  if (estados.length === 0) {
    return EstadoConciliacion.REVISAR;
  }

  if (estados.includes(EstadoConciliacion.REVISAR)) {
    return EstadoConciliacion.REVISAR;
  }

  const todosPagados = estados.every(
    (estado) =>
      estado === EstadoConciliacion.PAGADO ||
      estado === EstadoConciliacion.SOBREPAGO,
  );

  if (todosPagados) {
    return EstadoConciliacion.PAGADO;
  }

  const existePago = estados.some(
    (estado) =>
      estado === EstadoConciliacion.PAGADO ||
      estado === EstadoConciliacion.PAGO_PARCIAL ||
      estado === EstadoConciliacion.SOBREPAGO,
  );

  if (existePago) {
    return EstadoConciliacion.PAGO_PARCIAL;
  }

  if (
    estados.every((estado) => estado === EstadoConciliacion.SIN_DECLARACION)
  ) {
    return EstadoConciliacion.SIN_DECLARACION;
  }

  if (estados.every((estado) => estado === EstadoConciliacion.PAGO_ANULADO)) {
    return EstadoConciliacion.PAGO_ANULADO;
  }

  return EstadoConciliacion.PENDIENTE;
}

export async function ejecutarConciliacionLiquidaciones(
  cliente: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ResultadoConciliacionLiquidaciones> {
  const resumenDetalles: Record<string, number> = {};
  const resumenLiquidaciones: Record<string, number> = {};

  const detalles = await cliente.liquidacionDetalle.findMany({
    include: {
      liquidacion: {
        select: {
          id: true,
          dniRucOriginal: true,
          placa: true,
          estadoOriginal: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  for (const detalle of detalles) {
    const observaciones: string[] = [];
    const estadoOriginal = normalizarTexto(
      detalle.liquidacion.estadoOriginal,
    );

    if (estadoOriginal === "ANULADO") {
      await cliente.liquidacionDetalle.update({
        where: {
          id: detalle.id,
        },
        data: {
          declaracionId: null,
          montoPagado: 0,
          saldo: 0,
          estado: EstadoConciliacion.ANULADO,
          observacion:
            "La liquidación figura como anulada en el archivo de origen.",
        },
      });

      incrementarResumen(resumenDetalles, EstadoConciliacion.ANULADO);
      continue;
    }

    if (estadoOriginal !== "ACTIVO") {
      await cliente.liquidacionDetalle.update({
        where: {
          id: detalle.id,
        },
        data: {
          declaracionId: null,
          montoPagado: 0,
          saldo: detalle.totalPeriodo,
          estado: EstadoConciliacion.REVISAR,
          observacion:
            "El estado original de la liquidación no es Activo ni Anulado.",
        },
      });

      incrementarResumen(resumenDetalles, EstadoConciliacion.REVISAR);
      continue;
    }

    const documento = detalle.liquidacion.dniRucOriginal;
    const placa = detalle.liquidacion.placa;

    if (!documento || !placa) {
      await cliente.liquidacionDetalle.update({
        where: {
          id: detalle.id,
        },
        data: {
          declaracionId: null,
          montoPagado: 0,
          saldo: detalle.totalPeriodo,
          estado: EstadoConciliacion.REVISAR,
          observacion:
            "La liquidación no tiene DNI/RUC o placa para realizar la comparación.",
        },
      });

      incrementarResumen(resumenDetalles, EstadoConciliacion.REVISAR);
      continue;
    }

    const declaraciones = await cliente.declaracion.findMany({
      where: {
        dniRuc: documento,
        placa,
        anioDeclaracion: detalle.periodoAnio,
      },
      include: {
        recibos: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (declaraciones.length === 0) {
      await cliente.liquidacionDetalle.update({
        where: {
          id: detalle.id,
        },
        data: {
          declaracionId: null,
          montoPagado: 0,
          saldo: detalle.totalPeriodo,
          estado: EstadoConciliacion.SIN_DECLARACION,
          observacion:
            "No se encontró una declaración con el mismo DNI/RUC, placa y año.",
        },
      });

      incrementarResumen(
        resumenDetalles,
        EstadoConciliacion.SIN_DECLARACION,
      );
      continue;
    }

    const recibos = declaraciones.flatMap((declaracion) =>
      declaracion.recibos.map((recibo) => ({
        ...recibo,
        declaracionOrigenId: declaracion.id,
      })),
    );

    const recibosRelacionados = recibos.filter((recibo) =>
      reciboSeSuperpone(
        recibo.trimestreDesde,
        recibo.trimestreHasta,
        detalle.trimestreDesde,
        detalle.trimestreHasta,
      ),
    );

    const recibosActivos = recibosRelacionados.filter(
      (recibo) => recibo.activo,
    );

    const recibosAnulados = recibosRelacionados.filter(
      (recibo) =>
        !recibo.activo && normalizarTexto(recibo.estadoOriginal) === "ANULADO",
    );

    const recibosConOtroEstado = recibosRelacionados.filter(
      (recibo) =>
        !recibo.activo && normalizarTexto(recibo.estadoOriginal) !== "ANULADO",
    );

    const recibosPorTrimestre = new Map<number, Set<string>>();

    for (const recibo of recibosActivos) {
      if (recibo.trimestreDesde === null || recibo.trimestreHasta === null) {
        continue;
      }

      const desde = Math.max(
        recibo.trimestreDesde,
        detalle.trimestreDesde,
      );
      const hasta = Math.min(
        recibo.trimestreHasta,
        detalle.trimestreHasta,
      );
      const identificadorRecibo =
        `${recibo.anioRecibo}-${recibo.numeroRecibo} ` +
        `${recibo.trimestreOriginal ?? ""}`;

      for (let trimestre = desde; trimestre <= hasta; trimestre += 1) {
        const recibosDelTrimestre =
          recibosPorTrimestre.get(trimestre) ?? new Set<string>();

        recibosDelTrimestre.add(identificadorRecibo.trim());
        recibosPorTrimestre.set(trimestre, recibosDelTrimestre);
      }
    }

    const solapamientos: SolapamientoDetectado[] = Array.from(
      recibosPorTrimestre.entries(),
    )
      .filter(([_trimestre, conjunto]) => conjunto.size > 1)
      .map(([trimestre, conjunto]) => ({
        trimestre,
        recibos: Array.from(conjunto),
      }));

    const declaracionesConPago = new Set(
      recibosActivos.map((recibo) => recibo.declaracionOrigenId),
    );

    let declaracionId: number | null = null;

    if (declaracionesConPago.size === 1) {
      declaracionId = [...declaracionesConPago][0];
    } else if (declaraciones.length === 1) {
      declaracionId = declaraciones[0].id;
    }

    const montoPagado = redondearMoneda(
      recibosActivos.reduce(
        (total, recibo) => total + Number(recibo.monto),
        0,
      ),
    );

    const totalPeriodo = Number(detalle.totalPeriodo);
    const saldo = redondearMoneda(
      Math.max(totalPeriodo - montoPagado, 0),
    );

    const trimestresCubiertos = new Set<number>();

    for (const recibo of recibosActivos) {
      if (recibo.trimestreDesde === null || recibo.trimestreHasta === null) {
        continue;
      }

      const desde = Math.max(
        recibo.trimestreDesde,
        detalle.trimestreDesde,
      );
      const hasta = Math.min(
        recibo.trimestreHasta,
        detalle.trimestreHasta,
      );

      for (let trimestre = desde; trimestre <= hasta; trimestre += 1) {
        trimestresCubiertos.add(trimestre);
      }
    }

    const coberturaCompleta = Array.from(
      {
        length: detalle.trimestreHasta - detalle.trimestreDesde + 1,
      },
      (_valor, indice) => detalle.trimestreDesde + indice,
    ).every((trimestre) => trimestresCubiertos.has(trimestre));

    let estado: EstadoConciliacion;

    if (solapamientos.length > 0) {
      estado = EstadoConciliacion.REVISAR;

      const detalleSolapamientos = solapamientos
        .map(
          ({ trimestre, recibos: recibosSuperpuestos }) =>
            `T${trimestre}: ${recibosSuperpuestos.join(", ")}`,
        )
        .join("; ");

      observaciones.push(
        "Se detectaron recibos activos superpuestos. " +
          `${detalleSolapamientos}. El periodo requiere revisión manual.`,
      );
    } else if (recibosActivos.length === 0) {
      if (recibosConOtroEstado.length > 0) {
        estado = EstadoConciliacion.REVISAR;
        observaciones.push(
          "Se encontraron recibos con un estado diferente de Activo o Anulado.",
        );
      } else if (recibosAnulados.length > 0) {
        estado = EstadoConciliacion.PAGO_ANULADO;
        observaciones.push("Solo se encontraron recibos anulados.");
      } else {
        estado = EstadoConciliacion.PENDIENTE;
        observaciones.push(
          "Existe declaración, pero no tiene recibos asociados para los trimestres de la liquidación.",
        );
      }
    } else if (!coberturaCompleta) {
      estado = EstadoConciliacion.PAGO_PARCIAL;
      observaciones.push(
        "Existen pagos activos, pero no cubren todos los trimestres de la liquidación. " +
          "El estado parcial se determina por cobertura incompleta, no por diferencia de monto.",
      );
    } else {
      estado = EstadoConciliacion.PAGADO;

      const diferenciaPago = redondearMoneda(totalPeriodo - montoPagado);

      if (diferenciaPago > TOLERANCIA_MONTO) {
        observaciones.push(
          "Los pagos activos cubren todos los trimestres solicitados. " +
            `El monto registrado es menor al total liquidado en S/ ${diferenciaPago.toFixed(2)}, ` +
            "pero la diferencia se conserva únicamente como información y no se interpreta como deuda.",
        );
      } else if (diferenciaPago < -TOLERANCIA_MONTO) {
        observaciones.push(
          "Los pagos activos cubren todos los trimestres solicitados. " +
            `El monto registrado supera el total liquidado en S/ ${Math.abs(
              diferenciaPago,
            ).toFixed(2)}. La diferencia se conserva únicamente como información.`,
        );
      } else {
        observaciones.push(
          "Los pagos activos cubren todos los trimestres solicitados.",
        );
      }
    }

    if (declaraciones.length > 1) {
      observaciones.push(
        `Se encontraron ${declaraciones.length} declaraciones coincidentes.`,
      );
    }

    const saldoConciliado =
      estado === EstadoConciliacion.PAGADO ||
      estado === EstadoConciliacion.PAGO_PARCIAL
        ? 0
        : saldo;

    await cliente.liquidacionDetalle.update({
      where: {
        id: detalle.id,
      },
      data: {
        declaracionId,
        montoPagado,
        saldo: saldoConciliado,
        estado,
        observacion:
          observaciones.length > 0 ? observaciones.join(" ") : null,
      },
    });

    incrementarResumen(resumenDetalles, estado);
  }

  const liquidaciones = await cliente.liquidacion.findMany({
    include: {
      detalles: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  for (const liquidacion of liquidaciones) {
    const estado = determinarEstadoLiquidacion(
      liquidacion.detalles.map((detalle) => detalle.estado),
      liquidacion.estadoOriginal,
    );

    const estaAnulada = estado === EstadoConciliacion.ANULADO;

    const totalPagado = estaAnulada
      ? 0
      : redondearMoneda(
          liquidacion.detalles.reduce(
            (total, detalle) => total + Number(detalle.montoPagado),
            0,
          ),
        );

    const saldo = estaAnulada
      ? 0
      : redondearMoneda(
          liquidacion.detalles.reduce(
            (total, detalle) => total + Number(detalle.saldo),
            0,
          ),
        );

    await cliente.liquidacion.update({
      where: {
        id: liquidacion.id,
      },
      data: {
        totalPagado,
        saldo,
        estado,
      },
    });

    incrementarResumen(resumenLiquidaciones, estado);
  }

  return {
    detallesProcesados: detalles.length,
    liquidacionesProcesadas: liquidaciones.length,
    resumenDetalles,
    resumenLiquidaciones,
  };
}
