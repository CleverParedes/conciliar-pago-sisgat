import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import {
  analizarArchivoRequerimientosManuales,
} from "../services/importadores/analizar-requerimientos-manuales";

function imprimirResumen(
  titulo: string,
  valores: Record<string, number>,
): void {
  console.log("");
  console.log(titulo);

  for (
    const [clave, cantidad]
    of Object.entries(valores)
  ) {
    console.log(
      `  ${clave}: ${cantidad}`,
    );
  }
}

async function main():
Promise<void> {
  const argumentoArchivo =
    process.argv[2] ??
    "../Requerimientos_Manuales_2026.xlsx";

  const argumentoAnio =
    process.argv[3] ??
    "2026";

  const anioGestion =
    Number(argumentoAnio);

  const rutaArchivo =
    path.resolve(
      process.cwd(),
      argumentoArchivo,
    );

  const nombreArchivo =
    path.basename(rutaArchivo);

  const buffer =
    await readFile(rutaArchivo);

  const resultado =
    await analizarArchivoRequerimientosManuales(
      buffer,
      nombreArchivo,
      anioGestion,
    );

  console.log("");
  console.log(
    "VALIDACIÓN DE REQUERIMIENTOS MANUALES",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Archivo: ${rutaArchivo}`,
  );
  console.log(
    `Hoja analizada: ${resultado.nombreHoja}`,
  );
  console.log(
    `Año de gestión: ${resultado.anioGestion}`,
  );
  console.log(
    `Filas encontradas: ${resultado.totalFilas}`,
  );
  console.log(
    `Filas válidas: ${resultado.filasValidas}`,
  );
  console.log(
    `Filas con error: ${resultado.filasConError}`,
  );
  console.log(
    `Periodos extraídos: ${resultado.totalPeriodos}`,
  );
  console.log(
    `Placas normalizables: ${resultado.placasNormalizables}`,
  );
  console.log(
    `Advertencias: ${resultado.advertencias.length}`,
  );

  imprimirResumen(
    "Tipos de registro:",
    resultado.porTipoRegistro,
  );

  imprimirResumen(
    "Estados manuales normalizados:",
    resultado.porEstadoManual,
  );

  imprimirResumen(
    "Registros por cantidad de periodos:",
    resultado.porCantidadPeriodos,
  );

  if (
    resultado.advertencias.length >
    0
  ) {
    console.log("");
    console.log("ADVERTENCIAS");
    console.log(
      "========================================",
    );

    for (
      const advertencia
      of resultado.advertencias.slice(
        0,
        30,
      )
    ) {
      console.log(
        `Fila ${advertencia.fila} [${advertencia.campo}]: ${advertencia.mensaje}`,
      );
    }

    if (
      resultado.advertencias
        .length > 30
    ) {
      console.log(
        `Se omitieron ${
          resultado.advertencias
            .length - 30
        } advertencia(s) de la salida.`,
      );
    }
  }

  if (
    resultado.errores.length >
    0
  ) {
    console.log("");
    console.log("ERRORES");
    console.log(
      "========================================",
    );

    for (
      const error
      of resultado.errores.slice(
        0,
        30,
      )
    ) {
      console.log(
        `Fila ${error.fila} [${error.campo}]: ${error.mensaje}`,
      );
    }

    if (
      resultado.errores.length >
      30
    ) {
      console.log(
        `Se omitieron ${
          resultado.errores.length -
          30
        } error(es) de la salida.`,
      );
    }

    console.log("");
    console.log(
      "RESULTADO: ARCHIVO CON ERRORES",
    );
    console.log(
      "No se modificó PostgreSQL.",
    );

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log(
    resultado.advertencias.length >
      0
      ? "RESULTADO: ARCHIVO VÁLIDO CON ADVERTENCIAS"
      : "RESULTADO: ARCHIVO VÁLIDO",
  );
  console.log(
    "La validación no modificó PostgreSQL ni importó registros.",
  );
}

main().catch(
  (error: unknown) => {
    console.error("");

    console.error(
      error instanceof Error
        ? error.message
        : "Error desconocido.",
    );

    process.exitCode = 1;
  },
);
