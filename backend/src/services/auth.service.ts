import argon2 from "argon2";
import {
  createHash,
  randomBytes,
} from "node:crypto";
import type {
  Request,
  Response,
} from "express";

import { prisma } from "../lib/prisma";

const COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME?.trim() ||
  "sistema_pagos_session";

const COOKIE_SECURE =
  process.env.COOKIE_SECURE === "true";

const SESSION_HOURS =
  Number(
    process.env.SESSION_HOURS ?? 12,
  ) || 12;

const GUEST_SESSION_HOURS =
  Number(
    process.env.GUEST_SESSION_HOURS ?? 8,
  ) || 8;

const MAX_LOGIN_ATTEMPTS =
  Number(
    process.env.MAX_LOGIN_ATTEMPTS ?? 5,
  ) || 5;

const LOGIN_LOCK_MINUTES =
  Number(
    process.env.LOGIN_LOCK_MINUTES ?? 15,
  ) || 15;

export type RolSesion =
  | "INVITADO"
  | "USUARIO"
  | "ADMINISTRADOR";

export interface SesionPublica {
  autenticado: boolean;
  tipo:
    | "INVITADO"
    | "AUTENTICADO";
  rol: RolSesion;
  usuario: {
    id: number;
    nombre: string;
    nombreUsuario: string;
    correo: string | null;
  } | null;
  fechaExpira: Date;
}

interface DatosCliente {
  ip: string | null;
  userAgent: string | null;
}

interface ResultadoSesion {
  token: string;
  fechaExpira: Date;
  sesionPublica: SesionPublica;
}

function numeroSeguro(
  valor: number,
  minimo: number,
  maximo: number,
): number {
  return Math.min(
    Math.max(valor, minimo),
    maximo,
  );
}

function sumarHoras(
  fecha: Date,
  horas: number,
): Date {
  return new Date(
    fecha.getTime() +
      horas * 60 * 60 * 1000,
  );
}

function sumarMinutos(
  fecha: Date,
  minutos: number,
): Date {
  return new Date(
    fecha.getTime() +
      minutos * 60 * 1000,
  );
}

function generarToken(): string {
  return randomBytes(32).toString(
    "hex",
  );
}

function generarHashToken(
  token: string,
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function obtenerDatosCliente(
  req: Request,
): DatosCliente {
  const userAgent =
    req.get("user-agent")
      ?.slice(0, 500) ?? null;

  const ip =
    req.ip?.slice(0, 64) ||
    req.socket.remoteAddress
      ?.slice(0, 64) ||
    null;

  return {
    ip,
    userAgent,
  };
}

function obtenerTokenCookie(
  req: Request,
): string | null {
  const valor =
    req.cookies?.[COOKIE_NAME];

  if (
    typeof valor !== "string" ||
    valor.length < 20
  ) {
    return null;
  }

  return valor;
}

export function guardarCookieSesion(
  res: Response,
  token: string,
  fechaExpira: Date,
): void {
  res.cookie(
    COOKIE_NAME,
    token,
    {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
      expires: fechaExpira,
    },
  );
}

export function eliminarCookieSesion(
  res: Response,
): void {
  res.clearCookie(
    COOKIE_NAME,
    {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
    },
  );
}

export async function crearSesionInvitado(
  req: Request,
): Promise<ResultadoSesion> {
  const token = generarToken();

  const tokenHash =
    generarHashToken(token);

  const fechaExpira =
    sumarHoras(
      new Date(),
      numeroSeguro(
        GUEST_SESSION_HOURS,
        1,
        24,
      ),
    );

  const cliente =
    obtenerDatosCliente(req);

  const sesion =
    await prisma.sesion.create({
      data: {
        tokenHash,
        tipo: "INVITADO",
        estado: "ACTIVA",
        fechaExpira,
        ip: cliente.ip,
        userAgent:
          cliente.userAgent,
      },

      select: {
        id: true,
        fechaExpira: true,
      },
    });

  await prisma.auditoria.create({
    data: {
      sesionId: sesion.id,
      accion:
        "INGRESO_INVITADO",
      entidad: "SESION",
      entidadId: sesion.id,
      resultado: "CORRECTO",
      ip: cliente.ip,
      userAgent:
        cliente.userAgent,
    },
  });

  return {
    token,
    fechaExpira:
      sesion.fechaExpira,

    sesionPublica: {
      autenticado: true,
      tipo: "INVITADO",
      rol: "INVITADO",
      usuario: null,
      fechaExpira:
        sesion.fechaExpira,
    },
  };
}

export async function iniciarSesion(
  req: Request,
  identificador: string,
  password: string,
): Promise<ResultadoSesion> {
  const identificadorNormalizado =
    identificador
      .trim()
      .toLowerCase();

  const cliente =
    obtenerDatosCliente(req);

  const usuario =
    await prisma.usuario.findFirst({
      where: {
        OR: [
          {
            nombreUsuario:
              identificadorNormalizado,
          },
          {
            correo:
              identificadorNormalizado,
          },
        ],
      },
    });

  if (!usuario) {
    await prisma.auditoria.create({
      data: {
        accion: "LOGIN_FALLIDO",
        entidad: "USUARIO",
        resultado: "RECHAZADO",
        detalles: {
          motivo:
            "CREDENCIALES_INVALIDAS",
          identificador:
            identificadorNormalizado,
        },
        ip: cliente.ip,
        userAgent:
          cliente.userAgent,
      },
    });

    throw new Error(
      "El usuario o la contraseña son incorrectos.",
    );
  }

  if (
    usuario.estado !== "ACTIVO"
  ) {
    await prisma.auditoria.create({
      data: {
        usuarioId: usuario.id,
        accion: "LOGIN_FALLIDO",
        entidad: "USUARIO",
        entidadId: String(
          usuario.id,
        ),
        resultado: "RECHAZADO",
        detalles: {
          motivo:
            "CUENTA_NO_ACTIVA",
          estado: usuario.estado,
        },
        ip: cliente.ip,
        userAgent:
          cliente.userAgent,
      },
    });

    throw new Error(
      "La cuenta no está disponible.",
    );
  }

  const ahora = new Date();

  if (
    usuario.bloqueadoHasta &&
    usuario.bloqueadoHasta >
      ahora
  ) {
    throw new Error(
      "La cuenta está bloqueada temporalmente. Intenta nuevamente más tarde.",
    );
  }

  const passwordCorrecto =
    await argon2.verify(
      usuario.passwordHash,
      password,
    );

  if (!passwordCorrecto) {
    const intentos =
      usuario.intentosFallidos + 1;

    const bloquear =
      intentos >=
      MAX_LOGIN_ATTEMPTS;

    await prisma.usuario.update({
      where: {
        id: usuario.id,
      },

      data: {
        intentosFallidos:
          bloquear ? 0 : intentos,

        bloqueadoHasta:
          bloquear
            ? sumarMinutos(
                ahora,
                numeroSeguro(
                  LOGIN_LOCK_MINUTES,
                  1,
                  1440,
                ),
              )
            : null,
      },
    });

    await prisma.auditoria.create({
      data: {
        usuarioId: usuario.id,
        accion: "LOGIN_FALLIDO",
        entidad: "USUARIO",
        entidadId: String(
          usuario.id,
        ),
        resultado: "RECHAZADO",
        detalles: {
          motivo:
            "CREDENCIALES_INVALIDAS",
          bloqueado:
            bloquear,
        },
        ip: cliente.ip,
        userAgent:
          cliente.userAgent,
      },
    });

    throw new Error(
      bloquear
        ? "La cuenta fue bloqueada temporalmente por varios intentos fallidos."
        : "El usuario o la contraseña son incorrectos.",
    );
  }

  const token = generarToken();

  const tokenHash =
    generarHashToken(token);

  const fechaExpira =
    sumarHoras(
      ahora,
      numeroSeguro(
        SESSION_HOURS,
        1,
        72,
      ),
    );

  const resultado =
    await prisma.$transaction(
      async (tx) => {
        const usuarioActualizado =
          await tx.usuario.update({
            where: {
              id: usuario.id,
            },

            data: {
              intentosFallidos: 0,
              bloqueadoHasta: null,
              ultimoAcceso: ahora,
            },

            select: {
              id: true,
              nombre: true,
              nombreUsuario: true,
              correo: true,
              rol: true,
            },
          });

        const sesion =
          await tx.sesion.create({
            data: {
              tokenHash,
              tipo: "AUTENTICADO",
              estado: "ACTIVA",
              usuarioId:
                usuario.id,
              fechaExpira,
              ip: cliente.ip,
              userAgent:
                cliente.userAgent,
            },

            select: {
              id: true,
              fechaExpira: true,
            },
          });

        await tx.auditoria.create({
          data: {
            usuarioId:
              usuario.id,
            sesionId:
              sesion.id,
            accion:
              "LOGIN_CORRECTO",
            entidad:
              "SESION",
            entidadId:
              sesion.id,
            resultado:
              "CORRECTO",
            ip: cliente.ip,
            userAgent:
              cliente.userAgent,
          },
        });

        return {
          usuario:
            usuarioActualizado,
          sesion,
        };
      },
    );

  return {
    token,
    fechaExpira:
      resultado.sesion.fechaExpira,

    sesionPublica: {
      autenticado: true,
      tipo: "AUTENTICADO",
      rol:
        resultado.usuario.rol,
      usuario: {
        id:
          resultado.usuario.id,

        nombre:
          resultado.usuario
            .nombre,

        nombreUsuario:
          resultado.usuario
            .nombreUsuario,

        correo:
          resultado.usuario
            .correo,
      },

      fechaExpira:
        resultado.sesion
          .fechaExpira,
    },
  };
}

export async function obtenerSesionActual(
  req: Request,
): Promise<SesionPublica | null> {
  const token =
    obtenerTokenCookie(req);

  if (!token) {
    return null;
  }

  const tokenHash =
    generarHashToken(token);

  const sesion =
    await prisma.sesion.findUnique({
      where: {
        tokenHash,
      },

      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            nombreUsuario: true,
            correo: true,
            rol: true,
            estado: true,
          },
        },
      },
    });

  if (!sesion) {
    return null;
  }

  const ahora = new Date();

  if (
    sesion.estado !== "ACTIVA" ||
    sesion.fechaExpira <= ahora
  ) {
    if (
      sesion.estado === "ACTIVA"
    ) {
      await prisma.sesion.update({
        where: {
          id: sesion.id,
        },

        data: {
          estado: "EXPIRADA",
        },
      });
    }

    return null;
  }

  if (
    sesion.tipo === "INVITADO"
  ) {
    return {
      autenticado: true,
      tipo: "INVITADO",
      rol: "INVITADO",
      usuario: null,
      fechaExpira:
        sesion.fechaExpira,
    };
  }

  if (
    !sesion.usuario ||
    sesion.usuario.estado !==
      "ACTIVO"
  ) {
    await prisma.sesion.update({
      where: {
        id: sesion.id,
      },

      data: {
        estado: "REVOCADA",
        revokedAt: ahora,
      },
    });

    return null;
  }

  return {
    autenticado: true,
    tipo: "AUTENTICADO",
    rol: sesion.usuario.rol,
    usuario: {
      id: sesion.usuario.id,
      nombre:
        sesion.usuario.nombre,
      nombreUsuario:
        sesion.usuario
          .nombreUsuario,
      correo:
        sesion.usuario.correo,
    },
    fechaExpira:
      sesion.fechaExpira,
  };
}

export async function cerrarSesion(
  req: Request,
): Promise<void> {
  const token =
    obtenerTokenCookie(req);

  if (!token) {
    return;
  }

  const tokenHash =
    generarHashToken(token);

  const sesion =
    await prisma.sesion.findUnique({
      where: {
        tokenHash,
      },

      select: {
        id: true,
        usuarioId: true,
      },
    });

  if (!sesion) {
    return;
  }

  const cliente =
    obtenerDatosCliente(req);

  await prisma.$transaction([
    prisma.sesion.update({
      where: {
        id: sesion.id,
      },

      data: {
        estado: "REVOCADA",
        revokedAt: new Date(),
      },
    }),

    prisma.auditoria.create({
      data: {
        usuarioId:
          sesion.usuarioId,

        sesionId: sesion.id,
        accion: "CERRAR_SESION",
        entidad: "SESION",
        entidadId: sesion.id,
        resultado: "CORRECTO",
        ip: cliente.ip,
        userAgent:
          cliente.userAgent,
      },
    }),
  ]);
}