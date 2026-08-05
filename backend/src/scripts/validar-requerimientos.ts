import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  analizarArchivoRequerimientos,
} from "../services/importadores/analizar-requerimientos";

function imprimirResumen(
  titulo: string,
  valores: Record<string, number>,
): void {
  console.log("");
  console.log(titulo);

  for (
    const [clave, cantidad]
    of Object.entries(valores).sort(
      ([a], [b]) =>
        a.localeCompare(
          b,
          "es",
          {
            numeric: true,
          },
        ),
    )
  ) {
    console.log(
      `  ${clave}: ${cantidad}`,
    );
  }
}

async function main():
Promise<void> {
  const argumento =
    process.argv[2] ??
    "../Requerimientos.txt";

  const rutaArchivo =
    path.resolve(
      process.cwd(),
      argumento,
    );

  const nombreArchivo =
    path.basename(rutaArchivo);

  const buffer =
    await readFile(rutaArchivo);

  const resultado =
    analizarArchivoRequerimientos(
      buffer,
      nombreArchivo,
    );

  console.log("");
  console.log(
    "VALIDACIÓN DE REQUERIMIENTOS",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Archivo: ${rutaArchivo}`,
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
    `Requerimientos válidos: ${resultado.totalRequerimientos}`,
  );
  console.log(
    `Detalles de periodos: ${resultado.totalDetalles}`,
  );
  console.log(
    `Activos: ${resultado.activos}`,
  );
  console.log(
    `Anulados: ${resultado.anulados}`,
  );
  console.log(
    `Advertencias: ${resultado.advertencias.length}`,
  );

  imprimirResumen(
    "Requerimientos por año:",
    resultado
      .porAnioRequerimiento,
  );

  imprimirResumen(
    "Requerimientos por cantidad de periodos:",
    resultado
      .porCantidadPeriodos,
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
        20,
      )
    ) {
      console.log(
        `Fila ${advertencia.fila} [${advertencia.tipo}]: ${advertencia.mensaje}`,
      );
    }

    if (
      resultado.advertencias
        .length > 20
    ) {
      console.log(
        `Se omitieron ${
          resultado.advertencias
            .length - 20
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
        20,
      )
    ) {
      console.log(
        `Fila ${error.fila}: ${error.mensaje}`,
      );
    }

    if (
      resultado.errores.length >
      20
    ) {
      console.log(
        `Se omitieron ${
          resultado.errores
            .length - 20
        } error(es) de la salida.`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log("");

  if (
    resultado.advertencias.length >
    0
  ) {
    console.log(
      "RESULTADO: ARCHIVO VÁLIDO CON ADVERTENCIAS",
    );
  } else {
    console.log(
      "RESULTADO: ARCHIVO VÁLIDO",
    );
  }

  console.log(
    "La validación no modificó PostgreSQL ni importó requerimientos.",
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
