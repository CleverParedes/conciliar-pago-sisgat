export type EstadoReporteLiquidaciones =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SOBREPAGO"
  | "SIN_DECLARACION"
  | "PAGO_ANULADO"
  | "ANULADO"
  | "REVISAR";

export interface FiltrosReporteLiquidaciones {
  buscar: string;
  estado: EstadoReporteLiquidaciones | "";
  anioLiquidacion: number | null;
  periodoAnio: number | null;
  fechaDesde: string;
  fechaHasta: string;
}

export interface EstadoResumenLiquidaciones {
  estado: EstadoReporteLiquidaciones;
  cantidad: number;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
}

export interface MuestraReporteLiquidacion {
  id: number;
  anioLiquidacion: number;
  numeroLiquidacion: string;
  fechaEmision: string | null;
  dniRuc: string | null;
  nombre: string | null;
  placa: string | null;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  estado: EstadoReporteLiquidaciones;
  periodos: number;
  estadoOriginal: string | null;
}

export interface ResumenReporteLiquidaciones {
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
    estado: EstadoReporteLiquidaciones | null;
    anioLiquidacion: number | null;
    periodoAnio: number | null;
    fechaDesde: string | null;
    fechaHasta: string | null;
  };
  totales: {
    liquidaciones: number;
    periodos: number;
    contribuyentes: number;
    importeTotal: number;
    totalPagado: number;
    saldo: number;
  };
  estados: EstadoResumenLiquidaciones[];
  muestra: MuestraReporteLiquidacion[];
}

interface RespuestaApi<T> {
  ok: boolean;
  message?: string;
  data: T;
}

const API_URL = (
  import.meta.env.VITE_API_URL ?? "/api"
).replace(/\/$/, "");

function parametros(
  filtros: FiltrosReporteLiquidaciones,
): URLSearchParams {
  const resultado = new URLSearchParams();

  if (filtros.buscar.trim()) {
    resultado.set("buscar", filtros.buscar.trim());
  }

  if (filtros.estado) {
    resultado.set("estado", filtros.estado);
  }

  if (filtros.anioLiquidacion) {
    resultado.set(
      "anioLiquidacion",
      String(filtros.anioLiquidacion),
    );
  }

  if (filtros.periodoAnio) {
    resultado.set("periodoAnio", String(filtros.periodoAnio));
  }

  if (filtros.fechaDesde) {
    resultado.set("fechaDesde", filtros.fechaDesde);
  }

  if (filtros.fechaHasta) {
    resultado.set("fechaHasta", filtros.fechaHasta);
  }

  return resultado;
}

async function leerRespuesta<T>(
  respuesta: Response,
): Promise<RespuestaApi<T> | null> {
  try {
    return (await respuesta.json()) as RespuestaApi<T>;
  } catch {
    return null;
  }
}

function revisarSesion(respuesta: Response): void {
  if (respuesta.status === 401) {
    window.dispatchEvent(new Event("sesion-expirada"));
  }
}

export async function obtenerReporteLiquidaciones(
  filtros: FiltrosReporteLiquidaciones,
): Promise<ResumenReporteLiquidaciones> {
  const query = parametros(filtros);

  const respuesta = await fetch(
    `${API_URL}/reportes/liquidaciones/resumen?${query.toString()}`,
    {
      credentials: "include",
    },
  );

  revisarSesion(respuesta);

  const contenido =
    await leerRespuesta<ResumenReporteLiquidaciones>(respuesta);

  if (!respuesta.ok || contenido === null || contenido.ok !== true) {
    throw new Error(
      contenido?.message ??
        `No se pudo consultar el reporte. Error HTTP ${respuesta.status}.`,
    );
  }

  return contenido.data;
}

function nombreDescarga(respuesta: Response): string {
  const disposicion =
    respuesta.headers.get("Content-Disposition") ?? "";

  const coincidencia = /filename="?([^";]+)"?/i.exec(disposicion);

  return coincidencia?.[1] ?? "reporte_liquidaciones.xlsx";
}

export async function descargarReporteLiquidaciones(
  filtros: FiltrosReporteLiquidaciones,
): Promise<string> {
  const query = parametros(filtros);

  const respuesta = await fetch(
    `${API_URL}/reportes/liquidaciones/excel?${query.toString()}`,
    {
      credentials: "include",
    },
  );

  revisarSesion(respuesta);

  if (!respuesta.ok) {
    const contenido = await leerRespuesta<null>(respuesta);

    throw new Error(
      contenido?.message ??
        `No se pudo generar el Excel. Error HTTP ${respuesta.status}.`,
    );
  }

  const archivo = await respuesta.blob();
  const nombre = nombreDescarga(respuesta);
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombre;
  enlace.style.display = "none";

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return nombre;
}
