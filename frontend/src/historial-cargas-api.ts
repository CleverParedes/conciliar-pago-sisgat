export type TipoFuenteHistorial =
  | "PAGOS_SISGAT"
  | "ORDENES"
  | "LIQUIDACIONES"
  | "REQUERIMIENTOS_SISGAT"
  | "REQUERIMIENTOS_MANUALES";

export type EstadoVersionHistorial =
  | "PENDIENTE"
  | "VALIDADA"
  | "APLICANDO"
  | "ACTIVA"
  | "ARCHIVADA"
  | "FALLIDA"
  | "CANCELADA";

export interface HistorialCargaItem {
  clave: string;
  tipo: TipoFuenteHistorial;
  tipoEtiqueta: string;
  versionId: number;
  codigo: string;
  estado: EstadoVersionHistorial;
  comentario: string | null;
  principal: {
    etiqueta: string;
    total: number;
  };
  secundario: {
    etiqueta: string;
    total: number;
  };
  totalErrores: number;
  totalAdvertencias: number;
  anioGestion: number | null;
  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  usuario: {
    id: number;
    nombre: string;
    nombreUsuario: string;
  } | null;
  archivo: {
    nombre: string;
    hoja: string | null;
    tamano: number;
    totalFilas: number;
    filasValidas: number;
    filasConError: number;
  } | null;
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

export async function obtenerHistorialCargas():
Promise<HistorialCargaItem[]> {
  const respuesta = await fetch(
    `${API_URL}/historial-cargas`,
    {
      credentials: "include",
    },
  );

  let contenido:
    | RespuestaApi<HistorialCargaItem[]>
    | null = null;

  try {
    contenido =
      (await respuesta.json()) as
        RespuestaApi<
          HistorialCargaItem[]
        >;
  } catch {
    contenido = null;
  }

  if (respuesta.status === 401) {
    window.dispatchEvent(
      new Event("sesion-expirada"),
    );
  }

  if (
    !respuesta.ok ||
    contenido === null ||
    contenido.ok !== true
  ) {
    throw new Error(
      contenido?.message ??
        `Error HTTP ${respuesta.status}.`,
    );
  }

  return contenido.data;
}
