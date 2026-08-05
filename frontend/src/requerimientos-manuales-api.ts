import type {
  EstadoVersionDatos,
  RolSesion,
} from "./types";

export type TipoRegistroManual =
  | "REGISTRO_COMPLETO"
  | "INCOMPLETO"
  | "VACIO"
  | "SIN_REGISTRO"
  | "ANULADO";

export type EstadoConciliacionManual =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SIN_DECLARACION"
  | "ANULADO"
  | "NO_APLICA"
  | "REVISAR";

export type EstadoRevisionManual =
  | "PENDIENTE"
  | "COINCIDE"
  | "DISCREPANCIA"
  | "REVISAR"
  | "NO_APLICA";

export type EstadoNotificacionManual =
  | "SIN_ASIGNAR"
  | "ASIGNADO"
  | "PENDIENTE_NOTIFICACION"
  | "NOTIFICADO"
  | "NO_NOTIFICADO"
  | "OBSERVADO";


export type ValidacionAniosManual =
  | "ANIOS_COINCIDEN"
  | "EXCEL_ATRASADO_1"
  | "EXCEL_ADELANTADO_1"
  | "ANIOS_DIFERENTES"
  | "REFERENCIA_INSCRIPCION_INCONSISTENTE"
  | "SIN_TRES_ANIOS_PAGADOS"
  | "COBERTURA_INCOMPLETA"
  | "DATOS_AMBIGUOS"
  | "SIN_PLACA";

export interface PagoSisgatAnualManual {
  anio: number;
  estado:
    | "PAGADO"
    | "PAGO_PARCIAL"
    | "PENDIENTE"
    | "REVISAR";
  trimestresCubiertos: number[];
  trimestresFaltantes: number[];
  formato: string;
  cantidadDeclaraciones: number;
  cantidadRecibosActivos: number;
  anioInscripcion: number | null;
  propietarioSisgat: string | null;
  observacion: string;
}

export interface AnalisisAniosRequerimientoManual {
  historialPagosSisgat: string;
  pagosPorAnio:
    PagoSisgatAnualManual[];
  aniosManual: number[];
  aniosPagadosCompletos:
    number[];
  ventanaTresAniosPagados:
    number[];
  ventanaTresAniosPagadosFormato:
    string;
  anioInscripcionReferencia:
    number | null;
  aniosTributariosEsperados:
    number[];
  aniosTributariosEsperadosFormato:
    string;
  validacionAnios:
    ValidacionAniosManual;
  validacionAniosEtiqueta:
    string;
  mensajeValidacionAnios:
    string;
  puedeMarcarPagadoPorTresAnios:
    boolean;
  requiereRevisionAnios:
    boolean;
}

export interface ConteoEstado {
  estado: string;
  cantidad: number;
}

export interface ResumenRequerimientosManuales {
  totalRegistros: number;
  totalPeriodos: number;
  porTipo: ConteoEstado[];
  porEstadoConciliado:
    ConteoEstado[];
  porEstadoRevision:
    ConteoEstado[];
  porEstadoNotificacion:
    ConteoEstado[];
}

export interface PaginacionManual {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export interface RequerimientoManualResumen {
  id: number;
  anioGestion: number;
  numeroRequerimiento: string;
  placaOriginal: string | null;
  placaNormalizada: string | null;
  fechaRequerimiento: string | null;
  deudaOriginal: string | null;
  propietarioOriginal: string | null;
  estadoManualOriginal: string | null;
  tipoRegistro:
    TipoRegistroManual;
  estadoConciliado:
    EstadoConciliacionManual;
  estadoRevision:
    EstadoRevisionManual;
  estadoNotificacion:
    EstadoNotificacionManual;
  notificadorActual: string | null;
  responsableActual: string | null;
  numeroCedulonActual: string | null;
  filaOrigen: number | null;
  analisisAnios:
    AnalisisAniosRequerimientoManual;
  _count: {
    periodos: number;
    seguimientos: number;
    historial: number;
  };
}

export interface ReciboManual {
  id: number;
  anioRecibo: number;
  numeroRecibo: string;
  monto: number;
  trimestreOriginal: string | null;
  trimestreDesde: number | null;
  trimestreHasta: number | null;
  estadoOriginal: string | null;
  activo: boolean;
}

export interface DeclaracionManual {
  id: number;
  anioDeclaracion: number;
  numeroDeclaracion: string;
  dniRuc: string | null;
  nombresRazonSocial: string | null;
  placa: string | null;
  recibos: ReciboManual[];
}

export interface PeriodoManual {
  id: number;
  periodoAnio: number;
  estadoConciliado:
    EstadoConciliacionManual;
  montoPagado: number;
  observacion: string | null;
  declaracion:
    DeclaracionManual | null;
}

export interface UsuarioSeguimiento {
  id: number;
  nombre: string;
  nombreUsuario: string;
}

export interface SeguimientoManual {
  id: number;
  estadoNotificacion:
    EstadoNotificacionManual;
  notificador: string | null;
  responsable: string | null;
  numeroLiquidacionDeuda:
    string | null;
  fechaNotificacion:
    string | null;
  numeroCedulon:
    string | null;
  observacion: string | null;
  createdAt: string;
  usuario:
    UsuarioSeguimiento | null;
}

export interface HistorialManual {
  id: number;
  accion: string;
  campo: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  motivo: string | null;
  detalles: unknown;
  createdAt: string;
  usuario:
    UsuarioSeguimiento | null;
}

export interface RequerimientoManualDetalle
  extends RequerimientoManualResumen {
  correlativoExcel: number | null;
  anioVehiculoOriginal:
    string | null;
  anioVehiculo: number | null;
  provinciaOriginal: string | null;
  distritoOriginal: string | null;
  direccionOriginal: string | null;
  notificadorOriginal:
    string | null;
  observacionesOriginal:
    string | null;
  numeroLiquidacionDeudaOriginal:
    string | null;
  fechaNotificacionOriginal:
    string | null;
  numeroCedulonOriginal:
    string | null;
  responsableOriginal:
    string | null;
  notificadorActual: string | null;
  responsableActual: string | null;
  numeroLiquidacionDeudaActual:
    string | null;
  fechaNotificacionActual:
    string | null;
  numeroCedulonActual:
    string | null;
  observacionSeguimiento:
    string | null;
  archivoOrigen: string | null;
  datosOriginales: unknown;
  versionRequerimientosManuales: {
    id: number;
    codigo: string;
    estado: string;
    anioGestion: number;
    fechaAplicacion: string | null;
  } | null;
  periodos: PeriodoManual[];
  seguimientos: SeguimientoManual[];
  historial: HistorialManual[];
}

export interface RequerimientosManualesData {
  registros:
    RequerimientoManualResumen[];
  paginacion: PaginacionManual;
}

export interface FiltrosRequerimientosManuales {
  buscar?: string;
  tipoRegistro?:
    TipoRegistroManual | "";
  estadoConciliado?:
    EstadoConciliacionManual | "";
  estadoRevision?:
    EstadoRevisionManual | "";
  estadoNotificacion?:
    EstadoNotificacionManual | "";
  periodoAnio?: number | null;
  pagina?: number;
  limite?: number;
}

export interface ActualizarSeguimientoManual {
  estadoNotificacion:
    EstadoNotificacionManual;
  notificador: string | null;
  responsable: string | null;
  numeroLiquidacionDeuda:
    string | null;
  fechaNotificacion: string | null;
  numeroCedulon: string | null;
  observacion: string | null;
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
    !headers.has(
      "Content-Type",
    )
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
    RespuestaApi<T> | null =
      null;

  try {
    contenido =
      (await respuesta.json()) as
        RespuestaApi<T>;
  } catch {
    contenido = null;
  }

  if (
    respuesta.status ===
    401
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
        `Error HTTP ${respuesta.status}.`,
    );
  }

  return contenido.data;
}

export function obtenerResumenRequerimientosManuales():
Promise<ResumenRequerimientosManuales> {
  return solicitar(
    "/requerimientos-manuales/resumen",
  );
}

export function obtenerRequerimientosManuales(
  filtros:
    FiltrosRequerimientosManuales,
): Promise<RequerimientosManualesData> {
  const parametros =
    new URLSearchParams();

  if (filtros.buscar?.trim()) {
    parametros.set(
      "buscar",
      filtros.buscar.trim(),
    );
  }

  if (filtros.tipoRegistro) {
    parametros.set(
      "tipoRegistro",
      filtros.tipoRegistro,
    );
  }

  if (
    filtros.estadoConciliado
  ) {
    parametros.set(
      "estadoConciliado",
      filtros.estadoConciliado,
    );
  }

  if (filtros.estadoRevision) {
    parametros.set(
      "estadoRevision",
      filtros.estadoRevision,
    );
  }

  if (
    filtros.estadoNotificacion
  ) {
    parametros.set(
      "estadoNotificacion",
      filtros.estadoNotificacion,
    );
  }

  if (filtros.periodoAnio) {
    parametros.set(
      "periodoAnio",
      String(
        filtros.periodoAnio,
      ),
    );
  }

  parametros.set(
    "pagina",
    String(
      filtros.pagina ?? 1,
    ),
  );

  parametros.set(
    "limite",
    String(
      filtros.limite ?? 15,
    ),
  );

  return solicitar(
    `/requerimientos-manuales?${parametros.toString()}`,
  );
}

export function obtenerRequerimientoManualPorId(
  id: number,
): Promise<RequerimientoManualDetalle> {
  return solicitar(
    `/requerimientos-manuales/${id}`,
  );
}

export function actualizarSeguimientoRequerimientoManual(
  id: number,
  datos:
    ActualizarSeguimientoManual,
): Promise<RequerimientoManualDetalle> {
  return solicitar(
    `/requerimientos-manuales/${id}/seguimiento`,
    {
      method: "PATCH",
      body:
        JSON.stringify(
          datos,
        ),
    },
  );
}

export function puedeEditarRequerimientosManuales(
  rol: RolSesion,
): boolean {
  return (
    rol === "USUARIO" ||
    rol === "ADMINISTRADOR"
  );
}




export interface IncidenciaVersionRequerimientosManuales {
  fila: number;
  campo: string;
  nivel: "ERROR" | "ADVERTENCIA";
  mensaje: string;
  datosOriginales: Record<string, string | number | boolean | null>;
}

export interface ResultadoAnalisisVersionRequerimientosManuales {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  anioGestion: number;
  fechaAnalisis: string | null;
  puedeConfirmarse: boolean;
  reanalisis: boolean;
  totales: {
    registros: number;
    periodos: number;
    errores: number;
    advertencias: number;
    placasNormalizables: number;
  };
  clasificacion: {
    porTipoRegistro: Record<string, number>;
    porEstadoManual: Record<string, number>;
  };
  archivo: {
    nombre: string;
    hoja: string;
    totalFilas: number;
    filasValidas: number;
    filasConError: number;
    errores: IncidenciaVersionRequerimientosManuales[];
    advertencias: IncidenciaVersionRequerimientosManuales[];
  };
}

export interface ResultadoConfirmacionVersionRequerimientosManuales {
  version: {
    id: number;
    codigo: string;
    estado: EstadoVersionDatos;
    anioGestion: number;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
  };
  importacion: {
    id: number;
    registrosNuevos: number;
    registrosActualizados: number;
    registrosSinCambios: number;
    totalRegistros: number;
    totalPeriodos: number;
    mensaje?: string | null;
  };
  reemplazo: {
    registrosEliminados: number;
    periodosEliminados: number;
    seguimientosEliminados: number;
    historialEliminado: number;
  };
  totales: {
    registros: number;
    periodos: number;
    seguimientos: number;
    historial: number;
  };
  conciliacion: {
    periodosProcesados: number;
    requerimientosProcesados: number;
    requerimientosPagadosPorTresAnios: number;
    resumenPeriodos: Record<string, number>;
    resumenRequerimientos: Record<string, number>;
    resumenRevision: Record<string, number>;
    resumenValidacionAnios: Record<string, number>;
  };
}

export interface VersionRequerimientosManualesResumen {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  comentario: string | null;
  anioGestion: number;
  totalRegistros: number;
  totalPeriodos: number;
  totalErrores: number;
  totalAdvertencias: number;
  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  usuario?: {
    id: number;
    nombre: string;
    nombreUsuario: string;
  } | null;
  archivo?: {
    id: number;
    nombreArchivo: string;
    nombreHoja: string | null;
    tamanoOriginal: number;
    totalFilas: number;
    filasValidas: number;
    filasConError: number;
    resumen: unknown;
  } | null;
}

export function analizarVersionRequerimientosManuales(
  archivo: File,
  comentario: string,
): Promise<ResultadoAnalisisVersionRequerimientosManuales> {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  if (comentario.trim()) {
    formulario.append("comentario", comentario.trim());
  }

  return solicitar<ResultadoAnalisisVersionRequerimientosManuales>(
    "/versiones-requerimientos-manuales/analizar",
    { method: "POST", body: formulario },
  );
}

export function confirmarVersionRequerimientosManuales(
  versionId: number,
): Promise<ResultadoConfirmacionVersionRequerimientosManuales> {
  return solicitar<ResultadoConfirmacionVersionRequerimientosManuales>(
    `/versiones-requerimientos-manuales/${versionId}/confirmar`,
    { method: "POST", body: "{}" },
  );
}

export function obtenerVersionesRequerimientosManuales():
Promise<VersionRequerimientosManualesResumen[]> {
  return solicitar<VersionRequerimientosManualesResumen[]>(
    "/versiones-requerimientos-manuales",
  );
}
