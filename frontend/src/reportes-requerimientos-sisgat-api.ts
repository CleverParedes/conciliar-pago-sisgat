export type EstadoReporteRequerimientosSisgat =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SOBREPAGO"
  | "SIN_DECLARACION"
  | "PAGO_ANULADO"
  | "ANULADO"
  | "REVISAR";

export interface FiltrosReporteRequerimientosSisgat {
  buscar: string;
  estado: EstadoReporteRequerimientosSisgat | "";
  anioRequerimiento: number | null;
  periodoAnio: number | null;
  fechaDesde: string;
  fechaHasta: string;
}

export interface EstadoResumenRequerimientosSisgat {
  estado: EstadoReporteRequerimientosSisgat;
  cantidad: number;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
}

export interface MuestraReporteRequerimientoSisgat {
  id: number;
  anioRequerimiento: number;
  numeroRequerimiento: string;
  fechaEmision: string | null;
  dniRuc: string | null;
  nombre: string | null;
  placa: string | null;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  estado: EstadoReporteRequerimientosSisgat;
  periodos: number;
  estadoOriginal: string | null;
}

export interface ResumenReporteRequerimientosSisgat {
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
    estado: EstadoReporteRequerimientosSisgat | null;
    anioRequerimiento: number | null;
    periodoAnio: number | null;
    fechaDesde: string | null;
    fechaHasta: string | null;
  };
  totales: {
    requerimientos: number;
    periodos: number;
    contribuyentes: number;
    importeTotal: number;
    totalPagado: number;
    saldo: number;
  };
  estados: EstadoResumenRequerimientosSisgat[];
  muestra: MuestraReporteRequerimientoSisgat[];
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
  filtros: FiltrosReporteRequerimientosSisgat,
): URLSearchParams {
  const resultado = new URLSearchParams();

  if (filtros.buscar.trim()) {
    resultado.set("buscar", filtros.buscar.trim());
  }

  if (filtros.estado) {
    resultado.set("estado", filtros.estado);
  }

  if (filtros.anioRequerimiento) {
    resultado.set(
      "anioRequerimiento",
      String(filtros.anioRequerimiento),
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

export async function obtenerReporteRequerimientosSisgat(
  filtros: FiltrosReporteRequerimientosSisgat,
): Promise<ResumenReporteRequerimientosSisgat> {
  const query = parametros(filtros);

  const respuesta = await fetch(
    `${API_URL}/reportes/requerimientos-sisgat/resumen?${query.toString()}`,
    {
      credentials: "include",
    },
  );

  revisarSesion(respuesta);

  const contenido =
    await leerRespuesta<ResumenReporteRequerimientosSisgat>(respuesta);

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

  return coincidencia?.[1] ?? "reporte_requerimientos_sisgat.xlsx";
}

export async function descargarReporteRequerimientosSisgat(
  filtros: FiltrosReporteRequerimientosSisgat,
): Promise<string> {
  const query = parametros(filtros);

  const respuesta = await fetch(
    `${API_URL}/reportes/requerimientos-sisgat/excel?${query.toString()}`,
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
