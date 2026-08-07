import { createHash } from "node:crypto";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import {
  analizarArchivoRequerimientosManuales,
} from "./importadores/analizar-requerimientos-manuales";

const MAXIMO_INCIDENCIAS_GUARDADAS =
  2000;

export class ErrorVersionRequerimientosManuales
  extends Error {
  public readonly status: number;

  constructor(
    mensaje: string,
    status = 400,
  ) {
    super(mensaje);
    this.name =
      "ErrorVersionRequerimientosManuales";
    this.status = status;
  }
}

interface AnalizarVersionRequerimientosManualesInput {
  archivo: {
    nombreArchivo: string;
    buffer: Buffer;
  };
  anioGestion?: number;
  usuarioId: number;
  comentario?: string | null;
}

function hashBuffer(
  buffer: Buffer,
): string {
  return createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function incidenciaResumen(
  incidencia: {
    fila: number;
    campo: string;
    nivel: string;
    mensaje: string;
  },
): Prisma.InputJsonObject {
  return {
    fila: incidencia.fila,
    campo: incidencia.campo,
    nivel: incidencia.nivel,
    mensaje: incidencia.mensaje,
  };
}

function datosOriginalesJson(
  datos:
    Record<
      string,
      string | number | boolean | null
    >,
): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(datos).map(
      ([clave, valor]) => [
        clave,
        valor === null
          ? ""
          : valor,
      ],
    ),
  ) as Prisma.InputJsonObject;
}

export async function probarArchivoRequerimientosManuales(
  input: {
    archivo: {
      nombreArchivo: string;
      buffer: Buffer;
    };
    anioGestion?: number;
  },
) {
  const resultado =
    await analizarArchivoRequerimientosManuales(
      input.archivo.buffer,
      input.archivo.nombreArchivo,
      input.anioGestion,
    );

  return {
    id: 0,
    codigo: "PRUEBA",
    estado:
      resultado.filasConError === 0
        ? EstadoVersionDatos.VALIDADA
        : EstadoVersionDatos.FALLIDA,
    anioGestion: resultado.anioGestion,
    fechaAnalisis: new Date(),
    puedeConfirmarse: resultado.filasConError === 0,
    reanalisis: false,
    totales: {
      registros: resultado.filasValidas,
      periodos: resultado.totalPeriodos,
      errores: resultado.filasConError,
      advertencias: resultado.advertencias.length,
      placasNormalizables: resultado.placasNormalizables,
    },
    clasificacion: {
      porTipoRegistro: resultado.porTipoRegistro,
      porEstadoManual: resultado.porEstadoManual,
    },
    archivo: {
      nombre: input.archivo.nombreArchivo,
      hoja: resultado.nombreHoja,
      totalFilas: resultado.totalFilas,
      filasValidas: resultado.filasValidas,
      filasConError: resultado.filasConError,
      errores: resultado.errores.slice(0, 20),
      advertencias: resultado.advertencias,
    },
  };
}

export async function analizarVersionRequerimientosManuales(
  input:
    AnalizarVersionRequerimientosManualesInput,
) {
  const resultado =
    await analizarArchivoRequerimientosManuales(
      input.archivo.buffer,
      input.archivo.nombreArchivo,
      input.anioGestion,
    );

  const hashArchivo =
    hashBuffer(
      input.archivo.buffer,
    );

  /*
   * Prisma 7 espera Bytes como Uint8Array respaldado por ArrayBuffer.
   * Buffer de Node puede estar tipado con ArrayBufferLike, por eso se
   * crea una copia explícita y compatible antes de guardar el Excel.
   */
  const contenidoOriginal =
    new Uint8Array(
      input.archivo.buffer.length,
    );

  contenidoOriginal.set(
    input.archivo.buffer,
  );

  const versionAnterior =
    await prisma
      .versionRequerimientosManuales
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
    throw new ErrorVersionRequerimientosManuales(
      `Este Excel ya fue analizado en la versión ${versionAnterior.codigo}, ` +
        `cuyo estado actual es ${versionAnterior.estado}.`,
      409,
    );
  }

  const estado =
    resultado.filasConError === 0
      ? EstadoVersionDatos.VALIDADA
      : EstadoVersionDatos.FALLIDA;

  const version =
    await prisma.$transaction(
      async (tx) => {
        if (
          versionAnterior &&
          esReanalisis
        ) {
          await tx
            .archivoVersionRequerimientosManuales
            .deleteMany({
              where: {
                versionRequerimientosManualesId:
                  versionAnterior.id,
              },
            });
        }

        const datosVersion = {
          estado,
          usuarioId: input.usuarioId,
          comentario:
            input.comentario
              ?.trim()
              .slice(0, 500) ||
            null,
          anioGestion:
            resultado.anioGestion,
          totalRegistros:
            resultado.filasValidas,
          totalPeriodos:
            resultado.totalPeriodos,
          totalErrores:
            resultado.filasConError,
          totalAdvertencias:
            resultado
              .advertencias
              .length,
          fechaAnalisis:
            new Date(),
          fechaAplicacion:
            null,
        };

        const nuevaVersion =
          versionAnterior &&
          esReanalisis
            ? await tx
                .versionRequerimientosManuales
                .update({
                  where: {
                    id:
                      versionAnterior.id,
                  },
                  data:
                    datosVersion,
                })
            : await tx
                .versionRequerimientosManuales
                .create({
                  data: {
                    hashArchivo,
                    ...datosVersion,
                  },
                });

        const archivo =
          await tx
            .archivoVersionRequerimientosManuales
            .create({
              data: {
                versionRequerimientosManualesId:
                  nuevaVersion.id,
                nombreArchivo:
                  input.archivo
                    .nombreArchivo,
                nombreHoja:
                  resultado.nombreHoja,
                hashArchivo,
                contenidoOriginal,
                tamanoOriginal:
                  input.archivo
                    .buffer.length,
                totalFilas:
                  resultado.totalFilas,
                filasValidas:
                  resultado.filasValidas,
                filasConError:
                  resultado
                    .filasConError,
                resumen: {
                  anioGestion:
                    resultado.anioGestion,
                  totalPeriodos:
                    resultado.totalPeriodos,
                  placasNormalizables:
                    resultado
                      .placasNormalizables,
                  porTipoRegistro:
                    resultado
                      .porTipoRegistro,
                  porEstadoManual:
                    resultado
                      .porEstadoManual,
                  porCantidadPeriodos:
                    resultado
                      .porCantidadPeriodos,
                  erroresGuardados:
                    Math.min(
                      resultado
                        .errores.length,
                      MAXIMO_INCIDENCIAS_GUARDADAS,
                    ),
                  advertenciasGuardadas:
                    Math.min(
                      resultado
                        .advertencias
                        .length,
                      MAXIMO_INCIDENCIAS_GUARDADAS,
                    ),
                  advertencias:
                    resultado
                      .advertencias
                      .slice(0, 100)
                      .map(
                        incidenciaResumen,
                      ),
                } satisfies Prisma.InputJsonObject,
              },
            });

        const incidencias = [
          ...resultado.errores,
          ...resultado.advertencias,
        ].slice(
          0,
          MAXIMO_INCIDENCIAS_GUARDADAS,
        );

        if (
          incidencias.length > 0
        ) {
          await tx
            .errorArchivoRequerimientoManual
            .createMany({
              data:
                incidencias.map(
                  (
                    incidencia,
                  ) => ({
                    archivoId:
                      archivo.id,
                    fila:
                      incidencia.fila,
                    campo:
                      incidencia.campo,
                    nivel:
                      incidencia.nivel,
                    mensaje:
                      incidencia.mensaje,
                    datosOriginales:
                      datosOriginalesJson(
                        incidencia
                          .datosOriginales,
                      ),
                  }),
                ),
            });
        }

        await tx.auditoria.create({
          data: {
            usuarioId:
              input.usuarioId,
            accion:
              esReanalisis
                ? "REANALIZAR_VERSION_REQUERIMIENTOS_MANUALES"
                : "ANALIZAR_VERSION_REQUERIMIENTOS_MANUALES",
            entidad:
              "VERSION_REQUERIMIENTOS_MANUALES",
            entidadId:
              String(
                nuevaVersion.id,
              ),
            resultado:
              resultado
                .filasConError > 0
                ? "CON_ERRORES"
                : "CORRECTO",
            detalles: {
              codigo:
                nuevaVersion.codigo,
              anioGestion:
                resultado.anioGestion,
              totalRegistros:
                resultado.filasValidas,
              totalPeriodos:
                resultado.totalPeriodos,
              totalErrores:
                resultado
                  .filasConError,
              totalAdvertencias:
                resultado
                  .advertencias.length,
              porTipoRegistro:
                resultado
                  .porTipoRegistro,
              reanalisis:
                esReanalisis,
            } satisfies Prisma.InputJsonObject,
          },
        });

        return nuevaVersion;
      },
      {
        maxWait: 10000,
        timeout: 120000,
      },
    );

  return {
    id: version.id,
    codigo: version.codigo,
    estado: version.estado,
    anioGestion: version.anioGestion,
    fechaAnalisis:
      version.fechaAnalisis,
    puedeConfirmarse:
      resultado.filasConError ===
      0,
    reanalisis:
      esReanalisis,
    totales: {
      registros:
        resultado.filasValidas,
      periodos:
        resultado.totalPeriodos,
      errores:
        resultado.filasConError,
      advertencias:
        resultado
          .advertencias.length,
      placasNormalizables:
        resultado
          .placasNormalizables,
    },
    clasificacion: {
      porTipoRegistro:
        resultado
          .porTipoRegistro,
      porEstadoManual:
        resultado
          .porEstadoManual,
    },
    archivo: {
      nombre:
        input.archivo
          .nombreArchivo,
      hoja:
        resultado.nombreHoja,
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

export async function listarVersionesRequerimientosManuales() {
  return prisma
    .versionRequerimientosManuales
    .findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        codigo: true,
        estado: true,
        comentario: true,
        anioGestion: true,
        totalRegistros: true,
        totalPeriodos: true,
        totalErrores: true,
        totalAdvertencias: true,
        fechaAnalisis: true,
        fechaAplicacion: true,
        createdAt: true,
        usuario: {
          select: {
            id: true,
            nombre: true,
            nombreUsuario: true,
          },
        },
        archivo: {
          select: {
            id: true,
            nombreArchivo: true,
            nombreHoja: true,
            tamanoOriginal: true,
            totalFilas: true,
            filasValidas: true,
            filasConError: true,
            resumen: true,
          },
        },
      },
    });
}


