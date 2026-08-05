const SEPARADOR_CAMPOS = '"|"';

function limpiarValor(valor: string): string {
  return valor.replace(/\r\n?/g, "\n").trim();
}

function convertirRegistro(contenidoRegistro: string): string[] | null {
  let registro = contenidoRegistro.trim();

  if (!registro) {
    return null;
  }

  /*
   * Cada registro generado por SisGAT
   * comienza con una comilla doble.
   */
  if (registro.startsWith('"')) {
    registro = registro.slice(1);
  }

  return registro.split(SEPARADOR_CAMPOS).map(limpiarValor);
}

/**
 * Lee el reporte de declaraciones y pagos
 * generado por SisGAT.
 *
 * No utiliza las reglas tradicionales de CSV
 * porque el sistema de origen puede generar:
 *
 * - comillas dobles internas sin escapar;
 * - caracteres | dentro de los textos;
 * - saltos de línea dentro de observaciones.
 *
 * SisGAT sí mantiene una estructura reconocible:
 *
 * - los campos están separados por "|";
 * - cada registro finaliza con "| seguido de
 *   un salto de línea o del final del archivo.
 */
export function leerReporteDeclaracionesPagosSisgat(
  buffer: Buffer,
  nombreArchivo: string,
): string[][] {
  const contenido = buffer.toString("utf8").replace(/^\uFEFF/, "");

  if (!contenido.trim()) {
    throw new Error(`El archivo "${nombreArchivo}" está vacío.`);
  }

  const registros: string[][] = [];

  /*
   * El patrón reconoce únicamente el final
   * verdadero de un registro SisGAT.
   *
   * Un salto de línea normal dentro de una
   * observación no finalizará el registro.
   */
  const patronFinRegistro = /"\|(?:\r?\n|$)/g;

  let inicioRegistro = 0;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patronFinRegistro.exec(contenido)) !== null) {
    const fragmento = contenido.slice(inicioRegistro, coincidencia.index);

    const registro = convertirRegistro(fragmento);

    if (registro) {
      registros.push(registro);
    }

    inicioRegistro = coincidencia.index + coincidencia[0].length;
  }

  /*
   * Se conserva cualquier fragmento final
   * que no tenga el terminador habitual.
   * Luego la validación de columnas decidirá
   * si el registro es correcto o no.
   */
  const fragmentoFinal = contenido.slice(inicioRegistro);

  const registroFinal = convertirRegistro(fragmentoFinal);

  if (registroFinal) {
    registros.push(registroFinal);
  }

  if (registros.length === 0) {
    throw new Error(
      `No se encontraron registros reconocibles en "${nombreArchivo}".`,
    );
  }

  return registros;
}
