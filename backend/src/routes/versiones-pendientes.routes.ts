import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  EstadoVersionDatos,
  type Prisma,
} from "../../generated/prisma/client";

import { prisma } from "../lib/prisma";
import type { SesionPublica } from "../services/auth.service";
import { confirmarVersionLiquidaciones } from "../services/confirmar-version-liquidaciones.service";
import { confirmarVersionOrdenes } from "../services/confirmar-version-ordenes.service";
import { confirmarVersionPagosSisgat } from "../services/confirmar-version-pagos-sisgat.service";
import { confirmarVersionRequerimientosManuales } from "../services/confirmar-version-requerimientos-manuales.service";
import { confirmarVersionRequerimientos } from "../services/confirmar-version-requerimientos.service";

export const versionesPendientesRouter = Router();

const FUENTES = [
  "pagos",
  "ordenes",
  "liquidaciones",
  "requerimientos-sisgat",
  "requerimientos-manuales",
] as const;

type FuenteVersionPendiente = (typeof FUENTES)[number];

interface ArchivoComun {
  nombreArchivo: string;
  nombreHoja?: string | null;
  tamanoOriginal: number;
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  resumen: unknown;
  errores: Array<{
    fila: number | null;
    campo: string | null;
    mensaje: string;
    nivel?: string | null;
  }>;
}

interface VersionComun {
  id: number;
  codigo: string;
  estado: string;
  comentario: string | null;
  fechaAnalisis: Date | null;
  createdAt: Date;
  archivo: ArchivoComun | null;
  totalDeclaraciones?: number;
  totalRecibos?: number;
  totalAdvertencias?: number;
  totalOrdenes?: number;
  totalDetalles?: number;
  totalLiquidaciones?: number;
  totalRequerimientos?: number;
  totalRegistros?: number;
  totalPeriodos?: number;
  anioGestion?: number;
}

interface IncidenciaNormalizada {
  fila: number | null;
  campo: string | null;
  mensaje: string;
}

interface AjusteNormalizado {
  id: string;
  tipo: string;
  fila: number;
  anioDeclaracion: string;
  numeroDeclaracion: string;
  placa: string;
  numeroSerie: string;
  camposCompletados: string[];
  documentoEnmascarado: string;
  nombreRecuperado: string;
  filaFuente: number;
  anioDeclaracionFuente: string;
  numeroDeclaracionFuente: string;
  metodo: string;
  mensaje: string;
}

function esFuente(valor: string): valor is FuenteVersionPendiente {
  return (FUENTES as readonly string[]).includes(valor);
}

function obtenerFuente(req: Request): FuenteVersionPendiente {
  const fuente = String(req.params.fuente ?? "");

  if (!esFuente(fuente)) {
    throw Object.assign(
      new Error("El tipo de información solicitado no es válido."),
      { status: 400 },
    );
  }

  return fuente;
}

function obtenerId(req: Request): number {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    throw Object.assign(
      new Error("El identificador de la versión no es válido."),
      { status: 400 },
    );
  }

  return id;
}

function obtenerAdministrador(
  res: Response,
): NonNullable<SesionPublica["usuario"]> {
  const locals = res.locals as {
    sesion?: SesionPublica;
  };

  if (
    !locals.sesion?.usuario ||
    locals.sesion.rol !== "ADMINISTRADOR"
  ) {
    throw Object.assign(
      new Error("No se pudo identificar al administrador."),
      { status: 401 },
    );
  }

  return locals.sesion.usuario;
}

function esRegistro(
  valor: unknown,
): valor is Record<string, unknown> {
  return (
    typeof valor === "object" &&
    valor !== null &&
    !Array.isArray(valor)
  );
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : 0;
}

function cantidadSospechosa(valor: string): number {
  return (valor.match(/[ÃÂâ�]/g) ?? []).length;
}

function repararTextoUtf8(valor: string): string {
  let actual = valor;

  const reemplazos: Array<[string, string]> = [
    ["ÃƒÂ¡", "á"],
    ["ÃƒÂ©", "é"],
    ["ÃƒÂ­", "í"],
    ["ÃƒÂ³", "ó"],
    ["ÃƒÂº", "ú"],
    ["ÃƒÂ±", "ñ"],
    ["ÃƒÂ", "Á"],
    ["ÃƒÂ‰", "É"],
    ["ÃƒÂ", "Í"],
    ["ÃƒÂ“", "Ó"],
    ["ÃƒÂš", "Ú"],
    ["ÃƒÂ‘", "Ñ"],
    ["Ãƒâ€œ", "Ó"],
    ["Ãƒâ€°", "É"],
    ["â€”", "—"],
    ["â€“", "–"],
    ["â€¦", "…"],
    ["â€œ", "“"],
    ["â€", "”"],
    ["â€˜", "‘"],
    ["â€™", "’"],
    ["Â¿", "¿"],
    ["Â¡", "¡"],
    ["Â°", "°"],
    ["Â·", "·"],
  ];

  for (const [origen, destino] of reemplazos) {
    actual = actual.replaceAll(origen, destino);
  }

  for (let intento = 0; intento < 2; intento += 1) {
    if (!/[ÃÂ]/.test(actual)) {
      break;
    }

    const candidato = Buffer.from(actual, "latin1").toString("utf8");

    if (
      candidato.includes("�") ||
      cantidadSospechosa(candidato) >= cantidadSospechosa(actual)
    ) {
      break;
    }

    actual = candidato;
  }

  return actual;
}

function repararValor<T>(valor: T): T {
  if (typeof valor === "string") {
    return repararTextoUtf8(valor) as T;
  }

  if (Array.isArray(valor)) {
    return valor.map((item) => repararValor(item)) as T;
  }

  if (esRegistro(valor)) {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, item]) => [
        clave,
        repararValor(item),
      ]),
    ) as T;
  }

  return valor;
}

function obtenerListaResumen(
  archivo: ArchivoComun | null,
  clave: string,
): unknown[] {
  if (!archivo || !esRegistro(archivo.resumen)) {
    return [];
  }

  const lista = archivo.resumen[clave];
  return Array.isArray(lista) ? lista : [];
}

function normalizarIncidencia(
  valor: unknown,
): IncidenciaNormalizada | null {
  if (!esRegistro(valor)) {
    return null;
  }

  const mensaje = repararTextoUtf8(texto(valor.mensaje));

  if (!mensaje) {
    return null;
  }

  return {
    fila:
      typeof valor.fila === "number"
        ? valor.fila
        : null,
    campo:
      typeof valor.campo === "string"
        ? repararTextoUtf8(valor.campo)
        : typeof valor.tipo === "string"
          ? repararTextoUtf8(valor.tipo)
          : null,
    mensaje,
  };
}

function normalizarAjuste(
  valor: unknown,
): AjusteNormalizado | null {
  if (
    !esRegistro(valor) ||
    texto(valor.tipo) !== "IDENTIDAD_RECUPERADA"
  ) {
    return null;
  }

  return repararValor({
    id: texto(valor.id),
    tipo: texto(valor.tipo),
    fila: numero(valor.fila),
    anioDeclaracion: texto(valor.anioDeclaracion),
    numeroDeclaracion: texto(valor.numeroDeclaracion),
    placa: texto(valor.placa),
    numeroSerie: texto(valor.numeroSerie),
    camposCompletados: Array.isArray(valor.camposCompletados)
      ? valor.camposCompletados.map((item) => texto(item))
      : [],
    documentoEnmascarado: texto(valor.documentoEnmascarado),
    nombreRecuperado: texto(valor.nombreRecuperado),
    filaFuente: numero(valor.filaFuente),
    anioDeclaracionFuente: texto(valor.anioDeclaracionFuente),
    numeroDeclaracionFuente: texto(valor.numeroDeclaracionFuente),
    metodo: texto(valor.metodo),
    mensaje: texto(valor.mensaje),
  });
}

function nombreFuente(fuente: FuenteVersionPendiente): string {
  switch (fuente) {
    case "pagos":
      return "Pagos SisGAT";
    case "ordenes":
      return "Órdenes";
    case "liquidaciones":
      return "Liquidaciones";
    case "requerimientos-sisgat":
      return "Requerimientos SisGAT";
    case "requerimientos-manuales":
      return "Requerimientos manuales";
  }
}

function metricasVersion(
  fuente: FuenteVersionPendiente,
  version: VersionComun,
): Array<{ etiqueta: string; valor: number }> {
  switch (fuente) {
    case "pagos":
      return [
        {
          etiqueta: "Declaraciones",
          valor: numero(version.totalDeclaraciones),
        },
        {
          etiqueta: "Recibos",
          valor: numero(version.totalRecibos),
        },
        {
          etiqueta: "Ajustes",
          valor: numero(version.totalAdvertencias),
        },
      ];

    case "ordenes":
      return [
        {
          etiqueta: "Órdenes",
          valor: numero(version.totalOrdenes),
        },
        {
          etiqueta: "Periodos",
          valor: numero(version.totalDetalles),
        },
      ];

    case "liquidaciones":
      return [
        {
          etiqueta: "Liquidaciones",
          valor: numero(version.totalLiquidaciones),
        },
        {
          etiqueta: "Periodos",
          valor: numero(version.totalDetalles),
        },
      ];

    case "requerimientos-sisgat":
      return [
        {
          etiqueta: "Requerimientos",
          valor: numero(version.totalRequerimientos),
        },
        {
          etiqueta: "Periodos",
          valor: numero(version.totalDetalles),
        },
      ];

    case "requerimientos-manuales":
      return [
        {
          etiqueta: "Registros",
          valor: numero(version.totalRegistros),
        },
        {
          etiqueta: "Periodos",
          valor: numero(version.totalPeriodos),
        },
        {
          etiqueta: "Advertencias",
          valor: numero(version.totalAdvertencias),
        },
        {
          etiqueta: "Año de gestión",
          valor: numero(version.anioGestion),
        },
      ];
  }
}

function normalizarVersion(
  fuente: FuenteVersionPendiente,
  version: VersionComun,
) {
  const advertenciasResumen = obtenerListaResumen(
    version.archivo,
    "advertencias",
  );

  const ajustes = advertenciasResumen
    .map(normalizarAjuste)
    .filter((item): item is AjusteNormalizado => item !== null);

  const advertencias = advertenciasResumen
    .map(normalizarIncidencia)
    .filter((item): item is IncidenciaNormalizada => item !== null);

  const errores = (version.archivo?.errores ?? [])
    .filter((item) => item.nivel !== "ADVERTENCIA")
    .map((item) => ({
      fila: item.fila,
      campo: item.campo
        ? repararTextoUtf8(item.campo)
        : null,
      mensaje: repararTextoUtf8(item.mensaje),
    }));

  const advertenciasGuardadas = (version.archivo?.errores ?? [])
    .filter((item) => item.nivel === "ADVERTENCIA")
    .map((item) => ({
      fila: item.fila,
      campo: item.campo
        ? repararTextoUtf8(item.campo)
        : null,
      mensaje: repararTextoUtf8(item.mensaje),
    }));

  const advertenciasUnicas = [
    ...advertencias,
    ...advertenciasGuardadas,
  ].filter(
    (item, indice, lista) =>
      lista.findIndex(
        (otro) =>
          otro.fila === item.fila &&
          otro.campo === item.campo &&
          otro.mensaje === item.mensaje,
      ) === indice,
  );

  return repararValor({
    fuente,
    nombreFuente: nombreFuente(fuente),
    id: version.id,
    codigo: version.codigo,
    estado: version.estado,
    comentario: version.comentario,
    fechaAnalisis:
      version.fechaAnalisis?.toISOString() ??
      version.createdAt.toISOString(),
    archivo: version.archivo
      ? {
          nombre: version.archivo.nombreArchivo,
          hoja: version.archivo.nombreHoja ?? null,
          tamanoOriginal: version.archivo.tamanoOriginal,
          totalFilas: version.archivo.totalFilas,
          filasValidas: version.archivo.filasValidas,
          filasConError: version.archivo.filasConError,
        }
      : null,
    metricas: metricasVersion(fuente, version),
    errores,
    advertencias: advertenciasUnicas,
    ajustes,
    requiereAceptacion:
      ajustes.length > 0 ||
      advertenciasUnicas.length > 0,
  });
}

async function listarVersionesPorEstado(
  fuente: FuenteVersionPendiente,
  estado: EstadoVersionDatos,
) {
  const comun = {
    where: {
      estado,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
    include: {
      archivo: {
        include: {
          errores: {
            orderBy: [
              {
                fila: "asc" as const,
              },
              {
                id: "asc" as const,
              },
            ],
            take: 200,
          },
        },
      },
    },
  };

  switch (fuente) {
    case "pagos": {
      const versiones =
        await prisma.versionPagosSisgat.findMany(comun);

      return versiones.map((version) =>
        normalizarVersion(
          fuente,
          version as unknown as VersionComun,
        ),
      );
    }

    case "ordenes": {
      const versiones =
        await prisma.versionOrdenes.findMany(comun);

      return versiones.map((version) =>
        normalizarVersion(
          fuente,
          version as unknown as VersionComun,
        ),
      );
    }

    case "liquidaciones": {
      const versiones =
        await prisma.versionLiquidaciones.findMany(comun);

      return versiones.map((version) =>
        normalizarVersion(
          fuente,
          version as unknown as VersionComun,
        ),
      );
    }

    case "requerimientos-sisgat": {
      const versiones =
        await prisma.versionRequerimientos.findMany(comun);

      return versiones.map((version) =>
        normalizarVersion(
          fuente,
          version as unknown as VersionComun,
        ),
      );
    }

    case "requerimientos-manuales": {
      const versiones =
        await prisma.versionRequerimientosManuales.findMany(comun);

      return versiones.map((version) =>
        normalizarVersion(
          fuente,
          version as unknown as VersionComun,
        ),
      );
    }
  }
}

async function listarPendientes(
  fuente: FuenteVersionPendiente,
) {
  return listarVersionesPorEstado(
    fuente,
    EstadoVersionDatos.VALIDADA,
  );
}

async function listarCanceladas(
  fuente: FuenteVersionPendiente,
) {
  return listarVersionesPorEstado(
    fuente,
    EstadoVersionDatos.CANCELADA,
  );
}

async function confirmarPendiente(
  fuente: FuenteVersionPendiente,
  id: number,
  usuarioId: number,
  ajustesRevisados: boolean,
) {
  switch (fuente) {
    case "pagos":
      return confirmarVersionPagosSisgat({
        versionPagosSisgatId: id,
        usuarioId,
        ajustesRevisados,
      });

    case "ordenes":
      return confirmarVersionOrdenes({
        versionOrdenesId: id,
        usuarioId,
      });

    case "liquidaciones":
      return confirmarVersionLiquidaciones({
        versionLiquidacionesId: id,
        usuarioId,
      });

    case "requerimientos-sisgat":
      return confirmarVersionRequerimientos({
        versionRequerimientosId: id,
        usuarioId,
      });

    case "requerimientos-manuales":
      return confirmarVersionRequerimientosManuales({
        versionRequerimientosManualesId: id,
        usuarioId,
      });
  }
}

async function reabrirCancelada(
  fuente: FuenteVersionPendiente,
  id: number,
  usuarioId: number,
): Promise<void> {
  let cantidad = 0;

  switch (fuente) {
    case "pagos":
      cantidad = (
        await prisma.versionPagosSisgat.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.CANCELADA,
          },
          data: {
            estado: EstadoVersionDatos.VALIDADA,
          },
        })
      ).count;
      break;

    case "ordenes":
      cantidad = (
        await prisma.versionOrdenes.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.CANCELADA,
          },
          data: {
            estado: EstadoVersionDatos.VALIDADA,
          },
        })
      ).count;
      break;

    case "liquidaciones":
      cantidad = (
        await prisma.versionLiquidaciones.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.CANCELADA,
          },
          data: {
            estado: EstadoVersionDatos.VALIDADA,
          },
        })
      ).count;
      break;

    case "requerimientos-sisgat":
      cantidad = (
        await prisma.versionRequerimientos.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.CANCELADA,
          },
          data: {
            estado: EstadoVersionDatos.VALIDADA,
          },
        })
      ).count;
      break;

    case "requerimientos-manuales":
      cantidad = (
        await prisma.versionRequerimientosManuales.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.CANCELADA,
          },
          data: {
            estado: EstadoVersionDatos.VALIDADA,
          },
        })
      ).count;
      break;
  }

  if (cantidad !== 1) {
    throw Object.assign(
      new Error(
        "La versión no pudo reabrirse porque ya cambió de estado o no existe.",
      ),
      { status: 409 },
    );
  }

  await prisma.auditoria.create({
    data: {
      usuarioId,
      accion: "REABRIR_VERSION_CANCELADA",
      entidad: "VERSION_PENDIENTE",
      entidadId: `${fuente}:${id}`,
      resultado: "CORRECTO",
      detalles: {
        fuente,
        estadoAnterior: "CANCELADA",
        estadoNuevo: "VALIDADA",
        reutilizaAnalisisGuardado: true,
      } satisfies Prisma.InputJsonObject,
    },
  });
}

async function descartarPendiente(
  fuente: FuenteVersionPendiente,
  id: number,
  usuarioId: number,
): Promise<void> {
  let cantidad = 0;

  switch (fuente) {
    case "pagos":
      cantidad = (
        await prisma.versionPagosSisgat.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.VALIDADA,
          },
          data: {
            estado: EstadoVersionDatos.CANCELADA,
          },
        })
      ).count;
      break;

    case "ordenes":
      cantidad = (
        await prisma.versionOrdenes.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.VALIDADA,
          },
          data: {
            estado: EstadoVersionDatos.CANCELADA,
          },
        })
      ).count;
      break;

    case "liquidaciones":
      cantidad = (
        await prisma.versionLiquidaciones.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.VALIDADA,
          },
          data: {
            estado: EstadoVersionDatos.CANCELADA,
          },
        })
      ).count;
      break;

    case "requerimientos-sisgat":
      cantidad = (
        await prisma.versionRequerimientos.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.VALIDADA,
          },
          data: {
            estado: EstadoVersionDatos.CANCELADA,
          },
        })
      ).count;
      break;

    case "requerimientos-manuales":
      cantidad = (
        await prisma.versionRequerimientosManuales.updateMany({
          where: {
            id,
            estado: EstadoVersionDatos.VALIDADA,
          },
          data: {
            estado: EstadoVersionDatos.CANCELADA,
          },
        })
      ).count;
      break;
  }

  if (cantidad !== 1) {
    throw Object.assign(
      new Error(
        "La versión no pudo descartarse porque ya cambió de estado o no existe.",
      ),
      { status: 409 },
    );
  }

  await prisma.auditoria.create({
    data: {
      usuarioId,
      accion: "DESCARTAR_VERSION_VALIDADA",
      entidad: "VERSION_PENDIENTE",
      entidadId: `${fuente}:${id}`,
      resultado: "CORRECTO",
      detalles: {
        fuente,
        estadoAnterior: "VALIDADA",
        estadoNuevo: "CANCELADA",
      } satisfies Prisma.InputJsonObject,
    },
  });
}

function responderError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    res.status(error.status).json({
      ok: false,
      message:
        error instanceof Error
          ? repararTextoUtf8(error.message)
          : "No se pudo completar la operación.",
      data: null,
    });
    return;
  }

  next(error);
}

versionesPendientesRouter.get(
  "/:fuente/canceladas",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const fuente = obtenerFuente(req);
      const versiones = await listarCanceladas(fuente);

      res.status(200).json({
        ok: true,
        message:
          versiones.length > 0
            ? `Se encontraron ${versiones.length} versión(es) cancelada(s) reutilizable(s).`
            : "No existen versiones canceladas reutilizables.",
        data: versiones,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesPendientesRouter.get(
  "/:fuente",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const fuente = obtenerFuente(req);
      const versiones = await listarPendientes(fuente);

      res.status(200).json({
        ok: true,
        message:
          versiones.length > 0
            ? `Se encontraron ${versiones.length} versión(es) pendiente(s) de activación.`
            : "No existen versiones pendientes de activación.",
        data: versiones,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesPendientesRouter.post(
  "/:fuente/:id/reabrir",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);
      const fuente = obtenerFuente(req);
      const id = obtenerId(req);

      await reabrirCancelada(
        fuente,
        id,
        administrador.id,
      );

      res.status(200).json({
        ok: true,
        message:
          "La versión cancelada fue reabierta y volvió a quedar pendiente de revisión.",
        data: {
          id,
          fuente,
          estado: "VALIDADA",
        },
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesPendientesRouter.post(
  "/:fuente/:id/confirmar",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);
      const fuente = obtenerFuente(req);
      const id = obtenerId(req);
      const ajustesRevisados =
        req.body?.ajustesRevisados === true;

      const resultado = await confirmarPendiente(
        fuente,
        id,
        administrador.id,
        ajustesRevisados,
      );

      res.status(200).json({
        ok: true,
        message:
          "La versión pendiente fue confirmada y ahora está activa.",
        data: resultado,
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);

versionesPendientesRouter.post(
  "/:fuente/:id/descartar",
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const administrador = obtenerAdministrador(res);
      const fuente = obtenerFuente(req);
      const id = obtenerId(req);

      await descartarPendiente(
        fuente,
        id,
        administrador.id,
      );

      res.status(200).json({
        ok: true,
        message:
          "La versión pendiente fue descartada. La versión activa no fue modificada.",
        data: {
          id,
          fuente,
          estado: "CANCELADA",
        },
      });
    } catch (error) {
      responderError(error, res, next);
    }
  },
);
