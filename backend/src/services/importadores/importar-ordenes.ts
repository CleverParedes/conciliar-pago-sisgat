import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

import {
  EstadoConciliacion,
  EstadoImportacion,
  OrigenImportacion,
  TipoImportacion,
  type Prisma,
} from "../../../generated/prisma/client";

import { prisma } from "../../lib/prisma";

import type { ContextoImportacion } from "./contexto-importacion";

import type { OpcionesImportacion } from "./opciones-importacion";

const COLUMNAS_ORDENES = [
  "anio",
  "numero",
  "fecha",
  "dni",
  "nombres",
  "direccion",
  "placa",
  "fecha_sunarp",
  "activo",
  "periodo",
  "valor_referencial",
  "anio_fabricacion",
  "uit",
  "base_imponible",
  "impuesto",
  "reajuste",
  "interes",
  "gastos_administrativos",
  "total",
  "usuario_creacion",
  "fecha_usuario_creacion",
  "usuario_modificacion",
  "fecha_usuario_modificacion",
  "fecha_generacion",
  "monto_total",
  "id",
] as const;

const PATRON_NUMERO = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?\.\d+/g;

interface PeriodoDetectado {
  anio: number;
  trimestreDesde: number;
  trimestreHasta: number;
  original: string;
}

interface ResultadoImportacion {
  importacionId: number;
  totalFilas: number;
  filasCorrectas: number;
  filasConError: number;
  estado: EstadoImportacion;
}

function limpiarFila(fila: unknown[]): string[] {
  const resultado = fila.map((valor) => String(valor ?? "").trim());

  /*
   * El archivo termina cada fila con |
   * y genera una columna vacía.
   */
  while (
    resultado.length > COLUMNAS_ORDENES.length &&
    resultado.at(-1) === ""
  ) {
    resultado.pop();
  }

  return resultado;
}

function normalizarEncabezado(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

function normalizarPlaca(valor: string): string {
  const limpia = valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (limpia.length === 6) {
    return `${limpia.slice(0, 3)}-${limpia.slice(3)}`;
  }

  return limpia;
}

function obtenerTipoDocumento(documento: string): string {
  if (documento.length === 8) {
    return "DNI";
  }

  if (documento.length === 11) {
    return "RUC";
  }

  return "OTRO";
}

function extraerNumeros(valor: string): number[] {
  const coincidencias = valor.match(PATRON_NUMERO) ?? [];

  return coincidencias
    .map((numero) => Number(numero.replace(/,/g, "")))
    .filter((numero) => Number.isFinite(numero));
}

function numeroObligatorio(valor: string, nombreCampo: string): number {
  const numeros = extraerNumeros(valor);

  if (numeros.length === 0) {
    throw new Error(`El campo "${nombreCampo}" no contiene un número válido.`);
  }

  return numeros[0];
}

function enteroObligatorio(valor: string, nombreCampo: string): number {
  const numero = numeroObligatorio(valor, nombreCampo);

  if (!Number.isInteger(numero)) {
    throw new Error(`El campo "${nombreCampo}" debe ser un número entero.`);
  }

  return numero;
}

function fechaDesdeTexto(valor: string): Date | null {
  const texto = valor.trim();

  if (!texto) {
    return null;
  }

  const coincidencia = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);

  if (!coincidencia) {
    return null;
  }

  const dia = Number(coincidencia[1]);

  const mes = Number(coincidencia[2]);

  const anio = Number(coincidencia[3]);

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  const esValida =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;

  return esValida ? fecha : null;
}

function extraerPeriodos(valor: string): PeriodoDetectado[] {
  const expresion = /(\d{4})\s*\[\s*([1-4])(?:\s*-\s*([1-4]))?\s*\]/g;

  const periodos = [...valor.matchAll(expresion)].map((coincidencia) => {
    const anio = Number(coincidencia[1]);

    const trimestreDesde = Number(coincidencia[2]);

    const trimestreHasta = Number(coincidencia[3] ?? coincidencia[2]);

    if (trimestreDesde > trimestreHasta) {
      throw new Error(`Periodo inválido: ${coincidencia[0]}`);
    }

    return {
      anio,
      trimestreDesde,
      trimestreHasta,
      original: coincidencia[0],
    };
  });

  if (periodos.length === 0) {
    throw new Error(`No se pudo interpretar el periodo "${valor}".`);
  }

  return periodos;
}

function validarCantidad(
  nombreCampo: string,
  valores: number[],
  cantidadEsperada: number,
): void {
  if (valores.length < cantidadEsperada) {
    throw new Error(
      `El campo "${nombreCampo}" contiene ${valores.length} valor(es), ` +
        `pero se encontraron ${cantidadEsperada} periodo(s).`,
    );
  }
}

function filaComoJson(fila: string[]): Record<string, string> {
  return Object.fromEntries(
    COLUMNAS_ORDENES.map((columna, indice) => [columna, fila[indice] ?? ""]),
  );
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Error desconocido durante la importación.";
}

/*
 * Cuando existe un cliente transaccional,
 * la operación se ejecuta dentro de esa
 * transacción.
 *
 * Cuando no existe, cada fila conserva
 * el comportamiento anterior y utiliza
 * su propia transacción.
 */
async function ejecutarOperacionFila(
  cliente: Prisma.TransactionClient | undefined,

  operacion: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  if (cliente) {
    await operacion(cliente);
    return;
  }

  await prisma.$transaction(operacion);
}

export async function importarOrdenesDesdeBuffer(
  buffer: Buffer,
  nombreArchivo: string,
  opciones: OpcionesImportacion,
  contexto: ContextoImportacion = {},
): Promise<ResultadoImportacion> {
  const cliente = contexto.cliente ?? prisma;

  const contenido = buffer.toString("utf8");

  const registros = parse(contenido, {
    delimiter: "|",
    quote: '"',
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  if (registros.length < 2) {
    throw new Error("El archivo no contiene registros para importar.");
  }

  const cabecera = limpiarFila(registros[0]);

  const encabezados = cabecera.map(normalizarEncabezado);

  const cabeceraCorrecta =
    encabezados[0] === "ANO" &&
    encabezados[1] === "NRO" &&
    encabezados[9] === "PERIODO" &&
    encabezados[24] === "MONTO TOTAL" &&
    encabezados[25] === "ID";

  if (!cabeceraCorrecta) {
    throw new Error(
      "El archivo seleccionado no tiene la estructura esperada de órdenes de pago.",
    );
  }

  const filas = registros
    .slice(1)
    .map(limpiarFila)
    .filter((fila) => fila.some((valor) => valor !== ""));

  const hashArchivo = createHash("sha256").update(buffer).digest("hex");

  /*
   * Durante la confirmación de una versión
   * el archivo ya fue analizado anteriormente.
   * Por eso se permite omitir la validación
   * de duplicidad.
   */
  const importacionAnterior = contexto.permitirArchivoDuplicado
    ? null
    : await cliente.importacion.findFirst({
        where: {
          hashArchivo,

          tipo: TipoImportacion.ORDENES,

          estado: {
            in: [
              EstadoImportacion.COMPLETADA,

              EstadoImportacion.COMPLETADA_CON_ERRORES,
            ],
          },
        },
      });

  if (importacionAnterior) {
    throw new Error(
      `El archivo ya fue importado anteriormente. ` +
        `Importación registrada: ${importacionAnterior.id}.`,
    );
  }

  const importacion = await cliente.importacion.create({
    data: {
      tipo: TipoImportacion.ORDENES,

      origen: OrigenImportacion.MANUAL,

      estado: EstadoImportacion.PROCESANDO,

      modo: opciones.modo,

      fechaDesde: opciones.fechaDesde,

      fechaHasta: opciones.fechaHasta,

      tipoFechaFiltro: opciones.tipoFechaFiltro,

      nombreArchivo,
      hashArchivo,
      totalFilas: filas.length,

      ...(contexto.versionDatosId !== undefined
        ? {
            versionDatosId: contexto.versionDatosId,
          }
        : {}),

      ...(contexto.versionOrdenesId !== undefined
        ? {
            versionOrdenesId: contexto.versionOrdenesId,
          }
        : {}),

      ...(contexto.usuarioId !== undefined
        ? {
            usuarioId: contexto.usuarioId,
          }
        : {}),
    },
  });

  let filasCorrectas = 0;
  let filasConError = 0;

  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];

    const numeroFila = indice + 2;

    const datosOriginales = filaComoJson(fila);

    try {
      if (fila.length !== COLUMNAS_ORDENES.length) {
        throw new Error(
          `La fila tiene ${fila.length} columnas; ` +
            `se esperaban ${COLUMNAS_ORDENES.length}.`,
        );
      }

      const anioOrden = enteroObligatorio(fila[0], "Año");

      const numeroOrden = fila[1].trim();

      if (!numeroOrden) {
        throw new Error("El número de orden está vacío.");
      }

      const documento = normalizarDocumento(fila[3]);

      if (!documento) {
        throw new Error("El DNI/RUC está vacío o no es válido.");
      }

      const nombre = fila[4].trim();

      if (!nombre) {
        throw new Error("El nombre o razón social está vacío.");
      }

      const direccion = fila[5].trim();

      const placa = normalizarPlaca(fila[6]);

      if (!placa) {
        throw new Error("La placa está vacía o no es válida.");
      }

      const activoOriginal = enteroObligatorio(fila[8], "Activo");

      const periodos = extraerPeriodos(fila[9]);

      const cantidadPeriodos = periodos.length;

      const valoresReferenciales = extraerNumeros(fila[10]);

      const aniosFabricacion = extraerNumeros(fila[11]);

      const valoresUit = extraerNumeros(fila[12]);

      const basesImponibles = extraerNumeros(fila[13]);

      const impuestos = extraerNumeros(fila[14]);

      const reajustes = extraerNumeros(fila[15]);

      const intereses = extraerNumeros(fila[16]);

      const gastosAdministrativos = extraerNumeros(fila[17]);

      /*
       * TOTAL contiene los totales
       * por periodo y, al final,
       * el total general.
       */
      const valoresTotal = extraerNumeros(fila[18]);

      const totalesPorPeriodo = valoresTotal.slice(0, cantidadPeriodos);

      validarCantidad(
        "VALOR REFERENCIAL",
        valoresReferenciales,
        cantidadPeriodos,
      );

      validarCantidad("AÑO FABRICACIÓN", aniosFabricacion, cantidadPeriodos);

      validarCantidad("UIT", valoresUit, cantidadPeriodos);

      validarCantidad("BASE IMPONIBLE", basesImponibles, cantidadPeriodos);

      validarCantidad("IMPUESTO", impuestos, cantidadPeriodos);

      validarCantidad("REAJUSTE", reajustes, cantidadPeriodos);

      validarCantidad("INTERÉS", intereses, cantidadPeriodos);

      validarCantidad(
        "GASTOS ADMINISTRATIVOS",
        gastosAdministrativos,
        cantidadPeriodos,
      );

      validarCantidad("TOTAL", totalesPorPeriodo, cantidadPeriodos);

      const importeTotal = numeroObligatorio(fila[24], "Monto Total");

      const sumaDetalles = totalesPorPeriodo.reduce(
        (acumulado, total) => acumulado + total,
        0,
      );

      const observaciones: string[] = [];

      if (activoOriginal !== 1) {
        observaciones.push(
          `Activo original = ${activoOriginal}; debe revisarse su significado.`,
        );
      }

      if (Math.abs(sumaDetalles - importeTotal) > 0.05) {
        observaciones.push(
          `La suma de detalles (${sumaDetalles.toFixed(
            2,
          )}) no coincide con el monto total (${importeTotal.toFixed(2)}).`,
        );
      }

      const estadoInicial =
        observaciones.length > 0
          ? EstadoConciliacion.REVISAR
          : EstadoConciliacion.PENDIENTE;

      const observacion =
        observaciones.length > 0 ? observaciones.join(" ") : null;

      const detalles = periodos.map((periodo, posicion) => ({
        periodoAnio: periodo.anio,

        periodoOriginal: periodo.original,

        trimestreDesde: periodo.trimestreDesde,

        trimestreHasta: periodo.trimestreHasta,

        valorReferencial: valoresReferenciales[posicion],

        anioFabricacion: Math.trunc(aniosFabricacion[posicion]),

        uit: valoresUit[posicion],

        baseImponible: basesImponibles[posicion],

        impuesto: impuestos[posicion],

        reajuste: reajustes[posicion],

        interes: intereses[posicion],

        gastosAdmin: gastosAdministrativos[posicion],

        totalPeriodo: totalesPorPeriodo[posicion],

        montoPagado: 0,

        saldo: totalesPorPeriodo[posicion],

        estado: estadoInicial,

        observacion,
      }));

      await ejecutarOperacionFila(
        contexto.cliente,

        async (tx) => {
          const contribuyente = await tx.contribuyente.upsert({
            where: {
              numeroDocumento: documento,
            },

            update: {
              tipoDocumento: obtenerTipoDocumento(documento),

              nombreRazonSocial: nombre,

              direccion: direccion || null,
            },

            create: {
              tipoDocumento: obtenerTipoDocumento(documento),

              numeroDocumento: documento,

              nombreRazonSocial: nombre,

              direccion: direccion || null,
            },
          });

          await tx.ordenPago.upsert({
            where: {
              anioOrden_numeroOrden: {
                anioOrden,
                numeroOrden,
              },
            },

            update: {
              ...(contexto.versionDatosId !== undefined
                ? {
                    versionDatos: {
                      connect: {
                        id: contexto.versionDatosId,
                      },
                    },
                  }
                : {}),

              ...(contexto.versionOrdenesId !== undefined
                ? {
                    versionOrdenes: {
                      connect: {
                        id: contexto.versionOrdenesId,
                      },
                    },
                  }
                : {}),

              idOrigen: fila[25] || null,

              fechaEmision: fechaDesdeTexto(fila[2]),

              dniRucOriginal: documento,

              nombreOriginal: nombre,

              direccionOriginal: direccion || null,

              placa,

              fechaSunarp: fechaDesdeTexto(fila[7]),

              activoOriginal,

              periodoOriginal: fila[9],

              importeTotal,

              totalPagado: 0,

              saldo: importeTotal,

              estado: estadoInicial,

              archivoOrigen: nombreArchivo,

              filaOrigen: numeroFila,

              datosOriginales,

              contribuyente: {
                connect: {
                  id: contribuyente.id,
                },
              },

              importacion: {
                connect: {
                  id: importacion.id,
                },
              },

              detalles: {
                deleteMany: {},
                create: detalles,
              },
            },

            create: {
              ...(contexto.versionDatosId !== undefined
                ? {
                    versionDatos: {
                      connect: {
                        id: contexto.versionDatosId,
                      },
                    },
                  }
                : {}),

              ...(contexto.versionOrdenesId !== undefined
                ? {
                    versionOrdenes: {
                      connect: {
                        id: contexto.versionOrdenesId,
                      },
                    },
                  }
                : {}),

              anioOrden,
              numeroOrden,

              idOrigen: fila[25] || null,

              fechaEmision: fechaDesdeTexto(fila[2]),

              dniRucOriginal: documento,

              nombreOriginal: nombre,

              direccionOriginal: direccion || null,

              placa,

              fechaSunarp: fechaDesdeTexto(fila[7]),

              activoOriginal,

              periodoOriginal: fila[9],

              importeTotal,

              totalPagado: 0,

              saldo: importeTotal,

              estado: estadoInicial,

              archivoOrigen: nombreArchivo,

              filaOrigen: numeroFila,

              datosOriginales,

              contribuyente: {
                connect: {
                  id: contribuyente.id,
                },
              },

              importacion: {
                connect: {
                  id: importacion.id,
                },
              },

              detalles: {
                create: detalles,
              },
            },
          });
        },
      );

      filasCorrectas += 1;
    } catch (error) {
      filasConError += 1;

      /*
       * Se utiliza el cliente recibido.
       * Cuando la confirmación se ejecuta
       * en una transacción, el error queda
       * registrado en la misma transacción.
       */
      await cliente.errorImportacion.create({
        data: {
          fila: numeroFila,

          mensaje: mensajeDeError(error),

          valorOriginal: fila.join("|"),

          datosOriginales,

          importacion: {
            connect: {
              id: importacion.id,
            },
          },
        },
      });
    }
  }

  const estadoFinal =
    filasConError === 0
      ? EstadoImportacion.COMPLETADA
      : filasCorrectas === 0
        ? EstadoImportacion.FALLIDA
        : EstadoImportacion.COMPLETADA_CON_ERRORES;

  await cliente.importacion.update({
    where: {
      id: importacion.id,
    },

    data: {
      estado: estadoFinal,

      totalFilas: filas.length,

      filasCorrectas,

      filasConError,

      fechaFinalizacion: new Date(),

      mensaje:
        `Importación finalizada: ${filasCorrectas} filas correctas ` +
        `y ${filasConError} filas con error.`,
    },
  });

  return {
    importacionId: importacion.id,

    totalFilas: filas.length,

    filasCorrectas,

    filasConError,

    estado: estadoFinal,
  };
}