export type EstadoConciliacionRequerimiento =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SOBREPAGO"
  | "SIN_DECLARACION"
  | "PAGO_ANULADO"
  | "ANULADO"
  | "REVISAR";

export interface ResumenEstadoRequerimiento {
  estado:
    EstadoConciliacionRequerimiento;
  cantidad: number;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
}

export interface ResumenRequerimientos {
  totalRequerimientos: number;
  montos: {
    importeTotal: number;
    totalPagado: number;
    saldo: number;
  };
  requerimientosPorEstado:
    ResumenEstadoRequerimiento[];
}

export interface PaginacionRequerimientos {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export interface ContribuyenteRequerimiento {
  id: number;
  numeroDocumento: string | null;
  nombreRazonSocial: string;
}

export interface PagoSisgatRequerimiento {
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

export interface RequerimientoResumen {
  id: number;
  anioRequerimiento: number;
  numeroRequerimiento: string;
  fechaEmision: string | null;
  dniRuc: string | null;
  nombre: string | null;
  placa: string | null;
  pagosSisgat: PagoSisgatRequerimiento[];
  anioInscripcion: number | null;
  anioUltimoTributario: number | null;
  tresAniosPagados: boolean | null;
  periodo: string | null;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  estado:
    EstadoConciliacionRequerimiento;
  estadoOriginal: string | null;
  cantidadDetalles: number;
  contribuyente:
    ContribuyenteRequerimiento | null;
}

export interface ReciboRequerimiento {
  id: number;
  anioRecibo: number;
  numeroRecibo: string;
  monto: number;
  trimestre: string | null;
  trimestreDesde: number | null;
  trimestreHasta: number | null;
  estadoOriginal: string | null;
  activo: boolean;
}

export interface DeclaracionRequerimiento {
  id: number;
  anioDeclaracion: number;
  numeroDeclaracion: string;
  estadoConciliacion:
    EstadoConciliacionRequerimiento;
  recibos: ReciboRequerimiento[];
}

export interface PeriodoRequerimiento {
  id: number;
  periodoAnio: number;
  periodoOriginal: string | null;
  trimestreDesde: number;
  trimestreHasta: number;
  valorReferencial: number | null;
  anioFabricacion: number | null;
  uit: number | null;
  baseImponible: number | null;
  impuesto: number | null;
  reajuste: number | null;
  interes: number | null;
  gastosAdmin: number | null;
  totalPeriodo: number;
  montoPagado: number;
  saldo: number;
  estado:
    EstadoConciliacionRequerimiento;
  observacion: string | null;
  declaracion:
    DeclaracionRequerimiento | null;
}

export interface RequerimientoCompleta {
  id: number;
  anioRequerimiento: number;
  numeroRequerimiento: string;
  idOrigen: string | null;
  fechaEmision: string | null;
  dniRuc: string | null;
  nombre: string | null;
  direccion: string | null;
  placa: string | null;
  fechaSunarp: string | null;
  estadoOriginal: string | null;
  periodoOriginal: string | null;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  estado:
    EstadoConciliacionRequerimiento;
  fechaGeneracion: string | null;
  contribuyente:
    ContribuyenteRequerimiento | null;
  detalles: PeriodoRequerimiento[];
}

export interface RequerimientosData {
  registros: RequerimientoResumen[];
  paginacion:
    PaginacionRequerimientos;
}

export interface FiltrosRequerimientos {
  buscar?: string;
  estado?:
    | EstadoConciliacionRequerimiento
    | "";
  anioRequerimiento?: number | null;
  periodoAnio?: number | null;
  pagina?: number;
  limite?: number;
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
): Promise<T> {
  const respuesta = await fetch(
    `${API_URL}${ruta}`,
    {
      credentials: "include",
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

export function obtenerResumenRequerimientos():
Promise<ResumenRequerimientos> {
  return solicitar<ResumenRequerimientos>(
    "/requerimientos/resumen",
  );
}

export function obtenerRequerimientos(
  filtros: FiltrosRequerimientos,
): Promise<RequerimientosData> {
  const parametros =
    new URLSearchParams();

  if (filtros.buscar?.trim()) {
    parametros.set(
      "buscar",
      filtros.buscar.trim(),
    );
  }

  if (filtros.estado) {
    parametros.set(
      "estado",
      filtros.estado,
    );
  }

  if (filtros.anioRequerimiento) {
    parametros.set(
      "anioRequerimiento",
      String(
        filtros.anioRequerimiento,
      ),
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
    String(filtros.pagina ?? 1),
  );

  parametros.set(
    "limite",
    String(filtros.limite ?? 10),
  );

  return solicitar<RequerimientosData>(
    `/requerimientos?${parametros.toString()}`,
  );
}

export function obtenerRequerimientoPorId(
  id: number,
): Promise<RequerimientoCompleta> {
  return solicitar<RequerimientoCompleta>(
    `/requerimientos/${id}`,
  );
}
