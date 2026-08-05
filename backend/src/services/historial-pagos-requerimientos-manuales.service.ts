import {
  type Prisma,
} from "../../generated/prisma/client";

export type DeclaracionHistorialManual =
  Prisma.DeclaracionGetPayload<{
    include: {
      recibos: true;
    };
  }>;

export type EstadoPagoAnualManual =
  | "PAGADO"
  | "PAGO_PARCIAL"
  | "PENDIENTE"
  | "REVISAR";

export type ValidacionAniosManual =
  | "ANIOS_COINCIDEN"
  | "EXCEL_ATRASADO_1"
  | "EXCEL_ADELANTADO_1"
  | "ANIOS_DIFERENTES"
  | "REFERENCIA_INSCRIPCION_INCONSISTENTE"
  | "SIN_TRES_ANIOS_PAGADOS"
  | "COBERTURA_INCOMPLETA"
  | "DATOS_AMBIGUOS"
  | "SIN_PLACA";

export interface PagoSisgatAnualManual {
  anio: number;
  estado: EstadoPagoAnualManual;
  trimestresCubiertos: number[];
  trimestresFaltantes: number[];
  formato: string;
  cantidadDeclaraciones: number;
  cantidadRecibosActivos: number;
  anioInscripcion: number | null;
  propietarioSisgat: string | null;
  observacion: string;
}

export interface AnalisisAniosRequerimientoManual {
  historialPagosSisgat: string;
  pagosPorAnio: PagoSisgatAnualManual[];
  aniosManual: number[];
  aniosPagadosCompletos: number[];
  ventanaTresAniosPagados: number[];
  ventanaTresAniosPagadosFormato: string;
  anioInscripcionReferencia: number | null;
  aniosTributariosEsperados: number[];
  aniosTributariosEsperadosFormato: string;
  validacionAnios: ValidacionAniosManual;
  validacionAniosEtiqueta: string;
  mensajeValidacionAnios: string;
  puedeMarcarPagadoPorTresAnios: boolean;
  requiereRevisionAnios: boolean;
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

export function normalizarPlacaManual(
  valor: string | null,
): string {
  const caracteres =
    (valor ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  if (caracteres.length !== 6) {
    return "";
  }

  return (
    `${caracteres.slice(0, 3)}` +
    `-${caracteres.slice(3)}`
  );
}

function normalizarTexto(
  valor: string | null,
): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}


function normalizarDocumento(
  valor: string | null,
): string {
  return normalizarTexto(
    valor,
  ).replace(
    /[^A-Z0-9]/g,
    "",
  );
}

function declaracionesSonCompatibles(
  declaraciones:
    DeclaracionHistorialManual[],
  propietarioManual:
    string | null,
): boolean {
  if (
    declaraciones.length <= 1
  ) {
    return true;
  }

  const documentos =
    [
      ...new Set(
        declaraciones
          .map(
            (declaracion) =>
              normalizarDocumento(
                declaracion.dniRuc,
              ),
          )
          .filter(Boolean),
      ),
    ];

  if (
    documentos.length === 1
  ) {
    return true;
  }

  if (
    documentos.length > 1
  ) {
    return false;
  }

  const nombres =
    declaraciones
      .map(
        (declaracion) =>
          declaracion
            .nombresRazonSocial,
      )
      .filter(
        (
          nombre,
        ): nombre is string =>
          Boolean(nombre),
      );

  if (
    nombres.length === 0
  ) {
    return false;
  }

  const nombreBase =
    nombres[0];

  const nombresCompatibles =
    nombres.every(
      (nombre) =>
        similitudNombres(
          nombreBase,
          nombre,
        ) >= 0.60,
    );

  if (
    nombresCompatibles
  ) {
    return true;
  }

  if (!propietarioManual) {
    return false;
  }

  return nombres.every(
    (nombre) =>
      similitudNombres(
        propietarioManual,
        nombre,
      ) >= 0.60,
  );
}

function fusionarDeclaraciones(
  declaraciones:
    DeclaracionHistorialManual[],
): DeclaracionHistorialManual {
  const principal =
    [...declaraciones]
      .sort(
        (a, b) => {
          const activosA =
            a.recibos.filter(
              (recibo) =>
                recibo.activo,
            ).length;

          const activosB =
            b.recibos.filter(
              (recibo) =>
                recibo.activo,
            ).length;

          if (
            activosA !== activosB
          ) {
            return (
              activosB -
              activosA
            );
          }

          return (
            b.recibos.length -
            a.recibos.length
          );
        },
      )[0];

  return {
    ...principal,
    recibos:
      declaraciones.flatMap(
        (declaracion) =>
          declaracion.recibos,
      ),
  };
}

function tokensNombre(
  valor: string | null,
): Set<string> {
  return new Set(
    normalizarTexto(valor)
      .replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 2 &&
          !PALABRAS_NOMBRE_IGNORADAS.has(
            token,
          ),
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

export function elegirDeclaracionHistorialManual(
  declaraciones:
    DeclaracionHistorialManual[],
  propietarioManual:
    string | null,
): {
  declaracion:
    DeclaracionHistorialManual | null;
  observacion:
    string | null;
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

  if (
    declaracionesSonCompatibles(
      declaraciones,
      propietarioManual,
    )
  ) {
    return {
      declaracion:
        fusionarDeclaraciones(
          declaraciones,
        ),
      observacion:
        `Se unificaron ${declaraciones.length} declaraciones compatibles de la misma placa y año para evaluar todos sus recibos.`,
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

function analizarAnio(
  anio: number,
  declaraciones:
    DeclaracionHistorialManual[],
  propietarioManual:
    string | null,
): PagoSisgatAnualManual {
  const seleccion =
    elegirDeclaracionHistorialManual(
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
      formato:
        `${anio} [—]`,
      cantidadDeclaraciones:
        0,
      cantidadRecibosActivos:
        0,
      anioInscripcion:
        null,
      propietarioSisgat:
        null,
      observacion:
        "No existe declaración para la placa y el año.",
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
      formato:
        `${anio} [REVISAR]`,
      cantidadDeclaraciones:
        declaraciones.length,
      cantidadRecibosActivos:
        0,
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

  const porTrimestre =
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
        porTrimestre.get(
          trimestre,
        ) ??
        new Set<string>();

      conjunto.add(
        identificador,
      );

      porTrimestre.set(
        trimestre,
        conjunto,
      );
    }
  }

  const superpuestos =
    [...porTrimestre.values()]
      .some(
        (recibos) =>
          recibos.size > 1,
      );

  const cubiertos =
    [...porTrimestre.keys()]
      .sort(
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
    EstadoPagoAnualManual;

  const observaciones:
    string[] = [];

  if (seleccion.observacion) {
    observaciones.push(
      seleccion.observacion,
    );
  }

  if (
    superpuestos ||
    sinTrimestre.length > 0
  ) {
    estado = "REVISAR";

    if (superpuestos) {
      observaciones.push(
        "Existen recibos activos superpuestos.",
      );
    }

    if (
      sinTrimestre.length > 0
    ) {
      observaciones.push(
        "Existen recibos activos sin trimestre interpretable.",
      );
    }
  } else if (
    activos.length === 0
  ) {
    estado = "PENDIENTE";

    observaciones.push(
      "La declaración no contiene recibos activos.",
    );
  } else if (
    faltantes.length === 0
  ) {
    estado = "PAGADO";

    observaciones.push(
      "Los pagos activos cubren los cuatro trimestres.",
    );
  } else if (
    cubiertos.length > 0
  ) {
    estado =
      "PAGO_PARCIAL";

    observaciones.push(
      `Los pagos activos cubren ${cubiertos.length} de 4 trimestres.`,
    );
  } else {
    estado = "REVISAR";

    observaciones.push(
      "Los recibos activos no contienen rangos trimestrales válidos.",
    );
  }

  return {
    anio,
    estado,
    trimestresCubiertos:
      cubiertos,
    trimestresFaltantes:
      faltantes,
    formato:
      `${anio} [${resumirTrimestres(cubiertos)}]`,
    cantidadDeclaraciones:
      declaraciones.length,
    cantidadRecibosActivos:
      activos.length,
    anioInscripcion:
      declaracion
        .fechaInscripcion
        ?.getUTCFullYear() ??
      null,
    propietarioSisgat:
      declaracion
        .nombresRazonSocial,
    observacion:
      observaciones.join(" "),
  };
}

function arreglosIguales(
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

function ventanasConsecutivasDeTres(
  anios: number[],
): number[][] {
  const ordenados =
    [...new Set(anios)]
      .sort(
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
      ventana[1] ===
        ventana[0] + 1 &&
      ventana[2] ===
        ventana[1] + 1
    ) {
      ventanas.push(
        ventana,
      );
    }
  }

  return ventanas;
}

function distanciaVentana(
  manual: number[],
  ventana: number[],
): number {
  if (
    manual.length !== 3
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  return manual.reduce(
    (total, anio, indice) =>
      total +
      Math.abs(
        anio -
        ventana[indice],
      ),
    0,
  );
}

function etiquetaValidacion(
  validacion:
    ValidacionAniosManual,
): string {
  switch (validacion) {
    case "ANIOS_COINCIDEN":
      return "Años coinciden";
    case "EXCEL_ATRASADO_1":
      return "Excel atrasado 1 año";
    case "EXCEL_ADELANTADO_1":
      return "Excel adelantado 1 año";
    case "ANIOS_DIFERENTES":
      return "Revisar años";
    case "REFERENCIA_INSCRIPCION_INCONSISTENTE":
      return "Revisar inscripción y años";
    case "COBERTURA_INCOMPLETA":
      return "Faltan pagos";
    case "DATOS_AMBIGUOS":
      return "Datos ambiguos";
    case "SIN_PLACA":
      return "Sin placa";
    case "SIN_TRES_ANIOS_PAGADOS":
      return "Sin tres años pagados";
  }
}

export function analizarAniosRequerimientoManual(
  input: {
    placa:
      string | null;
    propietarioManual:
      string | null;
    aniosManual:
      number[];
    declaraciones:
      DeclaracionHistorialManual[];
  },
): AnalisisAniosRequerimientoManual {
  const placa =
    normalizarPlacaManual(
      input.placa,
    );

  const aniosManual =
    [...new Set(
      input.aniosManual,
    )].sort(
      (a, b) => a - b,
    );

  if (!placa) {
    return {
      historialPagosSisgat:
        "Sin placa normalizable",
      pagosPorAnio: [],
      aniosManual,
      aniosPagadosCompletos:
        [],
      ventanaTresAniosPagados:
        [],
      ventanaTresAniosPagadosFormato:
        "—",
      anioInscripcionReferencia:
        null,
      aniosTributariosEsperados:
        [],
      aniosTributariosEsperadosFormato:
        "—",
      validacionAnios:
        "SIN_PLACA",
      validacionAniosEtiqueta:
        etiquetaValidacion(
          "SIN_PLACA",
        ),
      mensajeValidacionAnios:
        "No existe una placa válida para consultar el historial completo de pagos.",
      puedeMarcarPagadoPorTresAnios:
        false,
      requiereRevisionAnios:
        true,
    };
  }

  const porAnio =
    new Map<
      number,
      DeclaracionHistorialManual[]
    >();

  for (
    const declaracion
    of input.declaraciones
  ) {
    if (
      normalizarPlacaManual(
        declaracion.placa,
      ) !== placa
    ) {
      continue;
    }

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

  const pagosPorAnio =
    [...porAnio.keys()]
      .sort(
        (a, b) => a - b,
      )
      .map(
        (anio) =>
          analizarAnio(
            anio,
            porAnio.get(
              anio,
            ) ?? [],
            input
              .propietarioManual,
          ),
      );

  const pagosActivos =
    pagosPorAnio.filter(
      (pago) =>
        pago
          .cantidadRecibosActivos >
        0,
    );

  const historialPagosSisgat =
    pagosActivos
      .map(
        (pago) =>
          pago.formato,
      )
      .join(" · ") ||
    "Sin pagos activos";

  const aniosPagadosCompletos =
    pagosPorAnio
      .filter(
        (pago) =>
          pago.estado ===
          "PAGADO",
      )
      .map(
        (pago) =>
          pago.anio,
      );

  const ventanas =
    ventanasConsecutivasDeTres(
      aniosPagadosCompletos,
    );

  const aniosInscripcion =
    [...new Set(
      pagosPorAnio
        .map(
          (pago) =>
            pago
              .anioInscripcion,
        )
        .filter(
          (
            valor,
          ): valor is number =>
            valor !== null,
        ),
    )];

  const anioInscripcionReferencia =
    aniosInscripcion.length ===
      1
      ? aniosInscripcion[0]
      : null;

  const aniosTributariosEsperados =
    anioInscripcionReferencia ===
      null
      ? []
      : [
          anioInscripcionReferencia +
            1,
          anioInscripcionReferencia +
            2,
          anioInscripcionReferencia +
            3,
        ];

  const ventanaEsperada =
    ventanas.find(
      (ventana) =>
        arreglosIguales(
          ventana,
          aniosTributariosEsperados,
        ),
    ) ??
    null;

  const ventanaExacta =
    ventanas.find(
      (ventana) =>
        arreglosIguales(
          ventana,
          aniosManual,
        ),
    ) ??
    null;

  const ventanaManualAtrasado =
    ventanas.find(
      (ventana) =>
        arreglosIguales(
          ventana,
          desplazar(
            aniosManual,
            1,
          ),
        ),
    ) ??
    null;

  const ventanaManualAdelantado =
    ventanas.find(
      (ventana) =>
        arreglosIguales(
          ventana,
          desplazar(
            aniosManual,
            -1,
          ),
        ),
    ) ??
    null;

  const ventanaMasCercana =
    ventanas.length === 0
      ? null
      : [...ventanas]
          .sort(
            (a, b) =>
              distanciaVentana(
                aniosManual,
                a,
              ) -
              distanciaVentana(
                aniosManual,
                b,
              ),
          )[0];

  const ventanaSeleccionada =
    ventanaEsperada ??
    ventanaExacta ??
    ventanaManualAtrasado ??
    ventanaManualAdelantado ??
    ventanaMasCercana ??
    null;

  const hayDatosAmbiguos =
    pagosPorAnio.some(
      (pago) =>
        pago.estado ===
        "REVISAR",
    );

  let validacionAnios:
    ValidacionAniosManual;

  let mensaje:
    string;

  if (
    hayDatosAmbiguos &&
    !ventanaSeleccionada
  ) {
    validacionAnios =
      "DATOS_AMBIGUOS";

    mensaje =
      "Existen declaraciones o recibos ambiguos y no puede confirmarse un periodo completo.";
  } else if (
    !ventanaSeleccionada
  ) {
    const hayPagoParcial =
      pagosPorAnio.some(
        (pago) =>
          pago.estado ===
          "PAGO_PARCIAL",
      );

    validacionAnios =
      hayPagoParcial
        ? "COBERTURA_INCOMPLETA"
        : "SIN_TRES_ANIOS_PAGADOS";

    mensaje =
      hayPagoParcial
        ? "Existe al menos un año con trimestres incompletos."
        : "SisGAT no muestra tres años consecutivos completamente pagados.";
  } else if (
    aniosTributariosEsperados.length ===
      3 &&
    !ventanaEsperada
  ) {
    validacionAnios =
      "REFERENCIA_INSCRIPCION_INCONSISTENTE";

    mensaje =
      `SisGAT muestra tres años consecutivos pagados (${ventanaSeleccionada.join(", ")}), ` +
      `pero la inscripción disponible sugiere ${aniosTributariosEsperados.join(", ")}. ` +
      "El estado puede considerarse pagado, pero los años deben revisarse.";
  } else if (
    arreglosIguales(
      aniosManual,
      ventanaSeleccionada,
    )
  ) {
    validacionAnios =
      "ANIOS_COINCIDEN";

    mensaje =
      "Los años del requerimiento coinciden con tres años consecutivos completamente pagados en SisGAT.";
  } else if (
    arreglosIguales(
      desplazar(
        aniosManual,
        1,
      ),
      ventanaSeleccionada,
    )
  ) {
    validacionAnios =
      "EXCEL_ATRASADO_1";

    mensaje =
      `Los años del Excel están un año atrasados. SisGAT muestra pagos completos en ${ventanaSeleccionada.join(", ")}.`;
  } else if (
    arreglosIguales(
      desplazar(
        aniosManual,
        -1,
      ),
      ventanaSeleccionada,
    )
  ) {
    validacionAnios =
      "EXCEL_ADELANTADO_1";

    mensaje =
      `Los años del Excel están un año adelantados. SisGAT muestra pagos completos en ${ventanaSeleccionada.join(", ")}.`;
  } else {
    validacionAnios =
      "ANIOS_DIFERENTES";

    mensaje =
      `SisGAT muestra tres años consecutivos completamente pagados (${ventanaSeleccionada.join(", ")}), ` +
      "pero no coinciden con los años registrados manualmente.";
  }

  const puedeMarcarPagadoPorTresAnios =
    ventanaSeleccionada !==
      null;

  const requiereRevisionAnios =
    puedeMarcarPagadoPorTresAnios &&
    validacionAnios !==
      "ANIOS_COINCIDEN";

  return {
    historialPagosSisgat,
    pagosPorAnio,
    aniosManual,
    aniosPagadosCompletos,
    ventanaTresAniosPagados:
      ventanaSeleccionada ??
      [],
    ventanaTresAniosPagadosFormato:
      ventanaSeleccionada
        ? ventanaSeleccionada
            .map(
              (anio) =>
                `${anio} [1-4]`,
            )
            .join(" · ")
        : "—",
    anioInscripcionReferencia,
    aniosTributariosEsperados,
    aniosTributariosEsperadosFormato:
      aniosTributariosEsperados
        .length > 0
        ? aniosTributariosEsperados
            .join(" · ")
        : "—",
    validacionAnios,
    validacionAniosEtiqueta:
      etiquetaValidacion(
        validacionAnios,
      ),
    mensajeValidacionAnios:
      mensaje,
    puedeMarcarPagadoPorTresAnios,
    requiereRevisionAnios,
  };
}
