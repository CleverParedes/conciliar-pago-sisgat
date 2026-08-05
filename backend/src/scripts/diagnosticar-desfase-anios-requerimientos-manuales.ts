import {
  writeFile,
} from "node:fs/promises";

import {
  EstadoConciliacionManual,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

type DeclaracionConRecibos =
  Prisma.DeclaracionGetPayload<{
    include: {
      recibos: true;
    };
  }>;

type EstadoAnioSisgat =
  | "PAGADO"
  | "PAGO_PARCIAL"
  | "PENDIENTE"
  | "REVISAR";

type Clasificacion =
  | "ANIOS_COINCIDEN_Y_ESTAN_PAGADOS"
  | "DESFASE_MANUAL_ATRASADO_1_CONFIRMADO"
  | "DESFASE_MANUAL_ADELANTADO_1_CONFIRMADO"
  | "ANIOS_MANUALES_DIFERENTES_TRIBUTO_COMPLETO_CONFIRMADO"
  | "POSIBLE_DESFASE_MANUAL_ATRASADO_1"
  | "POSIBLE_DESFASE_MANUAL_ADELANTADO_1"
  | "TRES_ANIOS_PAGADOS_DIFERENTES_SIN_REFERENCIA"
  | "COBERTURA_INCOMPLETA_REAL"
  | "COMBINACION_PAGADOS_Y_NO_PAGADOS"
  | "SIN_TRES_ANIOS_PAGADOS"
  | "DATOS_AMBIGUOS"
  | "SIN_PLACA";

interface ResultadoAnio {
  anio: number;
  estado: EstadoAnioSisgat;
  trimestresCubiertos:
    number[];
  trimestresFaltantes:
    number[];
  pagosSisgat: string;
  cantidadDeclaraciones:
    number;
  cantidadRecibosActivos:
    number;
  fechaInscripcion:
    string | null;
  anioInscripcion:
    number | null;
  propietarioSisgat:
    string | null;
  observacion: string;
}

interface FilaDiagnostico {
  requerimientoManualId:
    number;
  numeroRequerimiento:
    string;
  filaOrigen:
    number | null;
  placa:
    string | null;
  propietarioManual:
    string | null;
  anioVehiculoExcel:
    number | null;
  aniosRequerimiento:
    string;
  estadosActuales:
    string;
  historialPagosSisgat:
    string;
  aniosPagadosCompletos:
    string;
  anioInscripcionReferencia:
    number | null;
  aniosTributariosEsperados:
    string;
  clasificacion:
    Clasificacion;
  estadoPropuesto:
    string;
  validacionAnios:
    string;
  recomendacion:
    string;
  observaciones:
    string;
}

const PALABRAS_NOMBRE_IGNORADAS =
  new Set([
    "DE",
    "DEL",
    "LA",
    "LAS",
    "EL",
    "LOS",
    "Y",
    "E",
    "SAC",
    "SA",
    "SRL",
    "EIRL",
    "EMPRESA",
  ]);

function normalizarTexto(
  valor: string | null,
): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(
      /\p{Diacritic}/gu,
      "",
    )
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizarPlaca(
  valor: string | null,
): string {
  const caracteres =
    normalizarTexto(valor)
      .replace(
        /[^A-Z0-9]/g,
        "",
      );

  if (
    caracteres.length !== 6
  ) {
    return "";
  }

  return (
    `${caracteres.slice(0, 3)}` +
    `-${caracteres.slice(3)}`
  );
}

function tokensNombre(
  valor: string | null,
): Set<string> {
  return new Set(
    normalizarTexto(valor)
      .replace(
        /[^A-Z0-9 ]/g,
        " ",
      )
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 2 &&
          !PALABRAS_NOMBRE_IGNORADAS
            .has(token),
      ),
  );
}

function similitudNombres(
  izquierdo: string | null,
  derecho: string | null,
): number {
  const a =
    tokensNombre(izquierdo);

  const b =
    tokensNombre(derecho);

  if (
    a.size === 0 ||
    b.size === 0
  ) {
    return 0;
  }

  let interseccion = 0;

  for (const token of a) {
    if (b.has(token)) {
      interseccion += 1;
    }
  }

  const union =
    new Set([
      ...a,
      ...b,
    ]).size;

  return union === 0
    ? 0
    : interseccion / union;
}

function elegirDeclaracion(
  declaraciones:
    DeclaracionConRecibos[],
  propietarioManual:
    string | null,
): {
  declaracion:
    DeclaracionConRecibos | null;
  observacion: string | null;
} {
  if (
    declaraciones.length === 0
  ) {
    return {
      declaracion: null,
      observacion: null,
    };
  }

  if (
    declaraciones.length === 1
  ) {
    const unica =
      declaraciones[0];

    const similitud =
      similitudNombres(
        propietarioManual,
        unica.nombresRazonSocial,
      );

    return {
      declaracion: unica,
      observacion:
        propietarioManual &&
        unica.nombresRazonSocial &&
        similitud < 0.35
          ? "La placa y el año tienen una sola declaración, pero el propietario difiere del Excel."
          : null,
    };
  }

  const evaluadas =
    declaraciones
      .map(
        (declaracion) => ({
          declaracion,
          similitud:
            similitudNombres(
              propietarioManual,
              declaracion
                .nombresRazonSocial,
            ),
        }),
      )
      .sort(
        (a, b) =>
          b.similitud -
          a.similitud,
      );

  const mejor =
    evaluadas[0];

  const segunda =
    evaluadas[1];

  if (
    mejor &&
    mejor.similitud >= 0.60 &&
    (
      !segunda ||
      mejor.similitud -
        segunda.similitud >=
        0.15
    )
  ) {
    return {
      declaracion:
        mejor.declaracion,
      observacion:
        `Se eligió una de ${declaraciones.length} declaraciones usando el propietario como comprobación secundaria.`,
    };
  }

  return {
    declaracion: null,
    observacion:
      `Existen ${declaraciones.length} declaraciones para la misma placa y año y no se puede elegir una con seguridad.`,
  };
}

function resumirTrimestres(
  valores:
    Iterable<number>,
): string {
  const trimestres =
    [
      ...new Set(
        [...valores]
          .filter(
            (valor) =>
              Number.isInteger(
                valor,
              ) &&
              valor >= 1 &&
              valor <= 4,
          ),
      ),
    ].sort(
      (a, b) => a - b,
    );

  if (
    trimestres.length === 0
  ) {
    return "—";
  }

  const segmentos:
    string[] = [];

  let inicio =
    trimestres[0];

  let anterior =
    trimestres[0];

  for (
    let indice = 1;
    indice <
      trimestres.length;
    indice += 1
  ) {
    const actual =
      trimestres[indice];

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

function arregloIgual(
  a: number[],
  b: number[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (valor, indice) =>
        valor === b[indice],
    )
  );
}

function desplazar(
  anios: number[],
  cantidad: number,
): number[] {
  return anios.map(
    (anio) =>
      anio + cantidad,
  );
}

function esConsecutivo(
  anios: number[],
): boolean {
  if (
    anios.length === 0
  ) {
    return false;
  }

  return anios.every(
    (anio, indice) =>
      indice === 0 ||
      anio ===
        anios[
          indice - 1
        ] + 1,
  );
}

function ventanasDeTres(
  anios: number[],
): number[][] {
  const ordenados =
    [
      ...new Set(anios),
    ].sort(
      (a, b) => a - b,
    );

  const ventanas:
    number[][] = [];

  for (
    let indice = 0;
    indice <=
      ordenados.length - 3;
    indice += 1
  ) {
    const ventana =
      ordenados.slice(
        indice,
        indice + 3,
      );

    if (
      esConsecutivo(
        ventana,
      )
    ) {
      ventanas.push(
        ventana,
      );
    }
  }

  return ventanas;
}

function csvValor(
  valor: unknown,
): string {
  const texto =
    String(
      valor ?? "",
    );

  if (
    /[",\r\n]/.test(
      texto,
    )
  ) {
    return (
      `"${texto.replace(
        /"/g,
        '""',
      )}"`
    );
  }

  return texto;
}

function analizarAnio(
  anio: number,
  declaraciones:
    DeclaracionConRecibos[],
  propietarioManual:
    string | null,
): ResultadoAnio {
  const seleccion =
    elegirDeclaracion(
      declaraciones,
      propietarioManual,
    );

  if (
    declaraciones.length === 0
  ) {
    return {
      anio,
      estado: "PENDIENTE",
      trimestresCubiertos:
        [],
      trimestresFaltantes:
        [1, 2, 3, 4],
      pagosSisgat:
        `${anio} [—]`,
      cantidadDeclaraciones:
        0,
      cantidadRecibosActivos:
        0,
      fechaInscripcion:
        null,
      anioInscripcion:
        null,
      propietarioSisgat:
        null,
      observacion:
        "No se encontró declaración para la placa y el año.",
    };
  }

  if (
    !seleccion.declaracion
  ) {
    return {
      anio,
      estado: "REVISAR",
      trimestresCubiertos:
        [],
      trimestresFaltantes:
        [1, 2, 3, 4],
      pagosSisgat:
        `${anio} [REVISAR]`,
      cantidadDeclaraciones:
        declaraciones.length,
      cantidadRecibosActivos:
        0,
      fechaInscripcion:
        null,
      anioInscripcion:
        null,
      propietarioSisgat:
        null,
      observacion:
        seleccion.observacion ??
        "No se pudo seleccionar una declaración.",
    };
  }

  const declaracion =
    seleccion.declaracion;

  const activos =
    declaracion.recibos
      .filter(
        (recibo) =>
          recibo.activo,
      );

  const sinTrimestre =
    activos.filter(
      (recibo) =>
        recibo
          .trimestreDesde ===
          null ||
        recibo
          .trimestreHasta ===
          null,
    );

  const recibosPorTrimestre =
    new Map<
      number,
      Set<string>
    >();

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
        1,
        recibo
          .trimestreDesde,
      );

    const hasta =
      Math.min(
        4,
        recibo
          .trimestreHasta,
      );

    if (desde > hasta) {
      continue;
    }

    const identificador =
      `${recibo.anioRecibo}-${recibo.numeroRecibo} ${recibo.trimestreOriginal ?? ""}`
        .trim();

    for (
      let trimestre =
        desde;
      trimestre <= hasta;
      trimestre += 1
    ) {
      const conjunto =
        recibosPorTrimestre
          .get(trimestre) ??
        new Set<string>();

      conjunto.add(
        identificador,
      );

      recibosPorTrimestre
        .set(
          trimestre,
          conjunto,
        );
    }
  }

  const solapamientos =
    [
      ...recibosPorTrimestre
        .entries(),
    ].filter(
      (
        [_trimestre, recibos],
      ) =>
        recibos.size > 1,
    );

  const cubiertos =
    [
      ...recibosPorTrimestre
        .keys(),
    ].sort(
      (a, b) => a - b,
    );

  const faltantes =
    [1, 2, 3, 4]
      .filter(
        (trimestre) =>
          !cubiertos.includes(
            trimestre,
          ),
      );

  let estado:
    EstadoAnioSisgat;

  let observacion =
    seleccion.observacion ??
    "";

  if (
    solapamientos.length >
      0 ||
    sinTrimestre.length >
      0
  ) {
    estado = "REVISAR";

    const motivos:
      string[] = [];

    if (
      solapamientos.length >
      0
    ) {
      motivos.push(
        "recibos activos superpuestos",
      );
    }

    if (
      sinTrimestre.length >
      0
    ) {
      motivos.push(
        "recibos activos sin trimestre interpretable",
      );
    }

    observacion =
      [
        observacion,
        `Se detectaron ${motivos.join(" y ")}.`,
      ]
        .filter(Boolean)
        .join(" ");
  } else if (
    activos.length === 0
  ) {
    estado = "PENDIENTE";

    observacion =
      [
        observacion,
        "La declaración no contiene recibos activos.",
      ]
        .filter(Boolean)
        .join(" ");
  } else if (
    faltantes.length === 0
  ) {
    estado = "PAGADO";

    observacion =
      [
        observacion,
        "Los pagos activos cubren los cuatro trimestres.",
      ]
        .filter(Boolean)
        .join(" ");
  } else if (
    cubiertos.length > 0
  ) {
    estado =
      "PAGO_PARCIAL";

    observacion =
      [
        observacion,
        `Los pagos activos cubren ${cubiertos.length} de 4 trimestres.`,
      ]
        .filter(Boolean)
        .join(" ");
  } else {
    estado = "REVISAR";

    observacion =
      [
        observacion,
        "Los recibos activos no contienen rangos trimestrales válidos.",
      ]
        .filter(Boolean)
        .join(" ");
  }

  const fechaInscripcion =
    declaracion
      .fechaInscripcion
      ?.toISOString()
      .slice(0, 10) ??
    null;

  const anioInscripcion =
    declaracion
      .fechaInscripcion
      ?.getUTCFullYear() ??
    null;

  return {
    anio,
    estado,
    trimestresCubiertos:
      cubiertos,
    trimestresFaltantes:
      faltantes,
    pagosSisgat:
      `${anio} [${resumirTrimestres(cubiertos)}]`,
    cantidadDeclaraciones:
      declaraciones.length,
    cantidadRecibosActivos:
      activos.length,
    fechaInscripcion,
    anioInscripcion,
    propietarioSisgat:
      declaracion
        .nombresRazonSocial,
    observacion:
      observacion ||
      "Sin observaciones.",
  };
}

async function main():
Promise<void> {
  const requerimientos =
    await prisma
      .requerimientoManual
      .findMany({
        where: {
          estadoConciliado:
            EstadoConciliacionManual
              .PAGO_PARCIAL,
        },
        include: {
          periodos: {
            orderBy: {
              periodoAnio:
                "asc",
            },
          },
        },
        orderBy: [
          {
            anioGestion:
              "desc",
          },
          {
            numeroRequerimiento:
              "asc",
          },
        ],
      });

  const filas:
    FilaDiagnostico[] =
      [];

  for (
    const requerimiento
    of requerimientos
  ) {
    const placa =
      normalizarPlaca(
        requerimiento
          .placaNormalizada ??
        requerimiento
          .placaOriginal,
      );

    const aniosManual =
      [
        ...new Set(
          requerimiento
            .periodos.map(
              (periodo) =>
                periodo
                  .periodoAnio,
            ),
        ),
      ].sort(
        (a, b) => a - b,
      );

    const estadosActuales =
      requerimiento
        .periodos.map(
          (periodo) =>
            `${periodo.periodoAnio}:${periodo.estadoConciliado}`,
        )
        .join(" · ");

    if (!placa) {
      filas.push({
        requerimientoManualId:
          requerimiento.id,
        numeroRequerimiento:
          requerimiento
            .numeroRequerimiento,
        filaOrigen:
          requerimiento
            .filaOrigen,
        placa: null,
        propietarioManual:
          requerimiento
            .propietarioOriginal,
        anioVehiculoExcel:
          requerimiento
            .anioVehiculo,
        aniosRequerimiento:
          aniosManual.join(" · "),
        estadosActuales,
        historialPagosSisgat:
          "Sin placa normalizable",
        aniosPagadosCompletos:
          "—",
        anioInscripcionReferencia:
          null,
        aniosTributariosEsperados:
          "—",
        clasificacion:
          "SIN_PLACA",
        estadoPropuesto:
          "REVISAR",
        validacionAnios:
          "SIN PLACA",
        recomendacion:
          "Revisar y corregir la placa antes de recalcular.",
        observaciones:
          "No existe una placa válida para consultar el historial de pagos.",
      });

      continue;
    }

    const declaraciones =
      await prisma
        .declaracion
        .findMany({
          where: {
            placa,
          },
          include: {
            recibos: true,
          },
          orderBy: [
            {
              anioDeclaracion:
                "asc",
            },
            {
              id: "asc",
            },
          ],
        });

    const porAnio =
      new Map<
        number,
        DeclaracionConRecibos[]
      >();

    for (
      const declaracion
      of declaraciones
    ) {
      const grupo =
        porAnio.get(
          declaracion
            .anioDeclaracion,
        ) ?? [];

      grupo.push(
        declaracion,
      );

      porAnio.set(
        declaracion
          .anioDeclaracion,
        grupo,
      );
    }

    const aniosDisponibles =
      [
        ...porAnio.keys(),
      ].sort(
        (a, b) => a - b,
      );

    const resultados =
      aniosDisponibles.map(
        (anio) =>
          analizarAnio(
            anio,
            porAnio.get(
              anio,
            ) ?? [],
            requerimiento
              .propietarioOriginal,
          ),
      );

    const historialPagosSisgat =
      resultados
        .filter(
          (resultado) =>
            resultado
              .cantidadRecibosActivos >
              0,
        )
        .map(
          (resultado) =>
            resultado.pagosSisgat,
        )
        .join(" · ") ||
      "Sin pagos activos";

    const aniosPagados =
      resultados
        .filter(
          (resultado) =>
            resultado.estado ===
            "PAGADO",
        )
        .map(
          (resultado) =>
            resultado.anio,
        )
        .sort(
          (a, b) => a - b,
        );

    const aniosInscripcion =
      [
        ...new Set(
          resultados
            .map(
              (resultado) =>
                resultado
                  .anioInscripcion,
            )
            .filter(
              (
                valor,
              ): valor is number =>
                valor !== null,
            ),
        ),
      ];

    const anioInscripcion =
      aniosInscripcion.length ===
        1
        ? aniosInscripcion[0]
        : null;

    const esperados =
      anioInscripcion === null
        ? []
        : [
            anioInscripcion + 1,
            anioInscripcion + 2,
            anioInscripcion + 3,
          ];

    const esperadosPagados =
      esperados.length === 3 &&
      esperados.every(
        (anio) =>
          aniosPagados.includes(
            anio,
          ),
      );

    const ventanas =
      ventanasDeTres(
        aniosPagados,
      );

    let clasificacion:
      Clasificacion =
        "SIN_TRES_ANIOS_PAGADOS";

    let estadoPropuesto =
      "PAGO_PARCIAL";

    let validacionAnios =
      "SIN CONCLUSIÓN";

    let recomendacion =
      "Mantener PAGO_PARCIAL hasta revisar el historial.";

    if (
      resultados.some(
        (resultado) =>
          resultado.estado ===
          "REVISAR",
      )
    ) {
      clasificacion =
        "DATOS_AMBIGUOS";

      estadoPropuesto =
        "REVISAR";

      validacionAnios =
        "DATOS AMBIGUOS";

      recomendacion =
        "Revisar las declaraciones o recibos ambiguos antes de cambiar el estado.";
    } else if (
      esperadosPagados
    ) {
      estadoPropuesto =
        "PAGADO";

      if (
        arregloIgual(
          aniosManual,
          esperados,
        )
      ) {
        clasificacion =
          "ANIOS_COINCIDEN_Y_ESTAN_PAGADOS";

        validacionAnios =
          "AÑOS COINCIDEN";

        recomendacion =
          "Cambiar el requerimiento a PAGADO.";
      } else if (
        arregloIgual(
          desplazar(
            aniosManual,
            1,
          ),
          esperados,
        )
      ) {
        clasificacion =
          "DESFASE_MANUAL_ATRASADO_1_CONFIRMADO";

        validacionAnios =
          "EXCEL ATRASADO 1 AÑO";

        recomendacion =
          "Cambiar a PAGADO y mostrar REVISAR AÑOS: el Excel está desplazado un año hacia atrás.";
      } else if (
        arregloIgual(
          desplazar(
            aniosManual,
            -1,
          ),
          esperados,
        )
      ) {
        clasificacion =
          "DESFASE_MANUAL_ADELANTADO_1_CONFIRMADO";

        validacionAnios =
          "EXCEL ADELANTADO 1 AÑO";

        recomendacion =
          "Cambiar a PAGADO y mostrar REVISAR AÑOS: el Excel está desplazado un año hacia adelante.";
      } else {
        clasificacion =
          "ANIOS_MANUALES_DIFERENTES_TRIBUTO_COMPLETO_CONFIRMADO";

        validacionAnios =
          "AÑOS DIFERENTES";

        recomendacion =
          "Cambiar a PAGADO y mostrar REVISAR AÑOS porque los tres años tributarios esperados están cubiertos.";
      }
    } else {
      const ventanaCoincidente =
        ventanas.find(
          (ventana) =>
            arregloIgual(
              aniosManual,
              ventana,
            ),
        );

      const ventanaAtrasada =
        ventanas.find(
          (ventana) =>
            arregloIgual(
              desplazar(
                aniosManual,
                1,
              ),
              ventana,
            ),
        );

      const ventanaAdelantada =
        ventanas.find(
          (ventana) =>
            arregloIgual(
              desplazar(
                aniosManual,
                -1,
              ),
              ventana,
            ),
        );

      if (
        ventanaCoincidente
      ) {
        clasificacion =
          "ANIOS_COINCIDEN_Y_ESTAN_PAGADOS";

        estadoPropuesto =
          "PAGADO";

        validacionAnios =
          "AÑOS COINCIDEN";

        recomendacion =
          "Cambiar el requerimiento a PAGADO porque los años del Excel tienen cobertura completa.";
      } else if (
        ventanaAtrasada
      ) {
        clasificacion =
          "POSIBLE_DESFASE_MANUAL_ATRASADO_1";

        estadoPropuesto =
          "PAGADO + REVISAR AÑOS";

        validacionAnios =
          "POSIBLE DESFASE +1";

        recomendacion =
          "Los pagos muestran tres años consecutivos completos un año después de los años del Excel. Confirmar la inscripción y luego marcar PAGADO.";
      } else if (
        ventanaAdelantada
      ) {
        clasificacion =
          "POSIBLE_DESFASE_MANUAL_ADELANTADO_1";

        estadoPropuesto =
          "PAGADO + REVISAR AÑOS";

        validacionAnios =
          "POSIBLE DESFASE -1";

        recomendacion =
          "Los pagos muestran tres años consecutivos completos un año antes de los años del Excel. Confirmar la inscripción y luego marcar PAGADO.";
      } else if (
        ventanas.length > 0
      ) {
        clasificacion =
          "TRES_ANIOS_PAGADOS_DIFERENTES_SIN_REFERENCIA";

        estadoPropuesto =
          "REVISAR";

        validacionAnios =
          "TRES AÑOS PAGADOS DIFERENTES";

        recomendacion =
          "Existen tres años consecutivos pagados, pero no coinciden con el Excel y no hay una referencia única de inscripción.";
      } else if (
        resultados.some(
          (resultado) =>
            resultado.estado ===
            "PAGO_PARCIAL",
        )
      ) {
        clasificacion =
          "COBERTURA_INCOMPLETA_REAL";

        estadoPropuesto =
          "PAGO_PARCIAL";

        validacionAnios =
          "FALTAN TRIMESTRES";

        recomendacion =
          "Mantener PAGO_PARCIAL: al menos un año tiene cobertura trimestral incompleta.";
      } else if (
        resultados.some(
          (resultado) =>
            resultado.estado ===
            "PAGADO",
        ) &&
        resultados.some(
          (resultado) =>
            resultado.estado ===
            "PENDIENTE",
        )
      ) {
        clasificacion =
          "COMBINACION_PAGADOS_Y_NO_PAGADOS";

        estadoPropuesto =
          "PAGO_PARCIAL";

        validacionAnios =
          "AÑOS PAGADOS Y PENDIENTES";

        recomendacion =
          "Mantener PAGO_PARCIAL: existen años pagados y otros sin pagos activos.";
      }
    }

    const observaciones =
      [
        aniosInscripcion.length >
          1
          ? `Se encontraron años de inscripción diferentes: ${aniosInscripcion.join(", ")}.`
          : "",
        ...resultados
          .filter(
            (resultado) =>
              resultado
                .observacion !==
              "Los pagos activos cubren los cuatro trimestres.",
          )
          .map(
            (resultado) =>
              `${resultado.anio}: ${resultado.observacion}`,
          ),
      ]
        .filter(Boolean)
        .join(" ");

    filas.push({
      requerimientoManualId:
        requerimiento.id,
      numeroRequerimiento:
        requerimiento
          .numeroRequerimiento,
      filaOrigen:
        requerimiento
          .filaOrigen,
      placa,
      propietarioManual:
        requerimiento
          .propietarioOriginal,
      anioVehiculoExcel:
        requerimiento
          .anioVehiculo,
      aniosRequerimiento:
        aniosManual.join(" · "),
      estadosActuales,
      historialPagosSisgat,
      aniosPagadosCompletos:
        aniosPagados.join(" · ") ||
        "—",
      anioInscripcionReferencia:
        anioInscripcion,
      aniosTributariosEsperados:
        esperados.join(" · ") ||
        "—",
      clasificacion,
      estadoPropuesto,
      validacionAnios,
      recomendacion,
      observaciones:
        observaciones ||
        "Sin observaciones adicionales.",
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

  console.log("");
  console.log(
    "DIAGNÓSTICO DE PAGO PARCIAL Y DESFASE DE AÑOS",
  );
  console.log(
    "================================================",
  );
  console.log(
    `Requerimientos actualmente en PAGO_PARCIAL: ${filas.length}`,
  );

  console.log("");
  console.log(
    "Clasificación:",
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

  for (const fila of filas) {
    console.log("");
    console.log(
      `Req. ${fila.numeroRequerimiento} | ${fila.placa ?? "SIN PLACA"} | Fila ${fila.filaOrigen ?? "—"}`,
    );
    console.log(
      `  Años del Excel: ${fila.aniosRequerimiento || "—"}`,
    );
    console.log(
      `  Historial SisGAT: ${fila.historialPagosSisgat}`,
    );
    console.log(
      `  Inscripción: ${fila.anioInscripcionReferencia ?? "SIN REFERENCIA"} | Esperados: ${fila.aniosTributariosEsperados}`,
    );
    console.log(
      `  Clasificación: ${fila.clasificacion}`,
    );
    console.log(
      `  Estado propuesto: ${fila.estadoPropuesto}`,
    );
    console.log(
      `  Validación: ${fila.validacionAnios}`,
    );
  }

  const rutaJson =
    "/tmp/diagnostico-requerimientos-manuales-desfase-anios.json";

  const rutaCsv =
    "/tmp/diagnostico-requerimientos-manuales-desfase-anios.csv";

  await writeFile(
    rutaJson,
    JSON.stringify(
      {
        generadoEn:
          new Date()
            .toISOString(),
        total:
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
      "requerimientoManualId",
      "numeroRequerimiento",
      "filaOrigen",
      "placa",
      "propietarioManual",
      "anioVehiculoExcel",
      "aniosRequerimiento",
      "estadosActuales",
      "historialPagosSisgat",
      "aniosPagadosCompletos",
      "anioInscripcionReferencia",
      "aniosTributariosEsperados",
      "clasificacion",
      "estadoPropuesto",
      "validacionAnios",
      "recomendacion",
      "observaciones",
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
    "No se modificó PostgreSQL ni se cambiaron estados.",
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
