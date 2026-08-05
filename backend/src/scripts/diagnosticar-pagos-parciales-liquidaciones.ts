import {
  writeFile,
} from "node:fs/promises";

import {
  EstadoConciliacion,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

const TOLERANCIA_MONTO =
  0.05;

type ClasificacionDiagnostico =
  | "COBERTURA_COMPLETA_MONTO_MENOR"
  | "COBERTURA_INCOMPLETA"
  | "RECIBOS_SUPERPUESTOS"
  | "RECIBOS_SIN_TRIMESTRE"
  | "SIN_RECIBOS_ACTIVOS"
  | "SIN_DECLARACION"
  | "DATOS_INCOMPLETOS"
  | "OTRO";

interface FilaDiagnostico {
  liquidacionId: number;
  liquidacion:
    string;
  placa: string | null;
  dniRuc: string | null;
  periodo:
    string;
  trimestresSolicitados:
    string;
  pagosSisgat:
    string;
  trimestresCubiertos:
    string;
  trimestresFaltantes:
    string;
  cantidadDeclaraciones:
    number;
  cantidadRecibosRelacionados:
    number;
  cantidadRecibosActivos:
    number;
  montoLiquidado:
    number;
  montoPagado:
    number;
  diferenciaMonto:
    number;
  estadoDetalleActual:
    string;
  estadoLiquidacionActual:
    string;
  clasificacion:
    ClasificacionDiagnostico;
  estadoDetallePropuesto:
    string;
  observacion:
    string;
}

function normalizarTexto(
  valor: string | null,
): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function redondearMoneda(
  valor: number,
): number {
  return (
    Math.round(
      (valor +
        Number.EPSILON) *
        100,
    ) / 100
  );
}

function reciboSeSuperpone(
  trimestreDesde:
    number | null,
  trimestreHasta:
    number | null,
  detalleDesde: number,
  detalleHasta: number,
): boolean {
  if (
    trimestreDesde === null ||
    trimestreHasta === null
  ) {
    return false;
  }

  return (
    trimestreHasta >=
      detalleDesde &&
    trimestreDesde <=
      detalleHasta
  );
}

function rango(
  desde: number,
  hasta: number,
): number[] {
  return Array.from(
    {
      length:
        hasta - desde + 1,
    },
    (_valor, indice) =>
      desde + indice,
  );
}

function resumirTrimestres(
  trimestres:
    Iterable<number>,
): string {
  const valores =
    [...new Set(
      [...trimestres]
        .filter(
          (valor) =>
            Number.isInteger(
              valor,
            ) &&
            valor >= 1 &&
            valor <= 4,
        ),
    )].sort(
      (a, b) => a - b,
    );

  if (
    valores.length === 0
  ) {
    return "—";
  }

  const segmentos:
    string[] = [];

  let inicio =
    valores[0];
  let anterior =
    valores[0];

  for (
    let indice = 1;
    indice < valores.length;
    indice += 1
  ) {
    const actual =
      valores[indice];

    if (
      actual ===
      anterior + 1
    ) {
      anterior = actual;
      continue;
    }

    segmentos.push(
      inicio === anterior
        ? String(inicio)
        : `${inicio}-${anterior}`,
    );

    inicio = actual;
    anterior = actual;
  }

  segmentos.push(
    inicio === anterior
      ? String(inicio)
      : `${inicio}-${anterior}`,
  );

  return segmentos.join(",");
}

function csvValor(
  valor: unknown,
): string {
  const texto =
    String(valor ?? "");

  if (
    /[",\r\n]/.test(texto)
  ) {
    return `"${texto.replace(
      /"/g,
      '""',
    )}"`;
  }

  return texto;
}

async function main():
Promise<void> {
  const detalles =
    await prisma
      .liquidacionDetalle
      .findMany({
        where: {
          estado:
            EstadoConciliacion
              .PAGO_PARCIAL,
        },
        include: {
          liquidacion: {
            select: {
              id: true,
              anioLiquidacion:
                true,
              numeroLiquidacion:
                true,
              dniRucOriginal:
                true,
              placa: true,
              estado: true,
              estadoOriginal:
                true,
            },
          },
        },
        orderBy: [
          {
            liquidacionId:
              "asc",
          },
          {
            periodoAnio:
              "asc",
          },
        ],
      });

  const filas:
    FilaDiagnostico[] =
      [];

  for (
    const detalle
    of detalles
  ) {
    const documento =
      detalle.liquidacion
        .dniRucOriginal;

    const placa =
      detalle.liquidacion
        .placa;

    const periodo =
      `${detalle.periodoAnio} ` +
      `[${detalle.trimestreDesde}-${detalle.trimestreHasta}]`;

    const solicitados =
      rango(
        detalle.trimestreDesde,
        detalle.trimestreHasta,
      );

    if (
      !documento ||
      !placa
    ) {
      filas.push({
        liquidacionId:
          detalle.liquidacionId,
        liquidacion:
          `${detalle.liquidacion.anioLiquidacion}-${detalle.liquidacion.numeroLiquidacion}`,
        placa,
        dniRuc:
          documento,
        periodo,
        trimestresSolicitados:
          resumirTrimestres(
            solicitados,
          ),
        pagosSisgat: "—",
        trimestresCubiertos:
          "—",
        trimestresFaltantes:
          resumirTrimestres(
            solicitados,
          ),
        cantidadDeclaraciones:
          0,
        cantidadRecibosRelacionados:
          0,
        cantidadRecibosActivos:
          0,
        montoLiquidado:
          Number(
            detalle.totalPeriodo,
          ),
        montoPagado:
          Number(
            detalle.montoPagado,
          ),
        diferenciaMonto:
          redondearMoneda(
            Number(
              detalle.totalPeriodo,
            ) -
              Number(
                detalle.montoPagado,
              ),
          ),
        estadoDetalleActual:
          detalle.estado,
        estadoLiquidacionActual:
          detalle.liquidacion
            .estado,
        clasificacion:
          "DATOS_INCOMPLETOS",
        estadoDetallePropuesto:
          EstadoConciliacion
            .REVISAR,
        observacion:
          "Falta DNI/RUC o placa para ejecutar la conciliación.",
      });

      continue;
    }

    const declaraciones =
      await prisma
        .declaracion
        .findMany({
          where: {
            dniRuc:
              documento,
            placa,
            anioDeclaracion:
              detalle.periodoAnio,
          },
          include: {
            recibos: true,
          },
          orderBy: {
            id: "asc",
          },
        });

    if (
      declaraciones.length ===
      0
    ) {
      filas.push({
        liquidacionId:
          detalle.liquidacionId,
        liquidacion:
          `${detalle.liquidacion.anioLiquidacion}-${detalle.liquidacion.numeroLiquidacion}`,
        placa,
        dniRuc:
          documento,
        periodo,
        trimestresSolicitados:
          resumirTrimestres(
            solicitados,
          ),
        pagosSisgat: "—",
        trimestresCubiertos:
          "—",
        trimestresFaltantes:
          resumirTrimestres(
            solicitados,
          ),
        cantidadDeclaraciones:
          0,
        cantidadRecibosRelacionados:
          0,
        cantidadRecibosActivos:
          0,
        montoLiquidado:
          Number(
            detalle.totalPeriodo,
          ),
        montoPagado: 0,
        diferenciaMonto:
          Number(
            detalle.totalPeriodo,
          ),
        estadoDetalleActual:
          detalle.estado,
        estadoLiquidacionActual:
          detalle.liquidacion
            .estado,
        clasificacion:
          "SIN_DECLARACION",
        estadoDetallePropuesto:
          EstadoConciliacion
            .SIN_DECLARACION,
        observacion:
          "No se encontró declaración con el mismo DNI/RUC, placa y año.",
      });

      continue;
    }

    const todosRecibos =
      declaraciones.flatMap(
        (declaracion) =>
          declaracion
            .recibos.map(
              (recibo) => ({
                ...recibo,
                declaracionOrigenId:
                  declaracion.id,
              }),
            ),
      );

    const recibosSinTrimestre =
      todosRecibos.filter(
        (recibo) =>
          recibo.activo &&
          (
            recibo
              .trimestreDesde ===
              null ||
            recibo
              .trimestreHasta ===
              null
          ),
      );

    const relacionados =
      todosRecibos.filter(
        (recibo) =>
          reciboSeSuperpone(
            recibo
              .trimestreDesde,
            recibo
              .trimestreHasta,
            detalle
              .trimestreDesde,
            detalle
              .trimestreHasta,
          ),
      );

    const activos =
      relacionados.filter(
        (recibo) =>
          recibo.activo,
      );

    const recibosPorTrimestre =
      new Map<
        number,
        Set<string>
      >();

    const cubiertos =
      new Set<number>();

    for (
      const recibo
      of activos
    ) {
      if (
        recibo
          .trimestreDesde ===
          null ||
        recibo
          .trimestreHasta ===
          null
      ) {
        continue;
      }

      const desde =
        Math.max(
          recibo
            .trimestreDesde,
          detalle
            .trimestreDesde,
        );

      const hasta =
        Math.min(
          recibo
            .trimestreHasta,
          detalle
            .trimestreHasta,
        );

      const identificador =
        `${recibo.anioRecibo}-${recibo.numeroRecibo}` +
        `${recibo.trimestreOriginal ? ` ${recibo.trimestreOriginal}` : ""}`;

      for (
        let trimestre =
          desde;
        trimestre <= hasta;
        trimestre += 1
      ) {
        cubiertos.add(
          trimestre,
        );

        const conjunto =
          recibosPorTrimestre.get(
            trimestre,
          ) ??
          new Set<string>();

        conjunto.add(
          identificador,
        );

        recibosPorTrimestre.set(
          trimestre,
          conjunto,
        );
      }
    }

    const superpuestos =
      [...recibosPorTrimestre.entries()]
        .filter(
          (
            [_trimestre, conjunto],
          ) =>
            conjunto.size > 1,
        );

    const faltantes =
      solicitados.filter(
        (trimestre) =>
          !cubiertos.has(
            trimestre,
          ),
      );

    const coberturaCompleta =
      faltantes.length === 0;

    const montoPagado =
      redondearMoneda(
        activos.reduce(
          (
            total,
            recibo,
          ) =>
            total +
            Number(
              recibo.monto,
            ),
          0,
        ),
      );

    const montoLiquidado =
      Number(
        detalle.totalPeriodo,
      );

    const diferenciaMonto =
      redondearMoneda(
        montoLiquidado -
          montoPagado,
      );

    let clasificacion:
      ClasificacionDiagnostico;

    let estadoPropuesto:
      string;

    let observacion:
      string;

    if (
      superpuestos.length >
      0
    ) {
      clasificacion =
        "RECIBOS_SUPERPUESTOS";

      estadoPropuesto =
        EstadoConciliacion
          .REVISAR;

      observacion =
        "Existen dos o más recibos activos cubriendo el mismo trimestre.";
    } else if (
      recibosSinTrimestre.length >
      0
    ) {
      clasificacion =
        "RECIBOS_SIN_TRIMESTRE";

      estadoPropuesto =
        EstadoConciliacion
          .REVISAR;

      observacion =
        "Existen recibos activos sin rango trimestral interpretable.";
    } else if (
      activos.length === 0
    ) {
      clasificacion =
        "SIN_RECIBOS_ACTIVOS";

      estadoPropuesto =
        EstadoConciliacion
          .PENDIENTE;

      observacion =
        "Existe declaración, pero no se encontraron recibos activos relacionados.";
    } else if (
      !coberturaCompleta
    ) {
      clasificacion =
        "COBERTURA_INCOMPLETA";

      estadoPropuesto =
        EstadoConciliacion
          .PAGO_PARCIAL;

      observacion =
        "Existen pagos activos, pero faltan uno o más trimestres de la liquidación.";
    } else if (
      montoPagado <
      montoLiquidado -
        TOLERANCIA_MONTO
    ) {
      clasificacion =
        "COBERTURA_COMPLETA_MONTO_MENOR";

      estadoPropuesto =
        EstadoConciliacion
          .PAGADO;

      observacion =
        "Los pagos activos cubren todos los trimestres. La diferencia monetaria es informativa y no debe mantener el estado parcial.";
    } else {
      clasificacion =
        "OTRO";

      estadoPropuesto =
        EstadoConciliacion
          .PAGADO;

      observacion =
        "La cobertura trimestral es completa y el monto también alcanza el total liquidado.";
    }

    const pagosSisgat =
      activos.length === 0
        ? "Sin pagos activos"
        : `${detalle.periodoAnio} [${resumirTrimestres(cubiertos)}]`;

    filas.push({
      liquidacionId:
        detalle.liquidacionId,
      liquidacion:
        `${detalle.liquidacion.anioLiquidacion}-${detalle.liquidacion.numeroLiquidacion}`,
      placa,
      dniRuc:
        documento,
      periodo,
      trimestresSolicitados:
        resumirTrimestres(
          solicitados,
        ),
      pagosSisgat,
      trimestresCubiertos:
        resumirTrimestres(
          cubiertos,
        ),
      trimestresFaltantes:
        resumirTrimestres(
          faltantes,
        ),
      cantidadDeclaraciones:
        declaraciones.length,
      cantidadRecibosRelacionados:
        relacionados.length,
      cantidadRecibosActivos:
        activos.length,
      montoLiquidado:
        redondearMoneda(
          montoLiquidado,
        ),
      montoPagado,
      diferenciaMonto:
        redondearMoneda(
          diferenciaMonto,
        ),
      estadoDetalleActual:
        detalle.estado,
      estadoLiquidacionActual:
        detalle.liquidacion
          .estado,
      clasificacion,
      estadoDetallePropuesto:
        estadoPropuesto,
      observacion,
    });
  }

  const resumen:
    Record<string, number> =
      {};

  for (const fila of filas) {
    resumen[
      fila.clasificacion
    ] =
      (
        resumen[
          fila.clasificacion
        ] ?? 0
      ) + 1;
  }

  const liquidacionesParciales =
    await prisma
      .liquidacion
      .count({
        where: {
          estado:
            EstadoConciliacion
              .PAGO_PARCIAL,
        },
      });

  console.log("");
  console.log(
    "DIAGNÓSTICO DE PAGOS PARCIALES EN LIQUIDACIONES",
  );
  console.log(
    "================================================",
  );
  console.log(
    `Liquidaciones actualmente en PAGO_PARCIAL: ${liquidacionesParciales}`,
  );
  console.log(
    `Detalles anuales actualmente en PAGO_PARCIAL: ${filas.length}`,
  );

  console.log("");
  console.log(
    "Clasificación de los detalles:",
  );

  for (
    const [
      clasificacion,
      cantidad,
    ]
    of Object.entries(
      resumen,
    ).sort(
      (
        [a],
        [b],
      ) =>
        a.localeCompare(b),
    )
  ) {
    console.log(
      `  ${clasificacion}: ${cantidad}`,
    );
  }

  console.log("");
  console.log(
    "DETALLE DE CASOS",
  );
  console.log(
    "================================================",
  );

  for (
    const fila
    of filas
  ) {
    console.log("");
    console.log(
      `${fila.liquidacion} | ${fila.placa ?? "SIN PLACA"} | ${fila.periodo}`,
    );
    console.log(
      `  Pagos SisGAT: ${fila.pagosSisgat}`,
    );
    console.log(
      `  Cubiertos: [${fila.trimestresCubiertos}] | Faltantes: [${fila.trimestresFaltantes}]`,
    );
    console.log(
      `  Monto liquidado: S/ ${fila.montoLiquidado.toFixed(2)} | ` +
      `Monto pagado: S/ ${fila.montoPagado.toFixed(2)} | ` +
      `Diferencia: S/ ${fila.diferenciaMonto.toFixed(2)}`,
    );
    console.log(
      `  Clasificación: ${fila.clasificacion}`,
    );
    console.log(
      `  Estado propuesto: ${fila.estadoDetallePropuesto}`,
    );
  }

  const rutaJson =
    "/tmp/diagnostico-liquidaciones-pago-parcial.json";

  const rutaCsv =
    "/tmp/diagnostico-liquidaciones-pago-parcial.csv";

  await writeFile(
    rutaJson,
    JSON.stringify(
      {
        generadoEn:
          new Date()
            .toISOString(),
        liquidacionesParciales,
        detallesParciales:
          filas.length,
        resumen,
        filas,
      },
      null,
      2,
    ),
    "utf8",
  );

  const columnas:
    Array<
      keyof FilaDiagnostico
    > = [
      "liquidacionId",
      "liquidacion",
      "placa",
      "dniRuc",
      "periodo",
      "trimestresSolicitados",
      "pagosSisgat",
      "trimestresCubiertos",
      "trimestresFaltantes",
      "cantidadDeclaraciones",
      "cantidadRecibosRelacionados",
      "cantidadRecibosActivos",
      "montoLiquidado",
      "montoPagado",
      "diferenciaMonto",
      "estadoDetalleActual",
      "estadoLiquidacionActual",
      "clasificacion",
      "estadoDetallePropuesto",
      "observacion",
    ];

  const csv = [
    columnas.join(","),
    ...filas.map(
      (fila) =>
        columnas
          .map(
            (columna) =>
              csvValor(
                fila[columna],
              ),
          )
          .join(","),
    ),
  ].join("\n");

  await writeFile(
    rutaCsv,
    `${csv}\n`,
    "utf8",
  );

  console.log("");
  console.log(
    "Archivos generados:",
  );
  console.log(
    `  ${rutaJson}`,
  );
  console.log(
    `  ${rutaCsv}`,
  );
  console.log("");
  console.log(
    "RESULTADO: SOLO DIAGNÓSTICO",
  );
  console.log(
    "No se modificó PostgreSQL ni se recalcularon estados.",
  );
}

main()
  .catch(
    (error: unknown) => {
      console.error("");
      console.error(
        error instanceof Error
          ? error.message
          : "Error desconocido.",
      );
      process.exitCode = 1;
    },
  )
  .finally(
    async () => {
      await prisma
        .$disconnect();
    },
  );
