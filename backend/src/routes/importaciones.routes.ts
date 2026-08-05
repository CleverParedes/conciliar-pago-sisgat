import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma";

import type { SesionPublica } from "../services/auth.service";

const router = Router();

function obtenerUsuarioId(res: Response): number | null {
  const locals = res.locals as {
    sesion?: SesionPublica;
  };

  return locals.sesion?.usuario?.id ?? null;
}

function obtenerIp(req: Request): string | null {
  const ip = req.ip || req.socket.remoteAddress;

  if (!ip) {
    return null;
  }

  return ip.slice(0, 64);
}

function obtenerUserAgent(req: Request): string | null {
  const userAgent = req.get("user-agent");

  if (!userAgent) {
    return null;
  }

  return userAgent.slice(0, 500);
}

/*
 * Todas las importaciones deben realizarse
 * mediante el sistema de versiones:
 *
 * POST /api/versiones-datos/analizar
 * POST /api/versiones-datos/:id/confirmar
 *
 * Este router se conserva para bloquear y
 * auditar sistemas antiguos que todavía
 * intenten utilizar estas direcciones.
 */
router.use(async (req: Request, res: Response): Promise<void> => {
  const usuarioId = obtenerUsuarioId(res);

  try {
    await prisma.auditoria.create({
      data: {
        usuarioId,

        accion: "IMPORTACION_ANTIGUA_BLOQUEADA",

        entidad: "IMPORTACION",

        entidadId: req.path.slice(0, 100) || "/",

        resultado: "BLOQUEADO",

        detalles: {
          metodo: req.method,

          ruta: req.originalUrl,

          motivo:
            "La importación directa fue retirada. Debe utilizarse el flujo seguro de versiones de datos.",

          rutaAnalisis: "/api/versiones-datos/analizar",

          rutaConfirmacion: "/api/versiones-datos/:id/confirmar",
        },

        ip: obtenerIp(req),

        userAgent: obtenerUserAgent(req),
      },
    });
  } catch (errorAuditoria) {
    /*
     * Una falla en la auditoría no debe
     * habilitar la ruta antigua.
     */
    console.error(
      "No se pudo registrar el intento de importación antigua:",
      errorAuditoria,
    );
  }

  res.status(410).json({
    ok: false,

    message:
      "La importación directa fue retirada. Utiliza Actualización de datos para analizar y confirmar una versión completa.",

    data: {
      rutaAnalisis: "/api/versiones-datos/analizar",

      requiereDosArchivos: true,

      archivos: ["ordenes", "declaracionesPagos"],
    },
  });
});

export { router as importacionesRouter };
