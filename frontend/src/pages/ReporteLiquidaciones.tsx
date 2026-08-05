import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  descargarReporteLiquidaciones,
  obtenerReporteLiquidaciones,
  type EstadoReporteLiquidaciones,
  type FiltrosReporteLiquidaciones,
  type ResumenReporteLiquidaciones,
} from "../reportes-liquidaciones-api";

import "./ReporteLiquidaciones.css";

const ESTADOS: Array<{
  valor: EstadoReporteLiquidaciones;
  etiqueta: string;
}> = [
  { valor: "PAGADO", etiqueta: "Pagado" },
  { valor: "PAGO_PARCIAL", etiqueta: "Pago parcial" },
  { valor: "PENDIENTE", etiqueta: "Pendiente" },
  { valor: "SIN_DECLARACION", etiqueta: "Sin declaración" },
  { valor: "PAGO_ANULADO", etiqueta: "Pago anulado" },
  { valor: "ANULADO", etiqueta: "Anulado" },
  { valor: "SOBREPAGO", etiqueta: "Sobrepago" },
  { valor: "REVISAR", etiqueta: "Revisar" },
];

const formatoMoneda = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

function moneda(valor: number): string {
  return formatoMoneda.format(Number(valor ?? 0));
}

function fechaHora(valor: string | null): string {
  if (!valor) {
    return "Sin registro";
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return "Fecha no válida";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(fecha);
}

function fechaSimple(valor: string | null): string {
  if (!valor) {
    return "—";
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(fecha);
}

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}

function etiquetaEstado(
  estado: EstadoReporteLiquidaciones,
): string {
  return (
    ESTADOS.find((item) => item.valor === estado)?.etiqueta ??
    estado.replaceAll("_", " ")
  );
}

export default function ReporteLiquidaciones() {
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] =
    useState<EstadoReporteLiquidaciones | "">("");
  const [anioLiquidacion, setAnioLiquidacion] = useState("");
  const [periodoAnio, setPeriodoAnio] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [resumen, setResumen] =
    useState<ResumenReporteLiquidaciones | null>(null);
  const [consultando, setConsultando] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const filtros = useMemo<FiltrosReporteLiquidaciones>(
    () => ({
      buscar: buscar.trim(),
      estado,
      anioLiquidacion: anioLiquidacion
        ? Number(anioLiquidacion)
        : null,
      periodoAnio: periodoAnio ? Number(periodoAnio) : null,
      fechaDesde,
      fechaHasta,
    }),
    [
      buscar,
      estado,
      anioLiquidacion,
      periodoAnio,
      fechaDesde,
      fechaHasta,
    ],
  );

  async function consultar(
    filtrosAplicados: FiltrosReporteLiquidaciones,
  ): Promise<void> {
    try {
      setConsultando(true);
      setError(null);

      setResumen(
        await obtenerReporteLiquidaciones(filtrosAplicados),
      );
    } catch (errorEncontrado) {
      setError(mensajeError(errorEncontrado));
    } finally {
      setConsultando(false);
    }
  }

  useEffect(() => {
    void consultar({
      buscar: "",
      estado: "",
      anioLiquidacion: null,
      periodoAnio: null,
      fechaDesde: "",
      fechaHasta: "",
    });
  }, []);

  async function aplicarFiltros(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();
    setMensaje(null);
    await consultar(filtros);
  }

  async function limpiar(): Promise<void> {
    setBuscar("");
    setEstado("");
    setAnioLiquidacion("");
    setPeriodoAnio("");
    setFechaDesde("");
    setFechaHasta("");
    setMensaje(null);

    await consultar({
      buscar: "",
      estado: "",
      anioLiquidacion: null,
      periodoAnio: null,
      fechaDesde: "",
      fechaHasta: "",
    });
  }

  async function accesoRapido(
    nuevoEstado: EstadoReporteLiquidaciones,
  ): Promise<void> {
    setEstado(nuevoEstado);
    setMensaje(null);

    await consultar({
      ...filtros,
      estado: nuevoEstado,
    });
  }

  async function descargar(): Promise<void> {
    try {
      setDescargando(true);
      setError(null);
      setMensaje(null);

      const nombre = await descargarReporteLiquidaciones(filtros);

      setMensaje(`El archivo ${nombre} se descargó correctamente.`);
    } catch (errorDescarga) {
      setError(mensajeError(errorDescarga));
    } finally {
      setDescargando(false);
    }
  }

  return (
    <main className="reporte-liquidaciones">
      <header className="reporte-liquidaciones-cabecera">
        <div>
          <p className="pagina-etiqueta">Reportes</p>

          <h1>Reporte independiente de Liquidaciones</h1>

          <p>
            Consulta y exporta únicamente las Liquidaciones relacionadas con
            la versión independiente activa, sin mezclar Órdenes ni
            Requerimientos.
          </p>
        </div>

        {resumen && (
          <aside className="reporte-liquidaciones-version">
            <span>Versión independiente activa</span>
            <strong>#{resumen.versionActiva.id}</strong>
            <small>
              {resumen.versionActiva.archivo?.nombreArchivo ??
                "Sin archivo registrado"}
            </small>
            <small>
              Aplicada:{" "}
              {fechaHora(resumen.versionActiva.fechaAplicacion)}
            </small>
          </aside>
        )}
      </header>

      {error && (
        <div className="reporte-liquidaciones-alerta reporte-liquidaciones-alerta-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {mensaje && (
        <div className="reporte-liquidaciones-alerta reporte-liquidaciones-alerta-exito">
          <span>{mensaje}</span>
          <button type="button" onClick={() => setMensaje(null)}>
            ×
          </button>
        </div>
      )}

      <section className="reporte-liquidaciones-panel">
        <div className="reporte-liquidaciones-panel-cabecera">
          <div>
            <h2>Filtros del reporte</h2>
            <p>
              Busca por liquidación, ID de origen, DNI/RUC, contribuyente,
              dirección, placa o número de registro vehicular.
            </p>
          </div>

          <button
            className="reporte-liquidaciones-boton-secundario"
            type="button"
            disabled={consultando || descargando}
            onClick={() => void limpiar()}
          >
            Limpiar filtros
          </button>
        </div>

        <form
          className="reporte-liquidaciones-formulario"
          onSubmit={aplicarFiltros}
        >
          <label className="reporte-liquidaciones-campo reporte-liquidaciones-busqueda">
            <span>Buscar</span>
            <input
              type="search"
              value={buscar}
              placeholder="Liquidación, DNI/RUC, nombre, dirección o placa"
              onChange={(evento) => setBuscar(evento.target.value)}
            />
          </label>

          <label className="reporte-liquidaciones-campo">
            <span>Estado</span>
            <select
              value={estado}
              onChange={(evento) =>
                setEstado(
                  evento.target.value as
                    | EstadoReporteLiquidaciones
                    | "",
                )
              }
            >
              <option value="">Todos</option>
              {ESTADOS.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="reporte-liquidaciones-campo">
            <span>Año de liquidación</span>
            <input
              type="number"
              min="1900"
              max="2100"
              value={anioLiquidacion}
              placeholder="Todos"
              onChange={(evento) =>
                setAnioLiquidacion(evento.target.value)
              }
            />
          </label>

          <label className="reporte-liquidaciones-campo">
            <span>Año del periodo</span>
            <input
              type="number"
              min="1900"
              max="2100"
              value={periodoAnio}
              placeholder="Todos"
              onChange={(evento) => setPeriodoAnio(evento.target.value)}
            />
          </label>

          <label className="reporte-liquidaciones-campo">
            <span>Emisión desde</span>
            <input
              type="date"
              value={fechaDesde}
              onChange={(evento) => setFechaDesde(evento.target.value)}
            />
          </label>

          <label className="reporte-liquidaciones-campo">
            <span>Emisión hasta</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(evento) => setFechaHasta(evento.target.value)}
            />
          </label>

          <button
            className="reporte-liquidaciones-boton-aplicar"
            type="submit"
            disabled={consultando || descargando}
          >
            {consultando ? "Consultando..." : "Aplicar filtros"}
          </button>
        </form>

        <div className="reporte-liquidaciones-accesos">
          <span>Accesos rápidos:</span>
          {ESTADOS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              disabled={consultando || descargando}
              onClick={() => void accesoRapido(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </section>

      {consultando && !resumen ? (
        <section className="reporte-liquidaciones-cargando">
          <div className="sesion-spinner" />
          <strong>Preparando el reporte</strong>
          <span>Consultando la versión independiente activa…</span>
        </section>
      ) : resumen ? (
        <>
          <section className="reporte-liquidaciones-metricas">
            <article>
              <span>Liquidaciones</span>
              <strong>{resumen.totales.liquidaciones}</strong>
            </article>
            <article>
              <span>Periodos</span>
              <strong>{resumen.totales.periodos}</strong>
            </article>
            <article>
              <span>Contribuyentes</span>
              <strong>{resumen.totales.contribuyentes}</strong>
            </article>
            <article>
              <span>Importe generado</span>
              <strong>{moneda(resumen.totales.importeTotal)}</strong>
            </article>
            <article>
              <span>Total pagado</span>
              <strong>{moneda(resumen.totales.totalPagado)}</strong>
            </article>
            <article>
              <span>Saldo pendiente</span>
              <strong>{moneda(resumen.totales.saldo)}</strong>
            </article>
          </section>

          <section className="reporte-liquidaciones-resultados">
            <header>
              <div>
                <h2>Resumen por estado</h2>
                <p>
                  El Excel utilizará los mismos filtros y la misma versión
                  activa mostrada en pantalla.
                </p>
              </div>

              <button
                className="reporte-liquidaciones-boton-descargar"
                type="button"
                disabled={
                  descargando ||
                  consultando ||
                  resumen.totales.liquidaciones === 0
                }
                onClick={() => void descargar()}
              >
                {descargando ? "Generando Excel..." : "Descargar Excel"}
              </button>
            </header>

            {resumen.totales.liquidaciones === 0 ? (
              <div className="reporte-liquidaciones-vacio">
                <strong>No existen Liquidaciones con estos filtros</strong>
                <p>Cambia los criterios antes de generar el archivo.</p>
              </div>
            ) : (
              <div className="reporte-liquidaciones-tabla-contenedor">
                <table className="reporte-liquidaciones-tabla">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>Liquidaciones</th>
                      <th>Importe</th>
                      <th>Pagado</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.estados.map((fila) => (
                      <tr key={fila.estado}>
                        <td>
                          <span
                            className={`reporte-liquidaciones-estado reporte-liquidaciones-estado-${fila.estado.toLowerCase()}`}
                          >
                            {etiquetaEstado(fila.estado)}
                          </span>
                        </td>
                        <td>{fila.cantidad}</td>
                        <td>{moneda(fila.importeTotal)}</td>
                        <td>{moneda(fila.totalPagado)}</td>
                        <td>{moneda(fila.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="reporte-liquidaciones-resultados">
            <header>
              <div>
                <h2>Vista previa</h2>
                <p>
                  Se muestran hasta 50 Liquidaciones. El Excel contiene todos
                  los registros que coincidan con los filtros.
                </p>
              </div>

              <span className="reporte-liquidaciones-contador">
                {resumen.muestra.length} visibles
              </span>
            </header>

            {resumen.muestra.length === 0 ? (
              <div className="reporte-liquidaciones-vacio">
                Sin registros para mostrar.
              </div>
            ) : (
              <div className="reporte-liquidaciones-tabla-contenedor">
                <table className="reporte-liquidaciones-tabla reporte-liquidaciones-tabla-vista">
                  <thead>
                    <tr>
                      <th>Liquidación</th>
                      <th>Emisión</th>
                      <th>DNI/RUC</th>
                      <th>Contribuyente</th>
                      <th>Placa</th>
                      <th>Periodos</th>
                      <th>Importe</th>
                      <th>Pagado</th>
                      <th>Saldo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.muestra.map((liquidacion) => (
                      <tr key={liquidacion.id}>
                        <td>
                          <strong>
                            {liquidacion.anioLiquidacion}-
                            {liquidacion.numeroLiquidacion}
                          </strong>
                          <small>
                            {liquidacion.estadoOriginal ??
                              "Sin estado original"}
                          </small>
                        </td>
                        <td>{fechaSimple(liquidacion.fechaEmision)}</td>
                        <td>{liquidacion.dniRuc ?? "—"}</td>
                        <td>{liquidacion.nombre ?? "—"}</td>
                        <td>{liquidacion.placa ?? "—"}</td>
                        <td>{liquidacion.periodos}</td>
                        <td>{moneda(liquidacion.importeTotal)}</td>
                        <td>{moneda(liquidacion.totalPagado)}</td>
                        <td>{moneda(liquidacion.saldo)}</td>
                        <td>
                          <span
                            className={`reporte-liquidaciones-estado reporte-liquidaciones-estado-${liquidacion.estado.toLowerCase()}`}
                          >
                            {etiquetaEstado(liquidacion.estado)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="reporte-liquidaciones-excel">
            <h2>Contenido del archivo Excel</h2>
            <div>
              <article>
                <strong>Resumen</strong>
                <p>
                  Versión activa, archivo, filtros, métricas y distribución
                  por estado.
                </p>
              </article>
              <article>
                <strong>Liquidaciones</strong>
                <p>
                  Contribuyente, placa, importes, estado, datos vehiculares y
                  origen del registro.
                </p>
              </article>
              <article>
                <strong>Periodos y pagos</strong>
                <p>
                  Trimestres, conceptos tributarios, declaración vinculada,
                  recibos, pagos, saldos y observaciones.
                </p>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
