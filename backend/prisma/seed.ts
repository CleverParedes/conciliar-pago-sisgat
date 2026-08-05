import "dotenv/config";

import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../generated/prisma/client";

function obtenerVariableObligatoria(
  nombre: string,
): string {
  const valor =
    process.env[nombre]?.trim();

  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}.`,
    );
  }

  return valor;
}

const databaseUrl =
  obtenerVariableObligatoria(
    "DATABASE_URL",
  );

const pool = new Pool({
  connectionString: databaseUrl,
});

const adapter = new PrismaPg(
  pool,
);

const prisma = new PrismaClient({
  adapter,
});

async function main(): Promise<void> {
  const nombre =
    obtenerVariableObligatoria(
      "ADMIN_NAME",
    );

  const nombreUsuario =
    obtenerVariableObligatoria(
      "ADMIN_USERNAME",
    ).toLowerCase();

  const correo =
    process.env.ADMIN_EMAIL
      ?.trim()
      .toLowerCase() || null;

  const password =
    obtenerVariableObligatoria(
      "ADMIN_PASSWORD",
    );

  if (
    password.length < 12
  ) {
    throw new Error(
      "La contraseña del administrador debe tener como mínimo 12 caracteres.",
    );
  }

  if (
    password.includes(
      "COLOCA_AQUI",
    )
  ) {
    throw new Error(
      "Debes reemplazar la contraseña de ejemplo por una contraseña real.",
    );
  }

  const administradorExistente =
    await prisma.usuario.findUnique({
      where: {
        nombreUsuario,
      },
    });

  if (
    administradorExistente
  ) {
    console.log(
      `El usuario ${nombreUsuario} ya existe. No se modificó su contraseña.`,
    );

    return;
  }

  const passwordHash =
    await argon2.hash(
      password,
      {
        type: argon2.argon2id,
      },
    );

  const hashValido =
    await argon2.verify(
      passwordHash,
      password,
    );

  if (!hashValido) {
    throw new Error(
      "No se pudo comprobar el hash de la contraseña.",
    );
  }

  const administrador =
    await prisma.usuario.create({
      data: {
        nombre,
        nombreUsuario,
        correo,
        passwordHash,
        rol: "ADMINISTRADOR",
        estado: "ACTIVO",
      },

      select: {
        id: true,
        nombre: true,
        nombreUsuario: true,
        correo: true,
        rol: true,
        estado: true,
      },
    });

  await prisma.auditoria.create({
    data: {
      usuarioId:
        administrador.id,

      accion:
        "CREAR_ADMIN_INICIAL",

      entidad:
        "USUARIO",

      entidadId: String(
        administrador.id,
      ),

      resultado:
        "CORRECTO",

      detalles: {
        origen:
          "PRISMA_SEED",
      },
    },
  });

  console.log(
    "Administrador inicial creado correctamente:",
  );

  console.log({
    id: administrador.id,
    nombre:
      administrador.nombre,
    nombreUsuario:
      administrador.nombreUsuario,
    correo:
      administrador.correo,
    rol: administrador.rol,
    estado:
      administrador.estado,
  });
}

main()
  .catch((error: unknown) => {
    console.error(
      "No se pudo crear el administrador inicial.",
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });