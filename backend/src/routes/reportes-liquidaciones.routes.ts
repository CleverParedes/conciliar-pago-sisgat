import ExcelJS from "exceljs";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  EstadoConciliacion,
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

export const reportesLiquidacionesRouter = Router();

const ESTADOS_VALIDOS = Object.values(EstadoConciliacion);

class ErrorReporteLiquidaciones extends Error {
  public readonly status: number;

  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "ErrorReporteLiquidaciones";
    this.status = status;
  }
}

interface FiltrosReporteLiquidaciones {
  buscar: string;
  estado: EstadoConciliacion | null;
  anioLiquidacion: number | null;
  periodoAnio: number | null;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
}

function textoConsulta(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function enteroAnio(valor: unknown, etiqueta: string): number | null {
  const texto = textoConsulta(valor);

  if (!texto) {
    return null;
  }

  const numero = Number(texto);

  if (!Number.isInteger(numero) || numero < 1900 || numero > 2100) {
    throw new ErrorReporteLiquidaciones(
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
  const texto = textoConsulta(valor);

  if (!texto) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new ErrorReporteLiquidaciones(
      `${etiqueta} debe tener el formato AAAA-MM-DD.`,
    );
  }

  const fecha = new Date(
    `${texto}T${finDelDia ? "23:59:59.999" : "00:00:00.000"}Z`,
  );

  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorReporteLiquidaciones(`${etiqueta} no es válida.`);
  }

  return fecha;
}

function leerFiltros(req: Request): FiltrosReporteLiquidaciones {
  const estadoTexto = textoConsulta(req.query.estado);
  let estado: EstadoConciliacion | null = null;

  if (estadoTexto) {
    if (!ESTADOS_VALIDOS.includes(estadoTexto as EstadoConciliacion)) {
      throw new ErrorReporteLiquidaciones("El estado indicado no es válido.");
    }

    estado = estadoTexto as EstadoConciliacion;
  }

  const fechaDesde = fechaConsulta(
    req.query.fechaDesde,
    "La fecha inicial",
  );

  const fechaHasta = fechaConsulta(
    req.query.fechaHasta,
    "La fecha final",
    true,
  );

  if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
    throw new ErrorReporteLiquidaciones(
      "La fecha inicial no puede ser posterior a la fecha final.",
    );
  }

  return {
    buscar: textoConsulta(req.query.buscar),
    estado,
    anioLiquidacion: enteroAnio(
      req.query.anioLiquidacion,
      "El año de la liquidación",
    ),
    periodoAnio: enteroAnio(
      req.query.periodoAnio,
      "El año del periodo",
    ),
    fechaDesde,
    fechaHasta,
  };
}

function construirWhere(
  versionLiquidacionesId: number,
  filtros: FiltrosReporteLiquidaciones,
): Prisma.LiquidacionWhereInput {
  const where: Prisma.LiquidacionWhereInput = {
    versionLiquidacionesId,
  };

  if (filtros.buscar) {
    const buscar = filtros.buscar;

    where.OR = [
      {
        numeroLiquidacion: {
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
      {
        numeroRVeh: {
          contains: buscar,
          mode: "insensitive",
        },
      },
    ];
  }

  if (filtros.estado) {
    where.estado = filtros.estado;
  }

  if (filtros.anioLiquidacion) {
    where.anioLiquidacion = filtros.anioLiquidacion;
  }

  if (filtros.periodoAnio) {
    where.detalles = {
      some: {
        periodoAnio: filtros.periodoAnio,
      },
    };
  }

  if (filtros.fechaDesde || filtros.fechaHasta) {
    where.fechaEmision = {
      ...(filtros.fechaDesde ? { gte: filtros.fechaDesde } : {}),
      ...(filtros.fechaHasta ? { lte: filtros.fechaHasta } : {}),
    };
  }

  return where;
}

async function obtenerVersionActiva() {
  const version = await prisma.versionLiquidaciones.findFirst({
    where: {
      estado: EstadoVersionDatos.ACTIVA,
    },
    orderBy: {
      fechaAplicacion: "desc",
    },
    select: {
      id: true,
      codigo: true,
      comentario: true,
      totalLiquidaciones: true,
      totalDetalles: true,
      fechaAnalisis: true,
      fechaAplicacion: true,
      usuario: {
        select: {
          nombre: true,
          nombreUsuario: true,
        },
      },
      archivo: {
        select: {
          nombreArchivo: true,
          tamanoOriginal: true,
          totalFilas: true,
          filasValidas: true,
          filasConError: true,
        },
      },
    },
  });

  if (!version) {
    throw new ErrorReporteLiquidaciones(
      "No existe una versión independiente activa de Liquidaciones.",
      404,
    );
  }

  return version;
}

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

async function consultarReporte(filtros: FiltrosReporteLiquidaciones) {
  const version = await obtenerVersionActiva();
  const where = construirWhere(version.id, filtros);

  const liquidaciones = await prisma.liquidacion.findMany({
    where,
    orderBy: [
      {
        anioLiquidacion: "desc",
      },
      {
        numeroLiquidacion: "asc",
      },
    ],
    include: {
      contribuyente: {
        select: {
          id: true,
          numeroDocumento: true,
          nombreRazonSocial: true,
        },
      },
      detalles: {
        where: filtros.periodoAnio
          ? {
              periodoAnio: filtros.periodoAnio,
            }
          : {},
        orderBy: [
          {
            periodoAnio: "asc",
          },
          {
            trimestreDesde: "asc",
          },
        ],
        include: {
          declaracion: {
            include: {
              recibos: {
                orderBy: [
                  {
                    anioRecibo: "asc",
                  },
                  {
                    numeroRecibo: "asc",
                  },
                ],
              },
            },
          },
        },
      },
    },
  });

  const estados = new Map<
    EstadoConciliacion,
    {
      estado: EstadoConciliacion;
      cantidad: number;
      importeTotal: number;
      totalPagado: number;
      saldo: number;
    }
  >();

  const contribuyentes = new Set<string>();
  let periodos = 0;
  let importeTotal = 0;
  let totalPagado = 0;
  let saldo = 0;

  for (const liquidacion of liquidaciones) {
    const importe = Number(liquidacion.importeTotal);
    const pagado = Number(liquidacion.totalPagado);
    const pendiente = Number(liquidacion.saldo);

    periodos += liquidacion.detalles.length;
    importeTotal += importe;
    totalPagado += pagado;
    saldo += pendiente;

    contribuyentes.add(
      liquidacion.contribuyenteId
        ? `ID:${liquidacion.contribuyenteId}`
        : liquidacion.dniRucOriginal
          ? `DOC:${liquidacion.dniRucOriginal}`
          : `LIQ:${liquidacion.id}`,
    );

    const actual = estados.get(liquidacion.estado) ?? {
      estado: liquidacion.estado,
      cantidad: 0,
      importeTotal: 0,
      totalPagado: 0,
      saldo: 0,
    };

    actual.cantidad += 1;
    actual.importeTotal += importe;
    actual.totalPagado += pagado;
    actual.saldo += pendiente;

    estados.set(liquidacion.estado, actual);
  }

  return {
    version,
    filtros,
    liquidaciones,
    totales: {
      liquidaciones: liquidaciones.length,
      periodos,
      contribuyentes: contribuyentes.size,
      importeTotal: redondear(importeTotal),
      totalPagado: redondear(totalPagado),
      saldo: redondear(saldo),
    },
    estados: Array.from(estados.values())
      .map((item) => ({
        ...item,
        importeTotal: redondear(item.importeTotal),
        totalPagado: redondear(item.totalPagado),
        saldo: redondear(item.saldo),
      }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}

function fechaIso(valor: Date | null): string | null {
  return valor ? valor.toISOString().slice(0, 10) : null;
}

function nombreEstado(estado: EstadoConciliacion): string {
  return estado.replaceAll("_", " ");
}

function aplicarTitulo(
  hoja: ExcelJS.Worksheet,
  rango: string,
  titulo: string,
): void {
  hoja.mergeCells(rango);

  const celda = hoja.getCell(rango.split(":")[0]);
  celda.value = titulo;
  celda.font = {
    bold: true,
    size: 16,
  };
}

function aplicarEncabezado(fila: ExcelJS.Row): void {
  fila.font = {
    bold: true,
  };

  fila.alignment = {
    vertical: "middle",
    wrapText: true,
  };

  fila.eachCell((celda) => {
    celda.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
}

function configurarMoneda(
  hoja: ExcelJS.Worksheet,
  columnas: number[],
  desdeFila: number,
): void {
  for (let fila = desdeFila; fila <= hoja.rowCount; fila += 1) {
    for (const columna of columnas) {
      hoja.getCell(fila, columna).numFmt = '"S/ " #,##0.00';
    }
  }
}

async function construirExcel(
  resultado: Awaited<ReturnType<typeof consultarReporte>>,
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();

  libro.creator = "Sistema de conciliación SAT";
  libro.created = new Date();
  libro.modified = new Date();

  const resumen = libro.addWorksheet("Resumen");

  aplicarTitulo(
    resumen,
    "A1:F1",
    "Reporte independiente de Liquidaciones",
  );

  resumen.addRow([]);
  resumen.addRow([
    "Versión activa",
    `#${resultado.version.id}`,
    "Código",
    resultado.version.codigo,
  ]);
  resumen.addRow([
    "Archivo",
    resultado.version.archivo?.nombreArchivo ?? "Sin archivo",
    "Aplicada",
    resultado.version.fechaAplicacion ?? "Sin aplicación",
  ]);
  resumen.addRow([
    "Responsable",
    resultado.version.usuario?.nombre ??
      resultado.version.usuario?.nombreUsuario ??
      "Sin registro",
    "Comentario",
    resultado.version.comentario ?? "Sin comentario",
  ]);

  resumen.addRow([]);
  resumen.addRow(["Filtros aplicados"]);
  resumen.addRow([
    "Búsqueda",
    resultado.filtros.buscar || "Todos",
    "Estado",
    resultado.filtros.estado
      ? nombreEstado(resultado.filtros.estado)
      : "Todos",
  ]);
  resumen.addRow([
    "Año de liquidación",
    resultado.filtros.anioLiquidacion ?? "Todos",
    "Año del periodo",
    resultado.filtros.periodoAnio ?? "Todos",
  ]);
  resumen.addRow([
    "Fecha desde",
    fechaIso(resultado.filtros.fechaDesde) ?? "Todas",
    "Fecha hasta",
    fechaIso(resultado.filtros.fechaHasta) ?? "Todas",
  ]);

  resumen.addRow([]);
  const filaTotales = resumen.addRow([
    "Liquidaciones",
    "Periodos",
    "Contribuyentes",
    "Importe generado",
    "Total pagado",
    "Saldo",
  ]);
  aplicarEncabezado(filaTotales);

  resumen.addRow([
    resultado.totales.liquidaciones,
    resultado.totales.periodos,
    resultado.totales.contribuyentes,
    resultado.totales.importeTotal,
    resultado.totales.totalPagado,
    resultado.totales.saldo,
  ]);
  configurarMoneda(resumen, [4, 5, 6], resumen.rowCount);

  resumen.addRow([]);
  const filaEstados = resumen.addRow([
    "Estado",
    "Liquidaciones",
    "Importe",
    "Pagado",
    "Saldo",
  ]);
  aplicarEncabezado(filaEstados);

  for (const estado of resultado.estados) {
    resumen.addRow([
      nombreEstado(estado.estado),
      estado.cantidad,
      estado.importeTotal,
      estado.totalPagado,
      estado.saldo,
    ]);
  }
  configurarMoneda(resumen, [3, 4, 5], filaEstados.number + 1);

  resumen.columns = [
    { width: 25 },
    { width: 24 },
    { width: 24 },
    { width: 28 },
    { width: 22 },
    { width: 22 },
  ];

  const hojaLiquidaciones = libro.addWorksheet("Liquidaciones", {
    views: [
      {
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  hojaLiquidaciones.columns = [
    { header: "Año", key: "anio", width: 10 },
    { header: "Número de liquidación", key: "numero", width: 22 },
    { header: "Fecha de emisión", key: "fechaEmision", width: 17 },
    { header: "DNI/RUC", key: "dniRuc", width: 18 },
    { header: "Contribuyente", key: "nombre", width: 38 },
    { header: "Dirección", key: "direccion", width: 45 },
    { header: "Placa", key: "placa", width: 14 },
    { header: "Periodo original", key: "periodo", width: 24 },
    { header: "Importe total", key: "importe", width: 16 },
    { header: "Total pagado", key: "pagado", width: 16 },
    { header: "Saldo", key: "saldo", width: 16 },
    { header: "Estado", key: "estado", width: 20 },
    { header: "Periodos", key: "periodos", width: 11 },
    { header: "Estado original", key: "estadoOriginal", width: 20 },
    { header: "Fecha SUNARP", key: "fechaSunarp", width: 16 },
    { header: "Año R. Veh.", key: "anioRVeh", width: 13 },
    { header: "Número R. Veh.", key: "numeroRVeh", width: 18 },
    { header: "Fecha generación", key: "fechaGeneracion", width: 18 },
    { header: "ID origen", key: "idOrigen", width: 18 },
    { header: "Archivo de origen", key: "archivoOrigen", width: 38 },
    { header: "Fila de origen", key: "filaOrigen", width: 14 },
    { header: "Versión", key: "version", width: 11 },
  ];
  aplicarEncabezado(hojaLiquidaciones.getRow(1));

  for (const liquidacion of resultado.liquidaciones) {
    hojaLiquidaciones.addRow({
      anio: liquidacion.anioLiquidacion,
      numero: liquidacion.numeroLiquidacion,
      fechaEmision: liquidacion.fechaEmision,
      dniRuc:
        liquidacion.dniRucOriginal ??
        liquidacion.contribuyente?.numeroDocumento ??
        "",
      nombre:
        liquidacion.nombreOriginal ??
        liquidacion.contribuyente?.nombreRazonSocial ??
        "",
      direccion: liquidacion.direccionOriginal ?? "",
      placa: liquidacion.placa ?? "",
      periodo: liquidacion.periodoOriginal ?? "",
      importe: Number(liquidacion.importeTotal),
      pagado: Number(liquidacion.totalPagado),
      saldo: Number(liquidacion.saldo),
      estado: nombreEstado(liquidacion.estado),
      periodos: liquidacion.detalles.length,
      estadoOriginal: liquidacion.estadoOriginal ?? "",
      fechaSunarp: liquidacion.fechaSunarp,
      anioRVeh: liquidacion.anioRVeh ?? "",
      numeroRVeh: liquidacion.numeroRVeh ?? "",
      fechaGeneracion: liquidacion.fechaGeneracion,
      idOrigen: liquidacion.idOrigen ?? "",
      archivoOrigen: liquidacion.archivoOrigen ?? "",
      filaOrigen: liquidacion.filaOrigen ?? "",
      version: resultado.version.id,
    });
  }

  configurarMoneda(hojaLiquidaciones, [9, 10, 11], 2);
  hojaLiquidaciones.autoFilter = {
    from: "A1",
    to: "V1",
  };

  const hojaPeriodos = libro.addWorksheet("Periodos y pagos", {
    views: [
      {
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  hojaPeriodos.columns = [
    { header: "Año liquidación", key: "anio", width: 15 },
    { header: "Número liquidación", key: "numero", width: 21 },
    { header: "Placa", key: "placa", width: 14 },
    { header: "DNI/RUC", key: "dniRuc", width: 18 },
    { header: "Contribuyente", key: "nombre", width: 38 },
    { header: "Año del periodo", key: "periodoAnio", width: 14 },
    { header: "Trimestre desde", key: "trimestreDesde", width: 15 },
    { header: "Trimestre hasta", key: "trimestreHasta", width: 15 },
    { header: "Base imponible", key: "base", width: 17 },
    { header: "Impuesto", key: "impuesto", width: 15 },
    { header: "Reajuste", key: "reajuste", width: 15 },
    { header: "Interés", key: "interes", width: 15 },
    { header: "Gastos administrativos", key: "gastos", width: 22 },
    { header: "Total periodo", key: "totalPeriodo", width: 17 },
    { header: "Monto pagado", key: "montoPagado", width: 17 },
    { header: "Saldo", key: "saldo", width: 17 },
    { header: "Estado", key: "estado", width: 20 },
    { header: "Declaración", key: "declaracion", width: 20 },
    { header: "Recibos activos", key: "activos", width: 15 },
    { header: "Monto recibos activos", key: "montoActivos", width: 21 },
    { header: "Recibos anulados", key: "anulados", width: 17 },
    { header: "Observación", key: "observacion", width: 60 },
  ];
  aplicarEncabezado(hojaPeriodos.getRow(1));

  for (const liquidacion of resultado.liquidaciones) {
    for (const detalle of liquidacion.detalles) {
      const recibos = detalle.declaracion?.recibos ?? [];
      const activos = recibos.filter((recibo) => recibo.activo);
      const anulados = recibos.filter((recibo) => !recibo.activo);
      const montoActivos = activos.reduce(
        (total, recibo) => total + Number(recibo.monto),
        0,
      );

      hojaPeriodos.addRow({
        anio: liquidacion.anioLiquidacion,
        numero: liquidacion.numeroLiquidacion,
        placa: liquidacion.placa ?? "",
        dniRuc: liquidacion.dniRucOriginal ?? "",
        nombre: liquidacion.nombreOriginal ?? "",
        periodoAnio: detalle.periodoAnio,
        trimestreDesde: detalle.trimestreDesde,
        trimestreHasta: detalle.trimestreHasta,
        base:
          detalle.baseImponible === null
            ? ""
            : Number(detalle.baseImponible),
        impuesto:
          detalle.impuesto === null
            ? ""
            : Number(detalle.impuesto),
        reajuste:
          detalle.reajuste === null
            ? ""
            : Number(detalle.reajuste),
        interes:
          detalle.interes === null
            ? ""
            : Number(detalle.interes),
        gastos:
          detalle.gastosAdmin === null
            ? ""
            : Number(detalle.gastosAdmin),
        totalPeriodo: Number(detalle.totalPeriodo),
        montoPagado: Number(detalle.montoPagado),
        saldo: Number(detalle.saldo),
        estado: nombreEstado(detalle.estado),
        declaracion: detalle.declaracion
          ? `${detalle.declaracion.anioDeclaracion}-${detalle.declaracion.numeroDeclaracion}`
          : "",
        activos: activos.length,
        montoActivos: redondear(montoActivos),
        anulados: anulados.length,
        observacion: detalle.observacion ?? "",
      });
    }
  }

  configurarMoneda(
    hojaPeriodos,
    [9, 10, 11, 12, 13, 14, 15, 16, 20],
    2,
  );
  hojaPeriodos.autoFilter = {
    from: "A1",
    to: "V1",
  };

  const contenido = await libro.xlsx.writeBuffer();

  return Buffer.from(contenido);
}

function responderError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof ErrorReporteLiquidaciones) {
    res.status(error.status).json({
      ok: false,
      message: error.message,
      data: null,
    });
    return;
  }

  next(error);
}

reportesLiquidacionesRouter.get(
  "/resumen",
  async (req, res, next): Promise<void> => {
    try {
      const resultado = await consultarReporte(leerFiltros(req));

      res.status(200).json({
        ok: true,
        message:
          "Resumen del reporte independiente de Liquidaciones obtenido correctamente.",
        data: {
          versionActiva: {
            id: resultado.version.id,
            codigo: resultado.version.codigo,
            comentario: resultado.version.comentario,
            fechaAnalisis: resultado.version.fechaAnalisis,
            fechaAplicacion: resultado.version.fechaAplicacion,
            usuario: resultado.version.usuario,
            archivo: resultado.version.archivo,
          },
          filtros: {
            buscar: resultado.filtros.buscar,
            estado: resultado.filtros.estado,
            anioLiquidacion: resultado.filtros.anioLiquidacion,
            periodoAnio: resultado.filtros.periodoAnio,
            fechaDesde: fechaIso(resultado.filtros.fechaDesde),
            fechaHasta: fechaIso(resultado.filtros.fechaHasta),
          },
          totales: resultado.totales,
          estados: resultado.estados,
          muestra: resultado.liquidaciones.slice(0, 50).map(
            (liquidacion) => ({
              id: liquidacion.id,
              anioLiquidacion: liquidacion.anioLiquidacion,
              numeroLiquidacion: liquidacion.numeroLiquidacion,
              fechaEmision: liquidacion.fechaEmision,
              dniRuc: liquidacion.dniRucOriginal,
              nombre: liquidacion.nombreOriginal,
              placa: liquidacion.placa,
              importeTotal: Number(liquidacion.importeTotal),
              totalPagado: Number(liquidacion.totalPagado),
              saldo: Number(liquidacion.saldo),
              estado: liquidacion.estado,
              periodos: liquidacion.detalles.length,
              estadoOriginal: liquidacion.estadoOriginal,
            }),
          ),
        },
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

reportesLiquidacionesRouter.get(
  "/excel",
  async (req, res, next): Promise<void> => {
    try {
      const resultado = await consultarReporte(leerFiltros(req));

      if (resultado.totales.liquidaciones === 0) {
        throw new ErrorReporteLiquidaciones(
          "No existen Liquidaciones que coincidan con los filtros seleccionados.",
          404,
        );
      }

      const archivo = await construirExcel(resultado);
      const marca = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      const nombre =
        `reporte_liquidaciones_version_${resultado.version.id}_${marca}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${nombre}"`,
      );
      res.setHeader("Content-Length", String(archivo.length));

      res.status(200).end(archivo);
    } catch (error) {
      responderError(error, res, next);
    }
  },
);
