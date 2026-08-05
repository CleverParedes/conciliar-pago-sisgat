export type EstadoConciliacionLiquidacion =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SOBREPAGO"
  | "SIN_DECLARACION"
  | "PAGO_ANULADO"
  | "ANULADO"
  | "REVISAR";

export interface ResumenEstadoLiquidacion {
  estado:
    EstadoConciliacionLiquidacion;
  cantidad: number;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
}

export interface ResumenLiquidaciones {
  totalLiquidaciones: number;
  montos: {
    importeTotal: number;
    totalPagado: number;
    saldo: number;
  };
  liquidacionesPorEstado:
    ResumenEstadoLiquidacion[];
}

export interface PaginacionLiquidaciones {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export interface ContribuyenteLiquidacion {
  id: number;
  numeroDocumento: string | null;
  nombreRazonSocial: string;
}

export interface LiquidacionResumen {
  id: number;
  anioLiquidacion: number;
  numeroLiquidacion: string;
  fechaEmision: string | null;
  dniRuc: string | null;
  nombre: string | null;
  placa: string | null;
  periodo: string | null;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  pagosSisgat: string;
  pagosAplicadosLiquidacion: string;
  historialPagosSisgat: string;
  pagosFueraLiquidacion: string;
  estado:
    EstadoConciliacionLiquidacion;
  estadoOriginal: string | null;
  cantidadDetalles: number;
  contribuyente:
    ContribuyenteLiquidacion | null;
}

export interface ReciboLiquidacion {
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

export interface DeclaracionLiquidacion {
  id: number;
  anioDeclaracion: number;
  numeroDeclaracion: string;
  estadoConciliacion:
    EstadoConciliacionLiquidacion;
  recibos: ReciboLiquidacion[];
}

export interface PeriodoLiquidacion {
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
  pagosSisgat: string;
  trimestresCubiertos: string;
  trimestresFaltantes: string;
  cantidadTrimestresCubiertos: number;
  cantidadTrimestresSolicitados: number;
  coberturaCompleta: boolean;
  diferenciaMontoInformativa: number;
  estado:
    EstadoConciliacionLiquidacion;
  observacion: string | null;
  declaracion:
    DeclaracionLiquidacion | null;
}

export interface LiquidacionCompleta {
  id: number;
  anioLiquidacion: number;
  numeroLiquidacion: string;
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
  pagosSisgat: string;
  pagosAplicadosLiquidacion: string;
  historialPagosSisgat: string;
  pagosFueraLiquidacion: string;
  estado:
    EstadoConciliacionLiquidacion;
  anioRVeh: number | null;
  numeroRVeh: string | null;
  fechaGeneracion: string | null;
  contribuyente:
    ContribuyenteLiquidacion | null;
  detalles: PeriodoLiquidacion[];
}

export interface LiquidacionesData {
  registros: LiquidacionResumen[];
  paginacion:
    PaginacionLiquidaciones;
}

export interface FiltrosLiquidaciones {
  buscar?: string;
  estado?:
    | EstadoConciliacionLiquidacion
    | "";
  anioLiquidacion?: number | null;
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

export function obtenerResumenLiquidaciones():
Promise<ResumenLiquidaciones> {
  return solicitar<ResumenLiquidaciones>(
    "/liquidaciones/resumen",
  );
}

export function obtenerLiquidaciones(
  filtros: FiltrosLiquidaciones,
): Promise<LiquidacionesData> {
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

  if (filtros.anioLiquidacion) {
    parametros.set(
      "anioLiquidacion",
      String(
        filtros.anioLiquidacion,
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

  return solicitar<LiquidacionesData>(
    `/liquidaciones?${parametros.toString()}`,
  );
}

export function obtenerLiquidacionPorId(
  id: number,
): Promise<LiquidacionCompleta> {
  return solicitar<LiquidacionCompleta>(
    `/liquidaciones/${id}`,
  );
}
