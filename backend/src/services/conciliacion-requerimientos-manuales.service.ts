import {
  EstadoConciliacionManual,
  EstadoRevisionManual,
  TipoRegistroManual,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import {
  analizarAniosRequerimientoManual,
  elegirDeclaracionHistorialManual,
  type DeclaracionHistorialManual,
} from "./historial-pagos-requerimientos-manuales.service";

type ClientePrisma =
  Prisma.TransactionClient |
  typeof prisma;

type DeclaracionConRecibos =
  DeclaracionHistorialManual;

interface ResultadoPeriodo {
  declaracionId: number | null;
  estado:
    EstadoConciliacionManual;
  montoPagado: number;
  observacion: string;
}

export interface CambioTresAniosPagados {
  requerimientoManualId: number;
  numeroRequerimiento: string;
  estadoAnterior:
    EstadoConciliacionManual;
  estadoNuevo:
    EstadoConciliacionManual;
  validacionAnios: string;
  ventanaPagada: string;
}

export interface ResultadoConciliacionRequerimientosManuales {
  periodosProcesados: number;
  requerimientosProcesados: number;
  requerimientosPagadosPorTresAnios:
    number;
  resumenPeriodos:
    Record<string, number>;
  resumenRequerimientos:
    Record<string, number>;
  resumenRevision:
    Record<string, number>;
  resumenValidacionAnios:
    Record<string, number>;
  cambiosTresAnios:
    CambioTresAniosPagados[];
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
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizarPlaca(
  valor: string | null,
): string {
  const caracteres =
    normalizarTexto(valor)
      .replace(/[^A-Z0-9]/g, "");

  if (caracteres.length !== 6) {
    return "";
  }

  return `${caracteres.slice(0, 3)}-${caracteres.slice(3)}`;
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

function incrementar(
  resumen:
    Record<string, number>,
  clave: string,
): void {
  resumen[clave] =
    (resumen[clave] ?? 0) +
    1;
}

function clavePlacaAnio(
  placa: string,
  anio: number,
): string {
  return `${placa}|${anio}`;
}

function estadoManualNormalizado(
  valor: string | null,
):
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "NO_APLICA"
  | "REVISAR"
  | "SIN_ESTADO" {
  const texto =
    normalizarTexto(valor);

  if (!texto) {
    return "SIN_ESTADO";
  }

  if (texto === "PAGO") {
    return "PAGADO";
  }

  if (
    texto.includes("PAGO") &&
    texto.includes("DEBE")
  ) {
    return "PAGO_PARCIAL";
  }

  if (
    texto === "NO PAGO" ||
    texto === "DEBE" ||
    texto.startsWith("DEBE ")
  ) {
    return "PENDIENTE";
  }

  if (
    texto === "INSCRIPCION" ||
    texto === "NUEVO"
  ) {
    return "NO_APLICA";
  }

  return "REVISAR";
}

function determinarRevision(
  estadoManual:
    ReturnType<
      typeof estadoManualNormalizado
    >,
  estadoCalculado:
    EstadoConciliacionManual,
): EstadoRevisionManual {
  if (
    estadoCalculado ===
      EstadoConciliacionManual.ANULADO ||
    estadoCalculado ===
      EstadoConciliacionManual.NO_APLICA
  ) {
    return EstadoRevisionManual.NO_APLICA;
  }

  if (
    estadoCalculado ===
    EstadoConciliacionManual.REVISAR
  ) {
    return EstadoRevisionManual.REVISAR;
  }

  if (
    estadoManual ===
      "SIN_ESTADO" ||
    estadoManual ===
      "REVISAR"
  ) {
    return EstadoRevisionManual.PENDIENTE;
  }

  if (
    estadoManual ===
      "PENDIENTE" &&
    estadoCalculado ===
      EstadoConciliacionManual.SIN_DECLARACION
  ) {
    return EstadoRevisionManual.REVISAR;
  }

  const coincide =
    (estadoManual ===
      "PENDIENTE" &&
      estadoCalculado ===
        EstadoConciliacionManual.PENDIENTE) ||
    (estadoManual ===
      "PAGO_PARCIAL" &&
      estadoCalculado ===
        EstadoConciliacionManual.PAGO_PARCIAL) ||
    (estadoManual ===
      "PAGADO" &&
      estadoCalculado ===
        EstadoConciliacionManual.PAGADO);

  return coincide
    ? EstadoRevisionManual.COINCIDE
    : EstadoRevisionManual.DISCREPANCIA;
}

function elegirDeclaracion(
  declaraciones:
    DeclaracionConRecibos[],
  propietarioManual:
    string | null,
): {
  declaracion:
    DeclaracionConRecibos | null;
  observacion:
    string | null;
} {
  return elegirDeclaracionHistorialManual(
    declaraciones,
    propietarioManual,
  );
}

function analizarPeriodo(
  declaraciones:
    DeclaracionConRecibos[],
  propietarioManual:
    string | null,
): ResultadoPeriodo {
  if (
    declaraciones.length === 0
  ) {
    return {
      declaracionId: null,
      estado:
        EstadoConciliacionManual.SIN_DECLARACION,
      montoPagado: 0,
      observacion:
        "No se encontró una declaración para la misma placa y año.",
    };
  }

  const seleccion =
    elegirDeclaracion(
      declaraciones,
      propietarioManual,
    );

  if (!seleccion.declaracion) {
    return {
      declaracionId: null,
      estado:
        EstadoConciliacionManual.REVISAR,
      montoPagado: 0,
      observacion:
        seleccion.observacion ??
        "No se pudo seleccionar una declaración con seguridad.",
    };
  }

  const declaracion =
    seleccion.declaracion;

  const recibosActivos =
    declaracion.recibos.filter(
      (recibo) =>
        recibo.activo,
    );

  const recibosAnulados =
    declaracion.recibos.filter(
      (recibo) =>
        !recibo.activo &&
        normalizarTexto(
          recibo.estadoOriginal,
        ) === "ANULADO",
    );

  const recibosConOtroEstado =
    declaracion.recibos.filter(
      (recibo) =>
        !recibo.activo &&
        normalizarTexto(
          recibo.estadoOriginal,
        ) !== "ANULADO",
    );

  const observaciones:
    string[] = [];

  if (seleccion.observacion) {
    observaciones.push(
      seleccion.observacion,
    );
  }

  if (
    recibosActivos.length === 0
  ) {
    if (
      recibosConOtroEstado.length >
      0
    ) {
      observaciones.push(
        "Se encontraron recibos con un estado diferente de Activo o Anulado.",
      );

      return {
        declaracionId:
          declaracion.id,
        estado:
          EstadoConciliacionManual.REVISAR,
        montoPagado: 0,
        observacion:
          observaciones.join(" "),
      };
    }

    if (
      recibosAnulados.length > 0
    ) {
      observaciones.push(
        "Solo se encontraron recibos anulados.",
      );

      return {
        declaracionId:
          declaracion.id,
        estado:
          EstadoConciliacionManual.REVISAR,
        montoPagado: 0,
        observacion:
          observaciones.join(" "),
      };
    }

    observaciones.push(
      "Existe declaración, pero no contiene recibos activos.",
    );

    return {
      declaracionId:
        declaracion.id,
      estado:
        EstadoConciliacionManual.PENDIENTE,
      montoPagado: 0,
      observacion:
        observaciones.join(" "),
    };
  }

  const recibosSinTrimestre =
    recibosActivos.filter(
      (recibo) =>
        recibo.trimestreDesde ===
          null ||
        recibo.trimestreHasta ===
          null,
    );

  const recibosPorTrimestre =
    new Map<
      number,
      Set<string>
    >();

  for (
    const recibo
    of recibosActivos
  ) {
    if (
      recibo.trimestreDesde ===
        null ||
      recibo.trimestreHasta ===
        null
    ) {
      continue;
    }

    const desde =
      Math.max(
        1,
        recibo.trimestreDesde,
      );

    const hasta =
      Math.min(
        4,
        recibo.trimestreHasta,
      );

    if (desde > hasta) {
      continue;
    }

    const identificador =
      `${recibo.anioRecibo}-${recibo.numeroRecibo} ${recibo.trimestreOriginal ?? ""}`
        .trim();

    for (
      let trimestre = desde;
      trimestre <= hasta;
      trimestre += 1
    ) {
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

  const solapamientos =
    [...recibosPorTrimestre.entries()]
      .filter(
        (
          [_trimestre, recibos],
        ) =>
          recibos.size > 1,
      );

  const montoPagado =
    redondearMoneda(
      recibosActivos.reduce(
        (total, recibo) =>
          total +
          Number(recibo.monto),
        0,
      ),
    );

  if (
    solapamientos.length > 0
  ) {
    const detalle =
      solapamientos
        .map(
          (
            [trimestre, recibos],
          ) =>
            `T${trimestre}: ${[
              ...recibos,
            ].join(", ")}`,
        )
        .join("; ");

    observaciones.push(
      `Se detectaron recibos activos superpuestos (${detalle}).`,
    );

    return {
      declaracionId:
        declaracion.id,
      estado:
        EstadoConciliacionManual.REVISAR,
      montoPagado,
      observacion:
        observaciones.join(" "),
    };
  }

  if (
    recibosSinTrimestre.length >
    0
  ) {
    observaciones.push(
      "Existen recibos activos sin rango trimestral y no puede comprobarse su cobertura anual.",
    );

    return {
      declaracionId:
        declaracion.id,
      estado:
        EstadoConciliacionManual.REVISAR,
      montoPagado,
      observacion:
        observaciones.join(" "),
    };
  }

  const trimestresCubiertos =
    new Set(
      recibosPorTrimestre.keys(),
    );

  const coberturaCompleta =
    [1, 2, 3, 4].every(
      (trimestre) =>
        trimestresCubiertos.has(
          trimestre,
        ),
    );

  if (coberturaCompleta) {
    observaciones.push(
      "Los recibos activos cubren los cuatro trimestres del año.",
    );

    return {
      declaracionId:
        declaracion.id,
      estado:
        EstadoConciliacionManual.PAGADO,
      montoPagado,
      observacion:
        observaciones.join(" "),
    };
  }

  if (
    trimestresCubiertos.size > 0
  ) {
    observaciones.push(
      `Los recibos activos cubren ${trimestresCubiertos.size} de 4 trimestres.`,
    );

    return {
      declaracionId:
        declaracion.id,
      estado:
        EstadoConciliacionManual.PAGO_PARCIAL,
      montoPagado,
      observacion:
        observaciones.join(" "),
    };
  }

  observaciones.push(
    "Existen recibos activos, pero sus rangos trimestrales no son válidos.",
  );

  return {
    declaracionId:
      declaracion.id,
    estado:
      EstadoConciliacionManual.REVISAR,
    montoPagado,
    observacion:
      observaciones.join(" "),
  };
}

function determinarEstadoGeneral(
  tipoRegistro:
    TipoRegistroManual,
  estados:
    EstadoConciliacionManual[],
): EstadoConciliacionManual {
  if (
    tipoRegistro ===
    TipoRegistroManual.ANULADO
  ) {
    return EstadoConciliacionManual.ANULADO;
  }

  if (
    tipoRegistro ===
      TipoRegistroManual.VACIO ||
    tipoRegistro ===
      TipoRegistroManual.SIN_REGISTRO
  ) {
    return EstadoConciliacionManual.NO_APLICA;
  }

  if (estados.length === 0) {
    return EstadoConciliacionManual.REVISAR;
  }

  if (
    estados.includes(
      EstadoConciliacionManual.REVISAR,
    )
  ) {
    return EstadoConciliacionManual.REVISAR;
  }

  if (
    estados.every(
      (estado) =>
        estado ===
        EstadoConciliacionManual.PAGADO,
    )
  ) {
    return EstadoConciliacionManual.PAGADO;
  }

  if (
    estados.some(
      (estado) =>
        estado ===
          EstadoConciliacionManual.PAGADO ||
        estado ===
          EstadoConciliacionManual.PAGO_PARCIAL,
    )
  ) {
    return EstadoConciliacionManual.PAGO_PARCIAL;
  }

  if (
    estados.every(
      (estado) =>
        estado ===
        EstadoConciliacionManual.SIN_DECLARACION,
    )
  ) {
    return EstadoConciliacionManual.SIN_DECLARACION;
  }

  return EstadoConciliacionManual.PENDIENTE;
}

export async function ejecutarConciliacionRequerimientosManuales(
  cliente:
    ClientePrisma = prisma,
): Promise<ResultadoConciliacionRequerimientosManuales> {
  const resumenPeriodos:
    Record<string, number> = {};

  const resumenRequerimientos:
    Record<string, number> = {};

  const resumenRevision:
    Record<string, number> = {};

  const resumenValidacionAnios:
    Record<string, number> = {};

  const cambiosTresAnios:
    CambioTresAniosPagados[] =
      [];

  const requerimientos =
    await cliente
      .requerimientoManual
      .findMany({
        include: {
          periodos: {
            orderBy: {
              periodoAnio:
                "asc",
            },
          },
        },
        orderBy: {
          id: "asc",
        },
      });

  const placas =
    [
      ...new Set(
        requerimientos
          .map(
            (requerimiento) =>
              normalizarPlaca(
                requerimiento
                  .placaNormalizada,
              ),
          )
          .filter(Boolean),
      ),
    ];

  const declaraciones =
    placas.length > 0
      ? await cliente
          .declaracion
          .findMany({
            where: {
              placa: {
                in: placas,
              },
            },
            include: {
              recibos: true,
            },
            orderBy: [
              {
                placa: "asc",
              },
              {
                anioDeclaracion:
                  "asc",
              },
              {
                id: "asc",
              },
            ],
          })
      : [];

  const declaracionesPorClave =
    new Map<
      string,
      DeclaracionConRecibos[]
    >();

  const declaracionesPorPlaca =
    new Map<
      string,
      DeclaracionConRecibos[]
    >();

  for (
    const declaracion
    of declaraciones
  ) {
    const placa =
      normalizarPlaca(
        declaracion.placa,
      );

    if (!placa) {
      continue;
    }

    const clave =
      clavePlacaAnio(
        placa,
        declaracion
          .anioDeclaracion,
      );

    const grupo =
      declaracionesPorClave.get(
        clave,
      ) ?? [];

    grupo.push(
      declaracion,
    );

    declaracionesPorClave.set(
      clave,
      grupo,
    );

    const grupoPlaca =
      declaracionesPorPlaca.get(
        placa,
      ) ?? [];

    grupoPlaca.push(
      declaracion,
    );

    declaracionesPorPlaca.set(
      placa,
      grupoPlaca,
    );
  }

  for (
    const requerimiento
    of requerimientos
  ) {
    const placa =
      normalizarPlaca(
        requerimiento
          .placaNormalizada,
      );

    const estadosPeriodos:
      EstadoConciliacionManual[] =
        [];

    for (
      const periodo
      of requerimiento.periodos
    ) {
      let resultado:
        ResultadoPeriodo;

      if (
        requerimiento
          .tipoRegistro ===
        TipoRegistroManual.ANULADO
      ) {
        resultado = {
          declaracionId: null,
          estado:
            EstadoConciliacionManual.ANULADO,
          montoPagado: 0,
          observacion:
            "El registro está marcado como anulado en el Excel.",
        };
      } else if (
        requerimiento
          .tipoRegistro ===
          TipoRegistroManual.VACIO ||
        requerimiento
          .tipoRegistro ===
          TipoRegistroManual.SIN_REGISTRO
      ) {
        resultado = {
          declaracionId: null,
          estado:
            EstadoConciliacionManual.NO_APLICA,
          montoPagado: 0,
          observacion:
            "El registro vacío o sin registro no participa en la conciliación.",
        };
      } else if (!placa) {
        resultado = {
          declaracionId: null,
          estado:
            EstadoConciliacionManual.REVISAR,
          montoPagado: 0,
          observacion:
            "No existe una placa normalizable para buscar declaraciones y recibos.",
        };
      } else {
        const clave =
          clavePlacaAnio(
            placa,
            periodo.periodoAnio,
          );

        resultado =
          analizarPeriodo(
            declaracionesPorClave.get(
              clave,
            ) ?? [],
            requerimiento
              .propietarioOriginal,
          );
      }

      await cliente
        .requerimientoManualPeriodo
        .update({
          where: {
            id: periodo.id,
          },
          data: {
            declaracionId:
              resultado
                .declaracionId,
            estadoConciliado:
              resultado.estado,
            montoPagado:
              resultado
                .montoPagado,
            observacion:
              resultado
                .observacion,
          },
        });

      estadosPeriodos.push(
        resultado.estado,
      );

      incrementar(
        resumenPeriodos,
        resultado.estado,
      );
    }

    const estadoGeneralBase =
      determinarEstadoGeneral(
        requerimiento
          .tipoRegistro,
        estadosPeriodos,
      );

    const analisisAnios =
      analizarAniosRequerimientoManual({
        placa,
        propietarioManual:
          requerimiento
            .propietarioOriginal,
        aniosManual:
          requerimiento
            .periodos.map(
              (periodo) =>
                periodo.periodoAnio,
            ),
        declaraciones:
          declaracionesPorPlaca.get(
            placa,
          ) ?? [],
      });

    incrementar(
      resumenValidacionAnios,
      analisisAnios
        .validacionAnios,
    );

    const puedeReemplazarEstado =
      analisisAnios
        .puedeMarcarPagadoPorTresAnios &&
      estadoGeneralBase !==
        EstadoConciliacionManual.ANULADO &&
      estadoGeneralBase !==
        EstadoConciliacionManual.NO_APLICA &&
      estadoGeneralBase !==
        EstadoConciliacionManual.REVISAR;

    const estadoGeneral =
      puedeReemplazarEstado
        ? EstadoConciliacionManual.PAGADO
        : estadoGeneralBase;

    if (
      puedeReemplazarEstado &&
      estadoGeneralBase !==
        EstadoConciliacionManual.PAGADO
    ) {
      cambiosTresAnios.push({
        requerimientoManualId:
          requerimiento.id,
        numeroRequerimiento:
          requerimiento
            .numeroRequerimiento,
        estadoAnterior:
          estadoGeneralBase,
        estadoNuevo:
          EstadoConciliacionManual.PAGADO,
        validacionAnios:
          analisisAnios
            .validacionAniosEtiqueta,
        ventanaPagada:
          analisisAnios
            .ventanaTresAniosPagadosFormato,
      });
    }

    const estadoRevision =
      determinarRevision(
        estadoManualNormalizado(
          requerimiento
            .estadoManualOriginal,
        ),
        estadoGeneral,
      );

    await cliente
      .requerimientoManual
      .update({
        where: {
          id:
            requerimiento.id,
        },
        data: {
          estadoConciliado:
            estadoGeneral,
          estadoRevision,
        },
      });

    incrementar(
      resumenRequerimientos,
      estadoGeneral,
    );

    incrementar(
      resumenRevision,
      estadoRevision,
    );
  }

  return {
    periodosProcesados:
      requerimientos.reduce(
        (total, requerimiento) =>
          total +
          requerimiento
            .periodos.length,
        0,
      ),
    requerimientosProcesados:
      requerimientos.length,
    requerimientosPagadosPorTresAnios:
      cambiosTresAnios.length,
    resumenPeriodos,
    resumenRequerimientos,
    resumenRevision,
    resumenValidacionAnios,
    cambiosTresAnios,
  };
}
