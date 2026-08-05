import {
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import {
  ejecutarConciliacionRequerimientosManuales,
} from "../services/conciliacion-requerimientos-manuales.service";
import {
  crearRespaldoDatabase,
} from "../services/respaldo-database.service";

async function main():
Promise<void> {
  const nombreUsuario =
    process.argv[2] ??
    "admin";

  const administrador =
    await prisma.usuario.findFirst({
      where: {
        nombreUsuario,
        rol:
          "ADMINISTRADOR",
        estado:
          "ACTIVO",
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

  const versionActiva =
    await prisma
      .versionRequerimientosManuales
      .findFirst({
        where: {
          estado: "ACTIVA",
        },
        orderBy: {
          fechaAplicacion:
            "desc",
        },
        select: {
          id: true,
          anioGestion: true,
          totalRegistros: true,
          totalPeriodos: true,
        },
      });

  if (!versionActiva) {
    throw new Error(
      "No existe una versión activa de requerimientos manuales.",
    );
  }

  console.log("");
  console.log(
    "Se creará un respaldo automático antes de conciliar.",
  );
  console.log(
    `Versión activa: ${versionActiva.id}`,
  );
  console.log(
    `Año de gestión: ${versionActiva.anioGestion}`,
  );

  await crearRespaldoDatabase({
    usuarioId:
      administrador.id,
    versionRequerimientosManualesId:
      versionActiva.id,
    motivo:
      "CONCILIAR_REQUERIMIENTOS_MANUALES",
  });

  const resultado =
    await prisma.$transaction(
      async (tx) =>
        ejecutarConciliacionRequerimientosManuales(
          tx,
        ),
      {
        maxWait: 10000,
        timeout: 900000,
      },
    );

  await prisma.auditoria.create({
    data: {
      usuarioId:
        administrador.id,
      accion:
        "CONCILIAR_REQUERIMIENTOS_MANUALES",
      entidad:
        "VERSION_REQUERIMIENTOS_MANUALES",
      entidadId:
        String(
          versionActiva.id,
        ),
      resultado:
        "CORRECTO",
      detalles: {
        anioGestion:
          versionActiva.anioGestion,
        periodosProcesados:
          resultado
            .periodosProcesados,
        requerimientosProcesados:
          resultado
            .requerimientosProcesados,
        resumenPeriodos:
          resultado
            .resumenPeriodos,
        resumenRequerimientos:
          resultado
            .resumenRequerimientos,
        resumenRevision:
          resultado
            .resumenRevision,
        regla:
          "PLACA_ANIO_COBERTURA_TRIMESTRAL",
      } satisfies Prisma.InputJsonObject,
    },
  });

  console.log("");
  console.log(
    "CONCILIACIÓN DE REQUERIMIENTOS MANUALES COMPLETADA",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Periodos procesados: ${resultado.periodosProcesados}`,
  );
  console.log(
    `Requerimientos procesados: ${resultado.requerimientosProcesados}`,
  );

  console.log("");
  console.log(
    "Estados por periodo:",
  );

  for (
    const [estado, cantidad]
    of Object.entries(
      resultado
        .resumenPeriodos,
    )
  ) {
    console.log(
      `  ${estado}: ${cantidad}`,
    );
  }

  console.log("");
  console.log(
    "Estados generales:",
  );

  for (
    const [estado, cantidad]
    of Object.entries(
      resultado
        .resumenRequerimientos,
    )
  ) {
    console.log(
      `  ${estado}: ${cantidad}`,
    );
  }

  console.log("");
  console.log(
    "Comparación con el estado del Excel:",
  );

  for (
    const [estado, cantidad]
    of Object.entries(
      resultado
        .resumenRevision,
    )
  ) {
    console.log(
      `  ${estado}: ${cantidad}`,
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
