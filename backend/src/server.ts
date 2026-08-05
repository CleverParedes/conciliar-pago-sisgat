import "dotenv/config";

import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "./lib/prisma";

import { permitirRoles, requerirSesion } from "./middleware/auth.middleware";

import { adminUsuariosRouter } from "./routes/admin-usuarios.routes";
import { authRouter } from "./routes/auth.routes";
import { conciliacionRouter } from "./routes/conciliacion.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { importacionesRouter } from "./routes/importaciones.routes";
import { ordenesRouter } from "./routes/ordenes.routes";
import { liquidacionesRouter } from "./routes/liquidaciones.routes";
import { requerimientosRouter } from "./routes/requerimientos.routes";
import { requerimientosManualesRouter } from "./routes/requerimientos-manuales.routes";
import { reportesRouter } from "./routes/reportes.routes";
import { reportesLiquidacionesRouter } from "./routes/reportes-liquidaciones.routes";
import { reportesRequerimientosSisgatRouter } from "./routes/reportes-requerimientos-sisgat.routes";
import { reportesRequerimientosManualesRouter } from "./routes/reportes-requerimientos-manuales.routes";
import { versionesDatosRouter } from "./routes/versiones-datos.routes";
import { versionesPagosSisgatRouter } from "./routes/versiones-pagos-sisgat.routes";
import { versionesOrdenesRouter } from "./routes/versiones-ordenes.routes";
import { versionesLiquidacionesRouter } from "./routes/versiones-liquidaciones.routes";
import { versionesRequerimientosRouter } from "./routes/versiones-requerimientos.routes";
import { versionesRequerimientosManualesRouter } from "./routes/versiones-requerimientos-manuales.routes";
import { versionesPendientesRouter } from "./routes/versiones-pendientes.routes";

import { historialCargasRouter } from "./routes/historial-cargas.routes";

const app = express();

const port = Number(process.env.PORT ?? 3000);

const host = process.env.HOST ?? "0.0.0.0";

const esProduccion = process.env.NODE_ENV === "production";

const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

const archivoActual = fileURLToPath(import.meta.url);

const directorioActual = path.dirname(archivoActual);

const frontendDistPath = path.resolve(directorioActual, "../../frontend/dist");

const frontendIndexPath = path.join(frontendDistPath, "index.html");

/* ==================================================
   CONFIGURACIÓN GENERAL
================================================== */

app.disable("x-powered-by");

app.use(
  cors({
    origin: esProduccion ? false : frontendUrl,

    credentials: true,
  }),
);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "same-origin",
    },
  }),
);

app.use(morgan("dev"));

app.use(cookieParser());

app.use(
  express.json({
    limit: "10mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
  }),
);

/* ==================================================
   HEALTH CHECK
================================================== */

app.get("/api/health", async (_req: Request, res: Response) => {
  await prisma.$queryRaw`
      SELECT 1
    `;

  res.status(200).json({
    ok: true,

    message: "Frontend, backend y PostgreSQL están funcionando correctamente.",

    database: "Conectado",

    environment: process.env.NODE_ENV ?? "development",
  });
});

/* ==================================================
   AUTENTICACIÓN
================================================== */

app.use("/api/auth", authRouter);

/* ==================================================
   ADMINISTRACIÓN DE USUARIOS
   Solo disponible para ADMINISTRADOR
================================================== */

app.use(
  "/api/admin/usuarios",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  adminUsuariosRouter,
);

/* ==================================================
   RUTAS DE CONSULTA
   Invitado, usuario y administrador
================================================== */

app.use(
  "/api/dashboard",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  dashboardRouter,
);

app.use(
  "/api/ordenes",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  ordenesRouter,
);

app.use(
  "/api/liquidaciones",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  liquidacionesRouter,
);

app.use(
  "/api/requerimientos",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  requerimientosRouter,
);

app.use(
  "/api/requerimientos-manuales",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  requerimientosManualesRouter,
);

app.use(
  "/api/conciliacion",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  conciliacionRouter,
);

/* ==================================================
   REPORTES Y EXPORTACIONES
================================================== */

app.use(
  "/api/reportes/requerimientos-manuales",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  reportesRequerimientosManualesRouter,
);

app.use(
  "/api/reportes/requerimientos-sisgat",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  reportesRequerimientosSisgatRouter,
);

app.use(
  "/api/reportes/liquidaciones",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  reportesLiquidacionesRouter,
);

app.use(
  "/api/reportes",
  requerirSesion,
  permitirRoles("INVITADO", "USUARIO", "ADMINISTRADOR"),
  reportesRouter,
);

/* ==================================================
   VERSIONADO DE DATOS
   Solo disponible para ADMINISTRADOR

   POST /api/versiones-datos/analizar
================================================== */

app.use(
  "/api/versiones-datos",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  versionesDatosRouter,
);

app.use(
  "/api/versiones-pagos-sisgat",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  versionesPagosSisgatRouter,
);

app.use(
  "/api/versiones-ordenes",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  versionesOrdenesRouter,
);

app.use(
  "/api/versiones-liquidaciones",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  versionesLiquidacionesRouter,
);

app.use(
  "/api/versiones-requerimientos",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  versionesRequerimientosRouter,
);

app.use(
  "/api/versiones-requerimientos-manuales",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  versionesRequerimientosManualesRouter,
);


app.use(
  "/api/versiones-pendientes",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  versionesPendientesRouter,
);

/* ==================================================
   IMPORTACIONES ANTIGUAS BLOQUEADAS

   Estas direcciones se conservan únicamente
   para responder HTTP 410 y registrar cualquier
   intento de utilizar el flujo retirado.
================================================== */

app.use(
  "/api/importaciones",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  importacionesRouter,
);

/* ==================================================
   RUTA API NO ENCONTRADA
================================================== */

app.use(
  "/api/historial-cargas",
  requerirSesion,
  permitirRoles("ADMINISTRADOR"),
  historialCargasRouter,
);

/* ==================================================
   HISTORIAL UNIFICADO DE CARGAS
================================================== */

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({
    ok: false,

    message: "La ruta solicitada no existe.",

    data: null,
  });
});

/* ==================================================
   FRONTEND REACT COMPILADO
================================================== */

app.use(express.static(frontendDistPath));

app.get("/{*splat}", (_req: Request, res: Response) => {
  if (!existsSync(frontendIndexPath)) {
    res.status(503).json({
      ok: false,

      message:
        "El frontend todavía no está compilado. Ejecuta npm run build --prefix frontend.",

      data: null,
    });

    return;
  }

  res.sendFile(frontendIndexPath);
});

/* ==================================================
   MANEJO GENERAL DE ERRORES
================================================== */

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);

  if (error instanceof multer.MulterError) {
    let mensaje = error.message;

    if (error.code === "LIMIT_FILE_SIZE") {
      mensaje = "El archivo supera el límite de 25 MB.";
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      mensaje = "Solo se permiten los dos archivos requeridos.";
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      mensaje = "Se recibió un archivo en un campo no permitido.";
    }

    res.status(400).json({
      ok: false,
      message: mensaje,
      data: null,
    });

    return;
  }

  res.status(500).json({
    ok: false,

    message:
      error instanceof Error
        ? error.message
        : "Ocurrió un error interno en el servidor.",

    data: null,
  });
};

app.use(errorHandler);

/* ==================================================
   INICIO DEL SERVIDOR
================================================== */

app.listen(port, host, () => {
  console.log(`Aplicación funcionando en http://localhost:${port}`);

  console.log(`Frontend servido desde: ${frontendDistPath}`);
});