export type TipoRegistroReporteManual =
  | "REGISTRO_COMPLETO"
  | "INCOMPLETO"
  | "VACIO"
  | "SIN_REGISTRO"
  | "ANULADO";

export type EstadoConciliacionReporteManual =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SIN_DECLARACION"
  | "ANULADO"
  | "NO_APLICA"
  | "REVISAR";

export type EstadoRevisionReporteManual =
  | "PENDIENTE"
  | "COINCIDE"
  | "DISCREPANCIA"
  | "REVISAR"
  | "NO_APLICA";

export type EstadoNotificacionReporteManual =
  | "SIN_ASIGNAR"
  | "ASIGNADO"
  | "PENDIENTE_NOTIFICACION"
  | "NOTIFICADO"
  | "NO_NOTIFICADO"
  | "OBSERVADO";

export interface FiltrosReporteRequerimientosManuales {
  buscar: string;
  tipoRegistro:
    | TipoRegistroReporteManual
    | "";
  estadoConciliado:
    | EstadoConciliacionReporteManual
    | "";
  estadoRevision:
    | EstadoRevisionReporteManual
    | "";
  estadoNotificacion:
    | EstadoNotificacionReporteManual
    | "";
  anioGestion:
    | number
    | null;
  periodoAnio:
    | number
    | null;
  fechaNotificacionDesde:
    string;
  fechaNotificacionHasta:
    string;
}

export interface ConteoReporteManual<
  T extends string,
> {
  estado: T;
  cantidad: number;
}

export interface MuestraReporteRequerimientoManual {
  id: number;
  anioGestion: number;
  numeroRequerimiento:
    string;
  fechaRequerimiento:
    string | null;
  placa: string | null;
  propietario: string | null;
  deuda: string | null;
  estadoManualOriginal:
    string | null;
  tipoRegistro:
    TipoRegistroReporteManual;
  estadoConciliado:
    EstadoConciliacionReporteManual;
  estadoRevision:
    EstadoRevisionReporteManual;
  estadoNotificacion:
    EstadoNotificacionReporteManual;
  notificador: string | null;
  fechaNotificacion:
    string | null;
  periodos: number;
  montoPagado: number;
}

export interface ResumenReporteRequerimientosManuales {
  versionActiva: {
    id: number;
    codigo: string;
    comentario:
      string | null;
    anioGestion: number;
    fechaAnalisis:
      string | null;
    fechaAplicacion:
      string | null;
    usuario: {
      nombre: string;
      nombreUsuario: string;
    } | null;
    archivo: {
      nombreArchivo: string;
      nombreHoja: string;
      tamanoOriginal: number;
      totalFilas: number;
      filasValidas: number;
      filasConError: number;
    } | null;
  };
  filtros: {
    buscar: string;
    tipoRegistro:
      | TipoRegistroReporteManual
      | null;
    estadoConciliado:
      | EstadoConciliacionReporteManual
      | null;
    estadoRevision:
      | EstadoRevisionReporteManual
      | null;
    estadoNotificacion:
      | EstadoNotificacionReporteManual
      | null;
    anioGestion:
      number | null;
    periodoAnio:
      number | null;
    fechaNotificacionDesde:
      string | null;
    fechaNotificacionHasta:
      string | null;
  };
  totales: {
    requerimientos: number;
    periodos: number;
    propietarios: number;
    totalPagado: number;
    notificados: number;
    discrepancias: number;
    seguimientos: number;
    historial: number;
  };
  conciliacion:
    Array<
      ConteoReporteManual<EstadoConciliacionReporteManual>
    >;
  revision:
    Array<
      ConteoReporteManual<EstadoRevisionReporteManual>
    >;
  notificacion:
    Array<
      ConteoReporteManual<EstadoNotificacionReporteManual>
    >;
  tipos:
    Array<
      ConteoReporteManual<TipoRegistroReporteManual>
    >;
  muestra:
    MuestraReporteRequerimientoManual[];
}

interface RespuestaApi<T> {
  ok: boolean;
  message?: string;
  data: T;
}

const API_URL = (
  import.meta.env
    .VITE_API_URL ??
  "/api"
).replace(/\/$/, "");

function parametros(
  filtros:
    FiltrosReporteRequerimientosManuales,
): URLSearchParams {
  const resultado =
    new URLSearchParams();

  if (filtros.buscar.trim()) {
    resultado.set(
      "buscar",
      filtros.buscar.trim(),
    );
  }

  if (filtros.tipoRegistro) {
    resultado.set(
      "tipoRegistro",
      filtros.tipoRegistro,
    );
  }

  if (
    filtros.estadoConciliado
  ) {
    resultado.set(
      "estadoConciliado",
      filtros.estadoConciliado,
    );
  }

  if (
    filtros.estadoRevision
  ) {
    resultado.set(
      "estadoRevision",
      filtros.estadoRevision,
    );
  }

  if (
    filtros.estadoNotificacion
  ) {
    resultado.set(
      "estadoNotificacion",
      filtros.estadoNotificacion,
    );
  }

  if (filtros.anioGestion) {
    resultado.set(
      "anioGestion",
      String(
        filtros.anioGestion,
      ),
    );
  }

  if (filtros.periodoAnio) {
    resultado.set(
      "periodoAnio",
      String(
        filtros.periodoAnio,
      ),
    );
  }

  if (
    filtros
      .fechaNotificacionDesde
  ) {
    resultado.set(
      "fechaNotificacionDesde",
      filtros
        .fechaNotificacionDesde,
    );
  }

  if (
    filtros
      .fechaNotificacionHasta
  ) {
    resultado.set(
      "fechaNotificacionHasta",
      filtros
        .fechaNotificacionHasta,
    );
  }

  return resultado;
}

async function leerRespuesta<T>(
  respuesta: Response,
): Promise<RespuestaApi<T> | null> {
  try {
    return (
      await respuesta.json()
    ) as RespuestaApi<T>;
  } catch {
    return null;
  }
}

function revisarSesion(
  respuesta: Response,
): void {
  if (
    respuesta.status === 401
  ) {
    window.dispatchEvent(
      new Event(
        "sesion-expirada",
      ),
    );
  }
}

export async function obtenerReporteRequerimientosManuales(
  filtros:
    FiltrosReporteRequerimientosManuales,
): Promise<ResumenReporteRequerimientosManuales> {
  const query =
    parametros(filtros);

  const respuesta =
    await fetch(
      `${API_URL}/reportes/requerimientos-manuales/resumen?${query.toString()}`,
      {
        credentials:
          "include",
      },
    );

  revisarSesion(
    respuesta,
  );

  const contenido =
    await leerRespuesta<ResumenReporteRequerimientosManuales>(
      respuesta,
    );

  if (
    !respuesta.ok ||
    contenido === null ||
    contenido.ok !== true
  ) {
    throw new Error(
      contenido?.message ??
        `No se pudo consultar el reporte. Error HTTP ${respuesta.status}.`,
    );
  }

  return contenido.data;
}

function nombreDescarga(
  respuesta: Response,
): string {
  const disposicion =
    respuesta.headers.get(
      "Content-Disposition",
    ) ?? "";

  const coincidencia =
    /filename="?([^";]+)"?/i.exec(
      disposicion,
    );

  return (
    coincidencia?.[1] ??
    "reporte_requerimientos_manuales.xlsx"
  );
}

export async function descargarReporteRequerimientosManuales(
  filtros:
    FiltrosReporteRequerimientosManuales,
): Promise<string> {
  const query =
    parametros(filtros);

  const respuesta =
    await fetch(
      `${API_URL}/reportes/requerimientos-manuales/excel?${query.toString()}`,
      {
        credentials:
          "include",
      },
    );

  revisarSesion(
    respuesta,
  );

  if (!respuesta.ok) {
    const contenido =
      await leerRespuesta<null>(
        respuesta,
      );

    throw new Error(
      contenido?.message ??
        `No se pudo generar el Excel. Error HTTP ${respuesta.status}.`,
    );
  }

  const archivo =
    await respuesta.blob();

  const nombre =
    nombreDescarga(
      respuesta,
    );

  const url =
    URL.createObjectURL(
      archivo,
    );

  const enlace =
    document.createElement(
      "a",
    );

  enlace.href = url;
  enlace.download = nombre;
  enlace.style.display =
    "none";

  document.body.appendChild(
    enlace,
  );

  enlace.click();
  enlace.remove();

  window.setTimeout(
    () =>
      URL.revokeObjectURL(
        url,
      ),
    1000,
  );

  return nombre;
}
