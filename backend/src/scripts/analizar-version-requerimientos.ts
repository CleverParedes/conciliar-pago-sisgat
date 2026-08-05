import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { analizarVersionRequerimientos } from "../services/versiones-requerimientos.service";

async function main(): Promise<void> {
  const argumentoArchivo = process.argv[2] ?? "../Requerimientos.txt";
  const nombreUsuario = process.argv[3] ?? "admin";
  const rutaArchivo = path.resolve(process.cwd(), argumentoArchivo);

  const administrador = await prisma.usuario.findFirst({
    where: {
      nombreUsuario,
      rol: "ADMINISTRADOR",
      estado: "ACTIVO",
    },
    select: {
      id: true,
      nombre: true,
      nombreUsuario: true,
    },
  });

  if (!administrador) {
    throw new Error(
      `No se encontró un administrador activo con usuario "${nombreUsuario}".`,
    );
  }

  const buffer = await readFile(rutaArchivo);
  const resultado = await analizarVersionRequerimientos({
    archivo: {
      nombreArchivo: path.basename(rutaArchivo),
      buffer,
    },
    usuarioId: administrador.id,
    comentario: "Carga inicial del módulo de requerimientos",
  });

  console.log("");
  console.log("VERSIÓN DE REQUERIMIENTOS ANALIZADA");
  console.log("========================================");
  console.log(`Administrador: ${administrador.nombreUsuario}`);
  console.log(`Versión ID: ${resultado.id}`);
  console.log(`Código: ${resultado.codigo}`);
  console.log(`Estado: ${resultado.estado}`);
  console.log(`Requerimientos: ${resultado.totales.requerimientos}`);
  console.log(`Detalles: ${resultado.totales.detalles}`);
  console.log(`Errores: ${resultado.totales.errores}`);
  console.log(
    `Advertencias: ${resultado.archivo.advertencias.length}`,
  );
  console.log(`Puede confirmarse: ${resultado.puedeConfirmarse ? "Sí" : "No"}`);
}

main()
  .catch((error: unknown) => {
    console.error("");
    console.error(error instanceof Error ? error.message : "Error desconocido.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
