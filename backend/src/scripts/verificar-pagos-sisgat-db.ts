import { prisma } from "../lib/prisma";

async function main():
Promise<void> {
  const [
    versionActiva,
    declaraciones,
    recibos,
    ordenes,
    liquidaciones,
    requerimientosSisgat,
    requerimientosManuales,
    declaracionesSinVersion,
  ] = await Promise.all([
    prisma
      .versionPagosSisgat
      .findFirst({
        where: {
          estado: "ACTIVA",
        },
        orderBy: {
          fechaAplicacion:
            "desc",
        },
        include: {
          archivo: {
            select: {
              nombreArchivo:
                true,
              totalFilas: true,
              filasValidas: true,
              filasConError:
                true,
            },
          },
        },
      }),
    prisma.declaracion.count(),
    prisma.reciboPago.count(),
    prisma.ordenPago.count(),
    prisma.liquidacion.count(),
    prisma.requerimiento.count(),
    prisma
      .requerimientoManual
      .count(),
    prisma.declaracion.count({
      where: {
        versionPagosSisgatId:
          null,
      },
    }),
  ]);

  console.log("");
  console.log(
    "VERIFICACIÓN DE PAGOS SISGAT INDEPENDIENTES",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Versión activa: ${versionActiva ? `#${versionActiva.id}` : "NO EXISTE"}`,
  );
  console.log(
    `Declaraciones: ${declaraciones}`,
  );
  console.log(
    `Recibos: ${recibos}`,
  );
  console.log(
    `Declaraciones sin versión independiente: ${declaracionesSinVersion}`,
  );
  console.log("");
  console.log(
    "Módulos conservados:",
  );
  console.log(
    `  Órdenes: ${ordenes}`,
  );
  console.log(
    `  Liquidaciones: ${liquidaciones}`,
  );
  console.log(
    `  Requerimientos SisGAT: ${requerimientosSisgat}`,
  );
  console.log(
    `  Requerimientos manuales: ${requerimientosManuales}`,
  );

  if (!versionActiva) {
    throw new Error(
      "No existe una versión activa de pagos SisGAT.",
    );
  }

  if (
    declaraciones !==
    versionActiva
      .totalDeclaraciones
  ) {
    throw new Error(
      `La versión registra ${versionActiva.totalDeclaraciones} declaraciones, pero PostgreSQL contiene ${declaraciones}.`,
    );
  }

  if (
    recibos !==
    versionActiva.totalRecibos
  ) {
    throw new Error(
      `La versión registra ${versionActiva.totalRecibos} recibos, pero PostgreSQL contiene ${recibos}.`,
    );
  }

  if (
    declaracionesSinVersion !== 0
  ) {
    throw new Error(
      "Existen declaraciones sin relación con la versión independiente activa.",
    );
  }

  console.log("");
  console.log(
    "RESULTADO: CORRECTO",
  );
}

main()
  .catch(
    (error: unknown) => {
      console.error("");
      console.error(
        error instanceof Error
          ? error.message
          : "Error desconocido.",
      );
      process.exitCode = 1;
    },
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    },
  );
