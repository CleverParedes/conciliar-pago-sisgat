import { prisma } from "../lib/prisma";

async function main():
Promise<void> {
  const [
    totalManuales,
    totalPeriodos,
    totalSeguimientos,
    totalHistorial,
    tipos,
    estadosConciliados,
    estadosRevision,
    estadosNotificacion,
    versiones,
    ordenes,
    liquidaciones,
    requerimientosSisgat,
    declaraciones,
    recibos,
  ] = await Promise.all([
    prisma
      .requerimientoManual
      .count(),
    prisma
      .requerimientoManualPeriodo
      .count(),
    prisma
      .seguimientoRequerimientoManual
      .count(),
    prisma
      .historialRequerimientoManual
      .count(),
    prisma
      .requerimientoManual
      .groupBy({
        by: [
          "tipoRegistro",
        ],
        _count: {
          _all: true,
        },
        orderBy: {
          tipoRegistro:
            "asc",
        },
      }),
    prisma
      .requerimientoManual
      .groupBy({
        by: [
          "estadoConciliado",
        ],
        _count: {
          _all: true,
        },
        orderBy: {
          estadoConciliado:
            "asc",
        },
      }),
    prisma
      .requerimientoManual
      .groupBy({
        by: [
          "estadoRevision",
        ],
        _count: {
          _all: true,
        },
        orderBy: {
          estadoRevision:
            "asc",
        },
      }),
    prisma
      .requerimientoManual
      .groupBy({
        by: [
          "estadoNotificacion",
        ],
        _count: {
          _all: true,
        },
        orderBy: {
          estadoNotificacion:
            "asc",
        },
      }),
    prisma
      .versionRequerimientosManuales
      .findMany({
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
          estado: true,
          anioGestion: true,
          totalRegistros: true,
          totalPeriodos: true,
          totalErrores: true,
          totalAdvertencias: true,
          fechaAplicacion: true,
        },
      }),
    prisma
      .ordenPago
      .count(),
    prisma
      .liquidacion
      .count(),
    prisma
      .requerimiento
      .count(),
    prisma
      .declaracion
      .count(),
    prisma
      .reciboPago
      .count(),
  ]);

  console.log("");
  console.log(
    "VERIFICACIÓN DEL MÓDULO DE REQUERIMIENTOS MANUALES",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Requerimientos manuales: ${totalManuales}`,
  );
  console.log(
    `Periodos manuales: ${totalPeriodos}`,
  );
  console.log(
    `Seguimientos: ${totalSeguimientos}`,
  );
  console.log(
    `Entradas de historial: ${totalHistorial}`,
  );
  console.log(
    `Órdenes conservadas: ${ordenes}`,
  );
  console.log(
    `Liquidaciones conservadas: ${liquidaciones}`,
  );
  console.log(
    `Requerimientos SisGAT conservados: ${requerimientosSisgat}`,
  );
  console.log(
    `Declaraciones conservadas: ${declaraciones}`,
  );
  console.log(
    `Recibos conservados: ${recibos}`,
  );

  console.log("");
  console.log(
    "Tipos de registro:",
  );

  for (
    const item
    of tipos
  ) {
    console.log(
      `  ${item.tipoRegistro}: ${item._count._all}`,
    );
  }

  console.log("");
  console.log(
    "Estados conciliados:",
  );

  for (
    const item
    of estadosConciliados
  ) {
    console.log(
      `  ${item.estadoConciliado}: ${item._count._all}`,
    );
  }

  console.log("");
  console.log(
    "Estados de revisión:",
  );

  for (
    const item
    of estadosRevision
  ) {
    console.log(
      `  ${item.estadoRevision}: ${item._count._all}`,
    );
  }

  console.log("");
  console.log(
    "Estados de notificación:",
  );

  for (
    const item
    of estadosNotificacion
  ) {
    console.log(
      `  ${item.estadoNotificacion}: ${item._count._all}`,
    );
  }

  console.log("");
  console.log(
    "Versiones:",
  );

  for (
    const version
    of versiones
  ) {
    console.log(
      `  #${version.id} ${version.estado} | ` +
        `${version.anioGestion} | ` +
        `${version.totalRegistros} registros | ` +
        `${version.totalPeriodos} periodos | ` +
        `${version.totalAdvertencias} advertencias`,
    );
  }
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
      await prisma
        .$disconnect();
    },
  );
