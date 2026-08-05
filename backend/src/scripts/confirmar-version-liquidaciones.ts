import { prisma } from "../lib/prisma";
import { confirmarVersionLiquidaciones } from "../services/confirmar-version-liquidaciones.service";

async function main(): Promise<void> {
  const versionLiquidacionesId = Number(process.argv[2]);
  const nombreUsuario = process.argv[3] ?? "admin";

  if (!Number.isInteger(versionLiquidacionesId) || versionLiquidacionesId <= 0) {
    throw new Error(
      "Debes indicar el ID válido de la versión de liquidaciones.",
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
  console.log(`Versión a confirmar: ${versionLiquidacionesId}`);

  const resultado = await confirmarVersionLiquidaciones({
    versionLiquidacionesId,
    usuarioId: administrador.id,
  });

  console.log("");
  console.log("VERSIÓN DE LIQUIDACIONES CONFIRMADA");
  console.log("========================================");
  console.log(`Estado: ${resultado.version.estado}`);
  console.log(`Liquidaciones: ${resultado.totales.liquidaciones}`);
  console.log(`Detalles: ${resultado.totales.detalles}`);
  console.log(
    `Conciliadas: ${resultado.conciliacion.liquidacionesProcesadas}`,
  );
  console.log("");
  console.log("Resumen de liquidaciones:");

  for (const [estado, cantidad] of Object.entries(
    resultado.conciliacion.resumenLiquidaciones,
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
