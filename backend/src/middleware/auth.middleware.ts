import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  eliminarCookieSesion,
  obtenerSesionActual,
  type RolSesion,
  type SesionPublica,
} from "../services/auth.service";

interface AuthLocals {
  sesion?: SesionPublica;
}

function obtenerSesionLocal(
  res: Response,
): SesionPublica | null {
  const locals =
    res.locals as AuthLocals;

  return locals.sesion ?? null;
}

export async function requerirSesion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sesion =
      await obtenerSesionActual(req);

    if (!sesion) {
      eliminarCookieSesion(res);

      res.status(401).json({
        ok: false,
        message:
          "Debes iniciar sesión para acceder a esta función.",
        data: null,
      });

      return;
    }

    const locals =
      res.locals as AuthLocals;

    locals.sesion = sesion;

    next();
  } catch (error) {
    next(error);
  }
}

export function permitirRoles(
  ...rolesPermitidos: RolSesion[]
) {
  const roles =
    new Set<RolSesion>(
      rolesPermitidos,
    );

  return function validarRol(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const sesion =
      obtenerSesionLocal(res);

    if (!sesion) {
      res.status(401).json({
        ok: false,
        message:
          "No existe una sesión válida.",
        data: null,
      });

      return;
    }

    if (!roles.has(sesion.rol)) {
      res.status(403).json({
        ok: false,
        message:
          "No tienes permisos para realizar esta acción.",
        data: {
          rolActual:
            sesion.rol,
        },
      });

      return;
    }

    next();
  };
}