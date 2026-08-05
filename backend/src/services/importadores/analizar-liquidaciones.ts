import { parse } from "csv-parse/sync";

const COLUMNAS_LIQUIDACIONES = [
  "anio",
  "numero",
  "fecha",
  "dni",
  "nombres",
  "direccion",
  "placa",
  "fecha_sunarp",
  "estado_original",
  "periodo",
  "valor_referencial",
  "anio_fabricacion",
  "uit",
  "base_imponible",
  "impuesto",
  "reajuste",
  "interes",
  "gastos_administrativos",
  "total",
  "usuario_creacion",
  "fecha_usuario_creacion",
  "usuario_modificacion",
  "fecha_usuario_modificacion",
  "fecha_generacion",
  "monto_total",
  "id_origen",
  "anio_r_veh",
  "numero_r_veh",
] as const;

const PATRON_NUMERO =
  /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?\.\d+/g;

const TOLERANCIA_MONTO = 0.05;

const MAXIMO_ERRORES_GUARDADOS = 1000;

export interface PeriodoLiquidacionAnalizado {
  anio: number;
  trimestreDesde: number;
  trimestreHasta: number;
  original: string;
  valorReferencial: number;
  anioFabricacion: number;
  uit: number;
  baseImponible: number;
  impuesto: number;
  reajuste: number;
  interes: number;
  gastosAdministrativos: number;
  totalPeriodo: number;
}

export interface LiquidacionAnalizada {
  fila: number;
  anioLiquidacion: number;
  numeroLiquidacion: string;
  idOrigen: string;
  fechaEmision: Date;
  dniRuc: string;
  nombreRazonSocial: string;
  direccion: string | null;
  placa: string;
  fechaSunarp: Date;
  estadoOriginal: "ACTIVO" | "ANULADO";
  periodoOriginal: string;
  importeTotal: number;
  usuarioCreacion: string | null;
  fechaCreacionOrigen: Date;
  usuarioModificacion: string | null;
  fechaModificacionOrigen: Date | null;
  fechaGeneracion: Date;
  anioRVeh: number | null;
  numeroRVeh: string | null;
  datosOriginales: Record<string, string>;
  detalles: PeriodoLiquidacionAnalizado[];
}

export interface ErrorAnalisisLiquidacion {
  fila: number;
  campo: string;
  mensaje: string;
  datosOriginales: Record<string, string>;
}

export interface ResultadoAnalisisLiquidaciones {
  nombreArchivo: string;
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  totalLiquidaciones: number;
  totalDetalles: number;
  activas: number;
  anuladas: number;
  porAnioLiquidacion: Record<string, number>;
  porCantidadPeriodos: Record<string, number>;
  errores: ErrorAnalisisLiquidacion[];
  liquidaciones: LiquidacionAnalizada[];
}

function limpiarFila(fila: unknown[]): string[] {
  const resultado = fila.map((valor) => String(valor ?? "").trim());

  /*
   * SisGAT termina cada fila con | y genera
   * una columna vacía adicional.
   */
  while (
    resultado.length > COLUMNAS_LIQUIDACIONES.length &&
    resultado.at(-1) === ""
  ) {
    resultado.pop();
  }

  return resultado;
}

function normalizarEncabezado(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function normalizarDocumento(valor: string): string {
  return valor.replace(/\D/g, "");
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

function extraerNumeros(valor: string): number[] {
  const coincidencias = valor.match(PATRON_NUMERO) ?? [];

  return coincidencias
    .map((numero) => Number(numero.replace(/,/g, "")))
    .filter((numero) => Number.isFinite(numero));
}

function numeroObligatorio(valor: string, campo: string): number {
  const numeros = extraerNumeros(valor);

  if (numeros.length === 0) {
    throw new Error(`El campo "${campo}" no contiene un número válido.`);
  }

  return numeros[0];
}

function enteroObligatorio(valor: string, campo: string): number {
  const numero = numeroObligatorio(valor, campo);

  if (!Number.isInteger(numero)) {
    throw new Error(`El campo "${campo}" debe contener un número entero.`);
  }

  return numero;
}

function enteroOpcional(valor: string, campo: string): number | null {
  if (!valor.trim()) {
    return null;
  }

  return enteroObligatorio(valor, campo);
}

function fechaDesdeTexto(
  valor: string,
  campo: string,
  obligatoria: boolean,
): Date | null {
  const texto = valor.trim();

  if (!texto) {
    if (obligatoria) {
      throw new Error(`El campo "${campo}" está vacío.`);
    }

    return null;
  }

  const coincidencia =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/.exec(
      texto,
    );

  if (!coincidencia) {
    throw new Error(
      `El campo "${campo}" no contiene una fecha válida: "${valor}".`,
    );
  }

  const dia = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const anio = Number(coincidencia[3]);
  const hora = Number(coincidencia[4] ?? 0);
  const minuto = Number(coincidencia[5] ?? 0);
  const segundo = Number(coincidencia[6] ?? 0);

  const fecha = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo));

  const esValida =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia &&
    fecha.getUTCHours() === hora &&
    fecha.getUTCMinutes() === minuto &&
    fecha.getUTCSeconds() === segundo;

  if (!esValida) {
    throw new Error(
      `El campo "${campo}" no contiene una fecha válida: "${valor}".`,
    );
  }

  return fecha;
}

function extraerPeriodos(valor: string): Array<{
  anio: number;
  trimestreDesde: number;
  trimestreHasta: number;
  original: string;
}> {
  const expresion = /(\d{4})\s*\[\s*([1-4])(?:\s*-\s*([1-4]))?\s*\]/g;

  const coincidencias = [...valor.matchAll(expresion)];

  if (coincidencias.length === 0) {
    throw new Error(`No se pudo interpretar el periodo "${valor}".`);
  }

  const residuo = valor.replace(expresion, "").trim();

  if (residuo) {
    throw new Error(
      `El periodo contiene texto no reconocido: "${residuo}".`,
    );
  }

  const claves = new Set<string>();

  return coincidencias.map((coincidencia) => {
    const anio = Number(coincidencia[1]);
    const trimestreDesde = Number(coincidencia[2]);
    const trimestreHasta = Number(coincidencia[3] ?? coincidencia[2]);

    if (trimestreDesde > trimestreHasta) {
      throw new Error(`Periodo inválido: ${coincidencia[0]}`);
    }

    const clave = `${anio}|${trimestreDesde}|${trimestreHasta}`;

    if (claves.has(clave)) {
      throw new Error(`El periodo ${coincidencia[0]} está repetido.`);
    }

    claves.add(clave);

    return {
      anio,
      trimestreDesde,
      trimestreHasta,
      original: coincidencia[0],
    };
  });
}

function validarCantidadExacta(
  valores: number[],
  cantidadEsperada: number,
  campo: string,
): void {
  if (valores.length !== cantidadEsperada) {
    throw new Error(
      `El campo "${campo}" contiene ${valores.length} valor(es), ` +
        `pero se esperaban ${cantidadEsperada}.`,
    );
  }
}

function filaComoJson(fila: string[]): Record<string, string> {
  return Object.fromEntries(
    COLUMNAS_LIQUIDACIONES.map((columna, indice) => [
      columna,
      fila[indice] ?? "",
    ]),
  );
}

function incrementarResumen(
  resumen: Record<string, number>,
  clave: string | number,
): void {
  const texto = String(clave);

  resumen[texto] = (resumen[texto] ?? 0) + 1;
}

function redondearMoneda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido.";
}

function validarCabecera(cabecera: string[]): void {
  if (cabecera.length !== COLUMNAS_LIQUIDACIONES.length) {
    throw new Error(
      `La cabecera contiene ${cabecera.length} columnas; ` +
        `se esperaban ${COLUMNAS_LIQUIDACIONES.length}.`,
    );
  }

  const encabezados = cabecera.map(normalizarEncabezado);

  const correcta =
    encabezados[0] === "ANO" &&
    encabezados[1] === "NRO" &&
    encabezados[3] === "DNI" &&
    encabezados[6] === "PLACA" &&
    encabezados[8] === "ACTIVO" &&
    encabezados[9] === "PERIODO" &&
    encabezados[18] === "TOTAL" &&
    encabezados[24] === "MONTO TOTAL" &&
    encabezados[25] === "" &&
    encabezados[26] === "ANYO R VEH" &&
    encabezados[27] === "NRO R VEH";

  if (!correcta) {
    throw new Error(
      "El archivo no tiene la estructura esperada de liquidaciones.",
    );
  }
}

export function analizarArchivoLiquidaciones(
  buffer: Buffer,
  nombreArchivo: string,
): ResultadoAnalisisLiquidaciones {
  let registros: string[][];

  try {
    registros = parse(buffer.toString("utf8"), {
      delimiter: "|",
      quote: '"',
      bom: true,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];
  } catch (error) {
    throw new Error(
      `No se pudo leer el archivo "${nombreArchivo}": ${mensajeDeError(error)}`,
    );
  }

  if (registros.length < 2) {
    throw new Error(
      `El archivo "${nombreArchivo}" no contiene liquidaciones.`,
    );
  }

  const cabecera = limpiarFila(registros[0]);

  validarCabecera(cabecera);

  const filas = registros
    .slice(1)
    .map(limpiarFila)
    .filter((fila) => fila.some((valor) => valor !== ""));

  const errores: ErrorAnalisisLiquidacion[] = [];
  const liquidaciones: LiquidacionAnalizada[] = [];
  const claves = new Set<string>();
  const porAnioLiquidacion: Record<string, number> = {};
  const porCantidadPeriodos: Record<string, number> = {};

  let activas = 0;
  let anuladas = 0;
  let totalDetalles = 0;

  for (let indice = 0; indice < filas.length; indice += 1) {
    const fila = filas[indice];
    const numeroFila = indice + 2;
    const datosOriginales = filaComoJson(fila);

    try {
      if (fila.length !== COLUMNAS_LIQUIDACIONES.length) {
        throw new Error(
          `La fila contiene ${fila.length} columnas; ` +
            `se esperaban ${COLUMNAS_LIQUIDACIONES.length}.`,
        );
      }

      const anioLiquidacion = enteroObligatorio(fila[0], "Año");
      const numeroLiquidacion = fila[1].trim();

      if (!numeroLiquidacion) {
        throw new Error("El número de liquidación está vacío.");
      }

      const claveLiquidacion = `${anioLiquidacion}|${numeroLiquidacion}`;

      if (claves.has(claveLiquidacion)) {
        throw new Error(
          `La liquidación ${anioLiquidacion}-${numeroLiquidacion} ` +
            "está duplicada dentro del archivo.",
        );
      }

      const documento = normalizarDocumento(fila[3]);

      if (!documento) {
        throw new Error("El DNI/RUC está vacío o no es válido.");
      }

      const nombre = fila[4].trim();

      if (!nombre) {
        throw new Error("El nombre o razón social está vacío.");
      }

      const placa = normalizarPlaca(fila[6]);

      if (!placa) {
        throw new Error("La placa está vacía o no es válida.");
      }

      const estadoTexto = normalizarEncabezado(fila[8]);

      if (estadoTexto !== "ACTIVO" && estadoTexto !== "ANULADO") {
        throw new Error(
          `El estado original "${fila[8]}" no es Activo ni Anulado.`,
        );
      }

      const periodos = extraerPeriodos(fila[9]);
      const cantidadPeriodos = periodos.length;

      const valoresReferenciales = extraerNumeros(fila[10]);
      const aniosFabricacion = extraerNumeros(fila[11]);
      const valoresUit = extraerNumeros(fila[12]);
      const basesImponibles = extraerNumeros(fila[13]);
      const impuestos = extraerNumeros(fila[14]);
      const reajustes = extraerNumeros(fila[15]);
      const intereses = extraerNumeros(fila[16]);
      const gastosAdministrativos = extraerNumeros(fila[17]);
      const valoresTotal = extraerNumeros(fila[18]);

      validarCantidadExacta(
        valoresReferenciales,
        cantidadPeriodos,
        "VALOR REFERENCIAL",
      );
      validarCantidadExacta(
        aniosFabricacion,
        cantidadPeriodos,
        "AÑO FABRICACIÓN",
      );
      validarCantidadExacta(valoresUit, cantidadPeriodos, "UIT");
      validarCantidadExacta(
        basesImponibles,
        cantidadPeriodos,
        "BASE IMPONIBLE",
      );
      validarCantidadExacta(impuestos, cantidadPeriodos, "IMPUESTO 1%" );
      validarCantidadExacta(reajustes, cantidadPeriodos, "REAJUSTE");
      validarCantidadExacta(intereses, cantidadPeriodos, "INTERÉS");
      validarCantidadExacta(
        gastosAdministrativos,
        cantidadPeriodos,
        "GASTOS ADMINISTRATIVOS",
      );
      validarCantidadExacta(
        valoresTotal,
        cantidadPeriodos + 1,
        "TOTAL",
      );

      const totalesPorPeriodo = valoresTotal.slice(0, cantidadPeriodos);
      const totalIncluidoEnColumna = valoresTotal.at(-1) ?? 0;
      const importeTotal = numeroObligatorio(fila[24], "Monto Total");
      const sumaDetalles = redondearMoneda(
        totalesPorPeriodo.reduce((total, valor) => total + valor, 0),
      );

      if (
        Math.abs(totalIncluidoEnColumna - importeTotal) > TOLERANCIA_MONTO
      ) {
        throw new Error(
          `El total incluido en la columna TOTAL ` +
            `(${totalIncluidoEnColumna.toFixed(2)}) no coincide con ` +
            `Monto Total (${importeTotal.toFixed(2)}).`,
        );
      }

      if (Math.abs(sumaDetalles - importeTotal) > TOLERANCIA_MONTO) {
        throw new Error(
          `La suma de los periodos (${sumaDetalles.toFixed(2)}) ` +
            `no coincide con Monto Total (${importeTotal.toFixed(2)}).`,
        );
      }

      const idOrigen = fila[25].trim();

      if (!idOrigen) {
        throw new Error(
          "La columna sin encabezado que contiene el identificador de origen está vacía.",
        );
      }

      const fechaEmision = fechaDesdeTexto(fila[2], "Fecha", true);
      const fechaSunarp = fechaDesdeTexto(fila[7], "Fecha Sunarp", true);
      const fechaCreacionOrigen = fechaDesdeTexto(
        fila[20],
        "User Crea Fh",
        true,
      );
      const fechaModificacionOrigen = fechaDesdeTexto(
        fila[22],
        "User Mod Fh",
        false,
      );
      const fechaGeneracion = fechaDesdeTexto(
        fila[23],
        "F Genero",
        true,
      );

      if (
        !fechaEmision ||
        !fechaSunarp ||
        !fechaCreacionOrigen ||
        !fechaGeneracion
      ) {
        throw new Error("No se pudieron interpretar las fechas obligatorias.");
      }

      const detalles: PeriodoLiquidacionAnalizado[] = periodos.map(
        (periodo, posicion) => ({
          anio: periodo.anio,
          trimestreDesde: periodo.trimestreDesde,
          trimestreHasta: periodo.trimestreHasta,
          original: periodo.original,
          valorReferencial: valoresReferenciales[posicion],
          anioFabricacion: Math.trunc(aniosFabricacion[posicion]),
          uit: valoresUit[posicion],
          baseImponible: basesImponibles[posicion],
          impuesto: impuestos[posicion],
          reajuste: reajustes[posicion],
          interes: intereses[posicion],
          gastosAdministrativos: gastosAdministrativos[posicion],
          totalPeriodo: totalesPorPeriodo[posicion],
        }),
      );

      claves.add(claveLiquidacion);
      incrementarResumen(porAnioLiquidacion, anioLiquidacion);
      incrementarResumen(porCantidadPeriodos, cantidadPeriodos);
      totalDetalles += cantidadPeriodos;

      if (estadoTexto === "ACTIVO") {
        activas += 1;
      } else {
        anuladas += 1;
      }

      liquidaciones.push({
        fila: numeroFila,
        anioLiquidacion,
        numeroLiquidacion,
        idOrigen,
        fechaEmision,
        dniRuc: documento,
        nombreRazonSocial: nombre,
        direccion: fila[5].trim() || null,
        placa,
        fechaSunarp,
        estadoOriginal: estadoTexto,
        periodoOriginal: fila[9],
        importeTotal,
        usuarioCreacion: fila[19].trim() || null,
        fechaCreacionOrigen,
        usuarioModificacion: fila[21].trim() || null,
        fechaModificacionOrigen,
        fechaGeneracion,
        anioRVeh: enteroOpcional(fila[26], "Anyo R Veh"),
        numeroRVeh: fila[27].trim() || null,
        datosOriginales,
        detalles,
      });
    } catch (error) {
      if (errores.length < MAXIMO_ERRORES_GUARDADOS) {
        errores.push({
          fila: numeroFila,
          campo: "FILA",
          mensaje: mensajeDeError(error),
          datosOriginales,
        });
      }
    }
  }

  return {
    nombreArchivo,
    totalFilas: filas.length,
    filasValidas: liquidaciones.length,
    filasConError: filas.length - liquidaciones.length,
    totalLiquidaciones: liquidaciones.length,
    totalDetalles,
    activas,
    anuladas,
    porAnioLiquidacion,
    porCantidadPeriodos,
    errores,
    liquidaciones,
  };
}
