import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import {
  analizarVersionRequerimientosManuales,
} from "../services/versiones-requerimientos-manuales.service";

async function main():
Promise<void> {
  const argumentoArchivo =
    process.argv[2] ??
    "../Requerimientos_Manuales_2026.xlsx";

  const argumentoAnio =
    process.argv[3] ??
    "2026";

  const nombreUsuario =
    process.argv[4] ??
    "admin";

  const anioGestion =
    Number(argumentoAnio);

  if (
    !Number.isInteger(
      anioGestion,
    ) ||
    anioGestion < 2000 ||
    anioGestion > 2100
  ) {
    throw new Error(
      "Debes indicar un año de gestión válido.",
    );
  }

  const rutaArchivo =
    path.resolve(
      process.cwd(),
      argumentoArchivo,
    );

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

  const buffer =
    await readFile(
      rutaArchivo,
    );

  const resultado =
    await analizarVersionRequerimientosManuales({
      archivo: {
        nombreArchivo:
          path.basename(
            rutaArchivo,
          ),
        buffer,
      },
      anioGestion,
      usuarioId:
        administrador.id,
      comentario:
        "Carga inicial del módulo de requerimientos manuales",
    });

  console.log("");
  console.log(
    "VERSIÓN DE REQUERIMIENTOS MANUALES ANALIZADA",
  );
  console.log(
    "========================================",
  );
  console.log(
    `Administrador: ${administrador.nombreUsuario}`,
  );
  console.log(
    `Versión ID: ${resultado.id}`,
  );
  console.log(
    `Código: ${resultado.codigo}`,
  );
  console.log(
    `Estado: ${resultado.estado}`,
  );
  console.log(
    `Año de gestión: ${anioGestion}`,
  );
  console.log(
    `Registros: ${resultado.totales.registros}`,
  );
  console.log(
    `Periodos: ${resultado.totales.periodos}`,
  );
  console.log(
    `Placas normalizables: ${resultado.totales.placasNormalizables}`,
  );
  console.log(
    `Errores: ${resultado.totales.errores}`,
  );
  console.log(
    `Advertencias: ${resultado.totales.advertencias}`,
  );
  console.log(
    `Puede confirmarse: ${
      resultado.puedeConfirmarse
        ? "Sí"
        : "No"
    }`,
  );
  console.log("");
  console.log(
    "Tipos de registro:",
  );

  for (
    const [tipo, cantidad]
    of Object.entries(
      resultado
        .clasificacion
        .porTipoRegistro,
    )
  ) {
    console.log(
      `  ${tipo}: ${cantidad}`,
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
