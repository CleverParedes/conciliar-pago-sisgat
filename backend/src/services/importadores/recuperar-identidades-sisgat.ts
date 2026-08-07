import type { Prisma } from "../../../generated/prisma/client";

export type CampoIdentidadRecuperado = "DNI_RUC" | "NOMBRE_RAZON_SOCIAL";

export type MetodoAjusteIdentidad =
  | "PLACA_Y_SERIE_COINCIDENCIA_UNICA"
  | "MARCADOR_DATO_FALTANTE";

export interface AdvertenciaIdentidadRecuperada {
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
  metodo: MetodoAjusteIdentidad;
  mensaje: string;
}

export const MARCADOR_DNI_RUC = "SIN DNI/RUC";
export const MARCADOR_RAZON_SOCIAL = "SIN RZ";

export function advertenciaIdentidadRecuperadaComoJson(
  advertencia: AdvertenciaIdentidadRecuperada,
): Prisma.InputJsonObject {
  return {
    id: advertencia.id,
    tipo: advertencia.tipo,
    fila: advertencia.fila,
    anioDeclaracion: advertencia.anioDeclaracion,
    numeroDeclaracion: advertencia.numeroDeclaracion,
    placa: advertencia.placa,
    numeroSerie: advertencia.numeroSerie,
    camposCompletados: [...advertencia.camposCompletados],
    documentoEnmascarado: advertencia.documentoEnmascarado,
    nombreRecuperado: advertencia.nombreRecuperado,
    filaFuente: advertencia.filaFuente,
    anioDeclaracionFuente: advertencia.anioDeclaracionFuente,
    numeroDeclaracionFuente: advertencia.numeroDeclaracionFuente,
    metodo: advertencia.metodo,
    mensaje: advertencia.mensaje,
  };
}

interface IdentidadCandidata {
  documento: string;
  nombre: string;
  nombreNormalizado: string;
  filaFuente: number;
  anioDeclaracionFuente: string;
  numeroDeclaracionFuente: string;
}

interface ResultadoRecuperacionIdentidades {
  filas: string[][];
  advertencias: AdvertenciaIdentidadRecuperada[];
}

const INDICE_DOCUMENTO = 4;
const INDICE_NOMBRE = 5;
const INDICE_PLACA = 12;
const INDICE_SERIE = 14;

function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizarPlaca(valor: string): string {
  const placa = valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (placa.length === 6) {
    return `${placa.slice(0, 3)}-${placa.slice(3)}`;
  }

  return placa;
}

function normalizarSerie(valor: string): string {
  return valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function enmascararDocumento(documento: string): string {
  if (documento === MARCADOR_DNI_RUC) {
    return MARCADOR_DNI_RUC;
  }

  if (documento.length <= 4) {
    return documento;
  }

  return `${"*".repeat(documento.length - 4)}${documento.slice(-4)}`;
}

function crearClaveVehiculo(fila: string[]): string | null {
  const placa = normalizarPlaca(fila[INDICE_PLACA] ?? "");
  const serie = normalizarSerie(fila[INDICE_SERIE] ?? "");

  if (!placa || !serie) {
    return null;
  }

  return `${placa}|${serie}`;
}

function obtenerClaveIdentidad(identidad: IdentidadCandidata): string {
  return [identidad.documento, identidad.nombreNormalizado].join("|");
}

function crearAdvertenciaMarcador(
  fila: string[],
  indice: number,
  camposCompletados: CampoIdentidadRecuperado[],
): AdvertenciaIdentidadRecuperada {
  const filaObjetivo = indice + 2;
  const placa = normalizarPlaca(fila[INDICE_PLACA] ?? "");
  const numeroSerie = normalizarSerie(fila[INDICE_SERIE] ?? "");
  const documento = (fila[INDICE_DOCUMENTO] ?? "").trim();
  const nombre = (fila[INDICE_NOMBRE] ?? "").trim();

  const etiquetas = camposCompletados.map((campo) =>
    campo === "DNI_RUC" ? MARCADOR_DNI_RUC : MARCADOR_RAZON_SOCIAL,
  );

  return {
    id: `IDENTIDAD_MARCADOR-${filaObjetivo}`,
    tipo: "IDENTIDAD_MARCADOR",
    fila: filaObjetivo,
    anioDeclaracion: fila[0] ?? "",
    numeroDeclaracion: fila[1] ?? "",
    placa,
    numeroSerie,
    camposCompletados,
    documentoEnmascarado:
      documento === MARCADOR_DNI_RUC
        ? MARCADOR_DNI_RUC
        : enmascararDocumento(normalizarDocumento(documento)),
    nombreRecuperado: nombre || MARCADOR_RAZON_SOCIAL,
    filaFuente: 0,
    anioDeclaracionFuente: "",
    numeroDeclaracionFuente: "",
    metodo: "MARCADOR_DATO_FALTANTE",
    mensaje:
      `No se encontró una coincidencia única y segura para completar el dato faltante. ` +
      `Se asignó ${etiquetas.join(" y ")} como marcador controlado para permitir la importación ` +
      `sin ocultar que el dato no estaba disponible en la fuente. El archivo original no fue modificado.`,
  };
}

/**
 * Ajusta únicamente los campos de identidad de declaraciones SisGAT.
 *
 * Orden de reglas:
 *
 * 1. Intenta recuperar DNI/RUC y/o nombre cuando existe otra fila con la misma
 *    placa + número de serie y todas las coincidencias válidas representan una
 *    única identidad compatible.
 * 2. Si después de ese intento todavía falta DNI/RUC o nombre, asigna los
 *    marcadores controlados "SIN DNI/RUC" y "SIN RZ".
 * 3. Cada cambio se devuelve como advertencia para que el administrador lo
 *    revise y lo autorice antes de confirmar la versión.
 *
 * Nunca modifica el arreglo original recibido.
 */
export function recuperarIdentidadesDeclaracionesSisgat(
  filasEntrada: string[][],
): ResultadoRecuperacionIdentidades {
  const filas = filasEntrada.map((fila) => [...fila]);
  const candidatosPorVehiculo = new Map<string, IdentidadCandidata[]>();

  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];
    const documento = normalizarDocumento(fila[INDICE_DOCUMENTO] ?? "");
    const nombre = (fila[INDICE_NOMBRE] ?? "").trim();
    const claveVehiculo = crearClaveVehiculo(fila);

    if (!documento || !nombre || !claveVehiculo) {
      continue;
    }

    const candidato: IdentidadCandidata = {
      documento,
      nombre,
      nombreNormalizado: normalizarTexto(nombre),
      filaFuente: indice + 2,
      anioDeclaracionFuente: fila[0] ?? "",
      numeroDeclaracionFuente: fila[1] ?? "",
    };

    const candidatos = candidatosPorVehiculo.get(claveVehiculo) ?? [];
    candidatos.push(candidato);
    candidatosPorVehiculo.set(claveVehiculo, candidatos);
  }

  const advertencias: AdvertenciaIdentidadRecuperada[] = [];
  const filasConRecuperacion = new Set<number>();

  // 1) Recuperación segura usando placa + serie.
  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];
    const documentoActual = normalizarDocumento(fila[INDICE_DOCUMENTO] ?? "");
    const nombreActual = (fila[INDICE_NOMBRE] ?? "").trim();
    const faltaDocumento = !documentoActual;
    const faltaNombre = !nombreActual;

    if (!faltaDocumento && !faltaNombre) {
      continue;
    }

    const claveVehiculo = crearClaveVehiculo(fila);

    if (!claveVehiculo) {
      continue;
    }

    const candidatosIniciales = candidatosPorVehiculo.get(claveVehiculo) ?? [];
    const candidatosCompatibles = candidatosIniciales.filter((candidato) => {
      if (documentoActual && candidato.documento !== documentoActual) {
        return false;
      }

      if (
        nombreActual &&
        candidato.nombreNormalizado !== normalizarTexto(nombreActual)
      ) {
        return false;
      }

      return true;
    });

    const identidadesUnicas = new Map<string, IdentidadCandidata>();

    for (const candidato of candidatosCompatibles) {
      identidadesUnicas.set(obtenerClaveIdentidad(candidato), candidato);
    }

    if (identidadesUnicas.size !== 1) {
      continue;
    }

    const identidad = [...identidadesUnicas.values()][0];
    const camposCompletados: CampoIdentidadRecuperado[] = [];

    if (faltaDocumento) {
      fila[INDICE_DOCUMENTO] = identidad.documento;
      camposCompletados.push("DNI_RUC");
    }

    if (faltaNombre) {
      fila[INDICE_NOMBRE] = identidad.nombre;
      camposCompletados.push("NOMBRE_RAZON_SOCIAL");
    }

    const placa = normalizarPlaca(fila[INDICE_PLACA] ?? "");
    const numeroSerie = normalizarSerie(fila[INDICE_SERIE] ?? "");
    const filaObjetivo = indice + 2;

    advertencias.push({
      id: `IDENTIDAD_RECUPERADA-${filaObjetivo}`,
      tipo: "IDENTIDAD_RECUPERADA",
      fila: filaObjetivo,
      anioDeclaracion: fila[0] ?? "",
      numeroDeclaracion: fila[1] ?? "",
      placa,
      numeroSerie,
      camposCompletados,
      documentoEnmascarado: enmascararDocumento(identidad.documento),
      nombreRecuperado: identidad.nombre,
      filaFuente: identidad.filaFuente,
      anioDeclaracionFuente: identidad.anioDeclaracionFuente,
      numeroDeclaracionFuente: identidad.numeroDeclaracionFuente,
      metodo: "PLACA_Y_SERIE_COINCIDENCIA_UNICA",
      mensaje:
        "Se completó la identidad usando una única coincidencia exacta de placa y número de serie dentro del mismo reporte. El archivo original no fue modificado.",
    });

    filasConRecuperacion.add(indice);
  }

  // 2) Marcadores controlados para datos que continúan faltando.
  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];
    const documentoActual = normalizarDocumento(fila[INDICE_DOCUMENTO] ?? "");
    const nombreActual = (fila[INDICE_NOMBRE] ?? "").trim();
    const camposCompletados: CampoIdentidadRecuperado[] = [];

    if (!documentoActual) {
      fila[INDICE_DOCUMENTO] = MARCADOR_DNI_RUC;
      camposCompletados.push("DNI_RUC");
    }

    if (!nombreActual) {
      fila[INDICE_NOMBRE] = MARCADOR_RAZON_SOCIAL;
      camposCompletados.push("NOMBRE_RAZON_SOCIAL");
    }

    if (camposCompletados.length === 0) {
      continue;
    }

    // Si esta fila ya fue recuperada completamente en la fase anterior,
    // no debería llegar aquí; la condición se conserva como protección.
    if (filasConRecuperacion.has(indice)) {
      continue;
    }

    advertencias.push(
      crearAdvertenciaMarcador(fila, indice, camposCompletados),
    );
  }

  advertencias.sort((a, b) => a.fila - b.fila);

  return {
    filas,
    advertencias,
  };
}
