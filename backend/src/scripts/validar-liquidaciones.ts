import { readFile } from "node:fs/promises";
import path from "node:path";

import { analizarArchivoLiquidaciones } from "../services/importadores/analizar-liquidaciones";

function imprimirResumen(
  titulo: string,
  valores: Record<string, number>,
): void {
  console.log("");
  console.log(titulo);

  for (const [clave, cantidad] of Object.entries(valores).sort(
    ([a], [b]) => a.localeCompare(b, "es", { numeric: true }),
  )) {
    console.log(`  ${clave}: ${cantidad}`);
  }
}

async function main(): Promise<void> {
  const argumento = process.argv[2] ?? "../Liquidaciones.txt";
  const rutaArchivo = path.resolve(process.cwd(), argumento);
  const nombreArchivo = path.basename(rutaArchivo);
  const buffer = await readFile(rutaArchivo);
  const resultado = analizarArchivoLiquidaciones(buffer, nombreArchivo);

  console.log("");
  console.log("VALIDACIÓN DE LIQUIDACIONES");
  console.log("========================================");
  console.log(`Archivo: ${rutaArchivo}`);
  console.log(`Filas encontradas: ${resultado.totalFilas}`);
  console.log(`Filas válidas: ${resultado.filasValidas}`);
  console.log(`Filas con error: ${resultado.filasConError}`);
  console.log(`Liquidaciones válidas: ${resultado.totalLiquidaciones}`);
  console.log(`Detalles de periodos: ${resultado.totalDetalles}`);
  console.log(`Activas: ${resultado.activas}`);
  console.log(`Anuladas: ${resultado.anuladas}`);

  imprimirResumen("Liquidaciones por año:", resultado.porAnioLiquidacion);
  imprimirResumen(
    "Liquidaciones por cantidad de periodos:",
    resultado.porCantidadPeriodos,
  );

  if (resultado.errores.length > 0) {
    console.log("");
    console.log("ERRORES");
    console.log("========================================");

    for (const error of resultado.errores.slice(0, 20)) {
      console.log(`Fila ${error.fila}: ${error.mensaje}`);
    }

    if (resultado.errores.length > 20) {
      console.log(
        `Se omitieron ${resultado.errores.length - 20} error(es) de la salida.`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("RESULTADO: ARCHIVO VÁLIDO");
  console.log(
    "La validación no modificó PostgreSQL ni importó liquidaciones.",
  );
}

main().catch((error: unknown) => {
  console.error("");
  console.error(
    error instanceof Error ? error.message : "Error desconocido.",
  );
  process.exitCode = 1;
});
