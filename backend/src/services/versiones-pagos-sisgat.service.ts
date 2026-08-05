import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import { leerReporteDeclaracionesPagosSisgat } from "./importadores/lector-reporte-sisgat";
import {
  advertenciaIdentidadRecuperadaComoJson,
  recuperarIdentidadesDeclaracionesSisgat,
  type AdvertenciaIdentidadRecuperada,
} from "./importadores/recuperar-identidades-sisgat";

const COLUMNAS_DECLARACIONES = 57;
const MAXIMO_ERRORES_GUARDADOS = 1000;
const PATRON_NUMERO =
  /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?\.\d+/g;

export class ErrorVersionPagosSisgat extends Error {
  public readonly status: number;

  constructor(
    mensaje: string,
    status = 400,
  ) {
    super(mensaje);
    this.name =
      "ErrorVersionPagosSisgat";
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

interface ResultadoDeclaraciones {
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  totalDeclaraciones: number;
  totalRecibos: number;
  errores: ErrorArchivoAnalizado[];
  advertencias:
    AdvertenciaIdentidadRecuperada[];
}

interface AnalizarVersionPagosInput {
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
  totalColumnas: number,
): string[] {
  const valores = fila.map(
    (valor) =>
      String(valor ?? "").trim(),
  );

  while (
    valores.length > totalColumnas &&
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
    valor.match(PATRON_NUMERO) ?? []
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

function validarTrimestre(
  valor: string,
): void {
  const trimestre = valor
    .trim()
    .replace(/\s+/g, "");

  const coincidencia =
    /^\[([1-4])(?:-([1-4]))?\]$/.exec(
      trimestre,
    );

  if (!coincidencia) {
    throw new Error(
      `No se pudo interpretar el trimestre "${valor}".`,
    );
  }

  const desde =
    Number(coincidencia[1]);
  const hasta =
    Number(
      coincidencia[2] ??
        coincidencia[1],
    );

  if (desde > hasta) {
    throw new Error(
      `El trimestre "${valor}" contiene un rango inválido.`,
    );
  }
}

function esFilaResumen(
  fila: string[],
): boolean {
  const primerosVacios = fila
    .slice(0, 5)
    .every(
      (valor) => valor === "",
    );

  const valoresNoVacios =
    fila.filter(
      (valor) => valor !== "",
    );

  return (
    primerosVacios &&
    valoresNoVacios.length <= 1
  );
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

function analizarDeclaraciones(
  archivo: ArchivoEntrada,
): ResultadoDeclaraciones {
  let registros: string[][];

  try {
    registros =
      leerReporteDeclaracionesPagosSisgat(
        archivo.buffer,
        archivo.nombreArchivo,
      );
  } catch (error) {
    const mensaje =
      error instanceof Error
        ? error.message
        : "Error desconocido.";

    throw new ErrorVersionPagosSisgat(
      `No se pudo leer el archivo "${archivo.nombreArchivo}": ${mensaje}`,
    );
  }

  if (registros.length < 2) {
    throw new ErrorVersionPagosSisgat(
      "El archivo de declaraciones y pagos no contiene registros.",
    );
  }

  const cabecera = registros[0].map(
    (valor) =>
      normalizarTexto(
        String(valor ?? ""),
      ),
  );

  const cabeceraCorrecta =
    cabecera[0] === "ANO" &&
    cabecera[1] === "DECLARA" &&
    cabecera[5] ===
      "DNI RUC CONTRIBUYENTE" &&
    cabecera[13] === "PLACA" &&
    cabecera[50] === "NUMERO REC";

  if (!cabeceraCorrecta) {
    throw new ErrorVersionPagosSisgat(
      "El archivo no tiene la estructura esperada de declaraciones y pagos SisGAT.",
    );
  }

  const filasOriginales = registros
    .slice(1)
    .map(
      (fila) =>
        limpiarFila(
          fila,
          COLUMNAS_DECLARACIONES,
        ),
    )
    .filter(
      (fila) =>
        !esFilaResumen(fila),
    )
    .filter(
      (fila) =>
        fila.some(
          (valor) => valor !== "",
        ),
    );

  const recuperacion =
    recuperarIdentidadesDeclaracionesSisgat(
      filasOriginales,
    );

  const errores:
    ErrorArchivoAnalizado[] = [];

  const declaraciones =
    new Set<string>();
  const recibos =
    new Set<string>();

  let filasValidas = 0;

  for (
    let indice = 0;
    indice < recuperacion.filas.length;
    indice += 1
  ) {
    const fila =
      recuperacion.filas[indice];
    const numeroFila = indice + 2;

    try {
      if (
        fila.length !==
        COLUMNAS_DECLARACIONES
      ) {
        throw new Error(
          `La fila contiene ${fila.length} columnas; se esperaban ${COLUMNAS_DECLARACIONES}.`,
        );
      }

      const anioDeclaracion =
        enteroObligatorio(
          fila[0],
          "Año de declaración",
        );

      const numeroDeclaracion =
        fila[1].trim();

      if (!numeroDeclaracion) {
        throw new Error(
          "El número de declaración está vacío.",
        );
      }

      if (
        !normalizarDocumento(
          fila[4],
        )
      ) {
        throw new Error(
          "El DNI/RUC está vacío o no es válido.",
        );
      }

      if (!fila[5].trim()) {
        throw new Error(
          "El nombre o razón social está vacío.",
        );
      }

      if (
        !normalizarPlaca(
          fila[12],
        )
      ) {
        throw new Error(
          "La placa está vacía o no es válida.",
        );
      }

      const tieneRecibo = fila
        .slice(48, 57)
        .some(
          (valor) => valor !== "",
        );

      let claveRecibo:
        string | null = null;

      if (tieneRecibo) {
        const anioRecibo =
          enteroObligatorio(
            fila[48],
            "Año del recibo",
          );

        const numeroRecibo =
          fila[49].trim();

        if (!numeroRecibo) {
          throw new Error(
            "El número de recibo está vacío.",
          );
        }

        numeroObligatorio(
          fila[50],
          "Monto del recibo",
        );
        validarTrimestre(
          fila[51],
        );

        if (!fila[52].trim()) {
          throw new Error(
            "El estado del recibo está vacío.",
          );
        }

        claveRecibo =
          `${anioRecibo}|${numeroRecibo}`;

        if (
          recibos.has(claveRecibo)
        ) {
          throw new Error(
            `El recibo ${anioRecibo}-${numeroRecibo} está duplicado dentro del archivo.`,
          );
        }
      }

      declaraciones.add(
        `${anioDeclaracion}|${numeroDeclaracion}`,
      );

      if (claveRecibo) {
        recibos.add(claveRecibo);
      }

      filasValidas += 1;
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
    totalFilas:
      recuperacion.filas.length,
    filasValidas,
    filasConError:
      recuperacion.filas.length -
      filasValidas,
    totalDeclaraciones:
      declaraciones.size,
    totalRecibos:
      recibos.size,
    errores,
    advertencias:
      recuperacion.advertencias,
  };
}

export async function analizarVersionPagosSisgat(
  input: AnalizarVersionPagosInput,
) {
  const resultado =
    analizarDeclaraciones(
      input.archivo,
    );

  const hashArchivo =
    createHash("sha256")
      .update(input.archivo.buffer)
      .digest("hex");

  const versionAnterior =
    await prisma
      .versionPagosSisgat
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
    throw new ErrorVersionPagosSisgat(
      `Este archivo ya fue analizado en la versión ${versionAnterior.codigo}, cuyo estado es ${versionAnterior.estado}.`,
      409,
    );
  }

  const totalErrores =
    resultado.filasConError;
  const totalAdvertencias =
    resultado.advertencias.length;
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
          totalDeclaraciones:
            resultado
              .totalDeclaraciones,
          totalRecibos:
            resultado.totalRecibos,
          totalErrores,
          totalAdvertencias,
          fechaAnalisis:
            new Date(),
          fechaAplicacion: null,
        };

        if (
          versionAnterior &&
          esReanalisis
        ) {
          await tx
            .archivoVersionPagosSisgat
            .deleteMany({
              where: {
                versionPagosSisgatId:
                  versionAnterior.id,
              },
            });
        }

        const nuevaVersion =
          versionAnterior &&
          esReanalisis
            ? await tx
                .versionPagosSisgat
                .update({
                  where: {
                    id:
                      versionAnterior.id,
                  },
                  data:
                    datosVersion,
                })
            : await tx
                .versionPagosSisgat
                .create({
                  data: {
                    hashArchivo,
                    ...datosVersion,
                  },
                });

        const archivo =
          await tx
            .archivoVersionPagosSisgat
            .create({
              data: {
                versionPagosSisgatId:
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
                  totalDeclaraciones:
                    resultado
                      .totalDeclaraciones,
                  totalRecibos:
                    resultado
                      .totalRecibos,
                  totalAdvertencias,
                  erroresGuardados:
                    resultado
                      .errores.length,
                  advertencias:
                    resultado
                      .advertencias.map(
                        (advertencia) =>
                          advertenciaIdentidadRecuperadaComoJson(
                            advertencia,
                          ),
                      ),
                } satisfies Prisma.InputJsonObject,
              },
            });

        if (
          resultado.errores.length > 0
        ) {
          await tx
            .errorArchivoPagosSisgat
            .createMany({
              data:
                resultado.errores.map(
                  (error) => ({
                    archivoId:
                      archivo.id,
                    fila: error.fila,
                    campo: error.campo,
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
              ? "REANALIZAR_VERSION_PAGOS_SISGAT"
              : "ANALIZAR_VERSION_PAGOS_SISGAT",
            entidad:
              "VERSION_PAGOS_SISGAT",
            entidadId:
              String(nuevaVersion.id),
            resultado:
              totalErrores > 0
                ? "CON_ERRORES"
                : totalAdvertencias > 0
                  ? "CON_ADVERTENCIAS"
                  : "CORRECTO",
            detalles: {
              codigo:
                nuevaVersion.codigo,
              totalDeclaraciones:
                resultado
                  .totalDeclaraciones,
              totalRecibos:
                resultado.totalRecibos,
              totalErrores,
              totalAdvertencias,
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
    requiereRevisionAjustes:
      totalAdvertencias > 0,
    totalAdvertencias,
    advertencias:
      resultado.advertencias,
    reanalisis:
      esReanalisis,
    totales: {
      declaraciones:
        resultado
          .totalDeclaraciones,
      recibos:
        resultado.totalRecibos,
      errores: totalErrores,
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
        resultado.filasConError,
      errores:
        resultado.errores.slice(
          0,
          20,
        ),
      advertencias:
        resultado.advertencias,
    },
  };
}

export async function listarVersionesPagosSisgat() {
  return prisma
    .versionPagosSisgat
    .findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        codigo: true,
        estado: true,
        comentario: true,
        totalDeclaraciones:
          true,
        totalRecibos: true,
        totalErrores: true,
        totalAdvertencias:
          true,
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
            declaraciones:
              true,
          },
        },
      },
    });
}

export async function obtenerVersionPagosSisgat(
  versionPagosSisgatId: number,
) {
  const version =
    await prisma
      .versionPagosSisgat
      .findUnique({
        where: {
          id:
            versionPagosSisgatId,
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
              declaraciones:
                true,
            },
          },
        },
      });

  if (!version) {
    throw new ErrorVersionPagosSisgat(
      "La versión de pagos solicitada no existe.",
      404,
    );
  }

  return version;
}
