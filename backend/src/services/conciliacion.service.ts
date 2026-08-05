import { EstadoConciliacion, type Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";

const TOLERANCIA_MONTO = 0.05;

interface ResultadoConciliacion {
  detallesProcesados: number;
  ordenesProcesadas: number;
  resumenDetalles: Record<string, number>;
  resumenOrdenes: Record<string, number>;
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

function determinarEstadoOrden(
  estados: EstadoConciliacion[],
  activoOriginal: number | null,
): EstadoConciliacion {
  if (activoOriginal !== 1) {
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

function incrementarResumen(
  resumen: Record<string, number>,
  estado: EstadoConciliacion,
): void {
  resumen[estado] = (resumen[estado] ?? 0) + 1;
}

export async function ejecutarConciliacion(
  cliente: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ResultadoConciliacion> {
  const resumenDetalles: Record<string, number> = {};

  const resumenOrdenes: Record<string, number> = {};

  const detalles = await cliente.ordenDetalle.findMany({
    include: {
      orden: {
        select: {
          id: true,
          dniRucOriginal: true,
          placa: true,
          activoOriginal: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  });

  for (const detalle of detalles) {
    const observaciones: string[] = [];

    const documento = detalle.orden.dniRucOriginal;

    const placa = detalle.orden.placa;

    if (!documento || !placa) {
      await cliente.ordenDetalle.update({
        where: {
          id: detalle.id,
        },
        data: {
          declaracionId: null,
          montoPagado: 0,
          saldo: detalle.totalPeriodo,
          estado: EstadoConciliacion.REVISAR,
          observacion:
            "La orden no tiene DNI/RUC o placa para realizar la comparación.",
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
      await cliente.ordenDetalle.update({
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

      incrementarResumen(resumenDetalles, EstadoConciliacion.SIN_DECLARACION);

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

    /*
     * IMPORTANTE:
     * Esta declaración debe existir antes de usar
     * recibosActivos en la validación de solapamientos.
     */
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

    /*
     * Detecta si dos o más recibos activos cubren
     * un mismo trimestre del detalle.
     *
     * Casos válidos:
     * [1] + [2-4]
     * [1-2] + [3-4]
     *
     * Casos superpuestos:
     * [1-4] + [1]
     * [1-2] + [2-4]
     */
    const recibosPorTrimestre = new Map<number, Set<string>>();

    for (const recibo of recibosActivos) {
      if (recibo.trimestreDesde === null || recibo.trimestreHasta === null) {
        continue;
      }

      const desde = Math.max(recibo.trimestreDesde, detalle.trimestreDesde);

      const hasta = Math.min(recibo.trimestreHasta, detalle.trimestreHasta);

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
      .filter(
        ([_trimestre, recibosDelTrimestre]) => recibosDelTrimestre.size > 1,
      )
      .map(([trimestre, recibosDelTrimestre]) => ({
        trimestre,
        recibos: Array.from(recibosDelTrimestre),
      }));

    const existeSolapamiento = solapamientos.length > 0;

    const declaracionesConPago = new Set(
      recibosActivos.map((recibo) => recibo.declaracionOrigenId),
    );

    let declaracionId: number | null = null;

    if (declaracionesConPago.size === 1) {
      declaracionId = [...declaracionesConPago][0];
    } else if (declaraciones.length === 1) {
      declaracionId = declaraciones[0].id;
    }

    /*
     * Se conserva la suma real de recibos activos.
     * Si existe solapamiento, el estado será REVISAR
     * para evitar declararlo automáticamente como pagado.
     */
    const montoPagado = redondearMoneda(
      recibosActivos.reduce((total, recibo) => total + Number(recibo.monto), 0),
    );

    const totalPeriodo = Number(detalle.totalPeriodo);

    const saldo = redondearMoneda(Math.max(totalPeriodo - montoPagado, 0));

    const trimestresCubiertos = new Set<number>();

    for (const recibo of recibosActivos) {
      if (recibo.trimestreDesde === null || recibo.trimestreHasta === null) {
        continue;
      }

      const desde = Math.max(recibo.trimestreDesde, detalle.trimestreDesde);

      const hasta = Math.min(recibo.trimestreHasta, detalle.trimestreHasta);

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

    /*
     * El solapamiento se evalúa primero.
     * Aunque el monto y la cobertura parezcan completos,
     * el sistema no debe decidir automáticamente.
     */
    if (existeSolapamiento) {
      estado = EstadoConciliacion.REVISAR;

      const detalleSolapamientos = solapamientos
        .map(
          ({ trimestre, recibos: recibosSuperpuestos }) =>
            `T${trimestre}: ` + recibosSuperpuestos.join(", "),
        )
        .join("; ");

      observaciones.push(
        "Se detectaron recibos activos superpuestos. " +
          `${detalleSolapamientos}. ` +
          "El periodo requiere revisión manual.",
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
          "Existe declaración, pero no tiene recibos asociados para los trimestres de la orden.",
        );
      }
    } else if (!coberturaCompleta) {
      estado = EstadoConciliacion.PAGO_PARCIAL;

      observaciones.push(
        "Los recibos activos no cubren todos los trimestres de la orden.",
      );
    } else if (montoPagado >= totalPeriodo - TOLERANCIA_MONTO) {
      estado = EstadoConciliacion.PAGADO;

      const diferenciaPago = redondearMoneda(montoPagado - totalPeriodo);

      if (diferenciaPago > TOLERANCIA_MONTO) {
        observaciones.push(
          "El recibo cubre completamente el periodo, pero el monto pagado " +
            `supera el importe de la orden en S/ ${diferenciaPago.toFixed(2)}. ` +
            "La diferencia puede corresponder a intereses, reajustes o actualización.",
        );
      }
    } else {
      estado = EstadoConciliacion.PAGO_PARCIAL;

      observaciones.push(
        "Los trimestres están cubiertos, pero el monto pagado es menor al total de la orden.",
      );
    }

    if (declaraciones.length > 1) {
      observaciones.push(
        `Se encontraron ${declaraciones.length} declaraciones coincidentes.`,
      );
    }

    if (detalle.orden.activoOriginal !== 1) {
      estado = EstadoConciliacion.REVISAR;

      const valorActivoOriginal = detalle.orden.activoOriginal ?? "sin valor";

      observaciones.push(
        `SisGAT reportó el estado original de la orden con valor ${valorActivoOriginal}. ` +
          "El sistema solo reconoce el valor 1 como estado normal; " +
          "por seguridad, esta orden requiere revisión.",
      );
    }

    await cliente.ordenDetalle.update({
      where: {
        id: detalle.id,
      },
      data: {
        declaracionId,
        montoPagado,
        saldo,
        estado,
        observacion: observaciones.length > 0 ? observaciones.join(" ") : null,
      },
    });

    incrementarResumen(resumenDetalles, estado);
  }

  const ordenes = await cliente.ordenPago.findMany({
    include: {
      detalles: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  for (const orden of ordenes) {
    const totalPagado = redondearMoneda(
      orden.detalles.reduce(
        (total, detalle) => total + Number(detalle.montoPagado),
        0,
      ),
    );

    const importeTotal = Number(orden.importeTotal);

    const saldo = redondearMoneda(Math.max(importeTotal - totalPagado, 0));

    const estados = orden.detalles.map((detalle) => detalle.estado);

    const estado = determinarEstadoOrden(estados, orden.activoOriginal);

    await cliente.ordenPago.update({
      where: {
        id: orden.id,
      },
      data: {
        totalPagado,
        saldo,
        estado,
      },
    });

    incrementarResumen(resumenOrdenes, estado);
  }

  return {
    detallesProcesados: detalles.length,
    ordenesProcesadas: ordenes.length,
    resumenDetalles,
    resumenOrdenes,
  };
}
