import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { parse } from "csv-parse/sync";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

const COLUMNAS_ORDENES = 26;
const MAXIMO_ERRORES_GUARDADOS = 1000;
const PATRON_NUMERO =
  /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?\.\d+/g;

export class ErrorVersionOrdenes extends Error {
  public readonly status: number;

  constructor(
    mensaje: string,
    status = 400,
  ) {
    super(mensaje);
    this.name = "ErrorVersionOrdenes";
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
  totalDetalles: number;
  errores: ErrorArchivoAnalizado[];
}

interface AnalizarVersionOrdenesInput {
  archivo: ArchivoEntrada;
  usuarioId: number;
  comentario?: string | null;
}

function normalizarTexto(
  valor: string,
): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function limpiarFila(
  fila: unknown[],
): string[] {
  const valores = fila.map(
    (valor) =>
      String(valor ?? "").trim(),
  );

  while (
    valores.length >
      COLUMNAS_ORDENES &&
    valores.at(-1) === ""
  ) {
    valores.pop();
  }

  return valores;
}

function normalizarDocumento(
  valor: string,
): string {
  return valor.replace(/\D/g, "");
}

function normalizarPlaca(
  valor: string,
): string {
  const placa = valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (placa.length === 6) {
    return (
      `${placa.slice(0, 3)}-` +
      placa.slice(3)
    );
  }

  return placa;
}

function extraerNumeros(
  valor: string,
): number[] {
  return (
    valor.match(PATRON_NUMERO) ??
    []
  )
    .map(
      (numero) =>
        Number(
          numero.replace(/,/g, ""),
        ),
    )
    .filter(Number.isFinite);
}

function numeroObligatorio(
  valor: string,
  campo: string,
): number {
  const numeros =
    extraerNumeros(valor);

  if (numeros.length === 0) {
    throw new Error(
      `El campo "${campo}" no contiene un número válido.`,
    );
  }

  return numeros[0];
}

function enteroObligatorio(
  valor: string,
  campo: string,
): number {
  const numero =
    numeroObligatorio(
      valor,
      campo,
    );

  if (!Number.isInteger(numero)) {
    throw new Error(
      `El campo "${campo}" debe contener un número entero.`,
    );
  }

  return numero;
}

function validarCantidad(
  valores: number[],
  cantidadEsperada: number,
  campo: string,
): void {
  if (
    valores.length <
    cantidadEsperada
  ) {
    throw new Error(
      `El campo "${campo}" contiene ${valores.length} valor(es), ` +
        `pero se esperaban ${cantidadEsperada}.`,
    );
  }
}

function cantidadPeriodos(
  valor: string,
): number {
  const coincidencias = [
    ...valor.matchAll(
      /(\d{4})\s*\[\s*([1-4])(?:\s*-\s*([1-4]))?\s*\]/g,
    ),
  ];

  if (
    coincidencias.length === 0
  ) {
    throw new Error(
      `No se pudo interpretar el periodo "${valor}".`,
    );
  }

  for (
    const coincidencia
    of coincidencias
  ) {
    const desde =
      Number(coincidencia[2]);
    const hasta =
      Number(
        coincidencia[3] ??
          coincidencia[2],
      );

    if (desde > hasta) {
      throw new Error(
        `El periodo "${coincidencia[0]}" no es válido.`,
      );
    }
  }

  return coincidencias.length;
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

function leerRegistros(
  archivo: ArchivoEntrada,
): string[][] {
  try {
    return parse(
      archivo.buffer.toString(
        "utf8",
      ),
      {
        delimiter: "|",
        quote: '"',
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true,
      },
    ) as string[][];
  } catch (error) {
    const mensaje =
      error instanceof Error
        ? error.message
        : "Error desconocido.";

    throw new ErrorVersionOrdenes(
      `No se pudo leer el archivo "${archivo.nombreArchivo}": ${mensaje}`,
    );
  }
}

function analizarOrdenes(
  archivo: ArchivoEntrada,
): ResultadoOrdenes {
  const registros =
    leerRegistros(archivo);

  if (registros.length < 2) {
    throw new ErrorVersionOrdenes(
      "El archivo de órdenes no contiene registros.",
    );
  }

  const cabecera =
    limpiarFila(registros[0]).map(
      normalizarTexto,
    );

  const cabeceraCorrecta =
    cabecera[0] === "ANO" &&
    cabecera[1] === "NRO" &&
    cabecera[9] === "PERIODO" &&
    cabecera[24] ===
      "MONTO TOTAL" &&
    cabecera[25] === "ID";

  if (!cabeceraCorrecta) {
    throw new ErrorVersionOrdenes(
      "El archivo no tiene la estructura esperada de órdenes de pago.",
    );
  }

  const filas = registros
    .slice(1)
    .map(limpiarFila)
    .filter(
      (fila) =>
        fila.some(
          (valor) =>
            valor !== "",
        ),
    );

  const errores:
    ErrorArchivoAnalizado[] = [];
  const claves =
    new Set<string>();

  let filasValidas = 0;
  let totalDetalles = 0;

  for (
    let indice = 0;
    indice < filas.length;
    indice += 1
  ) {
    const fila = filas[indice];
    const numeroFila =
      indice + 2;

    try {
      if (
        fila.length !==
        COLUMNAS_ORDENES
      ) {
        throw new Error(
          `La fila contiene ${fila.length} columnas; se esperaban ${COLUMNAS_ORDENES}.`,
        );
      }

      const anioOrden =
        enteroObligatorio(
          fila[0],
          "Año",
        );
      const numeroOrden =
        fila[1].trim();

      if (!numeroOrden) {
        throw new Error(
          "El número de orden está vacío.",
        );
      }

      const clave =
        `${anioOrden}|${numeroOrden}`;

      if (claves.has(clave)) {
        throw new Error(
          `La orden ${anioOrden}-${numeroOrden} está duplicada dentro del archivo.`,
        );
      }

      if (
        !normalizarDocumento(
          fila[3],
        )
      ) {
        throw new Error(
          "El DNI/RUC está vacío o no es válido.",
        );
      }

      if (!fila[4].trim()) {
        throw new Error(
          "El nombre o razón social está vacío.",
        );
      }

      if (
        !normalizarPlaca(
          fila[6],
        )
      ) {
        throw new Error(
          "La placa está vacía o no es válida.",
        );
      }

      enteroObligatorio(
        fila[8],
        "Activo",
      );

      const totalPeriodos =
        cantidadPeriodos(
          fila[9],
        );

      validarCantidad(
        extraerNumeros(
          fila[10],
        ),
        totalPeriodos,
        "Valor referencial",
      );
      validarCantidad(
        extraerNumeros(
          fila[11],
        ),
        totalPeriodos,
        "Año fabricación",
      );
      validarCantidad(
        extraerNumeros(
          fila[12],
        ),
        totalPeriodos,
        "UIT",
      );
      validarCantidad(
        extraerNumeros(
          fila[13],
        ),
        totalPeriodos,
        "Base imponible",
      );
      validarCantidad(
        extraerNumeros(
          fila[14],
        ),
        totalPeriodos,
        "Impuesto",
      );
      validarCantidad(
        extraerNumeros(
          fila[15],
        ),
        totalPeriodos,
        "Reajuste",
      );
      validarCantidad(
        extraerNumeros(
          fila[16],
        ),
        totalPeriodos,
        "Interés",
      );
      validarCantidad(
        extraerNumeros(
          fila[17],
        ),
        totalPeriodos,
        "Gastos administrativos",
      );
      validarCantidad(
        extraerNumeros(
          fila[18],
        ),
        totalPeriodos,
        "Total",
      );

      numeroObligatorio(
        fila[24],
        "Monto total",
      );

      claves.add(clave);
      filasValidas += 1;
      totalDetalles +=
        totalPeriodos;
    } catch (error) {
      const mensaje =
        error instanceof Error
          ? error.message
          : "Error desconocido.";

      if (
        errores.length <
        MAXIMO_ERRORES_GUARDADOS
      ) {
        errores.push(
          crearError(
            numeroFila,
            "FILA",
            mensaje,
            fila,
          ),
        );
      }
    }
  }

  return {
    totalFilas: filas.length,
    filasValidas,
    filasConError:
      filas.length -
      filasValidas,
    totalOrdenes:
      filasValidas,
    totalDetalles,
    errores,
  };
}

export function probarArchivoOrdenes(
  archivo: ArchivoEntrada,
) {
  const resultado = analizarOrdenes(archivo);
  const totalErrores = resultado.filasConError;

  return {
    id: 0,
    codigo: "PRUEBA",
    estado:
      totalErrores === 0
        ? EstadoVersionDatos.VALIDADA
        : EstadoVersionDatos.FALLIDA,
    fechaAnalisis: new Date(),
    puedeConfirmarse: totalErrores === 0,
    reanalisis: false,
    totales: {
      ordenes: resultado.totalOrdenes,
      detalles: resultado.totalDetalles,
      errores: totalErrores,
    },
    archivo: {
      nombre: archivo.nombreArchivo,
      totalFilas: resultado.totalFilas,
      filasValidas: resultado.filasValidas,
      filasConError: resultado.filasConError,
      errores: resultado.errores.slice(0, 20),
    },
  };
}

export async function analizarVersionOrdenes(
  input: AnalizarVersionOrdenesInput,
) {
  const resultado =
    analizarOrdenes(
      input.archivo,
    );

  const hashArchivo =
    createHash("sha256")
      .update(input.archivo.buffer)
      .digest("hex");

  const versionAnterior =
    await prisma
      .versionOrdenes
      .findUnique({
        where: {
          hashArchivo,
        },
        select: {
          id: true,
          codigo: true,
          estado: true,
        },
      });

  const esReanalisis =
    versionAnterior?.estado === EstadoVersionDatos.FALLIDA ||
    versionAnterior?.estado === EstadoVersionDatos.CANCELADA;

  if (
    versionAnterior &&
    !esReanalisis
  ) {
    throw new ErrorVersionOrdenes(
      `Este archivo ya fue analizado en la versión ${versionAnterior.codigo}, cuyo estado es ${versionAnterior.estado}.`,
      409,
    );
  }

  const totalErrores =
    resultado.filasConError;
  const estado =
    totalErrores === 0
      ? EstadoVersionDatos.VALIDADA
      : EstadoVersionDatos.FALLIDA;
  const contenidoGzip =
    gzipSync(input.archivo.buffer);

  const version =
    await prisma.$transaction(
      async (tx) => {
        const datosVersion = {
          estado,
          usuarioId:
            input.usuarioId,
          comentario:
            input.comentario
              ?.trim()
              .slice(0, 500) ||
            null,
          totalOrdenes:
            resultado
              .totalOrdenes,
          totalDetalles:
            resultado
              .totalDetalles,
          totalErrores,
          fechaAnalisis:
            new Date(),
          fechaAplicacion: null,
        };

        if (
          versionAnterior &&
          esReanalisis
        ) {
          await tx
            .archivoVersionOrdenes
            .deleteMany({
              where: {
                versionOrdenesId:
                  versionAnterior.id,
              },
            });
        }

        const nuevaVersion =
          versionAnterior &&
          esReanalisis
            ? await tx
                .versionOrdenes
                .update({
                  where: {
                    id:
                      versionAnterior.id,
                  },
                  data:
                    datosVersion,
                })
            : await tx
                .versionOrdenes
                .create({
                  data: {
                    hashArchivo,
                    ...datosVersion,
                  },
                });

        const archivo =
          await tx
            .archivoVersionOrdenes
            .create({
              data: {
                versionOrdenesId:
                  nuevaVersion.id,
                nombreArchivo:
                  input.archivo
                    .nombreArchivo,
                hashArchivo,
                contenidoGzip,
                tamanoOriginal:
                  input.archivo
                    .buffer.length,
                tamanoComprimido:
                  contenidoGzip.length,
                totalFilas:
                  resultado.totalFilas,
                filasValidas:
                  resultado.filasValidas,
                filasConError:
                  resultado
                    .filasConError,
                resumen: {
                  totalOrdenes:
                    resultado
                      .totalOrdenes,
                  totalDetalles:
                    resultado
                      .totalDetalles,
                  erroresGuardados:
                    resultado
                      .errores.length,
                } satisfies Prisma.InputJsonObject,
              },
            });

        if (
          resultado.errores.length >
          0
        ) {
          await tx
            .errorArchivoOrdenes
            .createMany({
              data:
                resultado.errores.map(
                  (error) => ({
                    archivoId:
                      archivo.id,
                    fila: error.fila,
                    campo:
                      error.campo,
                    mensaje:
                      error.mensaje,
                    datosOriginales:
                      error
                        .datosOriginales,
                  }),
                ),
            });
        }

        await tx.auditoria.create({
          data: {
            usuarioId:
              input.usuarioId,
            accion: esReanalisis
              ? "REANALIZAR_VERSION_ORDENES"
              : "ANALIZAR_VERSION_ORDENES",
            entidad:
              "VERSION_ORDENES",
            entidadId:
              String(
                nuevaVersion.id,
              ),
            resultado:
              totalErrores > 0
                ? "CON_ERRORES"
                : "CORRECTO",
            detalles: {
              codigo:
                nuevaVersion.codigo,
              totalOrdenes:
                resultado
                  .totalOrdenes,
              totalDetalles:
                resultado
                  .totalDetalles,
              totalErrores,
              reanalisis:
                esReanalisis,
            } satisfies Prisma.InputJsonObject,
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
    fechaAnalisis:
      version.fechaAnalisis,
    puedeConfirmarse:
      totalErrores === 0,
    reanalisis:
      esReanalisis,
    totales: {
      ordenes:
        resultado.totalOrdenes,
      detalles:
        resultado.totalDetalles,
      errores:
        totalErrores,
    },
    archivo: {
      nombre:
        input.archivo
          .nombreArchivo,
      totalFilas:
        resultado.totalFilas,
      filasValidas:
        resultado.filasValidas,
      filasConError:
        resultado
          .filasConError,
      errores:
        resultado.errores.slice(
          0,
          20,
        ),
    },
  };
}

export async function listarVersionesOrdenes() {
  return prisma
    .versionOrdenes
    .findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        codigo: true,
        estado: true,
        comentario: true,
        totalOrdenes: true,
        totalDetalles: true,
        totalErrores: true,
        fechaAnalisis: true,
        fechaAplicacion: true,
        createdAt: true,
        updatedAt: true,
        usuario: {
          select: {
            id: true,
            nombre: true,
            nombreUsuario:
              true,
          },
        },
        archivo: {
          select: {
            id: true,
            nombreArchivo:
              true,
            tamanoOriginal:
              true,
            tamanoComprimido:
              true,
            totalFilas: true,
            filasValidas: true,
            filasConError:
              true,
          },
        },
        _count: {
          select: {
            importaciones:
              true,
            ordenes: true,
          },
        },
      },
    });
}

export async function obtenerVersionOrdenes(
  versionOrdenesId: number,
) {
  const version =
    await prisma
      .versionOrdenes
      .findUnique({
        where: {
          id:
            versionOrdenesId,
        },
        include: {
          usuario: {
            select: {
              id: true,
              nombre: true,
              nombreUsuario:
                true,
            },
          },
          archivo: {
            include: {
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
              },
            },
          },
          importaciones: {
            orderBy: {
              id: "asc",
            },
          },
          _count: {
            select: {
              importaciones:
                true,
              ordenes: true,
            },
          },
        },
      });

  if (!version) {
    throw new ErrorVersionOrdenes(
      "La versión de órdenes solicitada no existe.",
      404,
    );
  }

  return version;
}
