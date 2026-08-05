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
        },
      });

  if (!versionActiva) {
    throw new Error(
      "No existe una versión activa de requerimientos manuales.",
    );
  }

  console.log("");
  console.log(
    "Se creará un respaldo automático antes de aplicar la regla de tres años pagados.",
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
      "RECONCILIAR_REQUERIMIENTOS_MANUALES_TRES_ANIOS",
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
        "RECONCILIAR_REQUERIMIENTOS_MANUALES_TRES_ANIOS",
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
        requerimientosPagadosPorTresAnios:
          resultado
            .requerimientosPagadosPorTresAnios,
        resumenRequerimientos:
          resultado
            .resumenRequerimientos,
        resumenRevision:
          resultado
            .resumenRevision,
        resumenValidacionAnios:
          resultado
            .resumenValidacionAnios,
        cambiosTresAnios:
          resultado
            .cambiosTresAnios
            .map(
              (cambio) => ({
                ...cambio,
              }),
            ),
        regla:
          "TRES_ANIOS_CONSECUTIVOS_COBERTURA_COMPLETA",
      } satisfies Prisma.InputJsonObject,
    },
  });

  console.log("");
  console.log(
    "RECONCILIACIÓN DE TRES AÑOS PAGADOS COMPLETADA",
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
  console.log(
    `Cambios a PAGADO por tres años completos: ${resultado.requerimientosPagadosPorTresAnios}`,
  );

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
    "Validación de años:",
  );

  for (
    const [estado, cantidad]
    of Object.entries(
      resultado
        .resumenValidacionAnios,
    )
  ) {
    console.log(
      `  ${estado}: ${cantidad}`,
    );
  }

  if (
    resultado
      .cambiosTresAnios
      .length > 0
  ) {
    console.log("");
    console.log(
      "REQUERIMIENTOS CAMBIADOS A PAGADO",
    );
    console.log(
      "========================================",
    );

    for (
      const cambio
      of resultado
        .cambiosTresAnios
    ) {
      console.log(
        `  Req. ${cambio.numeroRequerimiento} | ` +
        `${cambio.estadoAnterior} → ${cambio.estadoNuevo} | ` +
        `${cambio.validacionAnios} | ${cambio.ventanaPagada}`,
      );
    }
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
