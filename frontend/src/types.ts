export type EstadoConciliacion =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "SOBREPAGO"
  | "SIN_DECLARACION"
  | "PAGO_ANULADO"
  | "ANULADO"
  | "REVISAR";

export interface MontosDashboard {
  importeTotal: number;
  totalPagado: number;
  saldo: number;
}

export interface ResumenEstado {
  estado: EstadoConciliacion;
  cantidad: number;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
}

export interface ImportacionResumen {
  id: number;
  tipo: string;
  origen: string;
  estado: string;
  nombreArchivo: string;
  totalFilas: number;
  filasCorrectas: number;
  filasConError: number;
  fechaImportacion: string;
  fechaFinalizacion: string | null;
}

export interface DashboardData {
  totalOrdenes: number;
  totalContribuyentes: number;
  montos: MontosDashboard;
  ordenesPorEstado: ResumenEstado[];
  ultimasImportaciones: ImportacionResumen[];
}

export interface ContribuyenteResumen {
  id: number;
  numeroDocumento: string;
  nombreRazonSocial: string;
}

export interface PagoSisgatResumen {
  id: number;
  anioRecibo: number;
  numeroRecibo: string;
  monto: number;
  trimestreOriginal: string | null;
  estadoOriginal: string | null;
  activo: boolean;
}

export interface OrdenResumen {
  id: number;
  anioOrden: number;
  numeroOrden: string;
  fechaEmision: string | null;
  dniRuc: string;
  nombre: string;
  placa: string;
  pagosSisgat: PagoSisgatResumen[];
  periodo: string;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  estado: EstadoConciliacion;
  activoOriginal: number | null;
  cantidadDetalles: number;
  contribuyente: ContribuyenteResumen | null;
}

export interface Paginacion {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export interface OrdenesData {
  registros: OrdenResumen[];
  paginacion: Paginacion;
}

export interface ReciboDetalle {
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

export interface DeclaracionDetalle {
  id: number;
  anioDeclaracion: number;
  numeroDeclaracion: string;
  estadoConciliacion: EstadoConciliacion;
  recibos: ReciboDetalle[];
}

export interface PeriodoDetalle {
  id: number;
  periodoAnio: number;
  periodoOriginal: string;
  trimestreDesde: number;
  trimestreHasta: number;
  valorReferencial: number | null;
  impuesto: number | null;
  reajuste: number | null;
  interes: number | null;
  gastosAdmin: number | null;
  totalPeriodo: number;
  montoPagado: number;
  saldo: number;
  estado: EstadoConciliacion;
  observacion: string | null;
  declaracion: DeclaracionDetalle | null;
}

export interface OrdenCompleta {
  id: number;
  anioOrden: number;
  numeroOrden: string;
  fechaEmision: string | null;
  dniRuc: string;
  nombre: string;
  direccion: string | null;
  placa: string;
  fechaSunarp: string | null;
  activoOriginal: number | null;
  periodoOriginal: string;
  importeTotal: number;
  totalPagado: number;
  saldo: number;
  estado: EstadoConciliacion;
  contribuyente: ContribuyenteResumen | null;
  detalles: PeriodoDetalle[];
}

export interface FiltrosOrdenes {
  buscar?: string;
  estado?: EstadoConciliacion | "";
  anioOrden?: number | null;
  periodoAnio?: number | null;
  pagina?: number;
  limite?: number;
}

export type RolSesion = "INVITADO" | "USUARIO" | "ADMINISTRADOR";

export type TipoSesion = "INVITADO" | "AUTENTICADO";

export interface UsuarioSesion {
  id: number;
  nombre: string;
  nombreUsuario: string;
  correo: string | null;
}

export interface SesionActual {
  autenticado: true;
  tipo: TipoSesion;
  rol: RolSesion;
  usuario: UsuarioSesion | null;
  fechaExpira: string;
}

export type RolUsuario = "USUARIO" | "ADMINISTRADOR";

export type EstadoUsuario = "ACTIVO" | "BLOQUEADO" | "DESACTIVADO";

export interface UsuarioAdministracion {
  id: number;
  nombre: string;
  nombreUsuario: string;
  correo: string | null;
  rol: RolUsuario;
  estado: EstadoUsuario;
  intentosFallidos: number;
  bloqueadoHasta: string | null;
  ultimoAcceso: string | null;
  createdAt: string;
  updatedAt: string;

  _count: {
    sesiones: number;
    auditorias: number;
  };
}

export interface CrearUsuarioInput {
  nombre: string;
  nombreUsuario: string;
  correo: string | null;
  password: string;
  rol: RolUsuario;
}

export type EstadoVersionDatos =
  | "PENDIENTE"
  | "VALIDADA"
  | "APLICANDO"
  | "ACTIVA"
  | "ARCHIVADA"
  | "FALLIDA"
  | "CANCELADA";

export type TipoArchivoVersion = "ORDENES" | "DECLARACIONES_PAGOS";

export interface ErrorAnalisisArchivo {
  fila: number;
  campo: string;
  mensaje: string;
  datosOriginales: {
    valores: string[];
  };
}

export type CampoIdentidadRecuperado = "DNI_RUC" | "NOMBRE_RAZON_SOCIAL";

export interface AdvertenciaAjusteAutomatico {
  id: string;
  tipo: "IDENTIDAD_RECUPERADA" | "IDENTIDAD_MARCADOR";
  fila: number;
  anioDeclaracion: string;
  numeroDeclaracion: string;
  placa: string;
  numeroSerie: string;
  camposCompletados: CampoIdentidadRecuperado[];
  documentoEnmascarado: string;
  nombreRecuperado: string;
  filaFuente: number;
  anioDeclaracionFuente: string;
  numeroDeclaracionFuente: string;
  metodo:
    | "PLACA_Y_SERIE_COINCIDENCIA_UNICA"
    | "MARCADOR_DATO_FALTANTE";
  mensaje: string;
}

export interface ArchivoAnalizado {
  nombre: string;
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  errores: ErrorAnalisisArchivo[];
  advertencias?: AdvertenciaAjusteAutomatico[];
}

export interface ResultadoAnalisisVersion {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  fechaAnalisis: string | null;
  puedeConfirmarse: boolean;
  requiereRevisionAjustes: boolean;
  totalAdvertencias: number;
  advertencias: AdvertenciaAjusteAutomatico[];
  reanalisis: boolean;

  totales: {
    ordenes: number;
    declaraciones: number;
    recibos: number;
    errores: number;
  };

  archivos: {
    ordenes: ArchivoAnalizado;
    declaracionesPagos: ArchivoAnalizado;
  };
}

export interface ResultadoImportacionVersion {
  importacionId: number;
  totalFilas: number;
  filasCorrectas: number;
  filasConError: number;
  ajustesAutomaticos?: number;
  estado: string;
}

export interface ResultadoConfirmacionVersion {
  version: {
    id: number;
    codigo: string;
    estado: EstadoVersionDatos;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
  };

  importaciones: {
    ordenes: ResultadoImportacionVersion;
    declaracionesPagos: ResultadoImportacionVersion;
  };

  totales: {
    contribuyentes: number;
    ordenes: number;
    detalles: number;
    declaraciones: number;
    recibos: number;
  };

  conciliacion: {
    detallesProcesados: number;
    ordenesProcesadas: number;
    resumenDetalles: Record<string, number>;
    resumenOrdenes: Record<string, number>;
  };
}

export interface ArchivoVersionResumen {
  id: number;
  tipo: TipoArchivoVersion;
  nombreArchivo: string;
  tamanoOriginal: number;
  tamanoComprimido: number;
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
}

export interface VersionDatosResumen {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  comentario: string | null;
  totalOrdenes: number;
  totalDeclaraciones: number;
  totalRecibos: number;
  totalErrores: number;
  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  updatedAt: string;

  usuario: {
    id: number;
    nombre: string;
    nombreUsuario: string;
  } | null;

  archivos: ArchivoVersionResumen[];

  _count: {
    importaciones: number;
    ordenes: number;
    declaraciones: number;
  };
}

export interface ErrorArchivoVersion {
  id: number;
  fila: number;
  campo: string | null;
  mensaje: string;
  datosOriginales: unknown;
  createdAt: string;
}

export interface ArchivoVersionDetalle extends ArchivoVersionResumen {
  hashArchivo: string;
  resumen: unknown;
  errores: ErrorArchivoVersion[];
}

export interface ImportacionVersionDetalle {
  id: number;
  tipo: string;
  origen: string;
  estado: string;
  nombreArchivo: string;
  totalFilas: number;
  filasCorrectas: number;
  filasConError: number;
  registrosNuevos: number;
  registrosActualizados: number;
  registrosSinCambios: number;
  fechaImportacion: string;
  fechaFinalizacion: string | null;
  mensaje: string | null;
}

export interface VersionDatosDetalle {
  id: number;
  codigo: string;
  hashConjunto: string;
  estado: EstadoVersionDatos;
  comentario: string | null;

  totalOrdenes: number;
  totalDeclaraciones: number;
  totalRecibos: number;
  totalErrores: number;

  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  updatedAt: string;

  usuario: {
    id: number;
    nombre: string;
    nombreUsuario: string;
  } | null;

  archivos: ArchivoVersionDetalle[];
  importaciones: ImportacionVersionDetalle[];

  _count: {
    ordenes: number;
    declaraciones: number;
    importaciones: number;
  };
}

export interface VersionAnteriorRestauracion {
  id: number;
  codigo: string;
  fechaAplicacion: string | null;
}

export interface ResultadoRestauracionVersion extends ResultadoConfirmacionVersion {
  versionAnterior: VersionAnteriorRestauracion | null;
}

export interface FiltrosReporteOrdenes {
  buscar?: string;
  estado?: EstadoConciliacion | "";
  anioOrden?: number | null;
  periodoAnio?: number | null;
}

export interface ResumenReporteOrdenes {
  versionActiva: {
    id: number;
    codigo: string;
    comentario: string | null;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
    totalOrdenes: number;
    totalDeclaraciones: number;
    totalRecibos: number;
  };

  filtros: {
    buscar: string;
    estado: EstadoConciliacion | null;
    anioOrden: number | null;
    periodoAnio: number | null;
  };

  totales: {
    ordenes: number;
    importeTotal: number;
    totalPagado: number;
    saldo: number;
  };

  estados: ResumenEstado[];
}

export interface FuenteCentroActualizacion {
  disponible: boolean;
  versionId?: number;
  codigo?: string;
  estado?: EstadoVersionDatos;
  fechaAplicacion?: string | null;
  totalPrincipal?: number;
  etiquetaPrincipal?: string;
  totalSecundario?: number | null;
  etiquetaSecundaria?: string | null;
  totalErrores?: number;
  totalAdvertencias?: number;
  anioGestion?: number;
  comentario?: string | null;
  versionCompartida: boolean;
}

export interface ResumenCentroActualizacion {
  pagosSisgat:
    FuenteCentroActualizacion;
  ordenes:
    FuenteCentroActualizacion;
  liquidaciones:
    FuenteCentroActualizacion;
  requerimientosSisgat:
    FuenteCentroActualizacion;
  requerimientosManuales:
    FuenteCentroActualizacion;
}

export interface ResultadoAnalisisPagosSisgat {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  fechaAnalisis: string | null;
  puedeConfirmarse: boolean;
  requiereRevisionAjustes: boolean;
  totalAdvertencias: number;
  advertencias:
    AdvertenciaAjusteAutomatico[];
  reanalisis: boolean;
  totales: {
    declaraciones: number;
    recibos: number;
    errores: number;
  };
  archivo: ArchivoAnalizado;
}

export interface ResultadoConfirmacionPagosSisgat {
  version: {
    id: number;
    codigo: string;
    estado: EstadoVersionDatos;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
  };
  importacion:
    ResultadoImportacionVersion;
  totales: {
    contribuyentes: number;
    declaraciones: number;
    recibos: number;
  };
  modulosConservados: {
    ordenes: number;
    liquidaciones: number;
    requerimientosSisgat: number;
    requerimientosManuales: number;
  };
  conciliaciones: {
    ordenes: {
      detallesProcesados: number;
      ordenesProcesadas: number;
      resumenDetalles:
        Record<string, number>;
      resumenOrdenes:
        Record<string, number>;
    };
    liquidaciones: {
      detallesProcesados: number;
      liquidacionesProcesadas: number;
      resumenDetalles:
        Record<string, number>;
      resumenLiquidaciones:
        Record<string, number>;
    };
    requerimientosSisgat: {
      detallesProcesados: number;
      requerimientosProcesadas: number;
      resumenDetalles:
        Record<string, number>;
      resumenRequerimientos:
        Record<string, number>;
    };
    requerimientosManuales: {
      periodosProcesados: number;
      requerimientosProcesados: number;
      requerimientosPagadosPorTresAnios:
        number;
      resumenRequerimientos:
        Record<string, number>;
      resumenRevision:
        Record<string, number>;
      resumenValidacionAnios:
        Record<string, number>;
    };
  };
}

export interface VersionPagosSisgatResumen {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  comentario: string | null;
  totalDeclaraciones: number;
  totalRecibos: number;
  totalErrores: number;
  totalAdvertencias: number;
  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResultadoAnalisisOrdenes {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  fechaAnalisis: string | null;
  puedeConfirmarse: boolean;
  reanalisis: boolean;
  totales: {
    ordenes: number;
    detalles: number;
    errores: number;
  };
  archivo: ArchivoAnalizado;
}

export interface ResultadoConfirmacionOrdenes {
  version: {
    id: number;
    codigo: string;
    estado: EstadoVersionDatos;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
  };
  importacion:
    ResultadoImportacionVersion;
  totales: {
    contribuyentes: number;
    ordenes: number;
    detalles: number;
  };
  modulosConservados: {
    declaraciones: number;
    recibos: number;
    liquidaciones: number;
    requerimientosSisgat: number;
    requerimientosManuales: number;
  };
  conciliacion: {
    detallesProcesados: number;
    ordenesProcesadas: number;
    resumenDetalles:
      Record<string, number>;
    resumenOrdenes:
      Record<string, number>;
  };
}

export interface VersionOrdenesResumen {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  comentario: string | null;
  totalOrdenes: number;
  totalDetalles: number;
  totalErrores: number;
  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  updatedAt: string;
}



export interface ResultadoAnalisisLiquidaciones {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  fechaAnalisis: string | null;
  puedeConfirmarse: boolean;
  reanalisis: boolean;
  totales: {
    liquidaciones: number;
    detalles: number;
    activas: number;
    anuladas: number;
    errores: number;
  };
  archivo: ArchivoAnalizado;
}

export interface ResultadoImportacionLiquidaciones {
  id: number;
  tipo: string;
  origen: string;
  estado: string;
  nombreArchivo: string;
  totalFilas: number;
  filasCorrectas: number;
  filasConError: number;
  registrosNuevos: number;
  registrosActualizados: number;
  registrosSinCambios: number;
  fechaImportacion: string;
  fechaFinalizacion: string | null;
  mensaje: string | null;
  totalLiquidaciones: number;
  totalDetalles: number;
  activas: number;
  anuladas: number;
}

export interface ResultadoConfirmacionLiquidaciones {
  version: {
    id: number;
    codigo: string;
    estado: EstadoVersionDatos;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
  };
  importacion: ResultadoImportacionLiquidaciones;
  totales: {
    liquidaciones: number;
    detalles: number;
    contribuyentes: number;
  };
  conciliacion: {
    detallesProcesados: number;
    liquidacionesProcesadas: number;
    resumenDetalles: Record<string, number>;
    resumenLiquidaciones: Record<string, number>;
  };
}

export interface VersionLiquidacionesResumen {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  comentario: string | null;
  totalLiquidaciones: number;
  totalDetalles: number;
  totalErrores: number;
  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  updatedAt: string;
  usuario?: {
    id: number;
    nombre: string;
    nombreUsuario: string;
  } | null;
  archivo?: {
    id: number;
    nombreArchivo: string;
    tamanoOriginal: number;
    tamanoComprimido: number;
    totalFilas: number;
    filasValidas: number;
    filasConError: number;
    resumen: unknown;
  } | null;
  _count?: {
    importaciones: number;
    liquidaciones: number;
  };
}


export interface ErrorAnalisisRequerimientoSisgat {
  fila: number;
  campo: string;
  mensaje: string;
  datosOriginales: Record<string, string>;
}

export interface AdvertenciaAnalisisRequerimientoSisgat {
  fila: number;
  tipo: "NUMERACION_ATIPICA" | "POSIBLE_DUPLICIDAD";
  mensaje: string;
  datosOriginales: Record<string, string>;
}

export interface ResultadoAnalisisRequerimientosSisgat {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  fechaAnalisis: string | null;
  puedeConfirmarse: boolean;
  reanalisis: boolean;
  totales: {
    requerimientos: number;
    detalles: number;
    activos: number;
    anulados: number;
    errores: number;
  };
  archivo: {
    nombre: string;
    totalFilas: number;
    filasValidas: number;
    filasConError: number;
    errores: ErrorAnalisisRequerimientoSisgat[];
    advertencias: AdvertenciaAnalisisRequerimientoSisgat[];
  };
}

export interface ResultadoConfirmacionRequerimientosSisgat {
  version: {
    id: number;
    codigo: string;
    estado: EstadoVersionDatos;
    fechaAnalisis: string | null;
    fechaAplicacion: string | null;
  };
  totales: {
    requerimientos: number;
    detalles: number;
    contribuyentes: number;
  };
  conciliacion: {
    detallesProcesados: number;
    requerimientosProcesadas: number;
    resumenDetalles: Record<string, number>;
    resumenRequerimientos: Record<string, number>;
  };
}

export interface VersionRequerimientosSisgatResumen {
  id: number;
  codigo: string;
  estado: EstadoVersionDatos;
  comentario: string | null;
  totalRequerimientos: number;
  totalDetalles: number;
  totalErrores: number;
  fechaAnalisis: string | null;
  fechaAplicacion: string | null;
  createdAt: string;
  updatedAt: string;
  usuario?: { id: number; nombre: string; nombreUsuario: string } | null;
  archivo?: {
    id: number;
    nombreArchivo: string;
    tamanoOriginal: number;
    tamanoComprimido: number;
    totalFilas: number;
    filasValidas: number;
    filasConError: number;
    resumen: unknown;
  } | null;
  _count?: { importaciones: number; requerimientos: number };
}
