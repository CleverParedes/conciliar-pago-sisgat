import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { parse } from "csv-parse/sync";

import { leerReporteDeclaracionesPagosSisgat } from "./importadores/lector-reporte-sisgat";

import {
  advertenciaIdentidadRecuperadaComoJson,
  recuperarIdentidadesDeclaracionesSisgat,
  type AdvertenciaIdentidadRecuperada,
} from "./importadores/recuperar-identidades-sisgat";

import {
  EstadoVersionDatos,
  TipoArchivoVersion,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

const COLUMNAS_ORDENES = 26;
const COLUMNAS_DECLARACIONES = 57;
const MAXIMO_ERRORES_GUARDADOS = 1000;

const PATRON_NUMERO = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?\.\d+/g;

export class ErrorVersionDatos extends Error {
  public readonly status: number;

  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = "ErrorVersionDatos";
    this.status = status;
  }
}

interface ArchivoEntrada {
  nombreArchivo: string;
  buffer: Buffer;
}

interface ErrorArchivoAnalizado {
  fila: number;
  campo: string;
  mensaje: string;
  datosOriginales: {
    valores: string[];
  };
}

interface ResultadoOrdenes {
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  totalOrdenes: number;
  errores: ErrorArchivoAnalizado[];
}

interface ResultadoDeclaraciones {
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  totalDeclaraciones: number;
  totalRecibos: number;
  errores: ErrorArchivoAnalizado[];
  advertencias: AdvertenciaIdentidadRecuperada[];
}

interface AnalizarVersionInput {
  ordenes: ArchivoEntrada;
  declaracionesPagos: ArchivoEntrada;
  usuarioId: number;
  comentario?: string | null;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function limpiarFila(fila: unknown[], totalColumnas: number): string[] {
  const valores = fila.map((valor) => String(valor ?? "").trim());

  while (valores.length > totalColumnas && valores.at(-1) === "") {
    valores.pop();
  }

  return valores;
}

function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

function normalizarPlaca(valor: string): string {
  const placa = valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (placa.length === 6) {
    return `${placa.slice(0, 3)}-${placa.slice(3)}`;
  }

  return placa;
}

function extraerNumeros(valor: string): number[] {
  const coincidencias = valor.match(PATRON_NUMERO) ?? [];

  return coincidencias
    .map((numero) => Number(numero.replace(/,/g, "")))
    .filter((numero) => Number.isFinite(numero));
}

function numeroObligatorio(valor: string, campo: string): number {
  const numeros = extraerNumeros(valor);

  if (numeros.length === 0) {
    throw new Error(`El campo "${campo}" no contiene un número válido.`);
  }

  return numeros[0];
}

function enteroObligatorio(valor: string, campo: string): number {
  const numero = numeroObligatorio(valor, campo);

  if (!Number.isInteger(numero)) {
    throw new Error(`El campo "${campo}" debe contener un número entero.`);
  }

  return numero;
}

function validarCantidad(
  valores: number[],
  cantidadEsperada: number,
  campo: string,
): void {
  if (valores.length < cantidadEsperada) {
    throw new Error(
      `El campo "${campo}" contiene ${valores.length} valor(es), pero se esperaban ${cantidadEsperada}.`,
    );
  }
}

function cantidadPeriodos(valor: string): number {
  const coincidencias = [
    ...valor.matchAll(/(\d{4})\s*\[\s*([1-4])(?:\s*-\s*([1-4]))?\s*\]/g),
  ];

  if (coincidencias.length === 0) {
    throw new Error(`No se pudo interpretar el periodo "${valor}".`);
  }

  for (const coincidencia of coincidencias) {
    const desde = Number(coincidencia[2]);

    const hasta = Number(coincidencia[3] ?? coincidencia[2]);

    if (desde > hasta) {
      throw new Error(`El periodo "${coincidencia[0]}" no es válido.`);
    }
  }

  return coincidencias.length;
}

function validarTrimestre(valor: string): void {
  const trimestre = valor.trim().replace(/\s+/g, "");

  const coincidencia = /^\[([1-4])(?:-([1-4]))?\]$/.exec(trimestre);

  if (!coincidencia) {
    throw new Error(`No se pudo interpretar el trimestre "${valor}".`);
  }

  const desde = Number(coincidencia[1]);

  const hasta = Number(coincidencia[2] ?? coincidencia[1]);

  if (desde > hasta) {
    throw new Error(`El trimestre "${valor}" contiene un rango inválido.`);
  }
}

function esFilaResumen(fila: string[]): boolean {
  const primerosVacios = fila.slice(0, 5).every((valor) => valor === "");

  const valoresNoVacios = fila.filter((valor) => valor !== "");

  return primerosVacios && valoresNoVacios.length <= 1;
}

function crearError(
  fila: number,
  campo: string,
  mensaje: string,
  valores: string[],
): ErrorArchivoAnalizado {
  return {
    fila,
    campo,
    mensaje,
    datosOriginales: {
      valores,
    },
  };
}

function leerRegistros(buffer: Buffer, nombreArchivo: string): string[][] {
  try {
    const contenido = buffer.toString("utf8");

    return parse(contenido, {
      delimiter: "|",
      quote: '"',
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido.";

    throw new ErrorVersionDatos(
      `No se pudo leer el archivo "${nombreArchivo}": ${mensaje}`,
    );
  }
}

function analizarOrdenes(archivo: ArchivoEntrada): ResultadoOrdenes {
  const registros = leerRegistros(archivo.buffer, archivo.nombreArchivo);

  if (registros.length < 2) {
    throw new ErrorVersionDatos(
      "El archivo de órdenes no contiene registros.",
    );
  }

  const cabecera = limpiarFila(registros[0], COLUMNAS_ORDENES).map(
    normalizarTexto,
  );

  const cabeceraCorrecta =
    cabecera[0] === "ANO" &&
    cabecera[1] === "NRO" &&
    cabecera[9] === "PERIODO" &&
    cabecera[24] === "MONTO TOTAL" &&
    cabecera[25] === "ID";

  if (!cabeceraCorrecta) {
    throw new ErrorVersionDatos(
      "El archivo de órdenes no tiene la estructura esperada.",
    );
  }

  const filas = registros
    .slice(1)
    .map((fila) => limpiarFila(fila, COLUMNAS_ORDENES))
    .filter((fila) => fila.some((valor) => valor !== ""));

  const errores: ErrorArchivoAnalizado[] = [];

  const claves = new Set<string>();

  let filasValidas = 0;

  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];

    const numeroFila = indice + 2;

    try {
      if (fila.length !== COLUMNAS_ORDENES) {
        throw new Error(
          `La fila contiene ${fila.length} columnas; se esperaban ${COLUMNAS_ORDENES}.`,
        );
      }

      const anioOrden = enteroObligatorio(fila[0], "Año");

      const numeroOrden = fila[1].trim();

      if (!numeroOrden) {
        throw new Error("El número de orden está vacío.");
      }

      const clave = `${anioOrden}|${numeroOrden}`;

      if (claves.has(clave)) {
        throw new Error(
          `La orden ${anioOrden}-${numeroOrden} está duplicada dentro del archivo.`,
        );
      }

      claves.add(clave);

      if (!normalizarDocumento(fila[3])) {
        throw new Error("El DNI/RUC está vacío o no es válido.");
      }

      if (!fila[4].trim()) {
        throw new Error("El nombre o razón social está vacío.");
      }

      if (!normalizarPlaca(fila[6])) {
        throw new Error("La placa está vacía o no es válida.");
      }

      enteroObligatorio(fila[8], "Activo");

      const totalPeriodos = cantidadPeriodos(fila[9]);

      validarCantidad(
        extraerNumeros(fila[10]),
        totalPeriodos,
        "Valor referencial",
      );

      validarCantidad(
        extraerNumeros(fila[11]),
        totalPeriodos,
        "Año fabricación",
      );

      validarCantidad(extraerNumeros(fila[12]), totalPeriodos, "UIT");

      validarCantidad(
        extraerNumeros(fila[13]),
        totalPeriodos,
        "Base imponible",
      );

      validarCantidad(extraerNumeros(fila[14]), totalPeriodos, "Impuesto");

      validarCantidad(extraerNumeros(fila[15]), totalPeriodos, "Reajuste");

      validarCantidad(extraerNumeros(fila[16]), totalPeriodos, "Interés");

      validarCantidad(
        extraerNumeros(fila[17]),
        totalPeriodos,
        "Gastos administrativos",
      );

      validarCantidad(extraerNumeros(fila[18]), totalPeriodos, "Total");

      numeroObligatorio(fila[24], "Monto total");

      filasValidas += 1;
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : "Error desconocido.";

      if (errores.length < MAXIMO_ERRORES_GUARDADOS) {
        errores.push(crearError(numeroFila, "FILA", mensaje, fila));
      }
    }
  }

  return {
    totalFilas: filas.length,

    filasValidas,

    filasConError: filas.length - filasValidas,

    totalOrdenes: filasValidas,

    errores,
  };
}

function analizarDeclaraciones(
  archivo: ArchivoEntrada,
): ResultadoDeclaraciones {
  let registros: string[][];

  try {
    registros = leerReporteDeclaracionesPagosSisgat(
      archivo.buffer,
      archivo.nombreArchivo,
    );
  } catch (error) {
    const mensaje =
      error instanceof Error ? error.message : "Error desconocido.";

    throw new ErrorVersionDatos(
      `No se pudo leer el archivo "${archivo.nombreArchivo}": ${mensaje}`,
    );
  }
  if (registros.length < 2) {
    throw new ErrorVersionDatos(
      "El archivo de declaraciones y pagos no contiene registros.",
    );
  }

  const cabecera = registros[0].map((valor) =>
    normalizarTexto(String(valor ?? "")),
  );

  const cabeceraCorrecta =
    cabecera[0] === "ANO" &&
    cabecera[1] === "DECLARA" &&
    cabecera[5] === "DNI RUC CONTRIBUYENTE" &&
    cabecera[13] === "PLACA" &&
    cabecera[50] === "NUMERO REC";

  if (!cabeceraCorrecta) {
    throw new ErrorVersionDatos(
      "El archivo de declaraciones y pagos no tiene la estructura esperada.",
    );
  }

  const filasOriginales = registros
    .slice(1)
    .map((fila) => limpiarFila(fila, COLUMNAS_DECLARACIONES))
    .filter((fila) => !esFilaResumen(fila))
    .filter((fila) => fila.some((valor) => valor !== ""));

  const recuperacion = recuperarIdentidadesDeclaracionesSisgat(filasOriginales);

  const filas = recuperacion.filas;

  const errores: ErrorArchivoAnalizado[] = [];

  const declaraciones = new Set<string>();

  const recibos = new Set<string>();

  let filasValidas = 0;

  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];

    const numeroFila = indice + 2;

    try {
      if (fila.length !== COLUMNAS_DECLARACIONES) {
        throw new Error(
          `La fila contiene ${fila.length} columnas; se esperaban ${COLUMNAS_DECLARACIONES}.`,
        );
      }

      const anioDeclaracion = enteroObligatorio(
        fila[0],
        "Año de declaración",
      );

      const numeroDeclaracion = fila[1].trim();

      if (!numeroDeclaracion) {
        throw new Error("El número de declaración está vacío.");
      }

      if (!normalizarDocumento(fila[4])) {
        throw new Error("El DNI/RUC está vacío o no es válido.");
      }

      if (!fila[5].trim()) {
        throw new Error("El nombre o razón social está vacío.");
      }

      if (!normalizarPlaca(fila[12])) {
        throw new Error("La placa está vacía o no es válida.");
      }

      const tieneRecibo = fila.slice(48, 57).some((valor) => valor !== "");

      let claveRecibo: string | null = null;

      if (tieneRecibo) {
        const anioRecibo = enteroObligatorio(fila[48], "Año del recibo");

        const numeroRecibo = fila[49].trim();

        if (!numeroRecibo) {
          throw new Error("El número de recibo está vacío.");
        }

        numeroObligatorio(fila[50], "Monto del recibo");

        validarTrimestre(fila[51]);

        if (!fila[52].trim()) {
          throw new Error("El estado del recibo está vacío.");
        }

        claveRecibo = `${anioRecibo}|${numeroRecibo}`;

        if (recibos.has(claveRecibo)) {
          throw new Error(
            `El recibo ${anioRecibo}-${numeroRecibo} está duplicado dentro del archivo.`,
          );
        }
      }

      declaraciones.add(`${anioDeclaracion}|${numeroDeclaracion}`);

      if (claveRecibo) {
        recibos.add(claveRecibo);
      }

      filasValidas += 1;
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : "Error desconocido.";

      if (errores.length < MAXIMO_ERRORES_GUARDADOS) {
        errores.push(crearError(numeroFila, "FILA", mensaje, fila));
      }
    }
  }

  return {
    totalFilas: filas.length,

    filasValidas,

    filasConError: filas.length - filasValidas,

    totalDeclaraciones: declaraciones.size,

    totalRecibos: recibos.size,

    errores,

    advertencias: recuperacion.advertencias,
  };
}

export async function analizarVersionDatos(input: AnalizarVersionInput) {
  const resultadoOrdenes = analizarOrdenes(input.ordenes);

  const resultadoDeclaraciones = analizarDeclaraciones(
    input.declaracionesPagos,
  );

  const hashOrdenes = hashBuffer(input.ordenes.buffer);

  const hashDeclaraciones = hashBuffer(input.declaracionesPagos.buffer);

  const hashConjunto = createHash("sha256")
    .update(`${hashOrdenes}:${hashDeclaraciones}`)
    .digest("hex");

  const versionAnterior = await prisma.versionDatos.findUnique({
    where: {
      hashConjunto,
    },

    select: {
      id: true,
      codigo: true,
      estado: true,
    },
  });

  const esReanalisis = versionAnterior?.estado === EstadoVersionDatos.FALLIDA;

  if (versionAnterior && !esReanalisis) {
    throw new ErrorVersionDatos(
      `Este conjunto de archivos ya fue analizado en la versión ${versionAnterior.codigo}, cuyo estado actual es ${versionAnterior.estado}.`,
      409,
    );
  }

  const totalErrores =
    resultadoOrdenes.filasConError + resultadoDeclaraciones.filasConError;

  const totalAdvertencias = resultadoDeclaraciones.advertencias.length;

  const estado =
    totalErrores === 0
      ? EstadoVersionDatos.VALIDADA
      : EstadoVersionDatos.FALLIDA;

  const gzipOrdenes = gzipSync(input.ordenes.buffer);

  const gzipDeclaraciones = gzipSync(input.declaracionesPagos.buffer);

  const version = await prisma.$transaction(
    async (tx) => {
      const datosVersion = {
        estado,
        usuarioId: input.usuarioId,

        comentario: input.comentario?.trim().slice(0, 500) || null,

        totalOrdenes: resultadoOrdenes.totalOrdenes,

        totalDeclaraciones: resultadoDeclaraciones.totalDeclaraciones,

        totalRecibos: resultadoDeclaraciones.totalRecibos,

        totalErrores,

        fechaAnalisis: new Date(),

        fechaAplicacion: null,
      };

      if (versionAnterior && esReanalisis) {
        await tx.archivoVersionDatos.deleteMany({
          where: {
            versionDatosId: versionAnterior.id,
          },
        });
      }

      const nuevaVersion =
        versionAnterior && esReanalisis
          ? await tx.versionDatos.update({
              where: {
                id: versionAnterior.id,
              },

              data: datosVersion,
            })
          : await tx.versionDatos.create({
              data: {
                hashConjunto,
                ...datosVersion,
              },
            });

      const archivoOrdenes = await tx.archivoVersionDatos.create({
        data: {
          versionDatosId: nuevaVersion.id,

          tipo: TipoArchivoVersion.ORDENES,

          nombreArchivo: input.ordenes.nombreArchivo,

          hashArchivo: hashOrdenes,

          contenidoGzip: gzipOrdenes,

          tamanoOriginal: input.ordenes.buffer.length,

          tamanoComprimido: gzipOrdenes.length,

          totalFilas: resultadoOrdenes.totalFilas,

          filasValidas: resultadoOrdenes.filasValidas,

          filasConError: resultadoOrdenes.filasConError,

          resumen: {
            totalOrdenes: resultadoOrdenes.totalOrdenes,

            erroresGuardados: resultadoOrdenes.errores.length,
          },
        },
      });

      const archivoDeclaraciones = await tx.archivoVersionDatos.create({
        data: {
          versionDatosId: nuevaVersion.id,

          tipo: TipoArchivoVersion.DECLARACIONES_PAGOS,

          nombreArchivo: input.declaracionesPagos.nombreArchivo,

          hashArchivo: hashDeclaraciones,

          contenidoGzip: gzipDeclaraciones,

          tamanoOriginal: input.declaracionesPagos.buffer.length,

          tamanoComprimido: gzipDeclaraciones.length,

          totalFilas: resultadoDeclaraciones.totalFilas,

          filasValidas: resultadoDeclaraciones.filasValidas,

          filasConError: resultadoDeclaraciones.filasConError,

          resumen: {
            totalDeclaraciones: resultadoDeclaraciones.totalDeclaraciones,

            totalRecibos: resultadoDeclaraciones.totalRecibos,

            erroresGuardados: resultadoDeclaraciones.errores.length,

            totalAdvertencias,

            advertencias: resultadoDeclaraciones.advertencias.map(
              (advertencia) =>
                advertenciaIdentidadRecuperadaComoJson(advertencia),
            ),
          } satisfies Prisma.InputJsonObject,
        },
      });

      if (resultadoOrdenes.errores.length > 0) {
        await tx.errorArchivoVersion.createMany({
          data: resultadoOrdenes.errores.map((error) => ({
            archivoId: archivoOrdenes.id,

            fila: error.fila,

            campo: error.campo,

            mensaje: error.mensaje,

            datosOriginales: error.datosOriginales,
          })),
        });
      }

      if (resultadoDeclaraciones.errores.length > 0) {
        await tx.errorArchivoVersion.createMany({
          data: resultadoDeclaraciones.errores.map((error) => ({
            archivoId: archivoDeclaraciones.id,

            fila: error.fila,

            campo: error.campo,

            mensaje: error.mensaje,

            datosOriginales: error.datosOriginales,
          })),
        });
      }

      await tx.auditoria.create({
        data: {
          usuarioId: input.usuarioId,

          accion: esReanalisis
            ? "REANALIZAR_VERSION_DATOS"
            : "ANALIZAR_VERSION_DATOS",

          entidad: "VERSION_DATOS",

          entidadId: String(nuevaVersion.id),

          resultado:
            totalErrores > 0
              ? "CON_ERRORES"
              : totalAdvertencias > 0
                ? "CON_ADVERTENCIAS"
                : "CORRECTO",

          detalles: {
            codigo: nuevaVersion.codigo,

            totalOrdenes: resultadoOrdenes.totalOrdenes,

            totalDeclaraciones: resultadoDeclaraciones.totalDeclaraciones,

            totalRecibos: resultadoDeclaraciones.totalRecibos,

            totalErrores,

            totalAdvertencias,

            reanalisis: esReanalisis,
          },
        },
      });

      return nuevaVersion;
    },
    {
      maxWait: 10000,
      timeout: 60000,
    },
  );

  return {
    id: version.id,
    codigo: version.codigo,
    estado: version.estado,
    fechaAnalisis: version.fechaAnalisis,

    puedeConfirmarse: totalErrores === 0,

    requiereRevisionAjustes: totalAdvertencias > 0,

    totalAdvertencias,

    advertencias: resultadoDeclaraciones.advertencias,

    reanalisis: esReanalisis,

    totales: {
      ordenes: resultadoOrdenes.totalOrdenes,

      declaraciones: resultadoDeclaraciones.totalDeclaraciones,

      recibos: resultadoDeclaraciones.totalRecibos,

      errores: totalErrores,
    },

    archivos: {
      ordenes: {
        nombre: input.ordenes.nombreArchivo,

        totalFilas: resultadoOrdenes.totalFilas,

        filasValidas: resultadoOrdenes.filasValidas,

        filasConError: resultadoOrdenes.filasConError,

        errores: resultadoOrdenes.errores.slice(0, 20),
      },

      declaracionesPagos: {
        nombre: input.declaracionesPagos.nombreArchivo,

        totalFilas: resultadoDeclaraciones.totalFilas,

        filasValidas: resultadoDeclaraciones.filasValidas,

        filasConError: resultadoDeclaraciones.filasConError,

        errores: resultadoDeclaraciones.errores.slice(0, 20),

        advertencias: resultadoDeclaraciones.advertencias,
      },
    },
  };
}

export async function listarVersionesDatos() {
  return prisma.versionDatos.findMany({
    orderBy: {
      createdAt: "desc",
    },

    select: {
      id: true,
      codigo: true,
      estado: true,
      comentario: true,

      totalOrdenes: true,
      totalDeclaraciones: true,
      totalRecibos: true,
      totalErrores: true,

      fechaAnalisis: true,
      fechaAplicacion: true,
      createdAt: true,
      updatedAt: true,

      usuario: {
        select: {
          id: true,
          nombre: true,
          nombreUsuario: true,
        },
      },

      archivos: {
        orderBy: {
          tipo: "asc",
        },

        select: {
          id: true,
          tipo: true,
          nombreArchivo: true,
          tamanoOriginal: true,
          tamanoComprimido: true,
          totalFilas: true,
          filasValidas: true,
          filasConError: true,
        },
      },

      _count: {
        select: {
          importaciones: true,
          ordenes: true,
          declaraciones: true,
        },
      },
    },
  });
}

export async function obtenerVersionDatos(versionDatosId: number) {
  const version = await prisma.versionDatos.findUnique({
    where: {
      id: versionDatosId,
    },

    select: {
      id: true,
      codigo: true,
      hashConjunto: true,
      estado: true,
      comentario: true,

      totalOrdenes: true,
      totalDeclaraciones: true,
      totalRecibos: true,
      totalErrores: true,

      fechaAnalisis: true,
      fechaAplicacion: true,
      createdAt: true,
      updatedAt: true,

      usuario: {
        select: {
          id: true,
          nombre: true,
          nombreUsuario: true,
        },
      },

      archivos: {
        orderBy: {
          tipo: "asc",
        },

        select: {
          id: true,
          tipo: true,
          nombreArchivo: true,
          hashArchivo: true,
          tamanoOriginal: true,
          tamanoComprimido: true,
          totalFilas: true,
          filasValidas: true,
          filasConError: true,
          resumen: true,

          errores: {
            orderBy: [
              {
                fila: "asc",
              },
              {
                id: "asc",
              },
            ],

            take: 100,

            select: {
              id: true,
              fila: true,
              campo: true,
              mensaje: true,
              datosOriginales: true,
              createdAt: true,
            },
          },
        },
      },

      importaciones: {
        orderBy: {
          id: "asc",
        },

        select: {
          id: true,
          tipo: true,
          origen: true,
          estado: true,
          nombreArchivo: true,
          totalFilas: true,
          filasCorrectas: true,
          filasConError: true,
          registrosNuevos: true,
          registrosActualizados: true,
          registrosSinCambios: true,
          fechaImportacion: true,
          fechaFinalizacion: true,
          mensaje: true,
        },
      },

      _count: {
        select: {
          ordenes: true,
          declaraciones: true,
          importaciones: true,
        },
      },
    },
  });

  if (!version) {
    throw new ErrorVersionDatos("La versión solicitada no existe.", 404);
  }

  return version;
}
