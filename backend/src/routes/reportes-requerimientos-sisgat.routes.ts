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

export const reportesRequerimientosSisgatRouter = Router();

const ESTADOS_VALIDOS = Object.values(EstadoConciliacion);

class ErrorReporteRequerimientosSisgat extends Error {
  public readonly status: number;

  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "ErrorReporteRequerimientosSisgat";
    this.status = status;
  }
}

interface FiltrosReporteRequerimientosSisgat {
  buscar: string;
  estado: EstadoConciliacion | null;
  anioRequerimiento: number | null;
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
    throw new ErrorReporteRequerimientosSisgat(
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
    throw new ErrorReporteRequerimientosSisgat(
      `${etiqueta} debe tener el formato AAAA-MM-DD.`,
    );
  }

  const fecha = new Date(
    `${texto}T${finDelDia ? "23:59:59.999" : "00:00:00.000"}Z`,
  );

  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorReporteRequerimientosSisgat(
      `${etiqueta} no es válida.`,
    );
  }

  return fecha;
}

function leerFiltros(req: Request): FiltrosReporteRequerimientosSisgat {
  const estadoTexto = textoConsulta(req.query.estado);
  let estado: EstadoConciliacion | null = null;

  if (estadoTexto) {
    if (!ESTADOS_VALIDOS.includes(estadoTexto as EstadoConciliacion)) {
      throw new ErrorReporteRequerimientosSisgat(
        "El estado indicado no es válido.",
      );
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
    throw new ErrorReporteRequerimientosSisgat(
      "La fecha inicial no puede ser posterior a la fecha final.",
    );
  }

  return {
    buscar: textoConsulta(req.query.buscar),
    estado,
    anioRequerimiento: enteroAnio(
      req.query.anioRequerimiento,
      "El año del requerimiento",
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
  versionRequerimientosId: number,
  filtros: FiltrosReporteRequerimientosSisgat,
): Prisma.RequerimientoWhereInput {
  const where: Prisma.RequerimientoWhereInput = {
    versionRequerimientosId,
  };

  if (filtros.buscar) {
    const buscar = filtros.buscar;

    where.OR = [
      {
        numeroRequerimiento: {
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
    where.estado = filtros.estado;
  }

  if (filtros.anioRequerimiento) {
    where.anioRequerimiento = filtros.anioRequerimiento;
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
  const version = await prisma.versionRequerimientos.findFirst({
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
      totalRequerimientos: true,
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
    throw new ErrorReporteRequerimientosSisgat(
      "No existe una versión independiente activa de Requerimientos SisGAT.",
      404,
    );
  }

  return version;
}

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

async function consultarReporte(
  filtros: FiltrosReporteRequerimientosSisgat,
) {
  const version = await obtenerVersionActiva();
  const where = construirWhere(version.id, filtros);

  const requerimientos = await prisma.requerimiento.findMany({
    where,
    orderBy: [
      {
        anioRequerimiento: "desc",
      },
      {
        numeroRequerimiento: "asc",
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

  for (const requerimiento of requerimientos) {
    const importe = Number(requerimiento.importeTotal);
    const pagado = Number(requerimiento.totalPagado);
    const pendiente = Number(requerimiento.saldo);

    periodos += requerimiento.detalles.length;
    importeTotal += importe;
    totalPagado += pagado;
    saldo += pendiente;

    contribuyentes.add(
      requerimiento.contribuyenteId
        ? `ID:${requerimiento.contribuyenteId}`
        : requerimiento.dniRucOriginal
          ? `DOC:${requerimiento.dniRucOriginal}`
          : `REQ:${requerimiento.id}`,
    );

    const actual = estados.get(requerimiento.estado) ?? {
      estado: requerimiento.estado,
      cantidad: 0,
      importeTotal: 0,
      totalPagado: 0,
      saldo: 0,
    };

    actual.cantidad += 1;
    actual.importeTotal += importe;
    actual.totalPagado += pagado;
    actual.saldo += pendiente;

    estados.set(requerimiento.estado, actual);
  }

  return {
    version,
    filtros,
    requerimientos,
    totales: {
      requerimientos: requerimientos.length,
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
    "Reporte independiente de Requerimientos SisGAT",
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
    "Año del requerimiento",
    resultado.filtros.anioRequerimiento ?? "Todos",
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
    "Requerimientos",
    "Periodos",
    "Contribuyentes",
    "Importe generado",
    "Total pagado",
    "Saldo",
  ]);
  aplicarEncabezado(filaTotales);

  resumen.addRow([
    resultado.totales.requerimientos,
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
    "Requerimientos",
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
    { width: 27 },
    { width: 24 },
    { width: 24 },
    { width: 28 },
    { width: 22 },
    { width: 22 },
  ];

  const hojaRequerimientos = libro.addWorksheet("Requerimientos", {
    views: [
      {
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  hojaRequerimientos.columns = [
    { header: "Año", key: "anio", width: 10 },
    { header: "Número de requerimiento", key: "numero", width: 24 },
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
    { header: "Fecha generación", key: "fechaGeneracion", width: 18 },
    { header: "Usuario creación", key: "usuarioCreacion", width: 20 },
    { header: "Fecha creación", key: "fechaCreacion", width: 20 },
    { header: "Usuario modificación", key: "usuarioModificacion", width: 22 },
    { header: "Fecha modificación", key: "fechaModificacion", width: 20 },
    { header: "ID origen", key: "idOrigen", width: 18 },
    { header: "Archivo de origen", key: "archivoOrigen", width: 38 },
    { header: "Fila de origen", key: "filaOrigen", width: 14 },
    { header: "Versión", key: "version", width: 11 },
  ];
  aplicarEncabezado(hojaRequerimientos.getRow(1));

  for (const requerimiento of resultado.requerimientos) {
    hojaRequerimientos.addRow({
      anio: requerimiento.anioRequerimiento,
      numero: requerimiento.numeroRequerimiento,
      fechaEmision: requerimiento.fechaEmision,
      dniRuc:
        requerimiento.dniRucOriginal ??
        requerimiento.contribuyente?.numeroDocumento ??
        "",
      nombre:
        requerimiento.nombreOriginal ??
        requerimiento.contribuyente?.nombreRazonSocial ??
        "",
      direccion: requerimiento.direccionOriginal ?? "",
      placa: requerimiento.placa ?? "",
      periodo: requerimiento.periodoOriginal ?? "",
      importe: Number(requerimiento.importeTotal),
      pagado: Number(requerimiento.totalPagado),
      saldo: Number(requerimiento.saldo),
      estado: nombreEstado(requerimiento.estado),
      periodos: requerimiento.detalles.length,
      estadoOriginal: requerimiento.estadoOriginal ?? "",
      fechaSunarp: requerimiento.fechaSunarp,
      fechaGeneracion: requerimiento.fechaGeneracion,
      usuarioCreacion: requerimiento.usuarioCreacion ?? "",
      fechaCreacion: requerimiento.fechaCreacionOrigen,
      usuarioModificacion: requerimiento.usuarioModificacion ?? "",
      fechaModificacion: requerimiento.fechaModificacionOrigen,
      idOrigen: requerimiento.idOrigen ?? "",
      archivoOrigen: requerimiento.archivoOrigen ?? "",
      filaOrigen: requerimiento.filaOrigen ?? "",
      version: resultado.version.id,
    });
  }

  configurarMoneda(hojaRequerimientos, [9, 10, 11], 2);
  hojaRequerimientos.autoFilter = {
    from: "A1",
    to: "X1",
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
    { header: "Año requerimiento", key: "anio", width: 16 },
    { header: "Número requerimiento", key: "numero", width: 23 },
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

  for (const requerimiento of resultado.requerimientos) {
    for (const detalle of requerimiento.detalles) {
      const recibos = detalle.declaracion?.recibos ?? [];
      const activos = recibos.filter((recibo) => recibo.activo);
      const anulados = recibos.filter((recibo) => !recibo.activo);
      const montoActivos = activos.reduce(
        (total, recibo) => total + Number(recibo.monto),
        0,
      );

      hojaPeriodos.addRow({
        anio: requerimiento.anioRequerimiento,
        numero: requerimiento.numeroRequerimiento,
        placa: requerimiento.placa ?? "",
        dniRuc: requerimiento.dniRucOriginal ?? "",
        nombre: requerimiento.nombreOriginal ?? "",
        periodoAnio: detalle.periodoAnio,
        trimestreDesde: detalle.trimestreDesde,
        trimestreHasta: detalle.trimestreHasta,
        base:
          detalle.baseImponible === null
            ? ""
            : Number(detalle.baseImponible),
        impuesto:
          detalle.impuesto === null ? "" : Number(detalle.impuesto),
        reajuste:
          detalle.reajuste === null ? "" : Number(detalle.reajuste),
        interes:
          detalle.interes === null ? "" : Number(detalle.interes),
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
  if (error instanceof ErrorReporteRequerimientosSisgat) {
    res.status(error.status).json({
      ok: false,
      message: error.message,
      data: null,
    });
    return;
  }

  next(error);
}

reportesRequerimientosSisgatRouter.get(
  "/resumen",
  async (req, res, next): Promise<void> => {
    try {
      const resultado = await consultarReporte(leerFiltros(req));

      res.status(200).json({
        ok: true,
        message:
          "Resumen del reporte independiente de Requerimientos SisGAT obtenido correctamente.",
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
            anioRequerimiento: resultado.filtros.anioRequerimiento,
            periodoAnio: resultado.filtros.periodoAnio,
            fechaDesde: fechaIso(resultado.filtros.fechaDesde),
            fechaHasta: fechaIso(resultado.filtros.fechaHasta),
          },
          totales: resultado.totales,
          estados: resultado.estados,
          muestra: resultado.requerimientos.slice(0, 50).map(
            (requerimiento) => ({
              id: requerimiento.id,
              anioRequerimiento: requerimiento.anioRequerimiento,
              numeroRequerimiento: requerimiento.numeroRequerimiento,
              fechaEmision: requerimiento.fechaEmision,
              dniRuc: requerimiento.dniRucOriginal,
              nombre: requerimiento.nombreOriginal,
              placa: requerimiento.placa,
              importeTotal: Number(requerimiento.importeTotal),
              totalPagado: Number(requerimiento.totalPagado),
              saldo: Number(requerimiento.saldo),
              estado: requerimiento.estado,
              periodos: requerimiento.detalles.length,
              estadoOriginal: requerimiento.estadoOriginal,
            }),
          ),
        },
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

reportesRequerimientosSisgatRouter.get(
  "/excel",
  async (req, res, next): Promise<void> => {
    try {
      const resultado = await consultarReporte(leerFiltros(req));

      if (resultado.totales.requerimientos === 0) {
        throw new ErrorReporteRequerimientosSisgat(
          "No existen Requerimientos SisGAT que coincidan con los filtros seleccionados.",
          404,
        );
      }

      const archivo = await construirExcel(resultado);
      const marca = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      const nombre =
        `reporte_requerimientos_sisgat_version_${resultado.version.id}_${marca}.xlsx`;

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
