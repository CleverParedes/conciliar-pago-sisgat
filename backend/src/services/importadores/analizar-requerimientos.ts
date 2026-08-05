import { parse } from "csv-parse/sync";

const COLUMNAS_REQUERIMIENTOS = [
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
] as const;

const PATRON_NUMERO =
  /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|-?\.\d+/g;

const TOLERANCIA_MONTO = 0.05;
const MAXIMO_ERRORES_GUARDADOS = 1000;
const MAXIMO_ADVERTENCIAS_GUARDADAS = 1000;

export interface PeriodoRequerimientoAnalizado {
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

export interface RequerimientoAnalizado {
  fila: number;
  anioRequerimiento: number;
  numeroRequerimiento: string;
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
  datosOriginales: Record<string, string>;
  detalles: PeriodoRequerimientoAnalizado[];
}

export interface ErrorAnalisisRequerimiento {
  fila: number;
  campo: string;
  mensaje: string;
  datosOriginales: Record<string, string>;
}

export interface AdvertenciaAnalisisRequerimiento {
  fila: number;
  tipo:
    | "NUMERACION_ATIPICA"
    | "POSIBLE_DUPLICIDAD";
  mensaje: string;
  datosOriginales: Record<string, string>;
}

export interface ResultadoAnalisisRequerimientos {
  nombreArchivo: string;
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  totalRequerimientos: number;
  totalDetalles: number;
  activos: number;
  anulados: number;
  porAnioRequerimiento: Record<string, number>;
  porCantidadPeriodos: Record<string, number>;
  errores: ErrorAnalisisRequerimiento[];
  advertencias: AdvertenciaAnalisisRequerimiento[];
  requerimientos: RequerimientoAnalizado[];
}

function limpiarFila(
  fila: unknown[],
): string[] {
  const resultado = fila.map(
    (valor) =>
      String(valor ?? "").trim(),
  );

  /*
   * SisGAT termina cada fila con |
   * y produce una columna vacía adicional.
   */
  while (
    resultado.length >
      COLUMNAS_REQUERIMIENTOS.length &&
    resultado.at(-1) === ""
  ) {
    resultado.pop();
  }

  return resultado;
}

function normalizarTexto(
  valor: string,
): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function normalizarDocumento(
  valor: string,
): string {
  return valor.replace(/\D/g, "");
}

function normalizarPlaca(
  valor: string,
): string {
  const placa = valor
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (placa.length === 6) {
    return `${placa.slice(0, 3)}-${placa.slice(3)}`;
  }

  return placa;
}

function extraerNumeros(
  valor: string,
): number[] {
  const coincidencias =
    valor.match(PATRON_NUMERO) ?? [];

  return coincidencias
    .map((numero) =>
      Number(
        numero.replace(/,/g, ""),
      ),
    )
    .filter((numero) =>
      Number.isFinite(numero),
    );
}

function numeroObligatorio(
  valor: string,
  campo: string,
): number {
  const numeros =
    extraerNumeros(valor);

  if (numeros.length === 0) {
    throw new Error(
      `El campo "${campo}" no contiene un número válido.`,
    );
  }

  return numeros[0];
}

function enteroObligatorio(
  valor: string,
  campo: string,
): number {
  const numero =
    numeroObligatorio(
      valor,
      campo,
    );

  if (!Number.isInteger(numero)) {
    throw new Error(
      `El campo "${campo}" debe contener un número entero.`,
    );
  }

  return numero;
}

function fechaDesdeTexto(
  valor: string,
  campo: string,
  obligatoria: boolean,
): Date | null {
  const texto = valor.trim();

  if (!texto) {
    if (obligatoria) {
      throw new Error(
        `El campo "${campo}" está vacío.`,
      );
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

  const dia =
    Number(coincidencia[1]);
  const mes =
    Number(coincidencia[2]);
  const anio =
    Number(coincidencia[3]);
  const hora =
    Number(coincidencia[4] ?? 0);
  const minuto =
    Number(coincidencia[5] ?? 0);
  const segundo =
    Number(coincidencia[6] ?? 0);

  const fecha = new Date(
    Date.UTC(
      anio,
      mes - 1,
      dia,
      hora,
      minuto,
      segundo,
    ),
  );

  const esValida =
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() ===
      mes - 1 &&
    fecha.getUTCDate() === dia &&
    fecha.getUTCHours() === hora &&
    fecha.getUTCMinutes() ===
      minuto &&
    fecha.getUTCSeconds() ===
      segundo;

  if (!esValida) {
    throw new Error(
      `El campo "${campo}" no contiene una fecha válida: "${valor}".`,
    );
  }

  return fecha;
}

function extraerPeriodos(
  valor: string,
): Array<{
  anio: number;
  trimestreDesde: number;
  trimestreHasta: number;
  original: string;
}> {
  const expresion =
    /(\d{4})\s*\[\s*([1-4])(?:\s*-\s*([1-4]))?\s*\]/g;

  const coincidencias = [
    ...valor.matchAll(expresion),
  ];

  if (
    coincidencias.length === 0
  ) {
    throw new Error(
      `No se pudo interpretar el periodo "${valor}".`,
    );
  }

  const residuo = valor
    .replace(expresion, "")
    .trim();

  if (residuo) {
    throw new Error(
      `El periodo contiene texto no reconocido: "${residuo}".`,
    );
  }

  return coincidencias.map(
    (coincidencia) => {
      const anio =
        Number(coincidencia[1]);
      const trimestreDesde =
        Number(coincidencia[2]);
      const trimestreHasta =
        Number(
          coincidencia[3] ??
            coincidencia[2],
        );

      if (
        trimestreDesde >
        trimestreHasta
      ) {
        throw new Error(
          `El rango trimestral "${coincidencia[0]}" no es válido.`,
        );
      }

      return {
        anio,
        trimestreDesde,
        trimestreHasta,
        original:
          coincidencia[0]
            .replace(/\s+/g, " ")
            .trim(),
      };
    },
  );
}

function validarCantidadExacta(
  valores: number[],
  cantidadEsperada: number,
  campo: string,
): void {
  if (
    valores.length !==
    cantidadEsperada
  ) {
    throw new Error(
      `El campo "${campo}" contiene ${valores.length} valor(es); ` +
        `se esperaban ${cantidadEsperada}.`,
    );
  }
}

function redondearMoneda(
  valor: number,
): number {
  return (
    Math.round(
      (valor +
        Number.EPSILON) *
        100,
    ) / 100
  );
}

function incrementarResumen(
  resumen: Record<string, number>,
  clave: string | number,
): void {
  const texto =
    String(clave);

  resumen[texto] =
    (resumen[texto] ?? 0) + 1;
}

function mensajeDeError(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Error desconocido.";
}

function filaComoJson(
  fila: string[],
): Record<string, string> {
  return COLUMNAS_REQUERIMIENTOS.reduce<
    Record<string, string>
  >(
    (resultado, columna, indice) => {
      resultado[columna] =
        fila[indice] ?? "";

      return resultado;
    },
    {},
  );
}

function validarCabecera(
  cabecera: string[],
): void {
  if (
    cabecera.length !==
    COLUMNAS_REQUERIMIENTOS.length
  ) {
    throw new Error(
      `La cabecera contiene ${cabecera.length} columnas; ` +
        `se esperaban ${COLUMNAS_REQUERIMIENTOS.length}.`,
    );
  }

  const encabezados =
    cabecera.map(normalizarTexto);

  const esperados = [
    "ANO",
    "NRO REQ",
    "FECHA",
    "DNI",
    "NOMBRES",
    "DIRECCION",
    "PLACA",
    "FECHA SUNARP",
    "ACTIVO",
    "PERIODO",
    "VALOR REFERENCIAL",
    "ANO FAB",
    "UIT",
    "BASE IMP.",
    "IMPUESTO",
    "REAJUSTE",
    "INTERES",
    "GASTOS ADM.",
    "TOTAL",
    "USER CREA",
    "USER CREA FH",
    "USER MOD",
    "USER MOD FH",
    "F GENERO",
    "MONTO TOTAL",
    "ID",
  ];

  const esCorrecta =
    esperados.every(
      (esperado, indice) =>
        encabezados[indice] ===
        esperado,
    );

  if (!esCorrecta) {
    throw new Error(
      "El archivo no tiene la estructura esperada de requerimientos.",
    );
  }
}

function clavePosibleDuplicidad(
  requerimiento:
    RequerimientoAnalizado,
): string {
  const periodos =
    requerimiento.detalles
      .map(
        (detalle) =>
          `${detalle.anio}[${detalle.trimestreDesde}-${detalle.trimestreHasta}]`,
      )
      .join("|");

  return [
    requerimiento.dniRuc,
    requerimiento.placa,
    periodos,
    requerimiento.importeTotal.toFixed(
      2,
    ),
  ].join("||");
}

function crearAdvertencias(
  requerimientos:
    RequerimientoAnalizado[],
): AdvertenciaAnalisisRequerimiento[] {
  const advertencias:
    AdvertenciaAnalisisRequerimiento[] =
      [];

  for (
    const requerimiento
    of requerimientos
  ) {
    const anioFecha =
      requerimiento.fechaEmision
        .getUTCFullYear();

    const numeroAtipico =
      requerimiento
        .numeroRequerimiento ===
      "0";

    const anioNoCoincide =
      requerimiento
        .anioRequerimiento !==
      anioFecha;

    if (
      numeroAtipico ||
      anioNoCoincide
    ) {
      const motivos: string[] = [];

      if (numeroAtipico) {
        motivos.push(
          "el número de requerimiento es 0",
        );
      }

      if (anioNoCoincide) {
        motivos.push(
          `el año del requerimiento (${requerimiento.anioRequerimiento}) ` +
            `no coincide con el año de emisión (${anioFecha})`,
        );
      }

      advertencias.push({
        fila:
          requerimiento.fila,
        tipo:
          "NUMERACION_ATIPICA",
        mensaje:
          `Requerimiento ${requerimiento.anioRequerimiento}-` +
          `${requerimiento.numeroRequerimiento}: ${motivos.join(
            " y ",
          )}. Se conservará sin modificar para revisión.`,
        datosOriginales:
          requerimiento
            .datosOriginales,
      });
    }
  }

  const grupos =
    new Map<
      string,
      RequerimientoAnalizado[]
    >();

  for (
    const requerimiento
    of requerimientos
  ) {
    if (
      requerimiento
        .estadoOriginal ===
      "ANULADO"
    ) {
      continue;
    }

    const clave =
      clavePosibleDuplicidad(
        requerimiento,
      );

    const grupo =
      grupos.get(clave) ?? [];

    grupo.push(requerimiento);
    grupos.set(clave, grupo);
  }

  for (const grupo of grupos.values()) {
    if (grupo.length < 2) {
      continue;
    }

    const referencias =
      grupo
        .map(
          (requerimiento) =>
            `${requerimiento.anioRequerimiento}-${requerimiento.numeroRequerimiento}`,
        )
        .join(", ");

    const filas =
      grupo
        .map(
          (requerimiento) =>
            requerimiento.fila,
        )
        .join(", ");

    const referencia =
      grupo.at(-1);

    if (!referencia) {
      continue;
    }

    advertencias.push({
      fila: referencia.fila,
      tipo:
        "POSIBLE_DUPLICIDAD",
      mensaje:
        `Posible duplicidad de origen entre los requerimientos ${referencias} ` +
        `(filas ${filas}): coinciden DNI/RUC, placa, periodos e importe total. ` +
        "No se eliminará ningún registro automáticamente.",
      datosOriginales:
        referencia.datosOriginales,
    });
  }

  return advertencias.slice(
    0,
    MAXIMO_ADVERTENCIAS_GUARDADAS,
  );
}

export function analizarArchivoRequerimientos(
  buffer: Buffer,
  nombreArchivo: string,
): ResultadoAnalisisRequerimientos {
  let registros: string[][];

  try {
    registros = parse(
      buffer.toString("utf8"),
      {
        delimiter: "|",
        quote: '"',
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true,
      },
    ) as string[][];
  } catch (error) {
    throw new Error(
      `No se pudo leer el archivo "${nombreArchivo}": ${mensajeDeError(
        error,
      )}`,
    );
  }

  if (registros.length < 2) {
    throw new Error(
      `El archivo "${nombreArchivo}" no contiene requerimientos.`,
    );
  }

  const cabecera =
    limpiarFila(registros[0]);

  validarCabecera(cabecera);

  const filas = registros
    .slice(1)
    .map(limpiarFila)
    .filter((fila) =>
      fila.some(
        (valor) => valor !== "",
      ),
    );

  const errores:
    ErrorAnalisisRequerimiento[] =
      [];

  const requerimientos:
    RequerimientoAnalizado[] =
      [];

  const claves =
    new Set<string>();

  const idsOrigen =
    new Set<string>();

  const porAnioRequerimiento:
    Record<string, number> = {};

  const porCantidadPeriodos:
    Record<string, number> = {};

  let activos = 0;
  let anulados = 0;
  let totalDetalles = 0;

  for (
    let indice = 0;
    indice < filas.length;
    indice += 1
  ) {
    const fila = filas[indice];
    const numeroFila =
      indice + 2;

    const datosOriginales =
      filaComoJson(fila);

    try {
      if (
        fila.length !==
        COLUMNAS_REQUERIMIENTOS.length
      ) {
        throw new Error(
          `La fila contiene ${fila.length} columnas; ` +
            `se esperaban ${COLUMNAS_REQUERIMIENTOS.length}.`,
        );
      }

      const anioRequerimiento =
        enteroObligatorio(
          fila[0],
          "Año",
        );

      const numeroRequerimiento =
        fila[1].trim();

      if (!numeroRequerimiento) {
        throw new Error(
          "El número de requerimiento está vacío.",
        );
      }

      const claveRequerimiento =
        `${anioRequerimiento}|${numeroRequerimiento}`;

      if (
        claves.has(
          claveRequerimiento,
        )
      ) {
        throw new Error(
          `El requerimiento ${anioRequerimiento}-${numeroRequerimiento} ` +
            "está duplicado dentro del archivo.",
        );
      }

      const idOrigen =
        fila[25].trim();

      if (!idOrigen) {
        throw new Error(
          "La columna Id está vacía.",
        );
      }

      if (
        idsOrigen.has(idOrigen)
      ) {
        throw new Error(
          `El identificador de origen "${idOrigen}" está duplicado dentro del archivo.`,
        );
      }

      const documento =
        normalizarDocumento(
          fila[3],
        );

      if (!documento) {
        throw new Error(
          "El DNI/RUC está vacío o no es válido.",
        );
      }

      const nombre =
        fila[4].trim();

      if (!nombre) {
        throw new Error(
          "El nombre o razón social está vacío.",
        );
      }

      const placa =
        normalizarPlaca(
          fila[6],
        );

      if (!placa) {
        throw new Error(
          "La placa está vacía o no es válida.",
        );
      }

      const estadoTexto =
        normalizarTexto(
          fila[8],
        );

      if (
        estadoTexto !==
          "ACTIVO" &&
        estadoTexto !==
          "ANULADO"
      ) {
        throw new Error(
          `El estado original "${fila[8]}" no es Activo ni Anulado.`,
        );
      }

      const periodos =
        extraerPeriodos(
          fila[9],
        );

      const cantidadPeriodos =
        periodos.length;

      const valoresReferenciales =
        extraerNumeros(fila[10]);

      const aniosFabricacion =
        extraerNumeros(fila[11]);

      const valoresUit =
        extraerNumeros(fila[12]);

      const basesImponibles =
        extraerNumeros(fila[13]);

      const impuestos =
        extraerNumeros(fila[14]);

      const reajustes =
        extraerNumeros(fila[15]);

      const intereses =
        extraerNumeros(fila[16]);

      const gastosAdministrativos =
        extraerNumeros(fila[17]);

      const valoresTotal =
        extraerNumeros(fila[18]);

      validarCantidadExacta(
        valoresReferenciales,
        cantidadPeriodos,
        "VALOR REFERENCIAL",
      );

      validarCantidadExacta(
        aniosFabricacion,
        cantidadPeriodos,
        "AÑO FAB",
      );

      validarCantidadExacta(
        valoresUit,
        cantidadPeriodos,
        "UIT",
      );

      validarCantidadExacta(
        basesImponibles,
        cantidadPeriodos,
        "BASE IMP.",
      );

      validarCantidadExacta(
        impuestos,
        cantidadPeriodos,
        "IMPUESTO",
      );

      validarCantidadExacta(
        reajustes,
        cantidadPeriodos,
        "REAJUSTE",
      );

      validarCantidadExacta(
        intereses,
        cantidadPeriodos,
        "INTERES",
      );

      validarCantidadExacta(
        gastosAdministrativos,
        cantidadPeriodos,
        "GASTOS ADM.",
      );

      validarCantidadExacta(
        valoresTotal,
        cantidadPeriodos + 1,
        "TOTAL",
      );

      const totalesPorPeriodo =
        valoresTotal.slice(
          0,
          cantidadPeriodos,
        );

      const totalIncluidoEnColumna =
        valoresTotal.at(-1) ?? 0;

      const importeTotal =
        numeroObligatorio(
          fila[24],
          "Monto Total",
        );

      const sumaDetalles =
        redondearMoneda(
          totalesPorPeriodo.reduce(
            (total, valor) =>
              total + valor,
            0,
          ),
        );

      if (
        Math.abs(
          totalIncluidoEnColumna -
            importeTotal,
        ) > TOLERANCIA_MONTO
      ) {
        throw new Error(
          "El total incluido en la columna TOTAL " +
            `(${totalIncluidoEnColumna.toFixed(
              2,
            )}) no coincide con Monto Total ` +
            `(${importeTotal.toFixed(
              2,
            )}).`,
        );
      }

      if (
        Math.abs(
          sumaDetalles -
            importeTotal,
        ) > TOLERANCIA_MONTO
      ) {
        throw new Error(
          `La suma de los periodos (${sumaDetalles.toFixed(
            2,
          )}) no coincide con Monto Total ` +
            `(${importeTotal.toFixed(
              2,
            )}).`,
        );
      }

      const fechaEmision =
        fechaDesdeTexto(
          fila[2],
          "Fecha",
          true,
        );

      const fechaSunarp =
        fechaDesdeTexto(
          fila[7],
          "Fecha Sunarp",
          true,
        );

      const fechaCreacionOrigen =
        fechaDesdeTexto(
          fila[20],
          "User Crea Fh",
          true,
        );

      const fechaModificacionOrigen =
        fechaDesdeTexto(
          fila[22],
          "User Mod Fh",
          false,
        );

      const fechaGeneracion =
        fechaDesdeTexto(
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
        throw new Error(
          "No se pudieron interpretar las fechas obligatorias.",
        );
      }

      const detalles:
        PeriodoRequerimientoAnalizado[] =
          periodos.map(
            (
              periodo,
              posicion,
            ) => ({
              anio:
                periodo.anio,
              trimestreDesde:
                periodo
                  .trimestreDesde,
              trimestreHasta:
                periodo
                  .trimestreHasta,
              original:
                periodo.original,
              valorReferencial:
                valoresReferenciales[
                  posicion
                ],
              anioFabricacion:
                Math.trunc(
                  aniosFabricacion[
                    posicion
                  ],
                ),
              uit:
                valoresUit[
                  posicion
                ],
              baseImponible:
                basesImponibles[
                  posicion
                ],
              impuesto:
                impuestos[
                  posicion
                ],
              reajuste:
                reajustes[
                  posicion
                ],
              interes:
                intereses[
                  posicion
                ],
              gastosAdministrativos:
                gastosAdministrativos[
                  posicion
                ],
              totalPeriodo:
                totalesPorPeriodo[
                  posicion
                ],
            }),
          );

      claves.add(
        claveRequerimiento,
      );

      idsOrigen.add(idOrigen);

      incrementarResumen(
        porAnioRequerimiento,
        anioRequerimiento,
      );

      incrementarResumen(
        porCantidadPeriodos,
        cantidadPeriodos,
      );

      totalDetalles +=
        cantidadPeriodos;

      if (
        estadoTexto ===
        "ACTIVO"
      ) {
        activos += 1;
      } else {
        anulados += 1;
      }

      requerimientos.push({
        fila: numeroFila,
        anioRequerimiento,
        numeroRequerimiento,
        idOrigen,
        fechaEmision,
        dniRuc: documento,
        nombreRazonSocial:
          nombre,
        direccion:
          fila[5].trim() ||
          null,
        placa,
        fechaSunarp,
        estadoOriginal:
          estadoTexto,
        periodoOriginal:
          fila[9],
        importeTotal,
        usuarioCreacion:
          fila[19].trim() ||
          null,
        fechaCreacionOrigen,
        usuarioModificacion:
          fila[21].trim() ||
          null,
        fechaModificacionOrigen,
        fechaGeneracion,
        datosOriginales,
        detalles,
      });
    } catch (error) {
      if (
        errores.length <
        MAXIMO_ERRORES_GUARDADOS
      ) {
        errores.push({
          fila: numeroFila,
          campo: "FILA",
          mensaje:
            mensajeDeError(error),
          datosOriginales,
        });
      }
    }
  }

  const advertencias =
    crearAdvertencias(
      requerimientos,
    );

  return {
    nombreArchivo,
    totalFilas: filas.length,
    filasValidas:
      requerimientos.length,
    filasConError:
      filas.length -
      requerimientos.length,
    totalRequerimientos:
      requerimientos.length,
    totalDetalles,
    activos,
    anulados,
    porAnioRequerimiento,
    porCantidadPeriodos,
    errores,
    advertencias,
    requerimientos,
  };
}
