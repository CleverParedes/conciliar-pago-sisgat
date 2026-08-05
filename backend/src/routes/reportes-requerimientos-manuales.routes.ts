import ExcelJS from "exceljs";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  EstadoConciliacionManual,
  EstadoNotificacionManual,
  EstadoRevisionManual,
  EstadoVersionDatos,
  TipoRegistroManual,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

export const reportesRequerimientosManualesRouter =
  Router();

const ESTADOS_CONCILIACION =
  Object.values(
    EstadoConciliacionManual,
  );

const ESTADOS_REVISION =
  Object.values(
    EstadoRevisionManual,
  );

const ESTADOS_NOTIFICACION =
  Object.values(
    EstadoNotificacionManual,
  );

const TIPOS_REGISTRO =
  Object.values(
    TipoRegistroManual,
  );

class ErrorReporteRequerimientosManuales extends Error {
  public readonly status: number;

  constructor(
    mensaje: string,
    status = 400,
  ) {
    super(mensaje);
    this.name =
      "ErrorReporteRequerimientosManuales";
    this.status = status;
  }
}

interface FiltrosReporteRequerimientosManuales {
  buscar: string;
  tipoRegistro:
    | TipoRegistroManual
    | null;
  estadoConciliado:
    | EstadoConciliacionManual
    | null;
  estadoRevision:
    | EstadoRevisionManual
    | null;
  estadoNotificacion:
    | EstadoNotificacionManual
    | null;
  anioGestion:
    | number
    | null;
  periodoAnio:
    | number
    | null;
  fechaNotificacionDesde:
    | Date
    | null;
  fechaNotificacionHasta:
    | Date
    | null;
}

function textoConsulta(
  valor: unknown,
): string {
  return typeof valor === "string"
    ? valor.trim()
    : "";
}

function enumConsulta<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
  etiqueta: string,
): T | null {
  const texto =
    textoConsulta(valor);

  if (!texto) {
    return null;
  }

  if (
    !permitidos.includes(
      texto as T,
    )
  ) {
    throw new ErrorReporteRequerimientosManuales(
      `${etiqueta} no es válido.`,
    );
  }

  return texto as T;
}

function enteroAnio(
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
    throw new ErrorReporteRequerimientosManuales(
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
    throw new ErrorReporteRequerimientosManuales(
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
    throw new ErrorReporteRequerimientosManuales(
      `${etiqueta} no es válida.`,
    );
  }

  return fecha;
}

function leerFiltros(
  req: Request,
): FiltrosReporteRequerimientosManuales {
  const fechaNotificacionDesde =
    fechaConsulta(
      req.query
        .fechaNotificacionDesde,
      "La fecha inicial de notificación",
    );

  const fechaNotificacionHasta =
    fechaConsulta(
      req.query
        .fechaNotificacionHasta,
      "La fecha final de notificación",
      true,
    );

  if (
    fechaNotificacionDesde &&
    fechaNotificacionHasta &&
    fechaNotificacionDesde >
      fechaNotificacionHasta
  ) {
    throw new ErrorReporteRequerimientosManuales(
      "La fecha inicial de notificación no puede ser posterior a la fecha final.",
    );
  }

  return {
    buscar:
      textoConsulta(
        req.query.buscar,
      ),
    tipoRegistro:
      enumConsulta(
        req.query.tipoRegistro,
        TIPOS_REGISTRO,
        "El tipo de registro",
      ),
    estadoConciliado:
      enumConsulta(
        req.query
          .estadoConciliado,
        ESTADOS_CONCILIACION,
        "El estado conciliado",
      ),
    estadoRevision:
      enumConsulta(
        req.query
          .estadoRevision,
        ESTADOS_REVISION,
        "El estado de revisión",
      ),
    estadoNotificacion:
      enumConsulta(
        req.query
          .estadoNotificacion,
        ESTADOS_NOTIFICACION,
        "El estado de notificación",
      ),
    anioGestion:
      enteroAnio(
        req.query.anioGestion,
        "El año de gestión",
      ),
    periodoAnio:
      enteroAnio(
        req.query.periodoAnio,
        "El año del periodo",
      ),
    fechaNotificacionDesde,
    fechaNotificacionHasta,
  };
}

function construirWhere(
  versionRequerimientosManualesId:
    number,
  filtros:
    FiltrosReporteRequerimientosManuales,
): Prisma.RequerimientoManualWhereInput {
  const where:
    Prisma.RequerimientoManualWhereInput = {
      versionRequerimientosManualesId,
  };

  if (filtros.buscar) {
    const buscar =
      filtros.buscar;

    where.OR = [
      {
        numeroRequerimiento: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        placaOriginal: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        placaNormalizada: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        propietarioOriginal: {
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
        provinciaOriginal: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        distritoOriginal: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        notificadorActual: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        responsableActual: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        numeroCedulonActual: {
          contains: buscar,
          mode: "insensitive",
        },
      },
      {
        numeroLiquidacionDeudaActual: {
          contains: buscar,
          mode: "insensitive",
        },
      },
    ];
  }

  if (filtros.tipoRegistro) {
    where.tipoRegistro =
      filtros.tipoRegistro;
  }

  if (
    filtros.estadoConciliado
  ) {
    where.estadoConciliado =
      filtros.estadoConciliado;
  }

  if (
    filtros.estadoRevision
  ) {
    where.estadoRevision =
      filtros.estadoRevision;
  }

  if (
    filtros.estadoNotificacion
  ) {
    where.estadoNotificacion =
      filtros.estadoNotificacion;
  }

  if (filtros.anioGestion) {
    where.anioGestion =
      filtros.anioGestion;
  }

  if (filtros.periodoAnio) {
    where.periodos = {
      some: {
        periodoAnio:
          filtros.periodoAnio,
      },
    };
  }

  if (
    filtros
      .fechaNotificacionDesde ||
    filtros
      .fechaNotificacionHasta
  ) {
    where.fechaNotificacionActual = {
      ...(filtros
        .fechaNotificacionDesde
        ? {
            gte:
              filtros
                .fechaNotificacionDesde,
          }
        : {}),
      ...(filtros
        .fechaNotificacionHasta
        ? {
            lte:
              filtros
                .fechaNotificacionHasta,
          }
        : {}),
    };
  }

  return where;
}

async function obtenerVersionActiva() {
  const version =
    await prisma
      .versionRequerimientosManuales
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
          anioGestion: true,
          totalRegistros: true,
          totalPeriodos: true,
          totalErrores: true,
          totalAdvertencias:
            true,
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
              nombreHoja: true,
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
    throw new ErrorReporteRequerimientosManuales(
      "No existe una versión independiente activa de Requerimientos manuales.",
      404,
    );
  }

  return version;
}

function redondear(
  valor: number,
): number {
  return (
    Math.round(
      (
        valor +
        Number.EPSILON
      ) *
        100,
    ) / 100
  );
}

function aumentarConteo<
  T extends string,
>(
  mapa: Map<T, number>,
  clave: T,
): void {
  mapa.set(
    clave,
    (
      mapa.get(clave) ??
      0
    ) + 1,
  );
}

async function consultarReporte(
  filtros:
    FiltrosReporteRequerimientosManuales,
) {
  const version =
    await obtenerVersionActiva();

  const where =
    construirWhere(
      version.id,
      filtros,
    );

  const requerimientos =
    await prisma
      .requerimientoManual
      .findMany({
        where,
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
        include: {
          periodos: {
            where:
              filtros.periodoAnio
                ? {
                    periodoAnio:
                      filtros.periodoAnio,
                  }
                : {},
            orderBy: {
              periodoAnio:
                "asc",
            },
            include: {
              declaracion: {
                select: {
                  anioDeclaracion:
                    true,
                  numeroDeclaracion:
                    true,
                },
              },
            },
          },
          seguimientos: {
            orderBy: {
              createdAt:
                "asc",
            },
            include: {
              usuario: {
                select: {
                  nombre: true,
                  nombreUsuario:
                    true,
                },
              },
            },
          },
          historial: {
            orderBy: {
              createdAt:
                "asc",
            },
            include: {
              usuario: {
                select: {
                  nombre: true,
                  nombreUsuario:
                    true,
                },
              },
            },
          },
        },
      });

  const propietarios =
    new Set<string>();

  const conteoConciliacion =
    new Map<
      EstadoConciliacionManual,
      number
    >();

  const conteoRevision =
    new Map<
      EstadoRevisionManual,
      number
    >();

  const conteoNotificacion =
    new Map<
      EstadoNotificacionManual,
      number
    >();

  const conteoTipos =
    new Map<
      TipoRegistroManual,
      number
    >();

  let periodos = 0;
  let totalPagado = 0;
  let seguimientos = 0;
  let historial = 0;
  let notificados = 0;
  let discrepancias = 0;

  for (
    const requerimiento
    of requerimientos
  ) {
    if (
      requerimiento
        .propietarioOriginal
        ?.trim()
    ) {
      propietarios.add(
        requerimiento
          .propietarioOriginal
          .trim()
          .toUpperCase(),
      );
    }

    periodos +=
      requerimiento
        .periodos.length;

    seguimientos +=
      requerimiento
        .seguimientos.length;

    historial +=
      requerimiento
        .historial.length;

    totalPagado +=
      requerimiento.periodos.reduce(
        (total, periodo) =>
          total +
          Number(
            periodo
              .montoPagado,
          ),
        0,
      );

    if (
      requerimiento
        .estadoNotificacion ===
      EstadoNotificacionManual.NOTIFICADO
    ) {
      notificados += 1;
    }

    if (
      requerimiento
        .estadoRevision ===
      EstadoRevisionManual.DISCREPANCIA
    ) {
      discrepancias += 1;
    }

    aumentarConteo(
      conteoConciliacion,
      requerimiento
        .estadoConciliado,
    );

    aumentarConteo(
      conteoRevision,
      requerimiento
        .estadoRevision,
    );

    aumentarConteo(
      conteoNotificacion,
      requerimiento
        .estadoNotificacion,
    );

    aumentarConteo(
      conteoTipos,
      requerimiento
        .tipoRegistro,
    );
  }

  function convertirConteos<
    T extends string,
  >(
    mapa: Map<T, number>,
  ): Array<{
    estado: T;
    cantidad: number;
  }> {
    return Array.from(
      mapa.entries(),
    )
      .map(
        ([
          estado,
          cantidad,
        ]) => ({
          estado,
          cantidad,
        }),
      )
      .sort(
        (a, b) =>
          b.cantidad -
          a.cantidad,
      );
  }

  return {
    version,
    filtros,
    requerimientos,
    totales: {
      requerimientos:
        requerimientos.length,
      periodos,
      propietarios:
        propietarios.size,
      totalPagado:
        redondear(
          totalPagado,
        ),
      notificados,
      discrepancias,
      seguimientos,
      historial,
    },
    conciliacion:
      convertirConteos(
        conteoConciliacion,
      ),
    revision:
      convertirConteos(
        conteoRevision,
      ),
    notificacion:
      convertirConteos(
        conteoNotificacion,
      ),
    tipos:
      convertirConteos(
        conteoTipos,
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

function etiquetaEnum(
  valor: string,
): string {
  return valor
    .replaceAll("_", " ");
}

function aplicarTitulo(
  hoja:
    ExcelJS.Worksheet,
  rango: string,
  titulo: string,
): void {
  hoja.mergeCells(rango);

  const celda =
    hoja.getCell(
      rango.split(":")[0],
    );

  celda.value = titulo;
  celda.font = {
    bold: true,
    size: 16,
  };
}

function aplicarEncabezado(
  fila: ExcelJS.Row,
): void {
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
): void {
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
    );

  aplicarTitulo(
    resumen,
    "A1:H1",
    "Reporte independiente de Requerimientos manuales",
  );

  resumen.addRow([]);

  resumen.addRow([
    "Versión activa",
    `#${resultado.version.id}`,
    "Código",
    resultado.version.codigo,
    "Año de gestión",
    resultado.version
      .anioGestion,
  ]);

  resumen.addRow([
    "Archivo",
    resultado.version.archivo
      ?.nombreArchivo ??
      "Sin archivo",
    "Hoja",
    resultado.version.archivo
      ?.nombreHoja ??
      "Sin hoja",
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
    resultado.version
      .comentario ??
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
    "Tipo",
    resultado.filtros
      .tipoRegistro
      ? etiquetaEnum(
          resultado.filtros
            .tipoRegistro,
        )
      : "Todos",
  ]);

  resumen.addRow([
    "Conciliación",
    resultado.filtros
      .estadoConciliado
      ? etiquetaEnum(
          resultado.filtros
            .estadoConciliado,
        )
      : "Todos",
    "Revisión",
    resultado.filtros
      .estadoRevision
      ? etiquetaEnum(
          resultado.filtros
            .estadoRevision,
        )
      : "Todos",
  ]);

  resumen.addRow([
    "Notificación",
    resultado.filtros
      .estadoNotificacion
      ? etiquetaEnum(
          resultado.filtros
            .estadoNotificacion,
        )
      : "Todos",
    "Año gestión",
    resultado.filtros
      .anioGestion ??
      "Todos",
    "Año periodo",
    resultado.filtros
      .periodoAnio ??
      "Todos",
  ]);

  resumen.addRow([
    "Notificación desde",
    fechaIso(
      resultado.filtros
        .fechaNotificacionDesde,
    ) ?? "Todas",
    "Notificación hasta",
    fechaIso(
      resultado.filtros
        .fechaNotificacionHasta,
    ) ?? "Todas",
  ]);

  resumen.addRow([]);

  const filaTotales =
    resumen.addRow([
      "Requerimientos",
      "Periodos",
      "Propietarios",
      "Monto pagado",
      "Notificados",
      "Discrepancias",
      "Seguimientos",
      "Historial",
    ]);

  aplicarEncabezado(
    filaTotales,
  );

  resumen.addRow([
    resultado.totales
      .requerimientos,
    resultado.totales
      .periodos,
    resultado.totales
      .propietarios,
    resultado.totales
      .totalPagado,
    resultado.totales
      .notificados,
    resultado.totales
      .discrepancias,
    resultado.totales
      .seguimientos,
    resultado.totales
      .historial,
  ]);

  configurarMoneda(
    resumen,
    [4],
    resumen.rowCount,
  );

  const secciones = [
    {
      titulo:
        "Estado conciliado",
      filas:
        resultado.conciliacion,
    },
    {
      titulo:
        "Estado de revisión",
      filas:
        resultado.revision,
    },
    {
      titulo:
        "Estado de notificación",
      filas:
        resultado.notificacion,
    },
    {
      titulo:
        "Tipo de registro",
      filas:
        resultado.tipos,
    },
  ];

  for (
    const seccion
    of secciones
  ) {
    resumen.addRow([]);

    const encabezado =
      resumen.addRow([
        seccion.titulo,
        "Cantidad",
      ]);

    aplicarEncabezado(
      encabezado,
    );

    for (
      const fila
      of seccion.filas
    ) {
      resumen.addRow([
        etiquetaEnum(
          fila.estado,
        ),
        fila.cantidad,
      ]);
    }
  }

  resumen.columns = [
    {
      width: 27,
    },
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
      width: 20,
    },
    {
      width: 20,
    },
    {
      width: 18,
    },
    {
      width: 18,
    },
  ];

  const hojaRequerimientos =
    libro.addWorksheet(
      "Requerimientos manuales",
      {
        views: [
          {
            state: "frozen",
            ySplit: 1,
          },
        ],
      },
    );

  hojaRequerimientos.columns = [
    {
      header: "Año gestión",
      key: "anioGestion",
      width: 13,
    },
    {
      header: "Número requerimiento",
      key: "numero",
      width: 23,
    },
    {
      header: "Correlativo Excel",
      key: "correlativo",
      width: 15,
    },
    {
      header: "Fecha requerimiento",
      key: "fecha",
      width: 18,
    },
    {
      header: "Placa original",
      key: "placaOriginal",
      width: 16,
    },
    {
      header: "Placa normalizada",
      key: "placaNormalizada",
      width: 18,
    },
    {
      header: "Año vehículo",
      key: "anioVehiculo",
      width: 14,
    },
    {
      header: "Deuda original",
      key: "deudaOriginal",
      width: 28,
    },
    {
      header: "Propietario",
      key: "propietario",
      width: 38,
    },
    {
      header: "Provincia",
      key: "provincia",
      width: 18,
    },
    {
      header: "Distrito",
      key: "distrito",
      width: 18,
    },
    {
      header: "Dirección",
      key: "direccion",
      width: 45,
    },
    {
      header: "Estado Excel",
      key: "estadoExcel",
      width: 28,
    },
    {
      header: "Tipo registro",
      key: "tipoRegistro",
      width: 20,
    },
    {
      header: "Estado conciliado",
      key: "estadoConciliado",
      width: 20,
    },
    {
      header: "Estado revisión",
      key: "estadoRevision",
      width: 20,
    },
    {
      header: "Estado notificación",
      key: "estadoNotificacion",
      width: 23,
    },
    {
      header: "Notificador actual",
      key: "notificador",
      width: 24,
    },
    {
      header: "Responsable actual",
      key: "responsable",
      width: 24,
    },
    {
      header: "Liquidación deuda",
      key: "liquidacion",
      width: 20,
    },
    {
      header: "Fecha notificación",
      key: "fechaNotificacion",
      width: 18,
    },
    {
      header: "Número cedulón",
      key: "cedulon",
      width: 20,
    },
    {
      header: "Observación seguimiento",
      key: "observacionSeguimiento",
      width: 50,
    },
    {
      header: "Observaciones originales",
      key: "observacionesOriginales",
      width: 50,
    },
    {
      header: "Periodos",
      key: "periodos",
      width: 11,
    },
    {
      header: "Monto pagado",
      key: "montoPagado",
      width: 17,
    },
    {
      header: "Seguimientos",
      key: "seguimientos",
      width: 14,
    },
    {
      header: "Cambios históricos",
      key: "historial",
      width: 16,
    },
    {
      header: "Archivo origen",
      key: "archivoOrigen",
      width: 38,
    },
    {
      header: "Fila origen",
      key: "filaOrigen",
      width: 13,
    },
    {
      header: "Versión",
      key: "version",
      width: 11,
    },
  ];

  aplicarEncabezado(
    hojaRequerimientos
      .getRow(1),
  );

  for (
    const requerimiento
    of resultado.requerimientos
  ) {
    const montoPagado =
      requerimiento.periodos.reduce(
        (total, periodo) =>
          total +
          Number(
            periodo
              .montoPagado,
          ),
        0,
      );

    hojaRequerimientos.addRow({
      anioGestion:
        requerimiento
          .anioGestion,
      numero:
        requerimiento
          .numeroRequerimiento,
      correlativo:
        requerimiento
          .correlativoExcel ??
        "",
      fecha:
        requerimiento
          .fechaRequerimiento,
      placaOriginal:
        requerimiento
          .placaOriginal ??
        "",
      placaNormalizada:
        requerimiento
          .placaNormalizada ??
        "",
      anioVehiculo:
        requerimiento
          .anioVehiculo ??
        requerimiento
          .anioVehiculoOriginal ??
        "",
      deudaOriginal:
        requerimiento
          .deudaOriginal ??
        "",
      propietario:
        requerimiento
          .propietarioOriginal ??
        "",
      provincia:
        requerimiento
          .provinciaOriginal ??
        "",
      distrito:
        requerimiento
          .distritoOriginal ??
        "",
      direccion:
        requerimiento
          .direccionOriginal ??
        "",
      estadoExcel:
        requerimiento
          .estadoManualOriginal ??
        "",
      tipoRegistro:
        etiquetaEnum(
          requerimiento
            .tipoRegistro,
        ),
      estadoConciliado:
        etiquetaEnum(
          requerimiento
            .estadoConciliado,
        ),
      estadoRevision:
        etiquetaEnum(
          requerimiento
            .estadoRevision,
        ),
      estadoNotificacion:
        etiquetaEnum(
          requerimiento
            .estadoNotificacion,
        ),
      notificador:
        requerimiento
          .notificadorActual ??
        requerimiento
          .notificadorOriginal ??
        "",
      responsable:
        requerimiento
          .responsableActual ??
        requerimiento
          .responsableOriginal ??
        "",
      liquidacion:
        requerimiento
          .numeroLiquidacionDeudaActual ??
        requerimiento
          .numeroLiquidacionDeudaOriginal ??
        "",
      fechaNotificacion:
        requerimiento
          .fechaNotificacionActual ??
        requerimiento
          .fechaNotificacionOriginal,
      cedulon:
        requerimiento
          .numeroCedulonActual ??
        requerimiento
          .numeroCedulonOriginal ??
        "",
      observacionSeguimiento:
        requerimiento
          .observacionSeguimiento ??
        "",
      observacionesOriginales:
        requerimiento
          .observacionesOriginal ??
        "",
      periodos:
        requerimiento
          .periodos.length,
      montoPagado:
        redondear(
          montoPagado,
        ),
      seguimientos:
        requerimiento
          .seguimientos.length,
      historial:
        requerimiento
          .historial.length,
      archivoOrigen:
        requerimiento
          .archivoOrigen ??
        "",
      filaOrigen:
        requerimiento
          .filaOrigen ??
        "",
      version:
        resultado.version.id,
    });
  }

  configurarMoneda(
    hojaRequerimientos,
    [26],
    2,
  );

  hojaRequerimientos.autoFilter = {
    from: "A1",
    to: "AE1",
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
      header: "Año gestión",
      key: "anioGestion",
      width: 13,
    },
    {
      header: "Número requerimiento",
      key: "numero",
      width: 23,
    },
    {
      header: "Placa",
      key: "placa",
      width: 16,
    },
    {
      header: "Propietario",
      key: "propietario",
      width: 38,
    },
    {
      header: "Año del periodo",
      key: "periodoAnio",
      width: 15,
    },
    {
      header: "Estado conciliado",
      key: "estado",
      width: 20,
    },
    {
      header: "Monto pagado",
      key: "montoPagado",
      width: 17,
    },
    {
      header: "Declaración vinculada",
      key: "declaracion",
      width: 23,
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
    const requerimiento
    of resultado.requerimientos
  ) {
    for (
      const periodo
      of requerimiento.periodos
    ) {
      hojaPeriodos.addRow({
        anioGestion:
          requerimiento
            .anioGestion,
        numero:
          requerimiento
            .numeroRequerimiento,
        placa:
          requerimiento
            .placaNormalizada ??
          requerimiento
            .placaOriginal ??
          "",
        propietario:
          requerimiento
            .propietarioOriginal ??
          "",
        periodoAnio:
          periodo.periodoAnio,
        estado:
          etiquetaEnum(
            periodo
              .estadoConciliado,
          ),
        montoPagado:
          Number(
            periodo
              .montoPagado,
          ),
        declaracion:
          periodo.declaracion
            ? `${periodo.declaracion.anioDeclaracion}-${periodo.declaracion.numeroDeclaracion}`
            : "",
        observacion:
          periodo.observacion ??
          "",
      });
    }
  }

  configurarMoneda(
    hojaPeriodos,
    [7],
    2,
  );

  hojaPeriodos.autoFilter = {
    from: "A1",
    to: "I1",
  };

  const hojaSeguimientos =
    libro.addWorksheet(
      "Seguimiento operativo",
      {
        views: [
          {
            state: "frozen",
            ySplit: 1,
          },
        ],
      },
    );

  hojaSeguimientos.columns = [
    {
      header: "Año gestión",
      key: "anioGestion",
      width: 13,
    },
    {
      header: "Número requerimiento",
      key: "numero",
      width: 23,
    },
    {
      header: "Placa",
      key: "placa",
      width: 16,
    },
    {
      header: "Estado notificación",
      key: "estado",
      width: 23,
    },
    {
      header: "Notificador",
      key: "notificador",
      width: 24,
    },
    {
      header: "Responsable",
      key: "responsable",
      width: 24,
    },
    {
      header: "Liquidación deuda",
      key: "liquidacion",
      width: 20,
    },
    {
      header: "Fecha notificación",
      key: "fechaNotificacion",
      width: 18,
    },
    {
      header: "Número cedulón",
      key: "cedulon",
      width: 20,
    },
    {
      header: "Observación",
      key: "observacion",
      width: 55,
    },
    {
      header: "Registrado por",
      key: "usuario",
      width: 24,
    },
    {
      header: "Fecha de registro",
      key: "createdAt",
      width: 22,
    },
  ];

  aplicarEncabezado(
    hojaSeguimientos.getRow(1),
  );

  for (
    const requerimiento
    of resultado.requerimientos
  ) {
    for (
      const seguimiento
      of requerimiento.seguimientos
    ) {
      hojaSeguimientos.addRow({
        anioGestion:
          requerimiento
            .anioGestion,
        numero:
          requerimiento
            .numeroRequerimiento,
        placa:
          requerimiento
            .placaNormalizada ??
          requerimiento
            .placaOriginal ??
          "",
        estado:
          etiquetaEnum(
            seguimiento
              .estadoNotificacion,
          ),
        notificador:
          seguimiento
            .notificador ??
          "",
        responsable:
          seguimiento
            .responsable ??
          "",
        liquidacion:
          seguimiento
            .numeroLiquidacionDeuda ??
          "",
        fechaNotificacion:
          seguimiento
            .fechaNotificacion,
        cedulon:
          seguimiento
            .numeroCedulon ??
          "",
        observacion:
          seguimiento
            .observacion ??
          "",
        usuario:
          seguimiento.usuario
            ?.nombre ??
          seguimiento.usuario
            ?.nombreUsuario ??
          "",
        createdAt:
          seguimiento.createdAt,
      });
    }
  }

  hojaSeguimientos.autoFilter = {
    from: "A1",
    to: "L1",
  };

  const hojaHistorial =
    libro.addWorksheet(
      "Historial de cambios",
      {
        views: [
          {
            state: "frozen",
            ySplit: 1,
          },
        ],
      },
    );

  hojaHistorial.columns = [
    {
      header: "Año gestión",
      key: "anioGestion",
      width: 13,
    },
    {
      header: "Número requerimiento",
      key: "numero",
      width: 23,
    },
    {
      header: "Placa",
      key: "placa",
      width: 16,
    },
    {
      header: "Acción",
      key: "accion",
      width: 22,
    },
    {
      header: "Campo",
      key: "campo",
      width: 22,
    },
    {
      header: "Valor anterior",
      key: "anterior",
      width: 35,
    },
    {
      header: "Valor nuevo",
      key: "nuevo",
      width: 35,
    },
    {
      header: "Motivo",
      key: "motivo",
      width: 45,
    },
    {
      header: "Detalles",
      key: "detalles",
      width: 55,
    },
    {
      header: "Usuario",
      key: "usuario",
      width: 24,
    },
    {
      header: "Fecha",
      key: "createdAt",
      width: 22,
    },
  ];

  aplicarEncabezado(
    hojaHistorial.getRow(1),
  );

  for (
    const requerimiento
    of resultado.requerimientos
  ) {
    for (
      const evento
      of requerimiento.historial
    ) {
      hojaHistorial.addRow({
        anioGestion:
          requerimiento
            .anioGestion,
        numero:
          requerimiento
            .numeroRequerimiento,
        placa:
          requerimiento
            .placaNormalizada ??
          requerimiento
            .placaOriginal ??
          "",
        accion:
          evento.accion,
        campo:
          evento.campo ??
          "",
        anterior:
          evento.valorAnterior ??
          "",
        nuevo:
          evento.valorNuevo ??
          "",
        motivo:
          evento.motivo ??
          "",
        detalles:
          evento.detalles
            ? JSON.stringify(
                evento.detalles,
              )
            : "",
        usuario:
          evento.usuario
            ?.nombre ??
          evento.usuario
            ?.nombreUsuario ??
          "",
        createdAt:
          evento.createdAt,
      });
    }
  }

  hojaHistorial.autoFilter = {
    from: "A1",
    to: "K1",
  };

  const contenido =
    await libro.xlsx
      .writeBuffer();

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
    ErrorReporteRequerimientosManuales
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

reportesRequerimientosManualesRouter.get(
  "/resumen",
  async (
    req,
    res,
    next,
  ): Promise<void> => {
    try {
      const resultado =
        await consultarReporte(
          leerFiltros(req),
        );

      res.status(200).json({
        ok: true,
        message:
          "Resumen del reporte independiente de Requerimientos manuales obtenido correctamente.",
        data: {
          versionActiva: {
            id:
              resultado.version.id,
            codigo:
              resultado.version.codigo,
            comentario:
              resultado.version
                .comentario,
            anioGestion:
              resultado.version
                .anioGestion,
            fechaAnalisis:
              resultado.version
                .fechaAnalisis,
            fechaAplicacion:
              resultado.version
                .fechaAplicacion,
            usuario:
              resultado.version
                .usuario,
            archivo:
              resultado.version
                .archivo,
          },
          filtros: {
            buscar:
              resultado.filtros
                .buscar,
            tipoRegistro:
              resultado.filtros
                .tipoRegistro,
            estadoConciliado:
              resultado.filtros
                .estadoConciliado,
            estadoRevision:
              resultado.filtros
                .estadoRevision,
            estadoNotificacion:
              resultado.filtros
                .estadoNotificacion,
            anioGestion:
              resultado.filtros
                .anioGestion,
            periodoAnio:
              resultado.filtros
                .periodoAnio,
            fechaNotificacionDesde:
              fechaIso(
                resultado.filtros
                  .fechaNotificacionDesde,
              ),
            fechaNotificacionHasta:
              fechaIso(
                resultado.filtros
                  .fechaNotificacionHasta,
              ),
          },
          totales:
            resultado.totales,
          conciliacion:
            resultado.conciliacion,
          revision:
            resultado.revision,
          notificacion:
            resultado.notificacion,
          tipos:
            resultado.tipos,
          muestra:
            resultado.requerimientos
              .slice(0, 50)
              .map(
                (
                  requerimiento,
                ) => ({
                  id:
                    requerimiento.id,
                  anioGestion:
                    requerimiento
                      .anioGestion,
                  numeroRequerimiento:
                    requerimiento
                      .numeroRequerimiento,
                  fechaRequerimiento:
                    requerimiento
                      .fechaRequerimiento,
                  placa:
                    requerimiento
                      .placaNormalizada ??
                    requerimiento
                      .placaOriginal,
                  propietario:
                    requerimiento
                      .propietarioOriginal,
                  deuda:
                    requerimiento
                      .deudaOriginal,
                  estadoManualOriginal:
                    requerimiento
                      .estadoManualOriginal,
                  tipoRegistro:
                    requerimiento
                      .tipoRegistro,
                  estadoConciliado:
                    requerimiento
                      .estadoConciliado,
                  estadoRevision:
                    requerimiento
                      .estadoRevision,
                  estadoNotificacion:
                    requerimiento
                      .estadoNotificacion,
                  notificador:
                    requerimiento
                      .notificadorActual,
                  fechaNotificacion:
                    requerimiento
                      .fechaNotificacionActual,
                  periodos:
                    requerimiento
                      .periodos.length,
                  montoPagado:
                    redondear(
                      requerimiento.periodos.reduce(
                        (
                          total,
                          periodo,
                        ) =>
                          total +
                          Number(
                            periodo
                              .montoPagado,
                          ),
                        0,
                      ),
                    ),
                }),
              ),
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

reportesRequerimientosManualesRouter.get(
  "/excel",
  async (
    req,
    res,
    next,
  ): Promise<void> => {
    try {
      const resultado =
        await consultarReporte(
          leerFiltros(req),
        );

      if (
        resultado.totales
          .requerimientos === 0
      ) {
        throw new ErrorReporteRequerimientosManuales(
          "No existen Requerimientos manuales que coincidan con los filtros seleccionados.",
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
        `reporte_requerimientos_manuales_version_${resultado.version.id}_${marca}.xlsx`;

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
