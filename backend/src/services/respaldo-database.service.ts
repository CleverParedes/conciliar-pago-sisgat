import { createHash } from "node:crypto";

import { spawn } from "node:child_process";

import { createReadStream } from "node:fs";

import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";

import path from "node:path";

import type { Prisma } from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";

export type MotivoRespaldo =
  | "CONFIRMAR_VERSION_DATOS"
  | "CONFIRMAR_VERSION_PAGOS_SISGAT"
  | "CONFIRMAR_VERSION_ORDENES"
  | "RESTAURAR_VERSION_DATOS"
  | "CONFIRMAR_VERSION_LIQUIDACIONES"
  | "RESTAURAR_VERSION_LIQUIDACIONES"
  | "CONFIRMAR_VERSION_REQUERIMIENTOS"
  | "RESTAURAR_VERSION_REQUERIMIENTOS"
  | "CONFIRMAR_VERSION_REQUERIMIENTOS_MANUALES"
  | "RESTAURAR_VERSION_REQUERIMIENTOS_MANUALES"
  | "CONCILIAR_REQUERIMIENTOS_MANUALES"
  | "RECONCILIAR_REQUERIMIENTOS_MANUALES_TRES_ANIOS"
  | "RECONCILIAR_LIQUIDACIONES_COBERTURA";

interface CrearRespaldoInput {
  usuarioId: number;
  versionDatosId?: number;
  versionPagosSisgatId?: number;
  versionOrdenesId?: number;
  versionLiquidacionesId?: number;
  versionRequerimientosId?: number;
  versionRequerimientosManualesId?: number;
  motivo: MotivoRespaldo;
}

interface ConexionPostgres {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  sslMode: string | null;
}

export interface ResultadoRespaldo {
  nombreArchivo: string;
  rutaContenedor: string;
  tamanoBytes: number;
  sha256: string;
  fechaCreacion: string;
}

function obtenerMensajeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Error desconocido.";
}

function obtenerConexionPostgres(): ConexionPostgres {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("No se encontró DATABASE_URL para crear el respaldo.");
  }

  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL no contiene una dirección válida.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL no corresponde a PostgreSQL.");
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  const user = decodeURIComponent(url.username);

  if (!url.hostname) {
    throw new Error("DATABASE_URL no contiene el servidor de PostgreSQL.");
  }

  if (!database) {
    throw new Error("DATABASE_URL no contiene el nombre de la base de datos.");
  }

  if (!user) {
    throw new Error("DATABASE_URL no contiene el usuario de PostgreSQL.");
  }

  return {
    host: url.hostname,

    port: url.port || "5432",

    database,

    user,

    password: decodeURIComponent(url.password),

    sslMode: url.searchParams.get("sslmode"),
  };
}

function obtenerDirectorioRespaldos(): string {
  const configurado = process.env.BACKUP_DIR?.trim();

  if (configurado) {
    return path.resolve(configurado);
  }

  return path.resolve(process.cwd(), "../backups/database");
}

function obtenerLimiteRespaldos(): number {
  const valor = Number(process.env.BACKUP_RETENTION_COUNT ?? 20);

  if (!Number.isInteger(valor) || valor < 1) {
    return 20;
  }

  return Math.min(valor, 200);
}

function crearMarcaTiempo(fecha: Date): string {
  return fecha.toISOString().replace(/[-:.]/g, "");
}

function nombreMotivo(motivo: MotivoRespaldo): string {
  switch (motivo) {
    case "CONFIRMAR_VERSION_DATOS":
      return "confirmar";
    case "CONFIRMAR_VERSION_PAGOS_SISGAT":
      return "confirmar_pagos_sisgat";
    case "CONFIRMAR_VERSION_ORDENES":
      return "confirmar_ordenes";
    case "RESTAURAR_VERSION_DATOS":
      return "restaurar";
    case "CONFIRMAR_VERSION_LIQUIDACIONES":
      return "confirmar_liquidaciones";
    case "RESTAURAR_VERSION_LIQUIDACIONES":
      return "restaurar_liquidaciones";
    case "CONFIRMAR_VERSION_REQUERIMIENTOS":
      return "confirmar_requerimientos";
    case "RESTAURAR_VERSION_REQUERIMIENTOS":
      return "restaurar_requerimientos";
    case "CONFIRMAR_VERSION_REQUERIMIENTOS_MANUALES":
      return "confirmar_requerimientos_manuales";
    case "RESTAURAR_VERSION_REQUERIMIENTOS_MANUALES":
      return "restaurar_requerimientos_manuales";
    case "CONCILIAR_REQUERIMIENTOS_MANUALES":
      return "conciliar_requerimientos_manuales";
    case "RECONCILIAR_REQUERIMIENTOS_MANUALES_TRES_ANIOS":
      return "reconciliar_requerimientos_manuales_tres_anios";
    case "RECONCILIAR_LIQUIDACIONES_COBERTURA":
      return "reconciliar_liquidaciones_cobertura";
  }
}

function obtenerReferenciaRespaldo(input: CrearRespaldoInput): {
  id: number;
  entidad:
    | "VERSION_DATOS"
    | "VERSION_PAGOS_SISGAT"
    | "VERSION_ORDENES"
    | "VERSION_LIQUIDACIONES"
    | "VERSION_REQUERIMIENTOS"
    | "VERSION_REQUERIMIENTOS_MANUALES";
} {
  if (input.versionRequerimientosManualesId !== undefined) {
    return {
      id: input.versionRequerimientosManualesId,
      entidad: "VERSION_REQUERIMIENTOS_MANUALES",
    };
  }

  if (input.versionRequerimientosId !== undefined) {
    return {
      id: input.versionRequerimientosId,
      entidad: "VERSION_REQUERIMIENTOS",
    };
  }

  if (input.versionOrdenesId !== undefined) {
    return {
      id: input.versionOrdenesId,
      entidad: "VERSION_ORDENES",
    };
  }

  if (input.versionPagosSisgatId !== undefined) {
    return {
      id: input.versionPagosSisgatId,
      entidad: "VERSION_PAGOS_SISGAT",
    };
  }

  if (input.versionLiquidacionesId !== undefined) {
    return {
      id: input.versionLiquidacionesId,
      entidad: "VERSION_LIQUIDACIONES",
    };
  }

  if (input.versionDatosId !== undefined) {
    return {
      id: input.versionDatosId,
      entidad: "VERSION_DATOS",
    };
  }

  throw new Error(
    "No se indicó la versión asociada al respaldo automático.",
  );
}

function ejecutarComando(
  comando: string,
  argumentos: string[],
  variables: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(comando, argumentos, {
      env: {
        ...process.env,
        ...variables,
      },

      stdio: ["ignore", "ignore", "pipe"],
    });

    let salidaError = "";

    proceso.stderr?.setEncoding("utf8");

    proceso.stderr?.on("data", (fragmento: string) => {
      salidaError += fragmento;

      if (salidaError.length > 20000) {
        salidaError = salidaError.slice(-20000);
      }
    });

    proceso.on("error", (error) => {
      reject(error);
    });

    proceso.on("close", (codigo) => {
      if (codigo === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          salidaError.trim() || `${comando} terminó con el código ${codigo}.`,
        ),
      );
    });
  });
}

function calcularHashArchivo(rutaArchivo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");

    const lectura = createReadStream(rutaArchivo);

    lectura.on("data", (fragmento) => {
      hash.update(fragmento);
    });

    lectura.on("error", reject);

    lectura.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

async function eliminarSeguro(rutaArchivo: string): Promise<void> {
  try {
    await unlink(rutaArchivo);
  } catch {
    // El archivo puede no existir.
  }
}

async function limpiarRespaldosAntiguos(
  directorio: string,
  limite: number,
): Promise<void> {
  const entradas = await readdir(directorio, {
    withFileTypes: true,
  });

  const respaldos: {
    ruta: string;
    fecha: number;
  }[] = [];

  for (const entrada of entradas) {
    if (
      !entrada.isFile() ||
      !entrada.name.startsWith("sistema_pagos_auto_") ||
      !entrada.name.endsWith(".dump")
    ) {
      continue;
    }

    const ruta = path.join(directorio, entrada.name);

    const informacion = await stat(ruta);

    respaldos.push({
      ruta,
      fecha: informacion.mtimeMs,
    });
  }

  respaldos.sort((a, b) => b.fecha - a.fecha);

  const sobrantes = respaldos.slice(limite);

  for (const respaldo of sobrantes) {
    await eliminarSeguro(respaldo.ruta);
  }
}

export async function crearRespaldoDatabase(
  input: CrearRespaldoInput,
): Promise<ResultadoRespaldo> {
  const fechaCreacion = new Date();

  const referencia = obtenerReferenciaRespaldo(input);

  const conexion = obtenerConexionPostgres();

  const directorio = obtenerDirectorioRespaldos();

  const nombreArchivo =
    [
      "sistema_pagos_auto",
      crearMarcaTiempo(fechaCreacion),
      nombreMotivo(input.motivo),
      `v${referencia.id}`,
    ].join("_") + ".dump";

  const rutaFinal = path.join(directorio, nombreArchivo);

  const rutaTemporal = `${rutaFinal}.tmp`;

  const variables: NodeJS.ProcessEnv = {
    PGPASSWORD: conexion.password,
  };

  if (conexion.sslMode) {
    variables.PGSSLMODE = conexion.sslMode;
  }

  try {
    await mkdir(directorio, {
      recursive: true,
    });

    await eliminarSeguro(rutaTemporal);

    await ejecutarComando(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--host",
        conexion.host,
        "--port",
        conexion.port,
        "--username",
        conexion.user,
        "--file",
        rutaTemporal,
        "--dbname",
        conexion.database,
      ],
      variables,
    );

    const informacionTemporal = await stat(rutaTemporal);

    if (informacionTemporal.size < 1024) {
      throw new Error("El archivo generado está vacío o es demasiado pequeño.");
    }

    /*
     * pg_restore --list comprueba que el
     * archivo sea un respaldo válido en
     * formato personalizado.
     */
    await ejecutarComando("pg_restore", ["--list", rutaTemporal], variables);

    await rename(rutaTemporal, rutaFinal);

    const informacionFinal = await stat(rutaFinal);

    const sha256 = await calcularHashArchivo(rutaFinal);

    const resultado: ResultadoRespaldo = {
      nombreArchivo,

      rutaContenedor: rutaFinal,

      tamanoBytes: informacionFinal.size,

      sha256,

      fechaCreacion: fechaCreacion.toISOString(),
    };

    /*
     * El respaldo debe quedar registrado.
     * Si la auditoría falla, se elimina el
     * archivo y se bloquea la operación.
     */
    await prisma.auditoria.create({
      data: {
        usuarioId: input.usuarioId,

        accion: "CREAR_RESPALDO_AUTOMATICO",

        entidad: referencia.entidad,

        entidadId: String(referencia.id),

        resultado: "CORRECTO",

        detalles: {
          motivo: input.motivo,

          nombreArchivo: resultado.nombreArchivo,

          rutaContenedor: resultado.rutaContenedor,

          tamanoBytes: resultado.tamanoBytes,

          sha256: resultado.sha256,

          fechaCreacion: resultado.fechaCreacion,

          formato: "POSTGRESQL_CUSTOM",

          herramienta: "pg_dump 17",
        } satisfies Prisma.InputJsonObject,
      },
    });

    /*
     * La limpieza de copias antiguas no
     * invalida un respaldo ya comprobado.
     */
    try {
      await limpiarRespaldosAntiguos(directorio, obtenerLimiteRespaldos());
    } catch (errorLimpieza) {
      console.error(
        "No se pudieron limpiar los respaldos antiguos:",
        errorLimpieza,
      );
    }

    return resultado;
  } catch (error) {
    await eliminarSeguro(rutaTemporal);

    await eliminarSeguro(rutaFinal);

    try {
      await prisma.auditoria.create({
        data: {
          usuarioId: input.usuarioId,

          accion: "CREAR_RESPALDO_AUTOMATICO",

          entidad: referencia.entidad,

          entidadId: String(referencia.id),

          resultado: "ERROR",

          detalles: {
            motivo: input.motivo,

            mensaje: obtenerMensajeError(error),
          } satisfies Prisma.InputJsonObject,
        },
      });
    } catch (errorAuditoria) {
      console.error(
        "No se pudo registrar el error del respaldo automático:",
        errorAuditoria,
      );
    }

    throw new Error(
      `No se pudo crear el respaldo automático: ${obtenerMensajeError(error)}`,
    );
  }
}