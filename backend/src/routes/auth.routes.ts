import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import {
  cerrarSesion,
  crearSesionInvitado,
  eliminarCookieSesion,
  guardarCookieSesion,
  iniciarSesion,
  obtenerSesionActual,
} from "../services/auth.service";

export const authRouter =
  Router();

const loginSchema = z.object({
  identificador: z
    .string()
    .trim()
    .min(
      3,
      "Ingresa un usuario o correo válido.",
    )
    .max(
      180,
      "El usuario o correo es demasiado largo.",
    ),

  password: z
    .string()
    .min(
      1,
      "Ingresa la contraseña.",
    )
    .max(
      200,
      "La contraseña es demasiado larga.",
    ),
});

authRouter.post(
  "/login",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const validacion =
        loginSchema.safeParse(
          req.body,
        );

      if (!validacion.success) {
        res.status(400).json({
          ok: false,
          message:
            validacion.error
              .issues[0]?.message ??
            "Datos de acceso inválidos.",
        });

        return;
      }

      const resultado =
        await iniciarSesion(
          req,
          validacion.data
            .identificador,
          validacion.data
            .password,
        );

      guardarCookieSesion(
        res,
        resultado.token,
        resultado.fechaExpira,
      );

      res.status(200).json({
        ok: true,
        message:
          "Sesión iniciada correctamente.",
        data:
          resultado.sesionPublica,
      });
    } catch (error) {
      if (
        error instanceof Error
      ) {
        const mensaje =
          error.message;

        const esCredencial =
          mensaje.includes(
            "contraseña",
          ) ||
          mensaje.includes(
            "bloqueada",
          ) ||
          mensaje.includes(
            "cuenta",
          );

        if (esCredencial) {
          res.status(401).json({
            ok: false,
            message: mensaje,
          });

          return;
        }
      }

      next(error);
    }
  },
);

authRouter.post(
  "/invitado",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const sesionAnterior =
        await obtenerSesionActual(
          req,
        );

      if (sesionAnterior) {
        res.status(200).json({
          ok: true,
          message:
            "Ya existe una sesión activa.",
          data: sesionAnterior,
        });

        return;
      }

      const resultado =
        await crearSesionInvitado(
          req,
        );

      guardarCookieSesion(
        res,
        resultado.token,
        resultado.fechaExpira,
      );

      res.status(201).json({
        ok: true,
        message:
          "Sesión de invitado creada correctamente.",
        data:
          resultado.sesionPublica,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get(
  "/me",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const sesion =
        await obtenerSesionActual(
          req,
        );

      if (!sesion) {
        eliminarCookieSesion(res);

        res.status(401).json({
          ok: false,
          message:
            "No existe una sesión activa.",
          data: null,
        });

        return;
      }

      res.status(200).json({
        ok: true,
        data: sesion,
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/logout",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      await cerrarSesion(req);

      eliminarCookieSesion(res);

      res.status(200).json({
        ok: true,
        message:
          "Sesión cerrada correctamente.",
        data: null,
      });
    } catch (error) {
      next(error);
    }
  },
);