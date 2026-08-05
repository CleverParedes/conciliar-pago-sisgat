import argon2 from "argon2";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import type {
  SesionPublica,
} from "../services/auth.service";

export const adminUsuariosRouter =
  Router();

const crearUsuarioSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(
      3,
      "El nombre debe tener al menos 3 caracteres.",
    )
    .max(
      150,
      "El nombre es demasiado largo.",
    ),

  nombreUsuario: z
    .string()
    .trim()
    .min(
      3,
      "El nombre de usuario debe tener al menos 3 caracteres.",
    )
    .max(
      80,
      "El nombre de usuario es demasiado largo.",
    )
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "El usuario solo puede contener letras, números, punto, guion y guion bajo.",
    ),

  correo: z
    .union([
      z
        .string()
        .trim()
        .email(
          "El correo no es válido.",
        )
        .max(180),
      z.literal(""),
      z.null(),
    ])
    .optional(),

  password: z
    .string()
    .min(
      12,
      "La contraseña debe tener como mínimo 12 caracteres.",
    )
    .max(
      200,
      "La contraseña es demasiado larga.",
    ),

  rol: z
    .enum([
      "USUARIO",
      "ADMINISTRADOR",
    ])
    .default("USUARIO"),
});

const cambiarEstadoSchema =
  z.object({
    estado: z.enum([
      "ACTIVO",
      "BLOQUEADO",
      "DESACTIVADO",
    ]),
  });

const cambiarRolSchema =
  z.object({
    rol: z.enum([
      "USUARIO",
      "ADMINISTRADOR",
    ]),
  });

const cambiarPasswordSchema =
  z.object({
    password: z
      .string()
      .min(
        12,
        "La nueva contraseña debe tener como mínimo 12 caracteres.",
      )
      .max(
        200,
        "La contraseña es demasiado larga.",
      ),
  });

function obtenerAdministradorActual(
  res: Response,
): SesionPublica {
  const locals =
    res.locals as {
      sesion?: SesionPublica;
    };

  const sesion =
    locals.sesion;

  if (
    !sesion ||
    !sesion.usuario ||
    sesion.rol !==
      "ADMINISTRADOR"
  ) {
    throw new Error(
      "No se pudo identificar al administrador actual.",
    );
  }

  return sesion;
}

function obtenerIdUsuario(
  req: Request,
  res: Response,
): number | null {
  const id =
    Number(req.params.id);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    res.status(400).json({
      ok: false,
      message:
        "El identificador del usuario no es válido.",
      data: null,
    });

    return null;
  }

  return id;
}

adminUsuariosRouter.get(
  "/",
  async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const usuarios =
        await prisma.usuario.findMany({
          orderBy: [
            {
              rol: "desc",
            },
            {
              nombre: "asc",
            },
          ],

          select: {
            id: true,
            nombre: true,
            nombreUsuario: true,
            correo: true,
            rol: true,
            estado: true,
            intentosFallidos: true,
            bloqueadoHasta: true,
            ultimoAcceso: true,
            createdAt: true,
            updatedAt: true,

            _count: {
              select: {
                sesiones: true,
                auditorias: true,
              },
            },
          },
        });

      res.status(200).json({
        ok: true,
        data: usuarios,
      });
    } catch (error) {
      next(error);
    }
  },
);

adminUsuariosRouter.post(
  "/",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const validacion =
        crearUsuarioSchema.safeParse(
          req.body,
        );

      if (!validacion.success) {
        res.status(400).json({
          ok: false,
          message:
            validacion.error
              .issues[0]?.message ??
            "Los datos del usuario no son válidos.",
          data: null,
        });

        return;
      }

      const administrador =
        obtenerAdministradorActual(
          res,
        );

      const nombreUsuario =
        validacion.data
          .nombreUsuario
          .toLowerCase();

      const correo =
        validacion.data.correo
          ?.trim()
          .toLowerCase() ||
        null;

      const condiciones = [
        {
          nombreUsuario,
        },

        ...(correo
          ? [
              {
                correo,
              },
            ]
          : []),
      ];

      const existente =
        await prisma.usuario.findFirst({
          where: {
            OR: condiciones,
          },

          select: {
            nombreUsuario: true,
            correo: true,
          },
        });

      if (existente) {
        const mensaje =
          existente.nombreUsuario ===
          nombreUsuario
            ? "El nombre de usuario ya está registrado."
            : "El correo electrónico ya está registrado.";

        res.status(409).json({
          ok: false,
          message: mensaje,
          data: null,
        });

        return;
      }

      const passwordHash =
        await argon2.hash(
          validacion.data.password,
          {
            type: argon2.argon2id,
          },
        );

      const resultado =
        await prisma.$transaction(
          async (tx) => {
            const usuario =
              await tx.usuario.create({
                data: {
                  nombre:
                    validacion.data
                      .nombre,

                  nombreUsuario,
                  correo,
                  passwordHash,

                  rol:
                    validacion.data
                      .rol,

                  estado: "ACTIVO",
                },

                select: {
                  id: true,
                  nombre: true,
                  nombreUsuario: true,
                  correo: true,
                  rol: true,
                  estado: true,
                  createdAt: true,
                },
              });

            await tx.auditoria.create({
              data: {
                usuarioId:
                  administrador.usuario
                    ?.id,

                accion:
                  "CREAR_USUARIO",

                entidad:
                  "USUARIO",

                entidadId: String(
                  usuario.id,
                ),

                resultado:
                  "CORRECTO",

                detalles: {
                  nombreUsuario:
                    usuario.nombreUsuario,

                  rol:
                    usuario.rol,
                },
              },
            });

            return usuario;
          },
        );

      res.status(201).json({
        ok: true,
        message:
          "Usuario creado correctamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

adminUsuariosRouter.patch(
  "/:id/estado",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const usuarioId =
        obtenerIdUsuario(
          req,
          res,
        );

      if (!usuarioId) {
        return;
      }

      const validacion =
        cambiarEstadoSchema.safeParse(
          req.body,
        );

      if (!validacion.success) {
        res.status(400).json({
          ok: false,
          message:
            validacion.error
              .issues[0]?.message ??
            "El estado no es válido.",
          data: null,
        });

        return;
      }

      const administrador =
        obtenerAdministradorActual(
          res,
        );

      if (
        administrador.usuario?.id ===
          usuarioId &&
        validacion.data.estado !==
          "ACTIVO"
      ) {
        res.status(400).json({
          ok: false,
          message:
            "No puedes bloquear o desactivar tu propia cuenta.",
          data: null,
        });

        return;
      }

      const existente =
        await prisma.usuario.findUnique({
          where: {
            id: usuarioId,
          },

          select: {
            id: true,
            estado: true,
          },
        });

      if (!existente) {
        res.status(404).json({
          ok: false,
          message:
            "El usuario solicitado no existe.",
          data: null,
        });

        return;
      }

      const resultado =
        await prisma.$transaction(
          async (tx) => {
            const usuario =
              await tx.usuario.update({
                where: {
                  id: usuarioId,
                },

                data: {
                  estado:
                    validacion.data
                      .estado,

                  intentosFallidos: 0,
                  bloqueadoHasta: null,
                },

                select: {
                  id: true,
                  nombre: true,
                  nombreUsuario: true,
                  rol: true,
                  estado: true,
                },
              });

            if (
              validacion.data.estado !==
              "ACTIVO"
            ) {
              await tx.sesion.updateMany({
                where: {
                  usuarioId,
                  estado: "ACTIVA",
                },

                data: {
                  estado: "REVOCADA",
                  revokedAt:
                    new Date(),
                },
              });
            }

            await tx.auditoria.create({
              data: {
                usuarioId:
                  administrador.usuario
                    ?.id,

                accion:
                  "CAMBIAR_ESTADO_USUARIO",

                entidad:
                  "USUARIO",

                entidadId: String(
                  usuarioId,
                ),

                resultado:
                  "CORRECTO",

                detalles: {
                  estadoAnterior:
                    existente.estado,

                  estadoNuevo:
                    validacion.data
                      .estado,
                },
              },
            });

            return usuario;
          },
        );

      res.status(200).json({
        ok: true,
        message:
          "Estado actualizado correctamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

adminUsuariosRouter.patch(
  "/:id/rol",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const usuarioId =
        obtenerIdUsuario(
          req,
          res,
        );

      if (!usuarioId) {
        return;
      }

      const validacion =
        cambiarRolSchema.safeParse(
          req.body,
        );

      if (!validacion.success) {
        res.status(400).json({
          ok: false,
          message:
            "El rol seleccionado no es válido.",
          data: null,
        });

        return;
      }

      const administrador =
        obtenerAdministradorActual(
          res,
        );

      if (
        administrador.usuario?.id ===
          usuarioId &&
        validacion.data.rol !==
          "ADMINISTRADOR"
      ) {
        res.status(400).json({
          ok: false,
          message:
            "No puedes retirar tu propio rol de administrador.",
          data: null,
        });

        return;
      }

      const existente =
        await prisma.usuario.findUnique({
          where: {
            id: usuarioId,
          },

          select: {
            id: true,
            rol: true,
          },
        });

      if (!existente) {
        res.status(404).json({
          ok: false,
          message:
            "El usuario solicitado no existe.",
          data: null,
        });

        return;
      }

      const resultado =
        await prisma.$transaction(
          async (tx) => {
            const usuario =
              await tx.usuario.update({
                where: {
                  id: usuarioId,
                },

                data: {
                  rol:
                    validacion.data
                      .rol,
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

            await tx.auditoria.create({
              data: {
                usuarioId:
                  administrador.usuario
                    ?.id,

                accion:
                  "CAMBIAR_ROL_USUARIO",

                entidad:
                  "USUARIO",

                entidadId: String(
                  usuarioId,
                ),

                resultado:
                  "CORRECTO",

                detalles: {
                  rolAnterior:
                    existente.rol,

                  rolNuevo:
                    validacion.data
                      .rol,
                },
              },
            });

            return usuario;
          },
        );

      res.status(200).json({
        ok: true,
        message:
          "Rol actualizado correctamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);

adminUsuariosRouter.patch(
  "/:id/password",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const usuarioId =
        obtenerIdUsuario(
          req,
          res,
        );

      if (!usuarioId) {
        return;
      }

      const validacion =
        cambiarPasswordSchema.safeParse(
          req.body,
        );

      if (!validacion.success) {
        res.status(400).json({
          ok: false,
          message:
            validacion.error
              .issues[0]?.message ??
            "La contraseña no es válida.",
          data: null,
        });

        return;
      }

      const administrador =
        obtenerAdministradorActual(
          res,
        );

      const existente =
        await prisma.usuario.findUnique({
          where: {
            id: usuarioId,
          },

          select: {
            id: true,
          },
        });

      if (!existente) {
        res.status(404).json({
          ok: false,
          message:
            "El usuario solicitado no existe.",
          data: null,
        });

        return;
      }

      const passwordHash =
        await argon2.hash(
          validacion.data.password,
          {
            type: argon2.argon2id,
          },
        );

      const resultado =
        await prisma.$transaction(
          async (tx) => {
            const usuario =
              await tx.usuario.update({
                where: {
                  id: usuarioId,
                },

                data: {
                  passwordHash,
                  intentosFallidos: 0,
                  bloqueadoHasta: null,
                },

                select: {
                  id: true,
                  nombre: true,
                  nombreUsuario: true,
                  rol: true,
                  estado: true,
                },
              });

            await tx.sesion.updateMany({
              where: {
                usuarioId,
                estado: "ACTIVA",
              },

              data: {
                estado: "REVOCADA",
                revokedAt: new Date(),
              },
            });

            await tx.auditoria.create({
              data: {
                usuarioId:
                  administrador.usuario
                    ?.id,

                accion:
                  "RESTABLECER_PASSWORD",

                entidad:
                  "USUARIO",

                entidadId: String(
                  usuarioId,
                ),

                resultado:
                  "CORRECTO",
              },
            });

            return usuario;
          },
        );

      res.status(200).json({
        ok: true,
        message:
          "Contraseña actualizada correctamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  },
);