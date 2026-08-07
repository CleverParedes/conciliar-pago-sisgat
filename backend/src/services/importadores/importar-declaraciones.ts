import { createHash } from "node:crypto";

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

import { leerReporteDeclaracionesPagosSisgat } from "./lector-reporte-sisgat";

import {
  advertenciaIdentidadRecuperadaComoJson,
  MARCADOR_DNI_RUC,
  recuperarIdentidadesDeclaracionesSisgat,
  type AdvertenciaIdentidadRecuperada,
} from "./recuperar-identidades-sisgat";

const TOTAL_COLUMNAS_REALES = 57;

interface ResultadoImportacion {
  importacionId: number;
  totalFilas: number;
  filasCorrectas: number;
  filasConError: number;
  ajustesAutomaticos: number;
  estado: EstadoImportacion;
}

interface TrimestreDetectado {
  desde: number;
  hasta: number;
  original: string;
}

function limpiarFila(fila: unknown[]): string[] {
  const resultado = fila.map((valor) => String(valor ?? "").trim());

  /*
   * Las filas normales terminan con |.
   * Esto genera una última columna vacía.
   */
  if (
    resultado.length === TOTAL_COLUMNAS_REALES + 1 &&
    resultado.at(-1) === ""
  ) {
    resultado.pop();
  }

  return resultado;
}

function esFilaResumen(fila: string[]): boolean {
  const primerosCamposVacios = fila.slice(0, 5).every((valor) => valor === "");

  const valoresNoVacios = fila.filter((valor) => valor !== "");

  return primerosCamposVacios && valoresNoVacios.length <= 1;
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function normalizarDocumento(valor: string): string {
  if (normalizarTexto(valor) === normalizarTexto(MARCADOR_DNI_RUC)) {
    return MARCADOR_DNI_RUC;
  }

  return valor.replace(/\D/g, "");
}

function documentoSinIdentidad(documento: string): boolean {
  return documento === MARCADOR_DNI_RUC;
}

function codigoContribuyenteSinDocumento(
  anioDeclaracion: number,
  numeroDeclaracion: string,
): string {
  const huella = createHash("sha256")
    .update(`${anioDeclaracion}|${numeroDeclaracion}`)
    .digest("hex")
    .slice(0, 18);

  return `SISGAT-SD-${huella}`;
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

function obtenerTipoDocumento(documento: string): string {
  if (documento.length === 8) {
    return "DNI";
  }

  if (documento.length === 11) {
    return "RUC";
  }

  return "OTRO";
}

function numeroOpcional(valor: string): number | null {
  const texto = valor.replace(/,/g, "").trim();

  if (!texto) {
    return null;
  }

  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : null;
}

function numeroObligatorio(valor: string, campo: string): number {
  const numero = numeroOpcional(valor);

  if (numero === null) {
    throw new Error(`El campo "${campo}" no contiene un número válido.`);
  }

  return numero;
}

function enteroOpcional(valor: string): number | null {
  const numero = numeroOpcional(valor);

  if (numero === null || !Number.isInteger(numero)) {
    return null;
  }

  return numero;
}

function enteroObligatorio(valor: string, campo: string): number {
  const numero = numeroObligatorio(valor, campo);

  if (!Number.isInteger(numero)) {
    throw new Error(`El campo "${campo}" debe ser entero.`);
  }

  return numero;
}

function fechaHoraDesdeTexto(valor: string): Date | null {
  const texto = valor.trim();

  if (!texto) {
    return null;
  }

  const coincidencia =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(
      texto,
    );

  if (!coincidencia) {
    return null;
  }

  const dia = Number(coincidencia[1]);

  const mes = Number(coincidencia[2]);

  const anio = Number(coincidencia[3]);

  const hora = Number(coincidencia[4] ?? 0);

  const minuto = Number(coincidencia[5] ?? 0);

  const segundo = Number(coincidencia[6] ?? 0);

  const fecha = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo));

  const valida =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia;

  return valida ? fecha : null;
}

function interpretarTrimestre(valor: string): TrimestreDetectado {
  const texto = valor.trim().replace(/\s+/g, "");

  const coincidencia = /^\[([1-4])(?:-([1-4]))?\]$/.exec(texto);

  if (!coincidencia) {
    throw new Error(`No se pudo interpretar el trimestre "${valor}".`);
  }

  const desde = Number(coincidencia[1]);

  const hasta = Number(coincidencia[2] ?? coincidencia[1]);

  if (desde > hasta) {
    throw new Error(`El trimestre "${valor}" tiene un rango inválido.`);
  }

  return {
    desde,
    hasta,
    original: texto,
  };
}

function estadoReciboActivo(valor: string): boolean {
  return normalizarTexto(valor) === "ACTIVO";
}

function combinarObservaciones(
  observacion: string,
  observacionAdministrativa: string,
): string | null {
  const valores = [observacion.trim(), observacionAdministrativa.trim()].filter(
    Boolean,
  );

  return valores.length > 0 ? valores.join(" | ") : null;
}

function datosOriginalesComoJson(
  fila: string[],
  advertencia?: AdvertenciaIdentidadRecuperada,
): Prisma.InputJsonObject {
  return {
    anioDeclaracion: fila[0] ?? "",

    numeroDeclaracion: fila[1] ?? "",

    anioRecepcion: fila[2] ?? "",

    numeroRecepcion: fila[3] ?? "",

    dniRuc: fila[4] ?? "",

    nombresRazonSocial: fila[5] ?? "",

    direccionFiscal: fila[6] ?? "",

    placa: fila[12] ?? "",

    fechaInscripcion: fila[16] ?? "",

    anioFabricacion: fila[17] ?? "",

    valorReferencial: fila[32] ?? "",

    baseImponible: fila[35] ?? "",

    tasa: fila[36] ?? "",

    impuestoAnual: fila[37] ?? "",

    impuestoTrimestral: fila[38] ?? "",

    observacion: fila[39] ?? "",

    observacionAdministrativa: fila[40] ?? "",

    anioRecibo: fila[48] ?? "",

    numeroRecibo: fila[49] ?? "",

    montoRecibo: fila[50] ?? "",

    trimestre: fila[51] ?? "",

    estadoRecibo: fila[52] ?? "",

    ajusteAutomatico: advertencia
      ? advertenciaIdentidadRecuperadaComoJson(advertencia)
      : null,
  };
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Error desconocido durante la importación.";
}

/*
 * Cuando existe un cliente transaccional,
 * la fila se ejecuta dentro de esa misma
 * transacción.
 *
 * Cuando no existe, se conserva el
 * funcionamiento anterior: una transacción
 * independiente por fila.
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

export async function importarDeclaracionesDesdeBuffer(
  buffer: Buffer,
  nombreArchivo: string,
  opciones: OpcionesImportacion,
  contexto: ContextoImportacion = {},
): Promise<ResultadoImportacion> {
  const cliente = contexto.cliente ?? prisma;

  const registros = leerReporteDeclaracionesPagosSisgat(buffer, nombreArchivo);

  if (registros.length < 2) {
    throw new Error("El archivo no contiene registros para importar.");
  }

  /*
   * El encabezado está desplazado
   * en el archivo original.
   *
   * Se validan campos importantes
   * para comprobar el tipo de archivo.
   */
  const cabecera = registros[0].map((valor) =>
    normalizarTexto(String(valor ?? "")),
  );

  const esArchivoCorrecto =
    cabecera[0] === "ANO" &&
    cabecera[1] === "DECLARA" &&
    cabecera[5] === "DNI RUC CONTRIBUYENTE" &&
    cabecera[13] === "PLACA" &&
    cabecera[50] === "NUMERO REC";

  if (!esArchivoCorrecto) {
    throw new Error(
      "El archivo seleccionado no tiene la estructura esperada de declaraciones y pagos.",
    );
  }

  const filasOriginales = registros
    .slice(1)
    .map(limpiarFila)
    .filter((fila) => !esFilaResumen(fila))
    .filter((fila) => fila.some((valor) => valor !== ""));

  const recuperacion = recuperarIdentidadesDeclaracionesSisgat(filasOriginales);

  const filas = recuperacion.filas;

  const advertenciasPorFila = new Map(
    recuperacion.advertencias.map((advertencia) => [
      advertencia.fila,
      advertencia,
    ]),
  );

  const hashArchivo = createHash("sha256").update(buffer).digest("hex");

  /*
   * Durante la confirmación versionada
   * los archivos ya fueron analizados y
   * almacenados previamente.
   */
  const importacionAnterior = contexto.permitirArchivoDuplicado
    ? null
    : await cliente.importacion.findFirst({
        where: {
          hashArchivo,

          tipo: TipoImportacion.DECLARACIONES_PAGOS,

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
      tipo: TipoImportacion.DECLARACIONES_PAGOS,

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

      ...(contexto.versionPagosSisgatId !== undefined
        ? {
            versionPagosSisgatId:
              contexto.versionPagosSisgatId,
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

    const filaOriginal = filasOriginales[indice];

    const numeroFila = indice + 2;

    const datosOriginales = datosOriginalesComoJson(
      filaOriginal,
      advertenciasPorFila.get(numeroFila),
    );

    try {
      if (fila.length !== TOTAL_COLUMNAS_REALES) {
        throw new Error(
          `La fila contiene ${fila.length} columnas; ` +
            `se esperaban ${TOTAL_COLUMNAS_REALES}.`,
        );
      }

      /*
       * Posiciones importantes:
       *
       * 0  año declaración
       * 1  número declaración
       * 2  año recepción
       * 3  número recepción
       * 4  DNI/RUC
       * 5  nombres
       * 6  dirección
       * 12 placa
       * 16 fecha inscripción
       * 17 año fabricación
       * 32 valor referencial
       * 35 base imponible
       * 36 tasa
       * 37 impuesto anual
       * 38 impuesto trimestral
       * 48 año recibo
       * 49 número recibo
       * 50 monto
       * 51 trimestre
       * 52 estado
       */

      const anioDeclaracion = enteroObligatorio(
        fila[0],
        "Año de declaración",
      );

      const numeroDeclaracion = fila[1].trim();

      if (!numeroDeclaracion) {
        throw new Error("El número de declaración está vacío.");
      }

      const anioRecepcion = enteroOpcional(fila[2]);

      const numeroRecepcion = fila[3].trim() || null;

      const documento = normalizarDocumento(fila[4]);

      if (!documento) {
        throw new Error("El DNI/RUC está vacío o no es válido.");
      }

      const nombres = fila[5].trim();

      if (!nombres) {
        throw new Error("El nombre o razón social está vacío.");
      }

      const direccion = fila[6].trim();

      const placa = normalizarPlaca(fila[12]);

      if (!placa) {
        throw new Error("La placa está vacía o no es válida.");
      }

      const tieneDatosDeRecibo = fila
        .slice(48, 57)
        .some((valor) => valor !== "");

      let datosRecibo: {
        anioRecibo: number;
        numeroRecibo: string;
        monto: number;
        trimestre: TrimestreDetectado;
        estadoOriginal: string;
        activo: boolean;
      } | null = null;

      if (tieneDatosDeRecibo) {
        const anioRecibo = enteroObligatorio(fila[48], "Año del recibo");

        const numeroRecibo = fila[49].trim();

        if (!numeroRecibo) {
          throw new Error("El número del recibo está vacío.");
        }

        const monto = numeroObligatorio(fila[50], "Monto del recibo");

        const trimestre = interpretarTrimestre(fila[51]);

        const estadoOriginal = fila[52].trim();

        if (!estadoOriginal) {
          throw new Error("El estado del recibo está vacío.");
        }

        datosRecibo = {
          anioRecibo,
          numeroRecibo,
          monto,
          trimestre,
          estadoOriginal,

          activo: estadoReciboActivo(estadoOriginal),
        };
      }

      await ejecutarOperacionFila(
        contexto.cliente,

        async (tx) => {
          const contribuyente = documentoSinIdentidad(documento)
            ? await tx.contribuyente.upsert({
                where: {
                  codigo: codigoContribuyenteSinDocumento(
                    anioDeclaracion,
                    numeroDeclaracion,
                  ),
                },

                update: {
                  tipoDocumento: "SIN_DNI_RUC",
                  numeroDocumento: null,
                  nombreRazonSocial: nombres,
                  ...(direccion ? { direccion } : {}),
                },

                create: {
                  codigo: codigoContribuyenteSinDocumento(
                    anioDeclaracion,
                    numeroDeclaracion,
                  ),
                  tipoDocumento: "SIN_DNI_RUC",
                  numeroDocumento: null,
                  nombreRazonSocial: nombres,
                  direccion: direccion || null,
                },
              })
            : await tx.contribuyente.upsert({
                where: {
                  numeroDocumento: documento,
                },

                update: {
                  tipoDocumento: obtenerTipoDocumento(documento),
                  nombreRazonSocial: nombres,
                  ...(direccion ? { direccion } : {}),
                },

                create: {
                  tipoDocumento: obtenerTipoDocumento(documento),
                  numeroDocumento: documento,
                  nombreRazonSocial: nombres,
                  direccion: direccion || null,
                },
              });

          const declaracion = await tx.declaracion.upsert({
            where: {
              anioDeclaracion_numeroDeclaracion: {
                anioDeclaracion,
                numeroDeclaracion,
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

              ...(contexto.versionPagosSisgatId !== undefined
                ? {
                    versionPagosSisgat: {
                      connect: {
                        id: contexto.versionPagosSisgatId,
                      },
                    },
                  }
                : {}),

              anioRecepcion,
              numeroRecepcion,

              dniRuc: documento,

              nombresRazonSocial: nombres,

              direccionFiscal: direccion || null,

              placa,

              fechaInscripcion: fechaHoraDesdeTexto(fila[16]),

              anioFabricacion: enteroOpcional(fila[17]),

              valorReferencial: numeroOpcional(fila[32]),

              baseImponible: numeroOpcional(fila[35]),

              tasa: numeroOpcional(fila[36]),

              impuestoAnual: numeroOpcional(fila[37]),

              impuestoTrimestral: numeroOpcional(fila[38]),

              observacion: combinarObservaciones(fila[39], fila[40]),

              estadoConciliacion: EstadoConciliacion.PENDIENTE,

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

              ...(contexto.versionPagosSisgatId !== undefined
                ? {
                    versionPagosSisgat: {
                      connect: {
                        id: contexto.versionPagosSisgatId,
                      },
                    },
                  }
                : {}),

              anioDeclaracion,
              numeroDeclaracion,
              anioRecepcion,
              numeroRecepcion,

              dniRuc: documento,

              nombresRazonSocial: nombres,

              direccionFiscal: direccion || null,

              placa,

              fechaInscripcion: fechaHoraDesdeTexto(fila[16]),

              anioFabricacion: enteroOpcional(fila[17]),

              valorReferencial: numeroOpcional(fila[32]),

              baseImponible: numeroOpcional(fila[35]),

              tasa: numeroOpcional(fila[36]),

              impuestoAnual: numeroOpcional(fila[37]),

              impuestoTrimestral: numeroOpcional(fila[38]),

              observacion: combinarObservaciones(fila[39], fila[40]),

              estadoConciliacion: EstadoConciliacion.PENDIENTE,

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
            },
          });

          if (datosRecibo) {
            await tx.reciboPago.upsert({
              where: {
                anioRecibo_numeroRecibo: {
                  anioRecibo: datosRecibo.anioRecibo,

                  numeroRecibo: datosRecibo.numeroRecibo,
                },
              },

              update: {
                monto: datosRecibo.monto,

                trimestreOriginal: datosRecibo.trimestre.original,

                trimestreDesde: datosRecibo.trimestre.desde,

                trimestreHasta: datosRecibo.trimestre.hasta,

                estadoOriginal: datosRecibo.estadoOriginal,

                activo: datosRecibo.activo,

                usuarioCreacion: fila[53] || null,

                fechaCreacionOrigen: fechaHoraDesdeTexto(fila[54]),

                usuarioModificacion: fila[55] || null,

                fechaModificacionOrigen: fechaHoraDesdeTexto(fila[56]),

                declaracion: {
                  connect: {
                    id: declaracion.id,
                  },
                },
              },

              create: {
                anioRecibo: datosRecibo.anioRecibo,

                numeroRecibo: datosRecibo.numeroRecibo,

                monto: datosRecibo.monto,

                trimestreOriginal: datosRecibo.trimestre.original,

                trimestreDesde: datosRecibo.trimestre.desde,

                trimestreHasta: datosRecibo.trimestre.hasta,

                estadoOriginal: datosRecibo.estadoOriginal,

                activo: datosRecibo.activo,

                usuarioCreacion: fila[53] || null,

                fechaCreacionOrigen: fechaHoraDesdeTexto(fila[54]),

                usuarioModificacion: fila[55] || null,

                fechaModificacionOrigen: fechaHoraDesdeTexto(fila[56]),

                declaracion: {
                  connect: {
                    id: declaracion.id,
                  },
                },
              },
            });
          }
        },
      );

      filasCorrectas += 1;
    } catch (error) {
      filasConError += 1;

      /*
       * Se utiliza el cliente recibido.
       * Así el registro del error forma
       * parte de la transacción general.
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
        `Importación finalizada: ` +
        `${filasCorrectas} filas correctas, ` +
        `${filasConError} filas con error y ` +
        `${recuperacion.advertencias.length} ajuste(s) automático(s) revisado(s).`,
    },
  });

  return {
    importacionId: importacion.id,

    totalFilas: filas.length,

    filasCorrectas,

    filasConError,

    ajustesAutomaticos: recuperacion.advertencias.length,

    estado: estadoFinal,
  };
}