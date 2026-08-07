export type EstadoReporteOrdenes =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SOBREPAGO"
  | "SIN_DECLARACION"
  | "PAGO_ANULADO"
  | "ANULADO"
  | "REVISAR";

export interface FiltrosReporteOrdenesIndependiente {
  buscar: string;
  estado:
    | EstadoReporteOrdenes
    | "";
  anioOrden: number | null;
  periodoAnio: number | null;
  fechaDesde: string;
  fechaHasta: string;
}

export interface ResumenEstadoReporteOrdenes {
  estado:
    EstadoReporteOrdenes;
  cantidad: number;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
}

export interface PagoSisgatReporte {
  declaracionId: number;
  anioDeclaracion: number;
  id: number | null;
  anioRecibo: number | null;
  numeroRecibo: string | null;
  monto: number | null;
  trimestreOriginal: string | null;
  estadoOriginal: string | null;
  activo: boolean;
}

export interface MuestraReporteOrden {
  id: number;
  anioOrden: number;
  numeroOrden: string;
  fechaEmision: string | null;
  dniRuc: string | null;
  nombre: string | null;
  placa: string | null;
  pagosSisgat: PagoSisgatReporte[];
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  estado:
    EstadoReporteOrdenes;
  periodos: number;
}

export interface ResumenReporteOrdenesIndependiente {
  versionActiva: {
    id: number;
    codigo: string;
    comentario: string | null;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
    usuario: {
      nombre: string;
      nombreUsuario: string;
    } | null;
    archivo: {
      nombreArchivo: string;
      tamanoOriginal: number;
      totalFilas: number;
      filasValidas: number;
      filasConError: number;
    } | null;
  };
  filtros: {
    buscar: string;
    estado:
      EstadoReporteOrdenes
      | null;
    anioOrden: number | null;
    periodoAnio: number | null;
    fechaDesde: string | null;
    fechaHasta: string | null;
  };
  totales: {
    ordenes: number;
    periodos: number;
    contribuyentes: number;
    importeTotal: number;
    totalPagado: number;
    saldo: number;
  };
  estados:
    ResumenEstadoReporteOrdenes[];
  muestra:
    MuestraReporteOrden[];
}

interface RespuestaApi<T> {
  ok: boolean;
  message?: string;
  data: T;
}

const API_URL = (
  import.meta.env.VITE_API_URL ??
  "/api"
).replace(/\/$/, "");

function parametros(
  filtros:
    FiltrosReporteOrdenesIndependiente,
): URLSearchParams {
  const resultado =
    new URLSearchParams();

  if (filtros.buscar.trim()) {
    resultado.set(
      "buscar",
      filtros.buscar.trim(),
    );
  }

  if (filtros.estado) {
    resultado.set(
      "estado",
      filtros.estado,
    );
  }

  if (filtros.anioOrden) {
    resultado.set(
      "anioOrden",
      String(
        filtros.anioOrden,
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

  if (filtros.fechaDesde) {
    resultado.set(
      "fechaDesde",
      filtros.fechaDesde,
    );
  }

  if (filtros.fechaHasta) {
    resultado.set(
      "fechaHasta",
      filtros.fechaHasta,
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

export async function obtenerReporteOrdenesIndependiente(
  filtros:
    FiltrosReporteOrdenesIndependiente,
): Promise<ResumenReporteOrdenesIndependiente> {
  const query =
    parametros(
      filtros,
    );

  const respuesta =
    await fetch(
      `${API_URL}/reportes/ordenes/resumen?${query.toString()}`,
      {
        credentials:
          "include",
      },
    );

  const contenido =
    await leerRespuesta<ResumenReporteOrdenesIndependiente>(
      respuesta,
    );

  if (
    respuesta.status === 401
  ) {
    window.dispatchEvent(
      new Event(
        "sesion-expirada",
      ),
    );
  }

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
    "reporte_ordenes.xlsx"
  );
}

export async function descargarReporteOrdenesIndependiente(
  filtros:
    FiltrosReporteOrdenesIndependiente,
): Promise<string> {
  const query =
    parametros(
      filtros,
    );

  const respuesta =
    await fetch(
      `${API_URL}/reportes/ordenes.xlsx?${query.toString()}`,
      {
        credentials:
          "include",
      },
    );

  if (
    respuesta.status === 401
  ) {
    window.dispatchEvent(
      new Event(
        "sesion-expirada",
      ),
    );
  }

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
