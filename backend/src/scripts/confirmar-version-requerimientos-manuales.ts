import { prisma } from "../lib/prisma";
import {
  confirmarVersionRequerimientosManuales,
} from "../services/confirmar-version-requerimientos-manuales.service";

async function main():
Promise<void> {
  const versionId =
    Number(
      process.argv[2],
    );

  const nombreUsuario =
    process.argv[3] ??
    "admin";

  if (
    !Number.isInteger(
      versionId,
    ) ||
    versionId <= 0
  ) {
    throw new Error(
      "Debes indicar el ID válido de la versión de requerimientos manuales.",
    );
  }

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

  console.log("");
  console.log(
    "Se creará un respaldo automático antes de importar.",
  );
  console.log(
    `Versión a confirmar: ${versionId}`,
  );

  const resultado =
    await confirmarVersionRequerimientosManuales({
      versionRequerimientosManualesId:
        versionId,
      usuarioId:
        administrador.id,
    });

  console.log("");
  console.log(
    "VERSIÓN DE REQUERIMIENTOS MANUALES CONFIRMADA",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Estado: ${resultado.version.estado}`,
  );
  console.log(
    `Registros: ${resultado.totales.registros}`,
  );
  console.log(
    `Periodos: ${resultado.totales.periodos}`,
  );
  console.log(
    `Seguimientos iniciales: ${resultado.totales.seguimientos}`,
  );
  console.log(
    `Entradas de historial: ${resultado.totales.historial}`,
  );
  console.log("");
  console.log(
    "Tipos de registro:",
  );

  for (
    const [tipo, cantidad]
    of Object.entries(
      resultado
        .importacion
        .porTipoRegistro,
    )
  ) {
    console.log(
      `  ${tipo}: ${cantidad}`,
    );
  }

  console.log("");
  console.log(
    "La conciliación automática todavía no se ejecutó.",
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
