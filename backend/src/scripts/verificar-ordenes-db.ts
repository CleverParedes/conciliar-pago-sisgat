import { EstadoVersionDatos } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";

async function main() {
  const activa =
    await prisma.versionOrdenes.findFirst({
      where: {
        estado:
          EstadoVersionDatos.ACTIVA,
      },
      orderBy: {
        fechaAplicacion: "desc",
      },
      include: {
        archivo: true,
        _count: {
          select: {
            ordenes: true,
            importaciones: true,
          },
        },
      },
    });

  const [
    totalOrdenes,
    totalDetalles,
    totalDeclaraciones,
    totalRecibos,
    totalLiquidaciones,
    totalRequerimientos,
    totalRequerimientosManuales,
  ] = await Promise.all([
    prisma.ordenPago.count(),
    prisma.ordenDetalle.count(),
    prisma.declaracion.count(),
    prisma.reciboPago.count(),
    prisma.liquidacion.count(),
    prisma.requerimiento.count(),
    prisma.requerimientoManual.count(),
  ]);

  console.log("");
  console.log(
    "VERIFICACIÓN ETAPA 9A.3",
  );
  console.log(
    "========================================",
  );

  if (!activa) {
    throw new Error(
      "No existe una versión activa de Órdenes.",
    );
  }

  console.log(
    `Versión activa: #${activa.id}`,
  );
  console.log(
    `Estado: ${activa.estado}`,
  );
  console.log(
    `Archivo: ${activa.archivo?.nombreArchivo ?? "SIN ARCHIVO"}`,
  );
  console.log(
    `Órdenes declaradas: ${activa.totalOrdenes}`,
  );
  console.log(
    `Órdenes relacionadas: ${activa._count.ordenes}`,
  );
  console.log(
    `Órdenes actuales: ${totalOrdenes}`,
  );
  console.log(
    `Detalles declarados: ${activa.totalDetalles}`,
  );
  console.log(
    `Detalles actuales: ${totalDetalles}`,
  );
  console.log(
    `Importaciones: ${activa._count.importaciones}`,
  );
  console.log("");
  console.log(
    "Módulos conservados:",
  );
  console.log(
    `Declaraciones: ${totalDeclaraciones}`,
  );
  console.log(
    `Recibos: ${totalRecibos}`,
  );
  console.log(
    `Liquidaciones: ${totalLiquidaciones}`,
  );
  console.log(
    `Requerimientos SisGAT: ${totalRequerimientos}`,
  );
  console.log(
    `Requerimientos manuales: ${totalRequerimientosManuales}`,
  );

  if (
    activa.totalOrdenes !==
      totalOrdenes ||
    activa.totalDetalles !==
      totalDetalles ||
    activa._count.ordenes !==
      totalOrdenes
  ) {
    throw new Error(
      "Los conteos de la versión activa no coinciden con las órdenes almacenadas.",
    );
  }

  console.log("");
  console.log(
    "RESULTADO: CORRECTO",
  );
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "RESULTADO: ERROR",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
