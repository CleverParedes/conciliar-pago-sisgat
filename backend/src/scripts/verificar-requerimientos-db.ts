import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const [
    totalRequerimientos,
    totalDetalles,
    estados,
    versiones,
    ordenes,
    liquidaciones,
    declaraciones,
    recibos,
  ] = await Promise.all([
    prisma.requerimiento.count(),
    prisma.requerimientoDetalle.count(),
    prisma.requerimiento.groupBy({
      by: ["estado"],
      _count: {
        _all: true,
      },
      orderBy: {
        estado: "asc",
      },
    }),
    prisma.versionRequerimientos.findMany({
      orderBy: {
        id: "asc",
      },
      select: {
        id: true,
        estado: true,
        totalRequerimientos: true,
        totalDetalles: true,
        fechaAplicacion: true,
      },
    }),
    prisma.ordenPago.count(),
    prisma.liquidacion.count(),
    prisma.declaracion.count(),
    prisma.reciboPago.count(),
  ]);

  console.log("");
  console.log("VERIFICACIÓN DEL MÓDULO DE REQUERIMIENTOS");
  console.log("========================================");
  console.log(`Requerimientos: ${totalRequerimientos}`);
  console.log(`Detalles: ${totalDetalles}`);
  console.log(`Órdenes conservadas: ${ordenes}`);
  console.log(`Liquidaciones conservadas: ${liquidaciones}`);
  console.log(`Declaraciones conservadas: ${declaraciones}`);
  console.log(`Recibos conservados: ${recibos}`);
  console.log("");
  console.log("Estados:");

  for (const item of estados) {
    console.log(`  ${item.estado}: ${item._count._all}`);
  }

  console.log("");
  console.log("Versiones:");

  for (const version of versiones) {
    console.log(
      `  #${version.id} ${version.estado} | ` +
        `${version.totalRequerimientos} requerimientos | ` +
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
