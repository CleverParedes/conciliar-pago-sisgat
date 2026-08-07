import type {
  DashboardData,
  FiltrosOrdenes,
  OrdenCompleta,
  OrdenesData,
  SesionActual,
  CrearUsuarioInput,
  EstadoUsuario,
  RolUsuario,
  UsuarioAdministracion,
  ResultadoAnalisisVersion,
  ResultadoConfirmacionVersion,
  VersionDatosResumen,
  VersionDatosDetalle,
  ResultadoRestauracionVersion,
  FiltrosReporteOrdenes,
  ResumenReporteOrdenes,
  ResumenCentroActualizacion,
  ResultadoAnalisisPagosSisgat,
  ResultadoConfirmacionPagosSisgat,
  VersionPagosSisgatResumen,
  ResultadoAnalisisOrdenes,
  ResultadoConfirmacionOrdenes,
  VersionOrdenesResumen,
  ResultadoAnalisisLiquidaciones,
  ResultadoConfirmacionLiquidaciones,
  VersionLiquidacionesResumen,
  ResultadoAnalisisRequerimientosSisgat,
  ResultadoConfirmacionRequerimientosSisgat,
  VersionRequerimientosSisgatResumen,
} from "./types";

interface RespuestaApi<T> {
  ok: boolean;
  message?: string;
  data: T;
}

interface DatosLogin {
  identificador: string;
  password: string;
}

const API_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

async function leerRespuesta<T>(
  respuesta: Response,
): Promise<RespuestaApi<T> | null> {
  try {
    return (await respuesta.json()) as RespuestaApi<T>;
  } catch {
    return null;
  }
}

async function solicitar<T>(
  ruta: string,
  opciones: RequestInit = {},
): Promise<T> {
  const headers = new Headers(opciones.headers);

  if (typeof opciones.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers,
    credentials: "include",
  });

  const contenido = await leerRespuesta<T>(respuesta);

  if (respuesta.status === 401) {
    window.dispatchEvent(new Event("sesion-expirada"));
  }

  if (!respuesta.ok || contenido === null || contenido.ok !== true) {
    throw new Error(contenido?.message ?? `Error HTTP ${respuesta.status}.`);
  }

  return contenido.data;
}

export function probarArchivoSinAplicar<T>(
  ruta: string,
  campoArchivo: string,
  archivo: File,
): Promise<T> {
  const formulario = new FormData();
  formulario.append(campoArchivo, archivo);

  return solicitar<T>(ruta, {
    method: "POST",
    body: formulario,
  });
}

export async function obtenerSesionActual(): Promise<SesionActual | null> {
  const respuesta = await fetch(`${API_URL}/auth/me`, {
    credentials: "include",
  });

  if (respuesta.status === 401) {
    return null;
  }

  const contenido = await leerRespuesta<SesionActual>(respuesta);

  if (!respuesta.ok || contenido === null || contenido.ok !== true) {
    throw new Error(contenido?.message ?? "No se pudo verificar la sesión.");
  }

  return contenido.data;
}

export function iniciarSesion(datos: DatosLogin): Promise<SesionActual> {
  return solicitar<SesionActual>("/auth/login", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function ingresarComoInvitado(): Promise<SesionActual> {
  return solicitar<SesionActual>("/auth/invitado", {
    method: "POST",
    body: "{}",
  });
}

export function cerrarSesion(): Promise<null> {
  return solicitar<null>("/auth/logout", {
    method: "POST",
    body: "{}",
  });
}

export function obtenerDashboard(): Promise<DashboardData> {
  return solicitar<DashboardData>("/dashboard/resumen");
}

export function obtenerOrdenes(filtros: FiltrosOrdenes): Promise<OrdenesData> {
  const parametros = new URLSearchParams();

  if (filtros.buscar) {
    parametros.set("buscar", filtros.buscar);
  }

  if (filtros.estado) {
    parametros.set("estado", filtros.estado);
  }

  if (filtros.anioOrden) {
    parametros.set("anioOrden", String(filtros.anioOrden));
  }

  if (filtros.periodoAnio) {
    parametros.set("periodoAnio", String(filtros.periodoAnio));
  }

  parametros.set("pagina", String(filtros.pagina ?? 1));

  parametros.set("limite", String(filtros.limite ?? 10));

  return solicitar<OrdenesData>(`/ordenes?${parametros.toString()}`);
}

export function obtenerOrdenPorId(id: number): Promise<OrdenCompleta> {
  return solicitar<OrdenCompleta>(`/ordenes/${id}`);
}

export function obtenerUsuariosAdmin(): Promise<UsuarioAdministracion[]> {
  return solicitar<UsuarioAdministracion[]>("/admin/usuarios");
}

export function crearUsuarioAdmin(
  datos: CrearUsuarioInput,
): Promise<UsuarioAdministracion> {
  return solicitar<UsuarioAdministracion>("/admin/usuarios", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function cambiarEstadoUsuarioAdmin(
  usuarioId: number,
  estado: EstadoUsuario,
): Promise<UsuarioAdministracion> {
  return solicitar<UsuarioAdministracion>(
    `/admin/usuarios/${usuarioId}/estado`,
    {
      method: "PATCH",
      body: JSON.stringify({
        estado,
      }),
    },
  );
}

export function cambiarRolUsuarioAdmin(
  usuarioId: number,
  rol: RolUsuario,
): Promise<UsuarioAdministracion> {
  return solicitar<UsuarioAdministracion>(`/admin/usuarios/${usuarioId}/rol`, {
    method: "PATCH",
    body: JSON.stringify({
      rol,
    }),
  });
}

export function cambiarPasswordUsuarioAdmin(
  usuarioId: number,
  password: string,
): Promise<UsuarioAdministracion> {
  return solicitar<UsuarioAdministracion>(
    `/admin/usuarios/${usuarioId}/password`,
    {
      method: "PATCH",
      body: JSON.stringify({
        password,
      }),
    },
  );
}
export function analizarVersionDatos(
  archivoOrdenes: File,
  archivoDeclaracionesPagos: File,
  comentario: string,
): Promise<ResultadoAnalisisVersion> {
  const formulario = new FormData();

  formulario.append("ordenes", archivoOrdenes);

  formulario.append("declaracionesPagos", archivoDeclaracionesPagos);

  if (comentario.trim()) {
    formulario.append("comentario", comentario.trim());
  }

  return solicitar<ResultadoAnalisisVersion>("/versiones-datos/analizar", {
    method: "POST",
    body: formulario,
  });
}

export function confirmarVersionDatos(
  versionDatosId: number,
  ajustesRevisados: boolean,
): Promise<ResultadoConfirmacionVersion> {
  return solicitar<ResultadoConfirmacionVersion>(
    `/versiones-datos/${versionDatosId}/confirmar`,
    {
      method: "POST",
      body: JSON.stringify({
        ajustesRevisados,
      }),
    },
  );
}



export function analizarVersionPagosSisgat(
  archivo: File,
  comentario: string,
): Promise<ResultadoAnalisisPagosSisgat> {
  const formulario =
    new FormData();

  formulario.append(
    "archivo",
    archivo,
  );

  if (comentario.trim()) {
    formulario.append(
      "comentario",
      comentario.trim(),
    );
  }

  return solicitar<ResultadoAnalisisPagosSisgat>(
    "/versiones-pagos-sisgat/analizar",
    {
      method: "POST",
      body: formulario,
    },
  );
}

export function confirmarVersionPagosSisgat(
  versionId: number,
  ajustesRevisados: boolean,
): Promise<ResultadoConfirmacionPagosSisgat> {
  return solicitar<ResultadoConfirmacionPagosSisgat>(
    `/versiones-pagos-sisgat/${versionId}/confirmar`,
    {
      method: "POST",
      body: JSON.stringify({
        ajustesRevisados,
      }),
    },
  );
}

export function obtenerVersionesPagosSisgat():
Promise<VersionPagosSisgatResumen[]> {
  return solicitar<VersionPagosSisgatResumen[]>(
    "/versiones-pagos-sisgat",
  );
}

export function obtenerResumenCentroActualizacion():
Promise<ResumenCentroActualizacion> {
  return solicitar<ResumenCentroActualizacion>(
    "/versiones-datos/centro-actualizacion",
  );
}

export function obtenerVersionesDatos(): Promise<VersionDatosResumen[]> {
  return solicitar<VersionDatosResumen[]>("/versiones-datos");
}

export function obtenerVersionDatos(
  versionDatosId: number,
): Promise<VersionDatosDetalle> {
  return solicitar<VersionDatosDetalle>(`/versiones-datos/${versionDatosId}`);
}

export function restaurarVersionDatos(
  versionDatosId: number,
): Promise<ResultadoRestauracionVersion> {
  return solicitar<ResultadoRestauracionVersion>(
    `/versiones-datos/${versionDatosId}/restaurar`,
    {
      method: "POST",
    },
  );
}

function parametrosReporte(filtros: FiltrosReporteOrdenes): URLSearchParams {
  const parametros = new URLSearchParams();

  if (filtros.buscar?.trim()) {
    parametros.set("buscar", filtros.buscar.trim());
  }

  if (filtros.estado) {
    parametros.set("estado", filtros.estado);
  }

  if (filtros.anioOrden) {
    parametros.set("anioOrden", String(filtros.anioOrden));
  }

  if (filtros.periodoAnio) {
    parametros.set("periodoAnio", String(filtros.periodoAnio));
  }

  return parametros;
}

function nombreArchivoDescarga(respuesta: Response): string {
  const disposicion = respuesta.headers.get("Content-Disposition") ?? "";

  const coincidencia = /filename="?([^";]+)"?/i.exec(disposicion);

  return coincidencia?.[1] || "reporte_ordenes.xlsx";
}

export function obtenerResumenReporteOrdenes(
  filtros: FiltrosReporteOrdenes,
): Promise<ResumenReporteOrdenes> {
  const parametros = parametrosReporte(filtros);

  return solicitar<ResumenReporteOrdenes>(
    `/reportes/ordenes/resumen?${parametros.toString()}`,
  );
}

export async function descargarReporteOrdenesExcel(
  filtros: FiltrosReporteOrdenes,
): Promise<string> {
  const parametros = parametrosReporte(filtros);

  const respuesta = await fetch(
    `${API_URL}/reportes/ordenes.xlsx?${parametros.toString()}`,
    {
      credentials: "include",
    },
  );

  if (respuesta.status === 401) {
    window.dispatchEvent(new Event("sesion-expirada"));
  }

  if (!respuesta.ok) {
    const contenido = await leerRespuesta<null>(respuesta);

    throw new Error(
      contenido?.message ??
        `No se pudo generar el reporte. Error HTTP ${respuesta.status}.`,
    );
  }

  const archivo = await respuesta.blob();
  const nombre = nombreArchivoDescarga(respuesta);
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

export function analizarVersionOrdenes(
  archivo: File,
  comentario: string,
): Promise<ResultadoAnalisisOrdenes> {
  const formulario =
    new FormData();

  formulario.append(
    "archivo",
    archivo,
  );

  formulario.append(
    "comentario",
    comentario,
  );

  return solicitar<ResultadoAnalisisOrdenes>(
    "/versiones-ordenes/analizar",
    {
      method: "POST",
      body: formulario,
    },
  );
}

export function confirmarVersionOrdenes(
  versionOrdenesId: number,
): Promise<ResultadoConfirmacionOrdenes> {
  return solicitar<ResultadoConfirmacionOrdenes>(
    `/versiones-ordenes/${versionOrdenesId}/confirmar`,
    {
      method: "POST",
      body: "{}",
    },
  );
}

export function obtenerVersionesOrdenes():
Promise<VersionOrdenesResumen[]> {
  return solicitar<VersionOrdenesResumen[]>(
    "/versiones-ordenes",
  );
}



export function analizarVersionLiquidaciones(
  archivo: File,
  comentario: string,
): Promise<ResultadoAnalisisLiquidaciones> {
  const formulario =
    new FormData();

  formulario.append(
    "liquidaciones",
    archivo,
  );

  if (comentario.trim()) {
    formulario.append(
      "comentario",
      comentario.trim(),
    );
  }

  return solicitar<ResultadoAnalisisLiquidaciones>(
    "/versiones-liquidaciones/analizar",
    {
      method: "POST",
      body: formulario,
    },
  );
}

export function confirmarVersionLiquidaciones(
  versionLiquidacionesId: number,
): Promise<ResultadoConfirmacionLiquidaciones> {
  return solicitar<ResultadoConfirmacionLiquidaciones>(
    `/versiones-liquidaciones/${versionLiquidacionesId}/confirmar`,
    {
      method: "POST",
      body: "{}",
    },
  );
}

export function obtenerVersionesLiquidaciones():
Promise<VersionLiquidacionesResumen[]> {
  return solicitar<VersionLiquidacionesResumen[]>(
    "/versiones-liquidaciones",
  );
}


export function analizarVersionRequerimientosSisgat(
  archivo: File,
  comentario: string,
): Promise<ResultadoAnalisisRequerimientosSisgat> {
  const formulario = new FormData();
  formulario.append("requerimientos", archivo);
  if (comentario.trim()) formulario.append("comentario", comentario.trim());

  return solicitar<ResultadoAnalisisRequerimientosSisgat>(
    "/versiones-requerimientos/analizar",
    { method: "POST", body: formulario },
  );
}

export function confirmarVersionRequerimientosSisgat(
  versionRequerimientosId: number,
): Promise<ResultadoConfirmacionRequerimientosSisgat> {
  return solicitar<ResultadoConfirmacionRequerimientosSisgat>(
    `/versiones-requerimientos/${versionRequerimientosId}/confirmar`,
    { method: "POST", body: "{}" },
  );
}

export function obtenerVersionesRequerimientosSisgat():
Promise<VersionRequerimientosSisgatResumen[]> {
  return solicitar<VersionRequerimientosSisgatResumen[]>(
    "/versiones-requerimientos",
  );
}
