import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const [
    totalLiquidaciones,
    totalDetalles,
    estados,
    estadosDetalles,
    versiones,
    ordenes,
    declaraciones,
    recibos,
  ] = await Promise.all([
    prisma.liquidacion.count(),
    prisma.liquidacionDetalle.count(),
    prisma.liquidacion.groupBy({
      by: ["estado"],
      _count: {
        _all: true,
      },
      orderBy: {
        estado: "asc",
      },
    }),
    prisma.liquidacionDetalle.groupBy({
      by: ["estado"],
      _count: {
        _all: true,
      },
      orderBy: {
        estado: "asc",
      },
    }),
    prisma.versionLiquidaciones.findMany({
      orderBy: {
        id: "asc",
      },
      select: {
        id: true,
        estado: true,
        totalLiquidaciones: true,
        totalDetalles: true,
        fechaAplicacion: true,
      },
    }),
    prisma.ordenPago.count(),
    prisma.declaracion.count(),
    prisma.reciboPago.count(),
  ]);

  console.log("");
  console.log("VERIFICACIÓN DEL MÓDULO DE LIQUIDACIONES");
  console.log("========================================");
  console.log(`Liquidaciones: ${totalLiquidaciones}`);
  console.log(`Detalles: ${totalDetalles}`);
  console.log(`Órdenes conservadas: ${ordenes}`);
  console.log(`Declaraciones conservadas: ${declaraciones}`);
  console.log(`Recibos conservados: ${recibos}`);
  console.log("");
  console.log("Estados:");

  for (const item of estados) {
    console.log(`  ${item.estado}: ${item._count._all}`);
  }

  console.log("");
  console.log("Estados por detalle:");

  for (const item of estadosDetalles) {
    console.log(`  ${item.estado}: ${item._count._all}`);
  }

  console.log("");
  console.log("Versiones:");

  for (const version of versiones) {
    console.log(
      `  #${version.id} ${version.estado} | ` +
        `${version.totalLiquidaciones} liquidaciones | ` +
        `${version.totalDetalles} detalles`,
    );
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
