import { prisma } from "../lib/prisma";
import { confirmarVersionRequerimientos } from "../services/confirmar-version-requerimientos.service";

async function main(): Promise<void> {
  const versionRequerimientosId = Number(process.argv[2]);
  const nombreUsuario = process.argv[3] ?? "admin";

  if (!Number.isInteger(versionRequerimientosId) || versionRequerimientosId <= 0) {
    throw new Error(
      "Debes indicar el ID válido de la versión de requerimientos.",
    );
  }

  const administrador = await prisma.usuario.findFirst({
    where: {
      nombreUsuario,
      rol: "ADMINISTRADOR",
      estado: "ACTIVO",
    },
    select: {
      id: true,
      nombreUsuario: true,
    },
  });

  if (!administrador) {
    throw new Error(
      `No se encontró un administrador activo con usuario "${nombreUsuario}".`,
    );
  }

  console.log("");
  console.log("Se creará un respaldo automático antes de importar.");
  console.log(`Versión a confirmar: ${versionRequerimientosId}`);

  const resultado = await confirmarVersionRequerimientos({
    versionRequerimientosId,
    usuarioId: administrador.id,
  });

  console.log("");
  console.log("VERSIÓN DE REQUERIMIENTOS CONFIRMADA");
  console.log("========================================");
  console.log(`Estado: ${resultado.version.estado}`);
  console.log(`Requerimientos: ${resultado.totales.requerimientos}`);
  console.log(`Detalles: ${resultado.totales.detalles}`);
  console.log(
    `Conciliadas: ${resultado.conciliacion.requerimientosProcesadas}`,
  );
  console.log("");
  console.log("Resumen de requerimientos:");

  for (const [estado, cantidad] of Object.entries(
    resultado.conciliacion.resumenRequerimientos,
  ).sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${estado}: ${cantidad}`);
  }
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
