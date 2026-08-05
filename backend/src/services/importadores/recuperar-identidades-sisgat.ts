import type { Prisma } from "../../../generated/prisma/client";

export type CampoIdentidadRecuperado = "DNI_RUC" | "NOMBRE_RAZON_SOCIAL";

export interface AdvertenciaIdentidadRecuperada {
  id: string;
  tipo: "IDENTIDAD_RECUPERADA";
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
  metodo: "PLACA_Y_SERIE_COINCIDENCIA_UNICA";
  mensaje: string;
}

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

/**
 * Completa únicamente DNI/RUC y nombre cuando:
 *
 * 1. el registro objetivo tiene uno o ambos campos vacíos;
 * 2. existe otra fila con igual placa y número de serie;
 * 3. todas las coincidencias válidas representan una sola identidad;
 * 4. cualquier dato ya presente en la fila objetivo coincide con la fuente.
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
  }

  return {
    filas,
    advertencias,
  };
}
