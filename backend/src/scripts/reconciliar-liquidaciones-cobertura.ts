import {
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import {
  ejecutarConciliacionLiquidaciones,
} from "../services/conciliacion-liquidaciones.service";
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
      .versionLiquidaciones
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
          codigo: true,
          totalLiquidaciones:
            true,
          totalDetalles: true,
        },
      });

  if (!versionActiva) {
    throw new Error(
      "No existe una versión activa de liquidaciones.",
    );
  }

  console.log("");
  console.log(
    "Se creará un respaldo automático antes de recalcular.",
  );
  console.log(
    `Versión activa: #${versionActiva.id} ${versionActiva.codigo}`,
  );
  console.log(
    `Liquidaciones registradas: ${versionActiva.totalLiquidaciones}`,
  );
  console.log(
    `Detalles registrados: ${versionActiva.totalDetalles}`,
  );

  await crearRespaldoDatabase({
    usuarioId:
      administrador.id,
    versionLiquidacionesId:
      versionActiva.id,
    motivo:
      "RECONCILIAR_LIQUIDACIONES_COBERTURA",
  });

  const resultado =
    await prisma.$transaction(
      async (tx) =>
        ejecutarConciliacionLiquidaciones(
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
        "RECONCILIAR_LIQUIDACIONES_COBERTURA",
      entidad:
        "VERSION_LIQUIDACIONES",
      entidadId:
        String(
          versionActiva.id,
        ),
      resultado:
        "CORRECTO",
      detalles: {
        detallesProcesados:
          resultado.detallesProcesados,
        liquidacionesProcesadas:
          resultado.liquidacionesProcesadas,
        resumenDetalles:
          resultado.resumenDetalles,
        resumenLiquidaciones:
          resultado.resumenLiquidaciones,
        regla:
          "PAGADO_POR_COBERTURA_TRIMESTRAL",
        monto:
          "INFORMATIVO_NO_DETERMINA_ESTADO",
      } satisfies Prisma.InputJsonObject,
    },
  });

  console.log("");
  console.log(
    "RECONCILIACIÓN DE LIQUIDACIONES COMPLETADA",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Detalles procesados: ${resultado.detallesProcesados}`,
  );
  console.log(
    `Liquidaciones procesadas: ${resultado.liquidacionesProcesadas}`,
  );

  console.log("");
  console.log(
    "Estados por detalle:",
  );

  for (
    const [estado, cantidad]
    of Object.entries(
      resultado
        .resumenDetalles,
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
        .resumenLiquidaciones,
    )
  ) {
    console.log(
      `  ${estado}: ${cantidad}`,
    );
  }

  console.log("");
  console.log(
    "Regla aplicada:",
  );
  console.log(
    "  Cobertura completa de trimestres -> PAGADO",
  );
  console.log(
    "  Cobertura incompleta con pagos activos -> PAGO_PARCIAL",
  );
  console.log(
    "  La diferencia de monto es únicamente informativa.",
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
      await prisma
        .$disconnect();
    },
  );
