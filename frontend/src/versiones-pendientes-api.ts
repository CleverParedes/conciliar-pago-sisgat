import {
  repararTextoUtf8,
  repararValorUtf8,
} from "./texto-utf8";

export type FuenteVersionPendiente =
  | "pagos"
  | "ordenes"
  | "liquidaciones"
  | "requerimientos-sisgat"
  | "requerimientos-manuales";

export interface AjusteAutomaticoPendiente {
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

export interface IncidenciaPendiente {
  fila: number | null;
  campo: string | null;
  mensaje: string;
}

export interface VersionPendiente {
  fuente: FuenteVersionPendiente;
  nombreFuente: string;
  id: number;
  codigo: string;
  estado:
    | "VALIDADA"
    | "CANCELADA";
  comentario: string | null;
  fechaAnalisis: string;
  archivo: {
    nombre: string;
    hoja: string | null;
    tamanoOriginal: number;
    totalFilas: number;
    filasValidas: number;
    filasConError: number;
  } | null;
  metricas: Array<{
    etiqueta: string;
    valor: number;
  }>;
  errores: IncidenciaPendiente[];
  advertencias: IncidenciaPendiente[];
  ajustes: AjusteAutomaticoPendiente[];
  requiereAceptacion: boolean;
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

async function solicitar<T>(
  ruta: string,
  opciones: RequestInit = {},
): Promise<T> {
  const headers =
    new Headers(
      opciones.headers,
    );

  if (
    typeof opciones.body ===
      "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const respuesta =
    await fetch(
      `${API_URL}${ruta}`,
      {
        ...opciones,
        headers,
        credentials:
          "include",
      },
    );

  let contenido:
    | RespuestaApi<T>
    | null = null;

  try {
    contenido =
      (await respuesta.json()) as
        RespuestaApi<T>;
  } catch {
    contenido = null;
  }

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
      repararTextoUtf8(
        contenido?.message ??
          `Error HTTP ${respuesta.status}.`,
      ),
    );
  }

  return repararValorUtf8(
    contenido.data,
  );
}

export function obtenerVersionesPendientes(
  fuente:
    FuenteVersionPendiente,
): Promise<VersionPendiente[]> {
  return solicitar<
    VersionPendiente[]
  >(
    `/versiones-pendientes/${fuente}`,
  );
}

export function obtenerVersionesCanceladas(
  fuente:
    FuenteVersionPendiente,
): Promise<VersionPendiente[]> {
  return solicitar<
    VersionPendiente[]
  >(
    `/versiones-pendientes/${fuente}/canceladas`,
  );
}

export function confirmarVersionPendiente(
  fuente:
    FuenteVersionPendiente,
  id: number,
  ajustesRevisados:
    boolean,
): Promise<unknown> {
  return solicitar<unknown>(
    `/versiones-pendientes/${fuente}/${id}/confirmar`,
    {
      method: "POST",
      body: JSON.stringify({
        ajustesRevisados,
      }),
    },
  );
}

export function descartarVersionPendiente(
  fuente:
    FuenteVersionPendiente,
  id: number,
): Promise<{
  id: number;
  fuente:
    FuenteVersionPendiente;
  estado: "CANCELADA";
}> {
  return solicitar(
    `/versiones-pendientes/${fuente}/${id}/descartar`,
    {
      method: "POST",
    },
  );
}

export function reabrirVersionCancelada(
  fuente:
    FuenteVersionPendiente,
  id: number,
): Promise<{
  id: number;
  fuente:
    FuenteVersionPendiente;
  estado: "VALIDADA";
}> {
  return solicitar(
    `/versiones-pendientes/${fuente}/${id}/reabrir`,
    {
      method: "POST",
    },
  );
}
