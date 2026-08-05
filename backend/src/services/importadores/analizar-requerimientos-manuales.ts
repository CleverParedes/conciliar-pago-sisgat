import ExcelJS from "exceljs";

export type TipoRegistroManualAnalizado =
  | "REGISTRO_COMPLETO"
  | "INCOMPLETO"
  | "VACIO"
  | "SIN_REGISTRO"
  | "ANULADO";

export type EstadoManualNormalizado =
  | "PENDIENTE"
  | "PAGO_PARCIAL"
  | "PAGADO"
  | "NO_APLICA"
  | "REVISAR"
  | "SIN_ESTADO";

export interface PeriodoManualAnalizado {
  anio: number;
}

export interface RequerimientoManualAnalizado {
  fila: number;
  anioGestion: number;
  numeroRequerimiento: string;
  correlativoExcel: number | null;
  placaOriginal: string | null;
  placaNormalizada: string | null;
  fechaRequerimiento: Date | null;
  anioVehiculoOriginal: string | null;
  anioVehiculo: number | null;
  deudaOriginal: string | null;
  propietarioOriginal: string | null;
  estadoManualOriginal: string | null;
  estadoManualNormalizado: EstadoManualNormalizado;
  provinciaOriginal: string | null;
  distritoOriginal: string | null;
  direccionOriginal: string | null;
  notificadorOriginal: string | null;
  observacionesOriginal: string | null;
  numeroLiquidacionDeudaOriginal: string | null;
  fechaNotificacionOriginal: Date | null;
  numeroCedulonOriginal: string | null;
  responsableOriginal: string | null;
  tipoRegistro: TipoRegistroManualAnalizado;
  periodos: PeriodoManualAnalizado[];
  datosOriginales: Record<string, string | number | boolean | null>;
}

export interface IncidenciaRequerimientoManual {
  fila: number;
  campo: string;
  nivel: "ERROR" | "ADVERTENCIA";
  mensaje: string;
  datosOriginales: Record<string, string | number | boolean | null>;
}

export interface ResultadoAnalisisRequerimientosManuales {
  nombreArchivo: string;
  nombreHoja: string;
  anioGestion: number;
  totalFilas: number;
  filasValidas: number;
  filasConError: number;
  totalPeriodos: number;
  placasNormalizables: number;
  porTipoRegistro: Record<TipoRegistroManualAnalizado, number>;
  porEstadoManual: Record<EstadoManualNormalizado, number>;
  porCantidadPeriodos: Record<string, number>;
  errores: IncidenciaRequerimientoManual[];
  advertencias: IncidenciaRequerimientoManual[];
  requerimientos: RequerimientoManualAnalizado[];
}

const COLUMNAS = [
  "correlativo",
  "numero_requerimiento",
  "placa",
  "fecha_requerimiento",
  "anio_vehiculo",
  "deuda",
  "propietario",
  "estado",
  "provincia",
  "distrito",
  "direccion",
  "notificador",
  "observaciones",
  "numero_liquidacion_deuda",
  "fecha_notificacion",
  "numero_cedulon",
  "responsable",
] as const;

const ENCABEZADOS_ESPERADOS = [
  "",
  "NROREQ",
  "PLACA",
  "FECHAREQ",
  "ANOVEH",
  "DEUDA",
  "PROPIETARIO",
  "ESTADO",
  "PROVINCIA",
  "DISTRITO",
  "DIRECCION",
  "NOTIFICADOR",
  "OBSERVACIONES",
  "NRODELIQUIDACIONDEDEUDA",
  "FECHADENOTIFICACION",
  "NRODECEDULON",
  "RESPONSABLE",
] as const;

const ESTADOS_MANUALES = new Set([
  "NO PAGO",
  "PAGO",
  "DEBE",
  "NO SABE",
  "INSCRIPCION",
  "NUEVO",
]);

const UBICACIONES_COMUNES = new Set([
  "PUNO",
  "JULIACA",
  "CUSCO",
  "AREQUIPA",
  "MOHO",
  "AZANGARO",
  "CHUCUITO",
  "COLLAO",
  "MELGAR",
  "SAN ROMAN",
]);

const CONDICIONES_SIN_PERIODOS = new Set([
  "INSCRIPCION",
  "INSCRIPICION",
  "INSCRPCION",
  "NUEVO",
]);

const MAXIMO_INCIDENCIAS = 2000;

function normalizarTexto(
  valor: unknown,
): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizarEncabezado(
  valor: unknown,
): string {
  return normalizarTexto(valor)
    .replace(/[^A-Z0-9]/g, "");
}

function textoOpcional(
  valor: unknown,
): string | null {
  const texto = String(valor ?? "").trim();
  return texto ? texto : null;
}

function valorCrudoCelda(
  celda: ExcelJS.Cell,
): unknown {
  const valor = celda.value as unknown;

  if (
    valor === null ||
    valor === undefined
  ) {
    return null;
  }

  if (
    typeof valor === "string" ||
    typeof valor === "number" ||
    typeof valor === "boolean" ||
    valor instanceof Date
  ) {
    return valor;
  }

  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;

    if (
      "result" in objeto &&
      objeto.result !== undefined
    ) {
      return objeto.result;
    }

    if (
      "text" in objeto &&
      typeof objeto.text === "string"
    ) {
      return objeto.text;
    }

    if (
      "richText" in objeto &&
      Array.isArray(objeto.richText)
    ) {
      return objeto.richText
        .map((parte) => {
          if (
            typeof parte === "object" &&
            parte !== null &&
            "text" in parte
          ) {
            return String(
              (parte as Record<string, unknown>).text ?? "",
            );
          }

          return "";
        })
        .join("");
    }
  }

  return celda.text || null;
}

function valorSerializable(
  celda: ExcelJS.Cell,
): string | number | boolean | null {
  const valor = valorCrudoCelda(celda);

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (
    typeof valor === "string" ||
    typeof valor === "number" ||
    typeof valor === "boolean"
  ) {
    return valor;
  }

  return null;
}

function textoCelda(
  celda: ExcelJS.Cell,
): string | null {
  const valor = valorCrudoCelda(celda);

  if (valor instanceof Date) {
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const anio = valor.getUTCFullYear();

    return `${dia}/${mes}/${anio}`;
  }

  return textoOpcional(valor);
}

function numeroEnteroOpcional(
  valor: unknown,
): number | null {
  if (
    typeof valor === "number" &&
    Number.isInteger(valor)
  ) {
    return valor;
  }

  const texto = String(valor ?? "").trim();

  if (!/^-?\d+$/.test(texto)) {
    return null;
  }

  const numero = Number(texto);

  return Number.isSafeInteger(numero)
    ? numero
    : null;
}

function fechaExcelDesdeNumero(
  numero: number,
): Date | null {
  if (
    !Number.isFinite(numero) ||
    numero <= 0
  ) {
    return null;
  }

  const milisegundosPorDia =
    24 * 60 * 60 * 1000;

  const fecha = new Date(
    Date.UTC(1899, 11, 30) +
      numero * milisegundosPorDia,
  );

  return Number.isNaN(fecha.getTime())
    ? null
    : fecha;
}

function fechaDesdeTexto(
  textoOriginal: string,
): Date | null {
  const texto = textoOriginal.trim();

  const coincidenciaLatina =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(
      texto,
    );

  if (coincidenciaLatina) {
    const dia = Number(coincidenciaLatina[1]);
    const mes = Number(coincidenciaLatina[2]);
    const anio = Number(coincidenciaLatina[3]);

    const fecha = new Date(
      Date.UTC(anio, mes - 1, dia),
    );

    if (
      fecha.getUTCFullYear() === anio &&
      fecha.getUTCMonth() === mes - 1 &&
      fecha.getUTCDate() === dia
    ) {
      return fecha;
    }
  }

  const coincidenciaIso =
    /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(
      texto,
    );

  if (coincidenciaIso) {
    const anio = Number(coincidenciaIso[1]);
    const mes = Number(coincidenciaIso[2]);
    const dia = Number(coincidenciaIso[3]);

    const fecha = new Date(
      Date.UTC(anio, mes - 1, dia),
    );

    if (
      fecha.getUTCFullYear() === anio &&
      fecha.getUTCMonth() === mes - 1 &&
      fecha.getUTCDate() === dia
    ) {
      return fecha;
    }
  }

  return null;
}

function fechaDesdeCelda(
  celda: ExcelJS.Cell,
): Date | null {
  const valor = valorCrudoCelda(celda);

  if (valor instanceof Date) {
    return new Date(
      Date.UTC(
        valor.getFullYear(),
        valor.getMonth(),
        valor.getDate(),
      ),
    );
  }

  if (typeof valor === "number") {
    return fechaExcelDesdeNumero(valor);
  }

  if (typeof valor === "string") {
    return fechaDesdeTexto(valor);
  }

  return null;
}

function placaEspecial(
  valor: unknown,
): TipoRegistroManualAnalizado | null {
  const texto = normalizarTexto(valor);

  if (texto.startsWith("VACIO")) {
    return "VACIO";
  }

  if (texto.startsWith("SIN REGISTRO")) {
    return "SIN_REGISTRO";
  }

  if (texto.startsWith("ANULADO")) {
    return "ANULADO";
  }

  return null;
}

function normalizarPlaca(
  valor: unknown,
): string | null {
  const especial = placaEspecial(valor);

  if (especial) {
    return null;
  }

  const caracteres = normalizarTexto(valor)
    .replace(/[^A-Z0-9]/g, "");

  if (caracteres.length !== 6) {
    return null;
  }

  return `${caracteres.slice(0, 3)}-${caracteres.slice(3)}`;
}

function extraerPeriodos(
  valor: unknown,
): PeriodoManualAnalizado[] {
  const texto = String(valor ?? "");
  const coincidencias =
    texto.match(/(?:19|20)\d{2}/g) ?? [];

  const periodosUnicos = [
    ...new Set(
      coincidencias
        .map(Number)
        .filter(
          (anio) =>
            Number.isInteger(anio) &&
            anio >= 1900 &&
            anio <= 2100,
        ),
    ),
  ];

  return periodosUnicos.map(
    (anio) => ({
      anio,
    }),
  );
}

function normalizarAnioVehiculo(
  valor: unknown,
): number | null {
  const numero =
    numeroEnteroOpcional(valor);

  if (
    numero !== null &&
    numero >= 1900 &&
    numero <= 2100
  ) {
    return numero;
  }

  const coincidencia =
    /(?:19|20)\d{2}/.exec(
      String(valor ?? ""),
    );

  if (!coincidencia) {
    return null;
  }

  const anio = Number(coincidencia[0]);

  return anio >= 1900 &&
    anio <= 2100
    ? anio
    : null;
}

function normalizarEstadoManual(
  valor: unknown,
): EstadoManualNormalizado {
  const texto = normalizarTexto(valor);

  if (!texto) {
    return "SIN_ESTADO";
  }

  if (texto === "PAGO") {
    return "PAGADO";
  }

  if (
    texto.includes("PAGO") &&
    texto.includes("DEBE")
  ) {
    return "PAGO_PARCIAL";
  }

  if (
    texto === "NO PAGO" ||
    texto === "DEBE" ||
    texto.startsWith("DEBE ")
  ) {
    return "PENDIENTE";
  }

  if (
    texto === "INSCRIPCION" ||
    texto === "NUEVO"
  ) {
    return "NO_APLICA";
  }

  return "REVISAR";
}

function datosOriginalesFila(
  fila: ExcelJS.Row,
): Record<string, string | number | boolean | null> {
  return COLUMNAS.reduce<
    Record<string, string | number | boolean | null>
  >(
    (resultado, columna, indice) => {
      resultado[columna] =
        valorSerializable(
          fila.getCell(indice + 1),
        );

      return resultado;
    },
    {},
  );
}

function filaTieneDatos(
  fila: ExcelJS.Row,
): boolean {
  for (
    let columna = 1;
    columna <= COLUMNAS.length;
    columna += 1
  ) {
    const valor =
      textoCelda(
        fila.getCell(columna),
      );

    if (valor) {
      return true;
    }
  }

  return false;
}

function filaSoloTieneNumero(
  fila: ExcelJS.Row,
): boolean {
  for (
    let columna = 3;
    columna <= COLUMNAS.length;
    columna += 1
  ) {
    if (
      textoCelda(
        fila.getCell(columna),
      )
    ) {
      return false;
    }
  }

  return true;
}

function clasificarRegistro(
  fila: ExcelJS.Row,
  placaNormalizada: string | null,
  deuda: string | null,
  propietario: string | null,
): TipoRegistroManualAnalizado {
  const especial =
    placaEspecial(
      valorCrudoCelda(
        fila.getCell(3),
      ),
    );

  if (especial) {
    return especial;
  }

  if (filaSoloTieneNumero(fila)) {
    return "INCOMPLETO";
  }

  if (
    placaNormalizada &&
    deuda &&
    propietario
  ) {
    return "REGISTRO_COMPLETO";
  }

  return "INCOMPLETO";
}

function incrementar(
  resumen: Record<string, number>,
  clave: string | number,
): void {
  const texto = String(clave);

  resumen[texto] =
    (resumen[texto] ?? 0) + 1;
}

function agregarIncidencia(
  destino: IncidenciaRequerimientoManual[],
  incidencia: IncidenciaRequerimientoManual,
): void {
  if (
    destino.length <
    MAXIMO_INCIDENCIAS
  ) {
    destino.push(incidencia);
  }
}

function validarEncabezados(
  hoja: ExcelJS.Worksheet,
): void {
  const encontrados =
    Array.from(
      {
        length:
          ENCABEZADOS_ESPERADOS.length,
      },
      (_, indice) =>
        normalizarEncabezado(
          textoCelda(
            hoja
              .getRow(1)
              .getCell(indice + 1),
          ),
        ),
    );

  const incorrectos =
    ENCABEZADOS_ESPERADOS
      .map(
        (esperado, indice) => ({
          esperado,
          encontrado:
            encontrados[indice],
          columna:
            String.fromCharCode(
              65 + indice,
            ),
        }),
      )
      .filter(
        (item) =>
          item.esperado !==
          item.encontrado,
      );

  if (incorrectos.length > 0) {
    const detalle =
      incorrectos
        .map(
          (item) =>
            `${item.columna}: esperado "${item.esperado}", encontrado "${item.encontrado}"`,
        )
        .join("; ");

    throw new Error(
      `La hoja no tiene la estructura esperada. ${detalle}`,
    );
  }
}

function obtenerHojaPrincipal(
  libro: ExcelJS.Workbook,
): ExcelJS.Worksheet {
  const porNombre =
    libro.getWorksheet("Hoja 1");

  if (porNombre) {
    return porNombre;
  }

  const primeraConDatos =
    libro.worksheets.find(
      (hoja) =>
        hoja.actualRowCount > 1,
    );

  if (!primeraConDatos) {
    throw new Error(
      "El archivo Excel no contiene una hoja con registros.",
    );
  }

  return primeraConDatos;
}

function contarAniosFechas(
  hoja: ExcelJS.Worksheet,
  numeroColumna: number,
): Map<number, number> {
  const conteo = new Map<number, number>();

  for (
    let numeroFila = 2;
    numeroFila <= hoja.rowCount;
    numeroFila += 1
  ) {
    const fecha = fechaDesdeCelda(
      hoja.getRow(numeroFila).getCell(numeroColumna),
    );

    if (!fecha) {
      continue;
    }

    const anio = fecha.getUTCFullYear();

    if (anio >= 2000 && anio <= 2100) {
      conteo.set(
        anio,
        (conteo.get(anio) ?? 0) + 1,
      );
    }
  }

  return conteo;
}

function elegirAnioMasFrecuente(
  conteo: Map<number, number>,
  aniosNombre: number[],
): number | null {
  if (conteo.size === 0) {
    return null;
  }

  const mayorFrecuencia = Math.max(...conteo.values());
  const candidatos = Array.from(conteo.entries())
    .filter(([, cantidad]) => cantidad === mayorFrecuencia)
    .map(([anio]) => anio)
    .sort();

  if (candidatos.length === 1) {
    return candidatos[0]!;
  }

  const candidatoNombre = aniosNombre.find((anio) =>
    candidatos.includes(anio),
  );

  if (candidatoNombre !== undefined) {
    return candidatoNombre;
  }

  throw new Error(
    `No se pudo determinar un único año de gestión. Se encontraron fechas de los años ${candidatos.join(", ")}.`,
  );
}

function inferirAnioGestion(
  hoja: ExcelJS.Worksheet,
  nombreArchivo: string,
  anioSolicitado?: number,
): number {
  if (anioSolicitado !== undefined) {
    if (
      !Number.isInteger(anioSolicitado) ||
      anioSolicitado < 2000 ||
      anioSolicitado > 2100
    ) {
      throw new Error(
        "El año de gestión indicado no es válido.",
      );
    }

    return anioSolicitado;
  }

  const aniosNombre = Array.from(
    new Set(
      Array.from(
        nombreArchivo.matchAll(/(?:19|20|21)\d{2}/g),
        (coincidencia) => Number(coincidencia[0]),
      ).filter((anio) => anio >= 2000 && anio <= 2100),
    ),
  );

  const anioFechaRequerimiento = elegirAnioMasFrecuente(
    contarAniosFechas(hoja, 4),
    aniosNombre,
  );

  if (anioFechaRequerimiento !== null) {
    return anioFechaRequerimiento;
  }

  const anioFechaNotificacion = elegirAnioMasFrecuente(
    contarAniosFechas(hoja, 15),
    aniosNombre,
  );

  if (anioFechaNotificacion !== null) {
    return anioFechaNotificacion;
  }

  if (aniosNombre.length === 1) {
    return aniosNombre[0]!;
  }

  if (aniosNombre.length > 1) {
    throw new Error(
      `El nombre del Excel contiene varios años posibles: ${aniosNombre.join(", ")}.`,
    );
  }

  throw new Error(
    "No se pudo detectar el año de gestión. Incluye el año en el nombre del Excel o registra al menos una fecha de requerimiento.",
  );
}

export async function analizarArchivoRequerimientosManuales(
  buffer: Buffer,
  nombreArchivo: string,
  anioGestionSolicitado?: number,
): Promise<ResultadoAnalisisRequerimientosManuales> {
  const libro =
    new ExcelJS.Workbook();

  const contenidoExcel =
    buffer as unknown as Parameters<
      typeof libro.xlsx.load
    >[0];

  await libro.xlsx.load(
    contenidoExcel,
  );

  const hoja =
    obtenerHojaPrincipal(libro);

  validarEncabezados(hoja);

  const anioGestion = inferirAnioGestion(
    hoja,
    nombreArchivo,
    anioGestionSolicitado,
  );

  const errores:
    IncidenciaRequerimientoManual[] =
      [];

  const advertencias:
    IncidenciaRequerimientoManual[] =
      [];

  const requerimientos:
    RequerimientoManualAnalizado[] =
      [];

  const numeros =
    new Set<string>();

  const porTipoRegistro:
    Record<TipoRegistroManualAnalizado, number> = {
      REGISTRO_COMPLETO: 0,
      INCOMPLETO: 0,
      VACIO: 0,
      SIN_REGISTRO: 0,
      ANULADO: 0,
    };

  const porEstadoManual:
    Record<EstadoManualNormalizado, number> = {
      PENDIENTE: 0,
      PAGO_PARCIAL: 0,
      PAGADO: 0,
      NO_APLICA: 0,
      REVISAR: 0,
      SIN_ESTADO: 0,
    };

  const porCantidadPeriodos:
    Record<string, number> = {};

  let totalFilas = 0;
  let totalPeriodos = 0;
  let placasNormalizables = 0;

  for (
    let numeroFila = 2;
    numeroFila <= hoja.rowCount;
    numeroFila += 1
  ) {
    const fila =
      hoja.getRow(numeroFila);

    if (!filaTieneDatos(fila)) {
      continue;
    }

    totalFilas += 1;

    const datosOriginales =
      datosOriginalesFila(fila);

    const numeroCrudo =
      valorCrudoCelda(
        fila.getCell(2),
      );

    const numeroEntero =
      numeroEnteroOpcional(
        numeroCrudo,
      );

    if (numeroEntero === null) {
      agregarIncidencia(
        errores,
        {
          fila: numeroFila,
          campo:
            "numero_requerimiento",
          nivel: "ERROR",
          mensaje:
            "El número de requerimiento está vacío o no es un número entero.",
          datosOriginales,
        },
      );

      continue;
    }

    const numeroRequerimiento =
      String(numeroEntero);

    const clave =
      `${anioGestion}|${numeroRequerimiento}`;

    if (numeros.has(clave)) {
      agregarIncidencia(
        errores,
        {
          fila: numeroFila,
          campo:
            "numero_requerimiento",
          nivel: "ERROR",
          mensaje:
            `El requerimiento ${numeroRequerimiento} está duplicado dentro del Excel.`,
          datosOriginales,
        },
      );

      continue;
    }

    numeros.add(clave);

    const correlativoExcel =
      numeroEnteroOpcional(
        valorCrudoCelda(
          fila.getCell(1),
        ),
      );

    const placaOriginal =
      textoCelda(
        fila.getCell(3),
      );

    const placaNormalizada =
      normalizarPlaca(
        placaOriginal,
      );

    if (placaNormalizada) {
      placasNormalizables += 1;
    }

    const fechaRequerimiento =
      fechaDesdeCelda(
        fila.getCell(4),
      );

    const anioVehiculoOriginal =
      textoCelda(
        fila.getCell(5),
      );

    const anioVehiculo =
      normalizarAnioVehiculo(
        valorCrudoCelda(
          fila.getCell(5),
        ),
      );

    const deudaOriginal =
      textoCelda(
        fila.getCell(6),
      );

    const propietarioOriginal =
      textoCelda(
        fila.getCell(7),
      );

    const estadoManualOriginal =
      textoCelda(
        fila.getCell(8),
      );

    const estadoManualNormalizado =
      normalizarEstadoManual(
        estadoManualOriginal,
      );

    const provinciaOriginal =
      textoCelda(
        fila.getCell(9),
      );

    const distritoOriginal =
      textoCelda(
        fila.getCell(10),
      );

    const direccionOriginal =
      textoCelda(
        fila.getCell(11),
      );

    const notificadorOriginal =
      textoCelda(
        fila.getCell(12),
      );

    const observacionesOriginal =
      textoCelda(
        fila.getCell(13),
      );

    const numeroLiquidacionDeudaOriginal =
      textoCelda(
        fila.getCell(14),
      );

    const fechaNotificacionOriginal =
      fechaDesdeCelda(
        fila.getCell(15),
      );

    const numeroCedulonOriginal =
      textoCelda(
        fila.getCell(16),
      );

    const responsableOriginal =
      textoCelda(
        fila.getCell(17),
      );

    const periodos =
      extraerPeriodos(
        deudaOriginal,
      );

    const tipoRegistro =
      clasificarRegistro(
        fila,
        placaNormalizada,
        deudaOriginal,
        propietarioOriginal,
      );

    porTipoRegistro[
      tipoRegistro
    ] += 1;

    porEstadoManual[
      estadoManualNormalizado
    ] += 1;

    incrementar(
      porCantidadPeriodos,
      periodos.length,
    );

    totalPeriodos +=
      periodos.length;

    const filaSoloNumero =
      filaSoloTieneNumero(
        fila,
      );

    const tipoEspecial =
      tipoRegistro === "VACIO" ||
      tipoRegistro === "SIN_REGISTRO" ||
      tipoRegistro === "ANULADO";

    if (
      !tipoEspecial &&
      !filaSoloNumero
    ) {
      if (!placaNormalizada) {
        agregarIncidencia(
          advertencias,
          {
            fila: numeroFila,
            campo: "placa",
            nivel: "ADVERTENCIA",
            mensaje: placaOriginal
              ? `La placa "${placaOriginal}" no puede normalizarse al formato XXX-XXX.`
              : "El registro contiene información, pero no tiene placa.",
            datosOriginales,
          },
        );
      }

      const fechaReqTexto =
        textoCelda(
          fila.getCell(4),
        );

      if (
        fechaReqTexto &&
        !fechaRequerimiento
      ) {
        agregarIncidencia(
          advertencias,
          {
            fila: numeroFila,
            campo:
              "fecha_requerimiento",
            nivel: "ADVERTENCIA",
            mensaje:
              `La fecha de requerimiento "${fechaReqTexto}" no tiene un formato válido.`,
            datosOriginales,
          },
        );
      }

      if (
        anioVehiculoOriginal &&
        anioVehiculo === null
      ) {
        agregarIncidencia(
          advertencias,
          {
            fila: numeroFila,
            campo: "anio_vehiculo",
            nivel: "ADVERTENCIA",
            mensaje:
              `El año del vehículo "${anioVehiculoOriginal}" no puede interpretarse.`,
            datosOriginales,
          },
        );
      }

      const deudaNormalizada =
        normalizarTexto(
          deudaOriginal,
        );

      if (
        deudaOriginal &&
        periodos.length === 0 &&
        !CONDICIONES_SIN_PERIODOS.has(
          deudaNormalizada,
        )
      ) {
        agregarIncidencia(
          advertencias,
          {
            fila: numeroFila,
            campo: "deuda",
            nivel: "ADVERTENCIA",
            mensaje:
              `La deuda "${deudaOriginal}" no contiene años que puedan conciliarse.`,
            datosOriginales,
          },
        );
      }

      const fechaNotificacionTexto =
        textoCelda(
          fila.getCell(15),
        );

      if (
        fechaNotificacionTexto &&
        !fechaNotificacionOriginal
      ) {
        agregarIncidencia(
          advertencias,
          {
            fila: numeroFila,
            campo:
              "fecha_notificacion",
            nivel: "ADVERTENCIA",
            mensaje:
              `La fecha de notificación "${fechaNotificacionTexto}" no tiene un formato válido.`,
            datosOriginales,
          },
        );
      }

      const propietarioNormalizado =
        normalizarTexto(
          propietarioOriginal,
        );

      const estadoNormalizado =
        normalizarTexto(
          estadoManualOriginal,
        );

      const posibleDesplazamiento =
        ESTADOS_MANUALES.has(
          propietarioNormalizado,
        ) &&
        (
          UBICACIONES_COMUNES.has(
            estadoNormalizado,
          ) ||
          !estadoNormalizado
        );

      if (posibleDesplazamiento) {
        agregarIncidencia(
          advertencias,
          {
            fila: numeroFila,
            campo: "columnas",
            nivel: "ADVERTENCIA",
            mensaje:
              "Los valores de Propietario y Estado parecen desplazados hacia una columna incorrecta.",
            datosOriginales,
          },
        );
      } else if (
        estadoManualOriginal &&
        estadoManualNormalizado ===
          "REVISAR"
      ) {
        agregarIncidencia(
          advertencias,
          {
            fila: numeroFila,
            campo: "estado",
            nivel: "ADVERTENCIA",
            mensaje:
              `El estado manual "${estadoManualOriginal}" no corresponde a una condición estandarizada.`,
            datosOriginales,
          },
        );
      }
    }

    requerimientos.push({
      fila: numeroFila,
      anioGestion,
      numeroRequerimiento,
      correlativoExcel,
      placaOriginal,
      placaNormalizada,
      fechaRequerimiento,
      anioVehiculoOriginal,
      anioVehiculo,
      deudaOriginal,
      propietarioOriginal,
      estadoManualOriginal,
      estadoManualNormalizado,
      provinciaOriginal,
      distritoOriginal,
      direccionOriginal,
      notificadorOriginal,
      observacionesOriginal,
      numeroLiquidacionDeudaOriginal,
      fechaNotificacionOriginal,
      numeroCedulonOriginal,
      responsableOriginal,
      tipoRegistro,
      periodos,
      datosOriginales,
    });
  }

  return {
    nombreArchivo,
    nombreHoja: hoja.name,
    anioGestion,
    totalFilas,
    filasValidas:
      requerimientos.length,
    filasConError:
      totalFilas -
      requerimientos.length,
    totalPeriodos,
    placasNormalizables,
    porTipoRegistro,
    porEstadoManual,
    porCantidadPeriodos,
    errores,
    advertencias,
    requerimientos,
  };
}


