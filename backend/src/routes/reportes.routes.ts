import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import ExcelJS from "exceljs";

import {
  EstadoConciliacion,
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

export const reportesRouter = Router();

const ESTADOS_VALIDOS =
  Object.values(
    EstadoConciliacion,
  );

class ErrorReporteOrdenes extends Error {
  public readonly status: number;

  constructor(
    mensaje: string,
    status = 400,
  ) {
    super(mensaje);
    this.name =
      "ErrorReporteOrdenes";
    this.status = status;
  }
}

interface FiltrosReporteOrdenes {
  buscar: string;
  estado:
    | EstadoConciliacion
    | null;
  anioOrden: number | null;
  periodoAnio: number | null;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
}

function textoConsulta(
  valor: unknown,
): string {
  return typeof valor === "string"
    ? valor.trim()
    : "";
}

function enteroConsulta(
  valor: unknown,
  etiqueta: string,
): number | null {
  const texto =
    textoConsulta(valor);

  if (!texto) {
    return null;
  }

  const numero =
    Number(texto);

  if (
    !Number.isInteger(numero) ||
    numero < 1900 ||
    numero > 2100
  ) {
    throw new ErrorReporteOrdenes(
      `${etiqueta} debe ser un año válido entre 1900 y 2100.`,
    );
  }

  return numero;
}

function fechaConsulta(
  valor: unknown,
  etiqueta: string,
  finDelDia = false,
): Date | null {
  const texto =
    textoConsulta(valor);

  if (!texto) {
    return null;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      texto,
    )
  ) {
    throw new ErrorReporteOrdenes(
      `${etiqueta} debe tener el formato AAAA-MM-DD.`,
    );
  }

  const fecha =
    new Date(
      `${texto}T${
        finDelDia
          ? "23:59:59.999"
          : "00:00:00.000"
      }Z`,
    );

  if (
    Number.isNaN(
      fecha.getTime(),
    )
  ) {
    throw new ErrorReporteOrdenes(
      `${etiqueta} no es válida.`,
    );
  }

  return fecha;
}

function leerFiltros(
  req: Request,
): FiltrosReporteOrdenes {
  const estadoTexto =
    textoConsulta(
      req.query.estado,
    );

  let estado:
    | EstadoConciliacion
    | null = null;

  if (estadoTexto) {
    if (
      !ESTADOS_VALIDOS.includes(
        estadoTexto as
          EstadoConciliacion,
      )
    ) {
      throw new ErrorReporteOrdenes(
        "El estado indicado no es válido.",
      );
    }

    estado =
      estadoTexto as
        EstadoConciliacion;
  }

  const fechaDesde =
    fechaConsulta(
      req.query.fechaDesde,
      "La fecha inicial",
    );

  const fechaHasta =
    fechaConsulta(
      req.query.fechaHasta,
      "La fecha final",
      true,
    );

  if (
    fechaDesde &&
    fechaHasta &&
    fechaDesde > fechaHasta
  ) {
    throw new ErrorReporteOrdenes(
      "La fecha inicial no puede ser posterior a la fecha final.",
    );
  }

  return {
    buscar:
      textoConsulta(
        req.query.buscar,
      ),
    estado,
    anioOrden:
      enteroConsulta(
        req.query.anioOrden,
        "El año de la orden",
      ),
    periodoAnio:
      enteroConsulta(
        req.query.periodoAnio,
        "El año del periodo",
      ),
    fechaDesde,
    fechaHasta,
  };
}

function construirWhere(
  versionOrdenesId: number,
  filtros: FiltrosReporteOrdenes,
): Prisma.OrdenPagoWhereInput {
  const where:
    Prisma.OrdenPagoWhereInput = {
      versionOrdenesId,
  };

  if (filtros.buscar) {
    const buscar =
      filtros.buscar;

    where.OR = [
      {
        numeroOrden: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        idOrigen: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        dniRucOriginal: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        nombreOriginal: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        direccionOriginal: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        placa: {
          contains: buscar,
          mode: "insensitive",
        },
      },
    ];
  }

  if (filtros.estado) {
    where.estado =
      filtros.estado;
  }

  if (filtros.anioOrden) {
    where.anioOrden =
      filtros.anioOrden;
  }

  if (filtros.periodoAnio) {
    where.detalles = {
      some: {
        periodoAnio:
          filtros.periodoAnio,
      },
    };
  }

  if (
    filtros.fechaDesde ||
    filtros.fechaHasta
  ) {
    where.fechaEmision = {
      ...(filtros.fechaDesde
        ? {
            gte:
              filtros.fechaDesde,
          }
        : {}),
      ...(filtros.fechaHasta
        ? {
            lte:
              filtros.fechaHasta,
          }
        : {}),
    };
  }

  return where;
}

async function obtenerVersionActiva() {
  const version =
    await prisma
      .versionOrdenes
      .findFirst({
        where: {
          estado:
            EstadoVersionDatos.ACTIVA,
        },
        orderBy: {
          fechaAplicacion:
            "desc",
        },
        select: {
          id: true,
          codigo: true,
          comentario: true,
          totalOrdenes: true,
          totalDetalles: true,
          fechaAnalisis: true,
          fechaAplicacion:
            true,
          usuario: {
            select: {
              nombre: true,
              nombreUsuario:
                true,
            },
          },
          archivo: {
            select: {
              nombreArchivo:
                true,
              tamanoOriginal:
                true,
              totalFilas: true,
              filasValidas:
                true,
              filasConError:
                true,
            },
          },
        },
      });

  if (!version) {
    throw new ErrorReporteOrdenes(
      "No existe una versión independiente activa de Órdenes.",
      404,
    );
  }

  return version;
}


interface PagoSisgatReporte {
  declaracionId: number;
  anioDeclaracion: number;
  anioInscripcion: number | null;
  id: number | null;
  anioRecibo: number | null;
  numeroRecibo: string | null;
  monto: number | null;
  trimestreOriginal: string | null;
  trimestreDesde: number | null;
  trimestreHasta: number | null;
  estadoOriginal: string | null;
  activo: boolean;
}

function normalizarPlacaPagosSisgat(
  valor: string | null,
): string {
  return (valor ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function variantesPlacaPagosSisgat(
  valor: string | null,
): string[] {
  const original = (valor ?? "").trim();

  if (!original) {
    return [];
  }

  const mayuscula = original.toUpperCase();
  const normalizada =
    normalizarPlacaPagosSisgat(original);

  const formateada =
    normalizada.length === 6
      ? `${normalizada.slice(0, 3)}-${normalizada.slice(3)}`
      : normalizada;

  return Array.from(
    new Set(
      [
        original,
        mayuscula,
        normalizada,
        formateada,
      ].filter(Boolean),
    ),
  );
}

async function obtenerPagosSisgatPorPlaca(
  placas: Array<string | null>,
): Promise<Map<string, PagoSisgatReporte[]>> {
  const placasConsulta = Array.from(
    new Set(
      placas.flatMap(
        variantesPlacaPagosSisgat,
      ),
    ),
  );

  if (placasConsulta.length === 0) {
    return new Map();
  }

  const versionPagos =
    await prisma.versionPagosSisgat.findFirst({
      where: {
        estado:
          EstadoVersionDatos.ACTIVA,
      },
      orderBy: {
        fechaAplicacion: "desc",
      },
      select: {
        id: true,
      },
    });

  if (!versionPagos) {
    return new Map();
  }

  const declaraciones =
    await prisma.declaracion.findMany({
      where: {
        versionPagosSisgatId:
          versionPagos.id,
        OR: placasConsulta.map(
          (placa) => ({
            placa: {
              equals: placa,
              mode: "insensitive",
            },
          }),
        ),
      },
      select: {
        id: true,
        anioDeclaracion: true,
        fechaInscripcion: true,
        placa: true,
        recibos: {
          orderBy: [
            {
              anioRecibo: "desc",
            },
            {
              numeroRecibo: "asc",
            },
          ],
          select: {
            id: true,
            anioRecibo: true,
            numeroRecibo: true,
            monto: true,
            trimestreOriginal: true,
            trimestreDesde: true,
            trimestreHasta: true,
            estadoOriginal: true,
            activo: true,
          },
        },
      },
    });

  const registrosPorPlaca = new Map<
    string,
    Map<string, PagoSisgatReporte>
  >();

  for (const declaracion of declaraciones) {
    const placa =
      normalizarPlacaPagosSisgat(
        declaracion.placa,
      );

    if (!placa) {
      continue;
    }

    const registros =
      registrosPorPlaca.get(placa) ??
      new Map<
        string,
        PagoSisgatReporte
      >();

    if (declaracion.recibos.length === 0) {
      registros.set(
        `D:${declaracion.id}`,
        {
          declaracionId:
            declaracion.id,
          anioDeclaracion:
            declaracion.anioDeclaracion,
          anioInscripcion:
            declaracion.fechaInscripcion
              ? declaracion.fechaInscripcion.getUTCFullYear()
              : null,
          id: null,
          anioRecibo: null,
          numeroRecibo: null,
          monto: null,
          trimestreOriginal: null,
          trimestreDesde: null,
          trimestreHasta: null,
          estadoOriginal: null,
          activo: false,
        },
      );
    }

    for (
      const recibo of
      declaracion.recibos
    ) {
      registros.set(
        `R:${recibo.id}`,
        {
          declaracionId:
            declaracion.id,
          anioDeclaracion:
            declaracion.anioDeclaracion,
          anioInscripcion:
            declaracion.fechaInscripcion
              ? declaracion.fechaInscripcion.getUTCFullYear()
              : null,
          id: recibo.id,
          anioRecibo:
            recibo.anioRecibo,
          numeroRecibo:
            recibo.numeroRecibo,
          monto: Number(
            recibo.monto,
          ),
          trimestreOriginal:
            recibo.trimestreOriginal,
          trimestreDesde:
            recibo.trimestreDesde,
          trimestreHasta:
            recibo.trimestreHasta,
          estadoOriginal:
            recibo.estadoOriginal,
          activo: recibo.activo,
        },
      );
    }

    registrosPorPlaca.set(
      placa,
      registros,
    );
  }

  const resultado =
    new Map<
      string,
      PagoSisgatReporte[]
    >();

  for (
    const [placa, registros] of
    registrosPorPlaca.entries()
  ) {
    resultado.set(
      placa,
      Array.from(
        registros.values(),
      ).sort((a, b) => {
        if (
          a.anioDeclaracion !==
          b.anioDeclaracion
        ) {
          return (
            a.anioDeclaracion -
            b.anioDeclaracion
          );
        }

        if (a.activo !== b.activo) {
          return a.activo
            ? -1
            : 1;
        }

        return (
          a.numeroRecibo ?? ""
        ).localeCompare(
          b.numeroRecibo ?? "",
          "es",
        );
      }),
    );
  }

  return resultado;
}

function pagosSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatReporte[]
  >,
  placa: string | null,
): PagoSisgatReporte[] {
  const clave =
    normalizarPlacaPagosSisgat(
      placa,
    );

  return clave
    ? pagosPorPlaca.get(clave) ??
        []
    : [];
}

function anioInscripcionSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatReporte[]
  >,
  placa: string | null,
): number | null {
  const pagos =
    pagosSisgatDePlaca(
      pagosPorPlaca,
      placa,
    );

  const candidato = pagos
    .filter(
      (pago) =>
        pago.anioInscripcion !==
        null,
    )
    .sort(
      (a, b) =>
        b.anioDeclaracion -
        a.anioDeclaracion,
    )[0];

  return (
    candidato?.anioInscripcion ??
    null
  );
}

function extraerTrimestresPagosSisgat(
  valor: string | null,
): number[] {
  if (!valor) {
    return [];
  }

  const encontrados =
    new Set<number>();
  const texto = valor.trim();

  for (
    const coincidencia of
    texto.matchAll(
      /([1-4])\s*[-–—]\s*([1-4])/g,
    )
  ) {
    const inicio = Number(
      coincidencia[1],
    );
    const fin = Number(
      coincidencia[2],
    );
    const desde = Math.min(
      inicio,
      fin,
    );
    const hasta = Math.max(
      inicio,
      fin,
    );

    for (
      let trimestre = desde;
      trimestre <= hasta;
      trimestre += 1
    ) {
      encontrados.add(
        trimestre,
      );
    }
  }

  for (
    const coincidencia of
    texto.matchAll(
      /(?:^|\D)([1-4])(?=\D|$)/g,
    )
  ) {
    encontrados.add(
      Number(
        coincidencia[1],
      ),
    );
  }

  return Array.from(
    encontrados,
  ).sort(
    (a, b) => a - b,
  );
}

function resumirTrimestresPagosSisgat(
  trimestres: Set<number>,
): string {
  const valores =
    Array.from(
      trimestres,
    ).sort(
      (a, b) => a - b,
    );

  if (valores.length === 0) {
    return "";
  }

  const segmentos: string[] = [];
  let inicio = valores[0];
  let anterior = valores[0];

  for (
    let indice = 1;
    indice < valores.length;
    indice += 1
  ) {
    const actual =
      valores[indice];

    if (
      actual === anterior + 1
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

function textoPagosSisgatExcel(
  pagos: PagoSisgatReporte[],
): string {
  if (pagos.length === 0) {
    return "Sin datos SisGAT";
  }

  const coberturaPorAnio =
    new Map<
      number,
      Set<number>
    >();

  for (const pago of pagos) {
    if (
      !Number.isInteger(
        pago.anioDeclaracion,
      )
    ) {
      continue;
    }

    const cobertura =
      coberturaPorAnio.get(
        pago.anioDeclaracion,
      ) ??
      new Set<number>();

    if (pago.activo) {
      for (
        const trimestre of
        extraerTrimestresPagosSisgat(
          pago.trimestreOriginal,
        )
      ) {
        cobertura.add(
          trimestre,
        );
      }
    }

    coberturaPorAnio.set(
      pago.anioDeclaracion,
      cobertura,
    );
  }

  if (
    coberturaPorAnio.size === 0
  ) {
    return "Sin datos SisGAT";
  }

  return Array.from(
    coberturaPorAnio.entries(),
  )
    .sort(
      ([anioA], [anioB]) =>
        anioA - anioB,
    )
    .map(
      ([anio, trimestres]) =>
        trimestres.size > 0
          ? `${anio} [${resumirTrimestresPagosSisgat(
              trimestres,
            )}]`
          : `${anio} [NO HAY PAGOS]`,
    )
    .join(" · ");
}

function anioUltimoTributarioSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatReporte[]
  >,
  placa: string | null,
): number | null {
  const anioInscripcion =
    anioInscripcionSisgatDePlaca(
      pagosPorPlaca,
      placa,
    );

  return anioInscripcion === null
    ? null
    : anioInscripcion + 3;
}

function tresAniosPagadosSisgatDePlaca(
  pagosPorPlaca: Map<
    string,
    PagoSisgatReporte[]
  >,
  placa: string | null,
): boolean | null {
  const anioInscripcion =
    anioInscripcionSisgatDePlaca(
      pagosPorPlaca,
      placa,
    );

  if (anioInscripcion === null) {
    return null;
  }

  const aniosEsperados = [
    anioInscripcion + 1,
    anioInscripcion + 2,
    anioInscripcion + 3,
  ];

  const cobertura =
    new Map<number, Set<number>>();

  for (
    const pago of pagosSisgatDePlaca(
      pagosPorPlaca,
      placa,
    )
  ) {
    if (
      !pago.activo ||
      !aniosEsperados.includes(
        pago.anioDeclaracion,
      )
    ) {
      continue;
    }

    const trimestres =
      cobertura.get(
        pago.anioDeclaracion,
      ) ?? new Set<number>();

    if (
      pago.trimestreDesde !== null &&
      pago.trimestreHasta !== null
    ) {
      const desde = Math.max(
        1,
        pago.trimestreDesde,
      );
      const hasta = Math.min(
        4,
        pago.trimestreHasta,
      );

      for (
        let trimestre = desde;
        trimestre <= hasta;
        trimestre += 1
      ) {
        trimestres.add(trimestre);
      }
    } else {
      for (
        const trimestre of
        extraerTrimestresPagosSisgat(
          pago.trimestreOriginal,
        )
      ) {
        trimestres.add(trimestre);
      }
    }

    cobertura.set(
      pago.anioDeclaracion,
      trimestres,
    );
  }

  return aniosEsperados.every(
    (anio) => {
      const trimestres =
        cobertura.get(anio);

      return (
        trimestres?.has(1) === true &&
        trimestres.has(2) &&
        trimestres.has(3) &&
        trimestres.has(4)
      );
    },
  );
}

function textoPeriodoTributarioExcel(
  anioInscripcion: number | null,
  anioUltimoTributario: number | null,
): string {
  if (
    anioInscripcion === null ||
    anioUltimoTributario === null
  ) {
    return "Sin inscripción SisGAT";
  }

  return (
    `Inscripción: ${anioInscripcion}\n` +
    `Último pago esperado: ${anioUltimoTributario}`
  );
}

function textoTresAniosPagados(
  valor: boolean | null,
): string {
  return valor === null
    ? "—"
    : valor
      ? "SÍ"
      : "NO";
}


async function consultarReporte(
  filtros:
    FiltrosReporteOrdenes,
) {
  const version =
    await obtenerVersionActiva();

  const where =
    construirWhere(
      version.id,
      filtros,
    );

  const whereDetalles:
    Prisma.OrdenDetalleWhereInput =
      filtros.periodoAnio
        ? {
            periodoAnio:
              filtros.periodoAnio,
          }
        : {};

  const ordenes =
    await prisma.ordenPago.findMany({
      where,
      orderBy: [
        {
          anioOrden: "desc",
        },
        {
          numeroOrden: "asc",
        },
      ],
      include: {
        contribuyente: {
          select: {
            id: true,
            numeroDocumento:
              true,
            nombreRazonSocial:
              true,
          },
        },
        detalles: {
          where:
            whereDetalles,
          orderBy: [
            {
              periodoAnio:
                "asc",
            },
            {
              trimestreDesde:
                "asc",
            },
          ],
          include: {
            declaracion: {
              include: {
                recibos: {
                  orderBy: [
                    {
                      anioRecibo:
                        "asc",
                    },
                    {
                      numeroRecibo:
                        "asc",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

  const pagosSisgatPorPlaca =
    await obtenerPagosSisgatPorPlaca(
      ordenes.map((orden) => orden.placa),
    );

  const estados =
    new Map<
      EstadoConciliacion,
      {
        estado:
          EstadoConciliacion;
        cantidad: number;
        importeTotal: number;
        totalPagado: number;
        saldo: number;
      }
    >();

  const contribuyentes =
    new Set<string>();

  let importeTotal = 0;
  let totalPagado = 0;
  let saldo = 0;
  let periodos = 0;

  for (const orden of ordenes) {
    const importe =
      Number(
        orden.importeTotal,
      );
    const pagado =
      Number(
        orden.totalPagado,
      );
    const pendiente =
      Number(
        orden.saldo,
      );

    importeTotal += importe;
    totalPagado += pagado;
    saldo += pendiente;
    periodos +=
      orden.detalles.length;

    const claveContribuyente =
      orden.contribuyenteId
        ? `ID:${orden.contribuyenteId}`
        : orden.dniRucOriginal
          ? `DOC:${orden.dniRucOriginal}`
          : `ORDEN:${orden.id}`;

    contribuyentes.add(
      claveContribuyente,
    );

    const actual =
      estados.get(
        orden.estado,
      ) ?? {
        estado:
          orden.estado,
        cantidad: 0,
        importeTotal: 0,
        totalPagado: 0,
        saldo: 0,
      };

    actual.cantidad += 1;
    actual.importeTotal +=
      importe;
    actual.totalPagado +=
      pagado;
    actual.saldo +=
      pendiente;

    estados.set(
      orden.estado,
      actual,
    );
  }

  const redondear = (
    valor: number,
  ) =>
    Math.round(
      (valor +
        Number.EPSILON) *
        100,
    ) / 100;

  return {
    version,
    filtros,
    ordenes,
    pagosSisgatPorPlaca,
    totales: {
      ordenes:
        ordenes.length,
      periodos,
      contribuyentes:
        contribuyentes.size,
      importeTotal:
        redondear(
          importeTotal,
        ),
      totalPagado:
        redondear(
          totalPagado,
        ),
      saldo:
        redondear(
          saldo,
        ),
    },
    estados:
      Array.from(
        estados.values(),
      )
        .map((item) => ({
          ...item,
          importeTotal:
            redondear(
              item.importeTotal,
            ),
          totalPagado:
            redondear(
              item.totalPagado,
            ),
          saldo:
            redondear(
              item.saldo,
            ),
        }))
        .sort(
          (a, b) =>
            b.cantidad -
            a.cantidad,
        ),
  };
}

function fechaIso(
  valor: Date | null,
): string | null {
  return valor
    ? valor
        .toISOString()
        .slice(0, 10)
    : null;
}

function nombreEstado(
  estado:
    EstadoConciliacion,
): string {
  return estado
    .replaceAll("_", " ");
}

function aplicarEstiloTitulo(
  hoja:
    ExcelJS.Worksheet,
  rango: string,
) {
  hoja.mergeCells(rango);

  const celda =
    hoja.getCell(
      rango.split(":")[0],
    );

  celda.font = {
    bold: true,
    size: 16,
  };
  celda.alignment = {
    vertical: "middle",
  };
}

function aplicarEncabezado(
  fila: ExcelJS.Row,
) {
  fila.font = {
    bold: true,
  };
  fila.alignment = {
    vertical: "middle",
    wrapText: true,
  };
  fila.eachCell((celda) => {
    celda.border = {
      top: {
        style: "thin",
      },
      left: {
        style: "thin",
      },
      bottom: {
        style: "thin",
      },
      right: {
        style: "thin",
      },
    };
  });
}

function configurarMoneda(
  hoja:
    ExcelJS.Worksheet,
  columnas: number[],
  desdeFila: number,
) {
  for (
    let fila = desdeFila;
    fila <= hoja.rowCount;
    fila += 1
  ) {
    for (
      const columna
      of columnas
    ) {
      hoja.getCell(
        fila,
        columna,
      ).numFmt =
        '"S/ " #,##0.00';
    }
  }
}

async function construirExcel(
  resultado:
    Awaited<
      ReturnType<
        typeof consultarReporte
      >
    >,
): Promise<Buffer> {
  const libro =
    new ExcelJS.Workbook();

  libro.creator =
    "Sistema de conciliación SAT";
  libro.created =
    new Date();
  libro.modified =
    new Date();

  const resumen =
    libro.addWorksheet(
      "Resumen",
      {
        views: [
          {
            state: "frozen",
            ySplit: 1,
          },
        ],
      },
    );

  aplicarEstiloTitulo(
    resumen,
    "A1:F1",
  );
  resumen.getCell("A1").value =
    "Reporte independiente de Órdenes";

  resumen.addRow([]);
  resumen.addRow([
    "Versión activa",
    `#${resultado.version.id}`,
    "Código",
    resultado.version.codigo,
  ]);
  resumen.addRow([
    "Archivo",
    resultado.version.archivo
      ?.nombreArchivo ??
      "Sin archivo",
    "Aplicada",
    resultado.version
      .fechaAplicacion ??
      "Sin aplicación",
  ]);
  resumen.addRow([
    "Responsable",
    resultado.version.usuario
      ?.nombre ??
      resultado.version.usuario
        ?.nombreUsuario ??
      "Sin registro",
    "Comentario",
    resultado.version.comentario ??
      "Sin comentario",
  ]);

  resumen.addRow([]);
  resumen.addRow([
    "Filtros aplicados",
  ]);
  resumen.addRow([
    "Búsqueda",
    resultado.filtros.buscar ||
      "Todos",
    "Estado",
    resultado.filtros.estado
      ? nombreEstado(
          resultado.filtros.estado,
        )
      : "Todos",
  ]);
  resumen.addRow([
    "Año de orden",
    resultado.filtros.anioOrden ??
      "Todos",
    "Año del periodo",
    resultado.filtros.periodoAnio ??
      "Todos",
  ]);
  resumen.addRow([
    "Fecha desde",
    fechaIso(
      resultado.filtros
        .fechaDesde,
    ) ?? "Todas",
    "Fecha hasta",
    fechaIso(
      resultado.filtros
        .fechaHasta,
    ) ?? "Todas",
  ]);

  resumen.addRow([]);
  const filaTotales =
    resumen.addRow([
      "Órdenes",
      "Periodos",
      "Contribuyentes",
      "Importe generado",
      "Total pagado",
      "Saldo",
    ]);
  aplicarEncabezado(
    filaTotales,
  );

  resumen.addRow([
    resultado.totales.ordenes,
    resultado.totales.periodos,
    resultado.totales
      .contribuyentes,
    resultado.totales
      .importeTotal,
    resultado.totales
      .totalPagado,
    resultado.totales.saldo,
  ]);

  configurarMoneda(
    resumen,
    [4, 5, 6],
    resumen.rowCount,
  );

  resumen.addRow([]);
  const filaEstados =
    resumen.addRow([
      "Estado",
      "Órdenes",
      "Importe",
      "Pagado",
      "Saldo",
    ]);
  aplicarEncabezado(
    filaEstados,
  );

  for (
    const estado
    of resultado.estados
  ) {
    resumen.addRow([
      nombreEstado(
        estado.estado,
      ),
      estado.cantidad,
      estado.importeTotal,
      estado.totalPagado,
      estado.saldo,
    ]);
  }

  configurarMoneda(
    resumen,
    [3, 4, 5],
    filaEstados.number + 1,
  );

  resumen.columns = [
    {
      width: 24,
    },
    {
      width: 24,
    },
    {
      width: 24,
    },
    {
      width: 28,
    },
    {
      width: 22,
    },
    {
      width: 22,
    },
  ];

  const hojaOrdenes =
    libro.addWorksheet(
      "Órdenes",
      {
        views: [
          {
            state: "frozen",
            ySplit: 1,
          },
        ],
      },
    );

  hojaOrdenes.columns = [
    {
      header: "Año",
      key: "anioOrden",
      width: 10,
    },
    {
      header: "Número de orden",
      key: "numeroOrden",
      width: 18,
    },
    {
      header: "Fecha de emisión",
      key: "fechaEmision",
      width: 16,
    },
    {
      header: "DNI/RUC",
      key: "dniRuc",
      width: 18,
    },
    {
      header: "Contribuyente",
      key: "nombre",
      width: 38,
    },
    {
      header: "Dirección",
      key: "direccion",
      width: 45,
    },
    {
      header: "Placa",
      key: "placa",
      width: 14,
    },
    {
      header: "Periodo original",
      key: "periodoOriginal",
      width: 22,
    },
    {
      header: "Importe total",
      key: "importeTotal",
      width: 16,
    },
    {
      header: "Total pagado",
      key: "totalPagado",
      width: 16,
    },
    {
      header: "Saldo",
      key: "saldo",
      width: 16,
    },
    {
      header: "Pagos SisGAT por placa",
      key: "pagosSisgat",
      width: 52,
    },
    {
      header: "Estado",
      key: "estado",
      width: 20,
    },
    {
      header: "Periodo tributario",
      key: "periodoTributario",
      width: 28,
    },
    {
      header: "3 años pagados",
      key: "tresAniosPagados",
      width: 16,
    },
    {
      header: "Periodos",
      key: "periodos",
      width: 11,
    },
    {
      header: "Activo original",
      key: "activoOriginal",
      width: 15,
    },
    {
      header: "ID origen",
      key: "idOrigen",
      width: 18,
    },
    {
      header: "Archivo de origen",
      key: "archivoOrigen",
      width: 38,
    },
    {
      header: "Fila de origen",
      key: "filaOrigen",
      width: 14,
    },
    {
      header: "Versión",
      key: "version",
      width: 12,
    },
  ];

  aplicarEncabezado(
    hojaOrdenes.getRow(1),
  );

  for (
    const orden
    of resultado.ordenes
  ) {
    hojaOrdenes.addRow({
      anioOrden:
        orden.anioOrden,
      numeroOrden:
        orden.numeroOrden,
      fechaEmision:
        orden.fechaEmision,
      dniRuc:
        orden.dniRucOriginal ??
        orden.contribuyente
          ?.numeroDocumento ??
        "",
      nombre:
        orden.nombreOriginal ??
        orden.contribuyente
          ?.nombreRazonSocial ??
        "",
      direccion:
        orden.direccionOriginal ??
        "",
      placa:
        orden.placa ?? "",
      pagosSisgat:
        textoPagosSisgatExcel(
          pagosSisgatDePlaca(
            resultado.pagosSisgatPorPlaca,
            orden.placa,
          ),
        ),
      periodoOriginal:
        orden.periodoOriginal ??
        "",
      importeTotal:
        Number(
          orden.importeTotal,
        ),
      totalPagado:
        Number(
          orden.totalPagado,
        ),
      saldo:
        Number(
          orden.saldo,
        ),
      estado:
        nombreEstado(
          orden.estado,
        ),
      periodoTributario:
        textoPeriodoTributarioExcel(
          anioInscripcionSisgatDePlaca(
            resultado.pagosSisgatPorPlaca,
            orden.placa,
          ),
          anioUltimoTributarioSisgatDePlaca(
            resultado.pagosSisgatPorPlaca,
            orden.placa,
          ),
        ),
      tresAniosPagados:
        textoTresAniosPagados(
          tresAniosPagadosSisgatDePlaca(
            resultado.pagosSisgatPorPlaca,
            orden.placa,
          ),
        ),
      periodos:
        orden.detalles.length,
      activoOriginal:
        orden.activoOriginal ??
        "",
      idOrigen:
        orden.idOrigen ?? "",
      archivoOrigen:
        orden.archivoOrigen ??
        "",
      filaOrigen:
        orden.filaOrigen ?? "",
      version:
        resultado.version.id,
    });
  }

  configurarMoneda(
    hojaOrdenes,
    [10, 11, 12],
    2,
  );

  for (let fila = 2; fila <= hojaOrdenes.rowCount; fila += 1) {
    hojaOrdenes.getCell(fila, 8).alignment = {
      vertical: "top",
      wrapText: true,
    };
  }

  hojaOrdenes.autoFilter = {
    from: "A1",
    to: "U1",
  };

  const hojaPeriodos =
    libro.addWorksheet(
      "Periodos y pagos",
      {
        views: [
          {
            state: "frozen",
            ySplit: 1,
          },
        ],
      },
    );

  hojaPeriodos.columns = [
    {
      header: "Año orden",
      key: "anioOrden",
      width: 11,
    },
    {
      header: "Número de orden",
      key: "numeroOrden",
      width: 18,
    },
    {
      header: "Placa",
      key: "placa",
      width: 14,
    },
    {
      header: "DNI/RUC",
      key: "dniRuc",
      width: 18,
    },
    {
      header: "Contribuyente",
      key: "nombre",
      width: 36,
    },
    {
      header: "Año del periodo",
      key: "periodoAnio",
      width: 14,
    },
    {
      header: "Trimestre desde",
      key: "trimestreDesde",
      width: 15,
    },
    {
      header: "Trimestre hasta",
      key: "trimestreHasta",
      width: 15,
    },
    {
      header: "Total periodo",
      key: "totalPeriodo",
      width: 16,
    },
    {
      header: "Monto pagado",
      key: "montoPagado",
      width: 16,
    },
    {
      header: "Saldo",
      key: "saldo",
      width: 16,
    },
    {
      header: "Estado",
      key: "estado",
      width: 20,
    },
    {
      header: "Declaración",
      key: "declaracion",
      width: 20,
    },
    {
      header: "Recibos activos",
      key: "recibosActivos",
      width: 15,
    },
    {
      header: "Monto recibos activos",
      key: "montoRecibosActivos",
      width: 20,
    },
    {
      header: "Recibos anulados",
      key: "recibosAnulados",
      width: 16,
    },
    {
      header: "Observación",
      key: "observacion",
      width: 60,
    },
  ];

  aplicarEncabezado(
    hojaPeriodos.getRow(1),
  );

  for (
    const orden
    of resultado.ordenes
  ) {
    for (
      const detalle
      of orden.detalles
    ) {
      const recibos =
        detalle.declaracion
          ?.recibos ??
        [];

      const activos =
        recibos.filter(
          (recibo) =>
            recibo.activo,
        );

      const anulados =
        recibos.filter(
          (recibo) =>
            !recibo.activo,
        );

      const montoActivos =
        activos.reduce(
          (total, recibo) =>
            total +
            Number(
              recibo.monto,
            ),
          0,
        );

      hojaPeriodos.addRow({
        anioOrden:
          orden.anioOrden,
        numeroOrden:
          orden.numeroOrden,
        placa:
          orden.placa ?? "",
        dniRuc:
          orden.dniRucOriginal ??
          "",
        nombre:
          orden.nombreOriginal ??
          "",
        periodoAnio:
          detalle.periodoAnio,
        trimestreDesde:
          detalle.trimestreDesde,
        trimestreHasta:
          detalle.trimestreHasta,
        totalPeriodo:
          Number(
            detalle.totalPeriodo,
          ),
        montoPagado:
          Number(
            detalle.montoPagado,
          ),
        saldo:
          Number(
            detalle.saldo,
          ),
        estado:
          nombreEstado(
            detalle.estado,
          ),
        declaracion:
          detalle.declaracion
            ? `${detalle.declaracion.anioDeclaracion}-${detalle.declaracion.numeroDeclaracion}`
            : "",
        recibosActivos:
          activos.length,
        montoRecibosActivos:
          Math.round(
            (montoActivos +
              Number.EPSILON) *
              100,
          ) / 100,
        recibosAnulados:
          anulados.length,
        observacion:
          detalle.observacion ??
          "",
      });
    }
  }

  configurarMoneda(
    hojaPeriodos,
    [9, 10, 11, 15],
    2,
  );

  hojaPeriodos.autoFilter = {
    from: "A1",
    to: "Q1",
  };

  const contenido =
    await libro.xlsx.writeBuffer();

  return Buffer.from(
    contenido,
  );
}

function responderError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (
    error instanceof
    ErrorReporteOrdenes
  ) {
    res.status(
      error.status,
    ).json({
      ok: false,
      message:
        error.message,
      data: null,
    });
    return;
  }

  next(error);
}

reportesRouter.get(
  "/ordenes/resumen",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filtros =
        leerFiltros(req);

      const resultado =
        await consultarReporte(
          filtros,
        );

      res.status(200).json({
        ok: true,
        message:
          "Resumen del reporte independiente de Órdenes obtenido correctamente.",
        data: {
          versionActiva: {
            id:
              resultado.version.id,
            codigo:
              resultado.version.codigo,
            comentario:
              resultado.version.comentario,
            fechaAnalisis:
              resultado.version.fechaAnalisis,
            fechaAplicacion:
              resultado.version.fechaAplicacion,
            usuario:
              resultado.version.usuario,
            archivo:
              resultado.version.archivo,
          },
          filtros: {
            buscar:
              resultado.filtros.buscar,
            estado:
              resultado.filtros.estado,
            anioOrden:
              resultado.filtros.anioOrden,
            periodoAnio:
              resultado.filtros.periodoAnio,
            fechaDesde:
              fechaIso(
                resultado.filtros
                  .fechaDesde,
              ),
            fechaHasta:
              fechaIso(
                resultado.filtros
                  .fechaHasta,
              ),
          },
          totales:
            resultado.totales,
          estados:
            resultado.estados,
          muestra:
            resultado.ordenes
              .slice(0, 50)
              .map((orden) => ({
                id: orden.id,
                anioOrden:
                  orden.anioOrden,
                numeroOrden:
                  orden.numeroOrden,
                fechaEmision:
                  orden.fechaEmision,
                dniRuc:
                  orden.dniRucOriginal,
                nombre:
                  orden.nombreOriginal,
                placa:
                  orden.placa,
                pagosSisgat:
                  pagosSisgatDePlaca(
                    resultado.pagosSisgatPorPlaca,
                    orden.placa,
                  ),
                anioInscripcion:
                  anioInscripcionSisgatDePlaca(
                    resultado.pagosSisgatPorPlaca,
                    orden.placa,
                  ),
                anioUltimoTributario:
                  anioUltimoTributarioSisgatDePlaca(
                    resultado.pagosSisgatPorPlaca,
                    orden.placa,
                  ),
                tresAniosPagados:
                  tresAniosPagadosSisgatDePlaca(
                    resultado.pagosSisgatPorPlaca,
                    orden.placa,
                  ),
                importeTotal:
                  Number(
                    orden.importeTotal,
                  ),
                totalPagado:
                  Number(
                    orden.totalPagado,
                  ),
                saldo:
                  Number(
                    orden.saldo,
                  ),
                estado:
                  orden.estado,
                periodos:
                  orden.detalles.length,
              })),
        },
      });
    } catch (error) {
      responderError(
        error,
        res,
        next,
      );
    }
  },
);

reportesRouter.get(
  "/ordenes.xlsx",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filtros =
        leerFiltros(req);

      const resultado =
        await consultarReporte(
          filtros,
        );

      if (
        resultado.totales
          .ordenes === 0
      ) {
        throw new ErrorReporteOrdenes(
          "No existen Órdenes que coincidan con los filtros seleccionados.",
          404,
        );
      }

      const archivo =
        await construirExcel(
          resultado,
        );

      const marca =
        new Date()
          .toISOString()
          .replace(
            /[:.]/g,
            "-",
          )
          .slice(0, 19);

      const nombre =
        `reporte_ordenes_version_${resultado.version.id}_${marca}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${nombre}"`,
      );
      res.setHeader(
        "Content-Length",
        String(
          archivo.length,
        ),
      );

      res.status(200).end(
        archivo,
      );
    } catch (error) {
      responderError(
        error,
        res,
        next,
      );
    }
  },
);
